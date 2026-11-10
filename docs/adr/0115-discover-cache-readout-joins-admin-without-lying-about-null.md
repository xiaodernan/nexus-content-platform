# ADR-0115：发现页缓存读数接到 admin 面板——把 `null ≠ 0` 摆到运维眼前，绝不画一张会说谎的表

- 状态：Accepted
- 日期：2026-11-11
- 相关：ADR-0113（按 viewer 分键缓存 / 单调水位线 `globalGen`）、ADR-0114（跨实例失效 pub/sub / 最终一致 / `bus=null` 语义）、ADR-0112（网关三份读数接前端，`.gw-` 视觉层与展示判据纯函数范式）、§SC 第四十三片

## 背景（这一轮填的格子）

SC-41 / SC-42 把发现页热读做成了本机正确 + 跨实例最终一致，但留下一个可观测性空洞：`discoverCacheStats()` 与 `InvalidationBusStats` 四账**全仓零消费者**——"这台实例的缓存到底有没有在命中、单调水位线有没有在涨、跨实例总线到底接没接上、有没有丢帧"这几个问题，只能读代码或翻日志，运维面板上看不见。ADR-0114 的"仍欠"里明确记着这一条：发现页缓存命中率与 bus 读数接进 admin 可观测面板。

本片正面接上这块欠账，落用户点名的 **前端美学 / 前后端协同 / 缓存 / 数据库性能**。但接一块运维面板真正难的不是把数字画出来——**是把"没测到""没接上""还没人读"诚实地画出来**。一张把所有缺失值都画成 `0%` / `published 0` 的表，会主动制造两个不存在的事故让运维去查：一个把"单机没接总线"说成"总线接了却不收发"，一个把"这台实例还没人读过发现页"说成"缓存一次都没命中"。这一整片的立论就是**用判据把这两句谎焊死**，让读反了界面时测试先红，而不是等一次误判。

## 决定

### 1. 一个只读门面 + 一条 admin route，原样端出、不二次加工

- `server/domain/discover-cache.ts` 新增 `describeDiscoverCache(): DiscoverCacheReadout`：`{ measuredAt, stats, busAttached, busUrlConfigured }`。它是**只读门面**，route 不直接触达内部 `Store`（那是 `discover-cache` 的私有领地）。加 `measuredAt` 是因为这份读数也是"此刻这一台"的快照，带时间才诚实——面板据此显示"更新于"，页脚说明多实例各算各的。
- `GET /api/admin/discover-cache` 门与 `/admin/*` 其余几张同一句口径：默认拒绝，`currentUserOrNull()` 没登录 401、`role !== 'admin'` 403，一格内部缓存账都不外泄（内部缓存了多少 viewer 的键、总线收发多少帧，是运维拓扑，不是公开状态页）。
- **`no-store`**：读数带 `measuredAt`，是"此刻这一台"的事实；网络层缓存它等于把旧读数冒充此刻。面板每 4 秒轮询，浏览器再缓存一层只会制造第三个时间点。
- **原样端出**：`describeDiscoverCache()` 的读数直接 JSON 化，不加工一层——加工就多一处把 `bus:null`（单机/未接）抹成四账全 0 的机会。
- **不打库**：`discoverCacheStats()` 是同步的进程内读数，问的是本实例自己的内存账，**这里没有依赖故障分支**；`describeDiscoverCache()` 也不碰库。集成测用 `stats.loads` 前后不变见证"问一次读数没有偷偷变成一次发现页查询"。catch 分支只兜"取数本身抛错"→ 503，而不是虚构一条 DB 降级路径。

### 2. 四条会被读反、读反了界面就说谎的话，抽成纯判据

沿用 ADR-0112 `gateway-view.ts` 的范式：展示判据抽成 `discover-view.ts` 纯函数（零 React / 零 DOM / 零网络），组件只消费，判据逐支验电。

| 判据 | 读反的谎 | 钉死的诚实 |
|---|---|---|
| `busTag(null)` | 把"没接总线"画成 `published/received/errors/applied` 四个 0 → 运维去查"总线为什么不收发"这个不存在的事故 | 单独一档中性说法（`gw-dotUnmeasured` / "单机·未接跨实例总线"），明确"这不是接了但没收发" |
| `hitRate(0,0)` | 画成 `0%` → 把"还没人读过"说成"读了都没命中" | `—（还没有读）`，`0%` 只在 `hits+misses>0` 且全未命中时出现 |
| `pollAllowed('hidden')` | 后台标签继续轮询 → 在没人看时给本实例制造流量 | 只有 `visible` 发，`visibilitychange` 回前台立刻补一发 |
| `busTag(bus)` errors>0 | 画成绿灯"线路正常" → 藏起 ADR-0114 的丢帧边界 | `warn` 档 + 明说"丢帧的那几台会退回 TTL（15s）自愈"；已接且无错也必带"最终一致，不是瞬时强一致" |

