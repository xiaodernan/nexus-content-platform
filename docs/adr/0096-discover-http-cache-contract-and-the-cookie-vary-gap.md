# ADR-0096：给 `/api/discover` 补 HTTP 应答缓存契约——`Vary: Cookie` 与下游不存是服务端 15s 窗口的护栏，不是重复

- 状态：已接受（2026-11-11）
- 相关：`docs/adr/0095-...`（同一条 `/api/discover` anon 缓存，本片补它**外面**那一层 HTTP 契约）；
  `apps/web/src/app/api/discover/route.ts`、`apps/web/src/server/cache/discoverRouteCache.ts`、
  `apps/web/src/server/http.ts`（§188 的 `apiJson` 对 `Accept-Encoding` 立过的同一条纪律）、
  `apps/web/src/server/domain/session.ts`（`currentUserOrNull()` 靠 `nexus_session` cookie 定身份）、
  `apps/web/test/discover-route-cache.test.ts`

## 背景：一个 real gap，不是补装饰

`docs/adr/0095` 钉住了服务端**进程内**那 15 秒窗口（`cachedDiscoverAnonymous`），两条写路径各自
`invalidateDiscoverRoute()` 去清它。但 `/api/discover` 自己对**下游**（浏览器 / CDN / 反代）一句
HTTP 缓存头都没说——它用的是裸 `NextResponse.json(result)`，而项目里同一层的 v1 JSON 出口
`apiJson()`（`server/http.ts`）默认就写 `cache-control: no-store`、gzip 时还会补
`Vary: Accept-Encoding`（§188）。这个缺口有三条具体的、能说清后果的理由：

1. **同一个 URL 对两种人返回不同内容，却没声明缓存键的维度。** `route.ts` 先 `currentUserOrNull()`
   读 `nexus_session` cookie：anon 走 `discover({ sort, viewerId: null })` 的公共缓存，登录走
   `discover({ sort, viewerId: viewer.id })` 的 following / 屏蔽过滤。所以
   `/api/discover?sort=new` 的应答**随 Cookie 变化**。不声明 `Vary: Cookie`，任何中间缓存一旦被
   打开（浏览器 bfcache、CDN、公司反代、将来加的一层短缓存）都可能把一个用户的私人结果端给
   另一个人，或把 anon 结果端给登录者。今天写着 no-store 所以"暂时没人存"，但这正是 §188 在
   `Accept-Encoding` 上已经立过、这里落到**更危险的 cookie 维度**的同一条欠账。
2. **服务端的 invalidate 清不到下游。** `invalidateDiscoverRoute()` 只 drain 服务端的 TtlLru / Redis
   窗口；新发布 / 刚过审的内容要 15 秒内出现，靠的是这一层重算。若浏览器或 CDN 再存一份，那个承诺
   就被绕过、且最坏翻倍到下游自己的 TTL。所以下游**必须** `no-store`——重复 DB 查询由服务端那层
   15s 缓存挡着，两层各管一段，不重叠。
3. **登录分支的私人结果需要第二道锁。** 即便将来有人误把 `no-store` 放宽成短缓存，登录分支标了
   `private` 仍能挡住共享缓存碰它；anon 结果是公共内容，不必标。

## 决定

1. 在 `discoverRouteCache.ts`（与服务端 15s 窗口同模块）导出纯函数
   `discoverResponseHeaders(authenticated: boolean): Record<string, string>`，返回
   `{ vary: 'Cookie', 'cache-control': authenticated ? 'private, no-store' : 'no-store' }`。
   `route.ts` 两分支都用它，不手抄头字符串：anon 传 `false`，登录传 `true`；两个
   `NextResponse.json` 调用点各接一次。
2. **不下游存 + 声明 Cookie 进键**，两层职责不重叠：服务端 15s 窗口负责挡住重复计算，HTTP 头负责
   让下游既不存、又知道内容随 Cookie 变。gzip / `Accept-Encoding` 不在本片（见「仍欠」）。
3. 门 `apps/web/test/discover-route-cache.test.ts` 在既有 5 条语义门上再挂 **4 条**：
   ① anon 头 = `Vary: Cookie` + `no-store` 且**不**误加 `private`；② 登录头 = `Vary: Cookie`
   + `private` + `no-store`；③ 两分支都不许声称可被共享缓存存储（无 `public` / `max-age` /
   `s-maxage` / `immutable`）；④ **静态接线门**钉 `route.ts`：anon 传 `false`、登录传 `true`、
   不许退回裸 `NextResponse.json(result)`、应答点恰好 2 个——防止将来加分支时漏接头而静默降级。
   纯内存、不连库、不改源码，低内存共享宿主跑得动。
