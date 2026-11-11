# ADR-0098：会话 JSON 出口的缓存契约用账本收敛，框架层统一兜底「未实测就不声称」

- 状态：已接受（2026-11-12）
- 相关：`docs/adr/0096-...`（`/api/discover` 的 `Vary: Cookie` + `no-store`，本片把它泛化成全站 helper）、
  `apps/web/src/server/http.ts`（`sessionResponseHeaders` / `privateJson` / `apiJson`）、
  `apps/web/src/proxy.ts`（Next 16 的 middleware 继任者）、`apps/web/test/session-json-cache.test.ts`、
  `apps/web/test/session-json-cache-ledger.json`

## 背景：v664 只是单点，缺口是成族的

v664 给 `/api/discover` 写了 `Vary: Cookie` + `no-store` / `private, no-store`，但普查（`grep` 全仓
`api/**/route.ts`）显示：**96 个读 session 的路由**里，`/api/auth/me`、`/api/projects`、`/api/notifications`、
`/api/marketplace/earnings`、`/api/admin/*`、以及一整族 `/api/projects/[projectId]/*` 的 GET 应答都随
`nexus_session` cookie 变化，却清一色裸 `NextResponse.json`、一个缓存头都不带。这与 v664 记录的是同一条
欠账（§188 在 `Accept-Encoding` 上立过、落到 cookie 维度更危险），只是散落在几十个文件里。

## 一个被否掉的诱人方案：在 proxy 统一兜底（以及为什么不声称它）

`apps/web/src/proxy.ts` 是每个请求的统一入口，已经在 `response.headers.set('x-nexus-trace', …)`——看起来
是"一处给全站 `/api/*` 加 `Vary: Cookie` + `no-store`"的理想位置。Next 文档实测确认
`NextResponse.next({ headers })` 的响应头会发往客户端（trace id 三方对账就是它在跑的证据）。但**没有采用**，
理由是全是可测/可说的，不是保守：

1. **合并顺序未在本宿主实测。** proxy 在路由**之前**运行，看不到路由最终会设什么头；proxy 设的 `cache-control`
   与路由 `NextResponse.json(result, {headers})` 的同名头谁胜出，取决于 Next 的
   `x-middleware-override-headers` 合并语义。低内存宿主起不了 `next start` 做真 HTTP 验证（ADR 0096 已记同类仍欠），
   把几十个端点的安全押在一条没实测的框架行为上，违反"measured, not assumed"。
2. **会碰 v664 精心区分的契约。** `/api/discover` 的 anon 分支明确是 `no-store`（公共内容，**不该**标
   `private`），登录分支才是 `private, no-store`；`apiJson` 的 gzip 分支还要把 `Accept-Encoding` **追加**进
   `Vary`。一个全站统一的 `private, no-store` + `Vary: Cookie` 若作为 override 盖下去，可能把 anon 误标 private、
   或吃掉 `Accept-Encoding`——修一个缺口引入两个新耦合，不划算。
3. **Next 官方也劝退** `NextResponse.next({ headers })` 当响应头通道（会覆盖 Content-Type 等框架预期）。

故记录此方案为**仍欠 + 不做的理由**，而不是假装做了，也不是让它悬着没人说。将来若在有资源的宿主实测清楚了
合并顺序，并且能证明不碰 v664 / `apiJson` 的头，可以在那时引入 proxy 兜底并**反向**收敛账本。

## 决定：统一 helper + 账本 DOWNWARD + 迁移最敏感 4 个

采用与 `docs/evidence/ci/lint-debt.json` 同构的账本纪律，把"全站收敛"变成一条**只许往下减**的渐进门，而不是
一次改 27 个文件的冒险：

1. `server/http.ts` 新增 `sessionResponseHeaders(given?)`（纯函数）与 `privateJson(data, init?)`（`NextResponse.json`
   的会话感知包装）：默认 `Vary: Cookie` + `private, no-store`；**追加**而非覆盖既有 `Vary`（保住
   `Accept-Encoding`）；**尊重**调用方已有的更具体 `cache-control`（门不替调用方决定，它若能证明可缓存该策略必须保留）。
   `privateJson` 与 `apiJson` 同纪律，只是不加 gzip。
2. 迁移 4 个最敏感的**只读私人 GET** 端点到 `privateJson`：`/api/auth/me`、`/api/projects`(GET)、
   `/api/notifications`(GET)、`/api/marketplace/earnings`(GET)——它们是前端账号面板、项目列表、顶栏铃铛、创作者
   收益，最典型也最不该被共享缓存串味。