另外 `keepPreviousOnError(hasPrevious)` 守"拉取失败**不清空上一帧**"：一次失败的读什么都没证明，旧账带 `measuredAt`，比空白诚实；`dashOr(null)` 守"没测到画 `—（未测）` 不画 0"。

### 3. 回执形状门必须校验 `config`——本片首跑后补严的一处

`isKnownReadout(value)` 是前端对后端 JSON 的信任边界：只有字段齐全才认这份读数，挡住"后端改了形状 / 中间层塞了坏 JSON"被当成真读数画出来。

- 初版校验了 `measuredAt`、`busAttached`、`busUrlConfigured`、缓存六账、以及 `bus` 为 null 或四账齐全的对象（残缺 bus 对象会让 `busTag` 读到 `undefined` 而误画"线路正常"）。
- **但漏了 `stats.config`**：而面板 KPI 拿它做分母（`size/maxEntries`）、拿 `ttlMs/1000` 当秒数、拿 `maxViewers` 做水位线旁注分母。一个缺了 `config` 的坏回执会让面板画出 `12/undefined`、`NaN s`。**首跑后补严**：`config` 的 `ttlMs` / `maxEntries` / `maxViewers` 三者必须同时是 number，缺一个或类型错都挡掉；纯判据逐字段正/反验电。`bus=null` 是合法读数，不被形状门误杀（否则单机部署的面板永远显示"拉取失败"）。

### 4. `footNote` 的秒数只从 `pollMs` 来、只出现一次——又一处"改了配置就悄悄说谎"

初版 `footNote` 的 `scope` 把"每 4 秒问一次"硬编码进字符串，末尾又拼一遍"每 N 秒"。这意味着：哪天把 `POLL_MS` 从 4000 改成 8000，末尾说"8 秒"、开头仍说"4 秒"，同一句话自相矛盾且 scope 那半句说谎。改为 `scope` 也从 `pollMs` 取、总句里秒数只出现一次；判据断言"每 8 秒"存在、"每 4 秒"不存在、正则 `/每 \d+ 秒/g` 恰好命中 1 次——把"单一真值源"钉成可验电的不变量。

### 5. 视觉零新增 token，复用 ADR-0112 已证的 `.gw-` 层

`/admin/discover-cache` 页 + `DiscoverPanel`（RSC 首屏取数 + 4s 轮询 + 后台暂停 + 失败保留上一帧 + 骨架屏 + KPI + 总线卡 + 水位线旁注 + 页脚），视觉全部复用 §SC-40 的 `.gw-` 原语（KPI 卡 / 状态灯 color-mix 柔光 / 骨架 shimmer / pill / mono），只补几类本片独有的排布（`.dc-*`：总线卡左边条 / 账目网格 / 提示段）。

- **零新增颜色 token**：颜色/间距/圆角/阴影全走 `var(--nexus-*)`（逐一核过 `--nexus-color-brand` / `shadow-md` / `radius-lg` / `motion-slow|ease` / `space-6` / `font-size-13` 均在项目中既有使用）；状态色只出现在圆点与总线卡左边条上，旁边文字一律中性 `fg-*`，故浅色也过 WCAG AA、不触 style-tokens 的"强调色当文字"硬门。
- `prefers-reduced-motion` 下 `.dc-busCard` 浮现动画归零；零 CSS Module（避开 `noUncheckedIndexedAccess` 下 `styles.x` 是 `string | undefined` 的旧债）、零组件渲染库。
- `AdminNav` 新增 `discover-cache` 入口，`AdminSection` 联合类型自动派生，type check 兜住。

### 6. 判据分层：门打真库、读数走内存、纯判据零依赖