4. **门要跟着正当改动改、不许惩罚它**：v663 那条"viewer 隔离"静态门原先把应答写法
   `return NextResponse.json(result);` 硬编码进正则，本片给应答加 headers 后它会误红。把它收窄成
   只钉"缓存调用被 `!viewer` 块包住"，应答写法交给第 ④ 条门单独钉——两片各管一件事（ADR-0094
   X4 反向对照纪律）。同时第 ④ 条的正则对 `discoverResponseHeaders( false )` 这类合法空格用
   `\s*` 放宽，避免格式变化误伤。

## 实测读数（measured, not assumed）

- `apps/web/test/discover-route-cache.test.ts` **9/9**（原 5 语义 + 3 纯数据契约 + 1 静态接线）；
- `npx tsc -p apps/web/tsconfig.json --noEmit` **exit 0**；
- `npx eslint route.ts discoverRouteCache.ts discover-route-cache.test.ts` **exit 0**（首次与 tsc 串跑
  时被宿主内存峰值 SIGTERM，单独重跑 exit 0 — 资源峰，不是红）；
- `verify:lint-tree`（`tools/ci/lint-tree.mjs`）全树门在本宿主**两次 SIGTERM**：15 项 self-test 全过、
  进入 graded 阶段后逐 area 起 ESLint 子进程（`graded root` 28s、`agents/exec-host` 105s 仍未完）被
  内存 + 时间峰值杀掉，**没有产出任何债务判定**，不是账本红。本片改动不使它漂移，理由是实测的：
  `docs/evidence/ci/lint-debt.json` 的 107 个 (rule, file) 上限对 `route.ts` / `discoverRouteCache.ts` /
  `discover-route-cache.test.ts` **一个条目都没有**（声明 0 债务），而这三个文件单文件 eslint **0
  违规**（无新的 (rule, file) 对）——账本期望 0、实测 0。全树绿仍需在有资源的宿主 / CI runner 上重跑，
  这里不声称它已在本机通过；
- **变异臂 + 反向对照 11/11 臂判别力符合预期**（`node` 只读真源码文本、内存变异、复刻门断言，
  不落盘改共享工作树）：
  - 变异臂 6 条**全红**：anon 退回裸 json / 登录退回裸 json / anon 误传 `true` /
    header 放宽成 `public, max-age=60` / `Vary` 从 `Cookie` 改 `Origin` / 漏掉 `no-store`；
  - 反向对照 3 条**全绿**：括号加无害空格、只改注释、加无害指令 `must-revalidate`；
  - baseline 2 条绿：真 `route.ts` 接线、真 `discoverResponseHeaders` 值。
  - 这证明门会在漏接 / 传错参数 / 头放宽时真的红，且不会惩罚格式与无害指令的正当改动。

## 仍欠（如实记，不伪造 HTTP 腿）

1. **没有真实 HTTP 集成腿。** 本片是纯数据门（`discoverResponseHeaders` 的返回值）+ 静态接线门
   （`route.ts` 文本）。没有把 Next 服务器跑起来、带 / 不带 `nexus_session` cookie 各发一个
   `/api/discover?sort=new` 真实请求、从 wire 上读回两个头。因此"Next.js 是否在 Route Handler
   上原样透出这两个小写头、会不会自己再叠一层缓存头、bfcache 实际怎么对待它"这一格是**未实测**
   的——生产框架层的行为不能用纯函数门代替。真要做，应在有服务能力且资源宽裕的宿主上补一条
   HTTP 行为腿（起 `next start`，两种 cookie 各打一发，断言 `vary` / `cache-control` 落 wire），
   而不是把本片说成"端到端已验"。
2. **`Vary: Cookie` 是故意选的粗粒度。** 任何 cookie 变化（哪怕与鉴权无关的埋点 cookie）都会让
   缓存把应答视为不同变体。当前一律 `no-store`、下游根本不存，所以粗粒度不付代价；它的价值是
   "将来谁放宽了 `no-store` 也不会串味"。若要精细化，得只挑鉴权 cookie 参与键——那需要改
   `Vary` 的构造方式，**本片不定门**，免得把当前的安全默认锁死成唯一形态。
3. **`Accept-Encoding` 的 `Vary` 合并未在此处落地。** `apiJson()` 在 gzip 时把 `Accept-Encoding`
   **追加**进既有 `Vary`（`http.ts:117`，不覆盖 `Cookie`）；但 `/api/discover` 走的是裸
   `NextResponse.json`、不经 `apiJson`，且 §188 实测 Route Handler 的写路径没被 `next start`
   的 compress 中间件接住，故当前 discover 应答不压缩、没有编码变体。将来若让这条路过 gzip，
   `Vary` 必须把 `Accept-Encoding` 追加到 `Cookie` 之后而非覆盖——这是那时那一笔要连着做的事，
   本片不预设、也不用一个耦合 gzip 的断言提前锁死。