3. `apps/web/test/session-json-cache-ledger.json`：显式列出**其余仍裸奔的 27 个**读 session GET 路由（已知欠账）。
   `apps/web/test/session-json-cache.test.ts` 四条门：
   - **门 A 防新增**：真实源码里"读 session + 有 GET + 无任何受认可出口"的集合必须是账本子集 → 新的裸奔私人
     响应一出现就红，欠账不许扩散；
   - **门 B DOWNWARD**：账本里每个路径必须**仍**裸奔，若已变合规却还赖在账本 → 红，逼同一笔修好并销账
     （账本只许减、不许只增不减、也不许"修好了没人记账"）；
   - **门 C 头契约**：`sessionResponseHeaders` 的默认、追加不覆盖、尊重已有策略、幂等、不许 `public/max-age`；
   - **门 D 迁移防回退**：4 个端点 GET 必须仍走 `privateJson`、不许退回裸 `NextResponse.json`（剥注释后判定，
     注释里提旧 API 名不误伤）。
4. 判定刻意**保守、宁可少报新增也不冤枉**：整文件扫描（避免常量在 GET 体定义之外被漏判）、受认可出口用
   白名单（`privateJson` / `discoverResponseHeaders` / `apiJson` / `bytesResponse` / 字面 `cache-control` /
   `vary` / `NO_STORE`）、path 统一 `/`-分隔相对 `apps/web/`。`bytesResponse`（带显式 cache 参数）与
   `agent/route.ts` 的 `NO_STORE` 常量都据此正确认作合规、不进账本。

## 实测读数（measured, not assumed）

- `session-json-cache.test.ts` **12/12**（门 A/B 自检账本与真实源码逐条吻合：无新增、无 stale、无重复；
  门 C 五条头契约；门 D 四条迁移防回退）。
- **红门先立**：门 D 首版对 `earnings` 报红——它的注释里历史性写着 `NextResponse.json(...)`（"这里原来是…"），
  被正则当成代码。按"门不惩罚正当说明文字"修为**剥注释后判定**，而非改生产注释；复验 12/12。
  这正是一次反向对照：门抓的是真代码回归，不是注释字面。
- **变异臂 + 反向对照 13/13**（生产同构的纯状态机 + 复刻门判定，内存变异、不碰共享树）：5 个变异臂各被抓
  （新增裸出口未登记 → 门 A 红；修好没销账 → 门 B 红；头漏 `Vary` / 放宽成 `public,max-age` / 覆盖而非追加
  `Vary` → 门 C 红）；8 个反向对照保持绿（账本吻合、非 session 的 GET、只有 POST、privateJson 合规、
  头默认/追加/尊重已有策略/幂等）。
- `npx tsc -p apps/web/tsconfig.json --noEmit` **exit 0**（首轮报 `string|undefined`：
  `noUncheckedIndexedAccess` 下 `Record<string,string>` 索引不确定，改为返回精确类型
  `{ vary: string; 'cache-control': string }` + 本地变量收窄而**非** `!` 断言）；单文件 `npx eslint` **exit 0**
  （一处 `no-useless-escape` 已修）。census **exit 0**：132 modules / 119 rows / arms 132/132——本片加的是
  `apps/web/test/*` 与账本 JSON，不进 census population。

## 仍欠（如实记，不冒充已验）

1. **proxy 统一兜底未做、合并顺序未实测**——见上文「否掉的方案」。这是本片最大的界：账本让存量不再扩散、
   新增立毙，但**没有**给全站一次性的框架级兜底；27 个欠账仍真实存在，只是被显式记账、逐片可销。
2. **没有真 HTTP 行为腿**——4 个迁移端点的头用纯函数门验证（`sessionResponseHeaders`），没有起 `next start`
   带 / 不带 cookie 各打一发从 wire 读回 `Vary` / `cache-control`。函数契约证明了，端到端未测（同 ADR 0096）。
3. **账本判定是保守的整文件白名单**——一个文件只要在**任何**位置提到 `cache-control` / `vary` / `NO_STORE`
   就算合规，哪怕那段头只加在某一个出口、别的 GET 出口仍裸奔。这是"宁可少报新增也不冤枉"的有意取舍：
   把判定做细（逐出口、逐函数体、剥注释）会重演首版门 D 的假阳性，并在共享树上把门变脆。真要逐出口收敛，
   应在有资源宿主上配合真 HTTP 腿一起做，而不是靠一个更激进的正则。