| 层 | 文件 | 证什么 |
|---|---|---|
| 展示判据（纯） | `discover-view.test.ts`（18） | 四条谎 + 形状门（含 config 三字段正反） + 页脚秒数单一真值源，零 React/DOM/网络 |
| **路由层（真库门）** | `admin-discover-cache.integration.test.ts`（7） | 401/403 不外泄、200+`no-store`、形状门前后端闭环、`bus:null` 原样保留（抹成四账对象会红）、`busUrlConfigured` 与 `busAttached` 分开报、bus 已接时四账原样、读数不打库、门面即 200 JSON |
| 横向门 | `style-tokens` / `jsx-text` / `control-names`（29）+ `route-security-gate` | 新视觉与文案不触硬门；新 route 是 GET（结构门只扫写路由，不受影响） |
| 后端回归 | SC-41/42 既有（66 合计） | 单机语义、跨实例语义零回归 |

**真库门为什么不 mock session**：门层"默认拒绝"的价值在于它是真的查了会话才拒绝；mock 掉 `currentUserOrNull` 等于把"门是否真的会拒绝"这条判据换成了一句注释。沿用其余 admin route 集成测的真库夹具（建 user + session，mock 只落在 `next/headers` 的 cookie 读取上）。**读数本身不碰库**，所以这组测只需 session 那两张表，不需构造缓存数据。

**注入替身不连真 Redis**：`bus 已接`那条用 `resetDiscoverCacheForTest({ bus: fakeBus(...) })` 注入只读四账的最小替身，全程不设真连接、不依赖 opt-in；`busUrlConfigured=true 但没接上`那条显式 `bus:null` + 临时设 `NEXUS_REDIS_URL`（finally 还原），确定性造出"配了旋钮但此刻没接上"这个中间态，验证两个布尔分开报、不谎称部署错了。

## 验证（不粉饰）

- 展示判据 `discover-view.test.ts` **18/18**。
- 路由层集成测 `admin-discover-cache.integration.test.ts` **7/7**（打真库，1.94s）。
- SC-41/42/43 发现页缓存相关 6 文件合计 **66/66**。
- `npx tsc -p apps/web/tsconfig.json --noEmit` **通过**（EXIT=0）。
- 横向门 `style-tokens` / `jsx-text` / `control-names` **29/29**。
- 全仓 vitest：**404 files / 5777 tests passed + 1 skipped（405 files / 5778 tests total），EXIT=0**（对比 SC-42 基线 402 files / 5752 passed + 1 skipped，本片净增 2 files / 25 tests = 18 判据 + 7 路由层，完全吻合；耗时 517.88s）。

## 诚实边界

- 面板显示的是**这一台实例**的进程内读数；多实例各算各的，页脚明说，不做跨实例聚合（那要另起一个权威读数汇聚点，属更大改动）。
- `busAttached` 是"这条 pub/sub 线路此刻挂着"，**不是**"全集群都收到了我的失效帧"——pub/sub 无订阅者名册、会丢帧，ADR-0114 的最终一致边界原样成立；面板四账只数本实例收/发。
- `measuredAt` 是服务端取数时刻，客户端"更新于"是浏览器收到时刻；两者不同（网络/调度差），页脚分别标"上游测量时刻"与"更新于"，不混成一个时间点。
- 首屏取数在 RSC 同步调用 `describeDiscoverCache()`，吞异常降级给面板说"这次没测到"；`route` 对应 503。两者都不画一份全 0 的假账。
- 不设 `NEXUS_REDIS_URL` 时 `busUrlConfigured=false`、`bus=null`、`busAttached=false`，面板画"单机·未接跨实例总线"——**这是默认且正确的形态**，不是待修的事故。

## 仍欠

publish 后新作品即时进发现页（当前最多 TTL 15s）；共享权威 generation 存储（要跨实例强一致时）；实例粒度 breaker / bulkhead 聚合；Redis / Lettuce connect 阶段黑洞独立看门狗（SC-36）；CI `topology` job 经真实 push 验证（需明确授权 push）；3 条既存 `docs/evidence/**/*.mjs` TS8016。

## 相关文件

- `apps/web/src/server/domain/discover-cache.ts`（`DiscoverCacheReadout` / `describeDiscoverCache`）
- `apps/web/src/app/api/admin/discover-cache/route.ts`（门 + `no-store` + 原样端出）
- `apps/web/src/app/admin/discover-cache/{page.tsx,DiscoverPanel.tsx,discover-view.ts}`
- `apps/web/src/app/globals.css`（`.gw-kpiHint` / `.dc-*`）、`apps/web/src/components/AdminNav.tsx`
- `apps/web/test/{discover-view.test.ts,admin-discover-cache.integration.test.ts}`
