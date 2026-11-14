# ADR-0112：网关三份读数接到前端——一次 join，三种"没测到"都不许画成 0

- 状态：Accepted
- 日期：2026-11-11
- 相关：ADR-0081（限流 Redis 单一旋钮）、ADR-0101（已提交响应的诚实边界）、ADR-0108（自持 deadline 与黑洞边界）、ADR-0110（context 缓存封顶、失败不报绿）、ADR-0111（`/platform/routes` 只读读数）、§SC 第三十九/四十片

## 背景（这一轮真正填的格子）

网关到 SC-39 已经有三个只读运维端点：`/platform/services`（注册中心名册）、`/platform/health`（逐个实例实测 `/actuator/health`）、`/platform/routes`（编译期路由表，ADR-0111）。但**全仓库没有任何前端或 `nexus-api` 消费过它们**——`admin/observability` 只显示 web 自己的进程计数器与库里的账。于是"此刻网关给哪些前缀路由、注册中心记着谁、每个实例还活不活"这个运维最常问的问题，答案仍是要 curl 三个端点、再在脑子里按 service id 对齐。

同时这一轮用户明确点了六项侧重：Redis、计网、算法、操作系统/数据结构级优化、前端美学登峰造极、前后端协同、数据库与缓存性能。它们不是六个独立任务，而是**这一条纵切里各自有真实落点的一层**——下面逐条说明落在哪、为什么那样选。

## 决定

### 1. 自写一层纯 TS 门面（`apps/web/src/server/gateway/`），不让浏览器直连网关

- 浏览器直连 `{gateway}/platform/*` 会引入跨域、把网关地址暴露给客户端、且**绕过 `role=admin` 门**（网关默认 auth-off，见 ADR-0111）。所以前端只问自己家 `/api/admin/gateway`（与 `/api/admin/rate-limit`、`/api/admin/realtime` 同一形态），由它在服务端扇出到网关，并复用 admin 区已有的 `currentUserOrNull` + `role=admin` 门（默认拒绝，不外泄拓扑）。
- 地址来自 `NEXUS_GATEWAY_URL`；共享缓存开关是 `NEXUS_REDIS_URL`——**与实时总线、限流共用同一个旋钮，不各设各的**（ADR-0081 的先例）。没设网关地址时给可解释的默认，但三列取数失败会如实显示 `unavailable`，不编造一份空拓扑。

### 2. `null` 是这一片的宪法：没测到的列画 `null`，绝不画 0

这是从网关三份读数本身继承的纪律，并在 join 里第一次系统化：

- 注册列 `unavailable` → 每个 service 的 `registeredInstances = null`（"不知道有几个"），**不是 0**（"一个都没有"）。后者是一句具体的谎，会让人去查不存在的事故。列可用但确实没有该 id → 才是 0。
- 健康列没测到 → `health = NOT_MEASURED`，不是 `DOWN`。`UNKNOWN`（没答上）与 `DOWN`（实测挂了）在 UI 上用**不同圆点与不同文案**，守住 `ServiceHealthProbe` 花整段注释区分的那条线。
- 手写归一化（`types.ts`）在形状不认识时返回 `null` → 该列降级 `unavailable`。不写 `as` 断言把外部 HTTP 回执伪装成有类型；同一份坏 JSON 也不重试（重试不会让它变好）。
- 三列 `measuredAt` 各不相同，`gaps` 里如实登记"这是三张带各自日期的事实拼成的图，不是同一瞬间的原子快照"。UI 页脚把这句印出来，不藏在注释里。

判据 `gateway-pure.test.ts` / `gateway-view.test.ts` 逐支钉死：`numberOrDash(null) === '—（未测）'` 且 `numberOrDash(0) === '0'`；UNKNOWN 不用红色圆点；只有 `cached/stale` 打"带日期的旧事实"标。

### 3. join 的错处才是价值：两种配置漂移、两种健康故障

`snapshot.ts` 把三列按 `lb://<service>` 抽出的 service id 对齐，并给出四类归类：`routed-healthy` / `routed-degraded` / `routed-down` / `unrouted`（注册了没路由）/ `dangling`（有路由没注册）。这与 ADR-0111 坐实的"rogue 服务 advertise 但无路由"是同一枚硬币：**本片是它第一次在前端可见**。判据钉住"注册了却没路由"标 `unrouted` 且 `routeIds=[]`、`gaps` 点名该 id。

### 4. 缓存、计网、算法、数据结构各自落在哪（不是堆砌，是每层解决一个真实坏法）

| 侧重 | 落点 | 防的坏法 |
|---|---|---|
| 数据结构 / 操作系统 | `cache.ts`：有界 TTL + LRU + singleflight | 键来自注册中心（外部可控），无界 `Map` 是内存漏点；N 个 admin 同时轮询会把同一键的 health 扇出打 N 遍（惊群）→ 有界淘汰 + 同键合并 |
| 算法 | `backoff.ts`：全抖动 `rng()*min(cap, base*2^n)` | 裸指数退避让所有客户端同一刻重试，把小抖动放大成同步洪峰；上限 cap 防止等到以小时计 |
| 计网 | `client.ts`：`AbortSignal.timeout` + 只重试该重试的 + `allSettled` 并发扇出 | 黑洞下游挂死管理页；401/坏形状重试无意义；一列挂了拖垮整页 |
| 缓存 | 内存 TTL（原生）+ 可选 Redis 共享（跨实例一份） | 面板每 4s 轮询 × 多实例，重复打网关给后端增压 |
| Redis | `index.ts`：opt-in 懒接、`enableOfflineQueue:false`、fail-open | 线路不在时立即失败回退进程内，不排队拖住管理页；不因为 Redis 没起就拒绝服务 |
| 前端美学 | `globals.css` §SC-40 段 + `gateway.module.css` 思路（最终并入 globals） | 层次（表面分级 + 品牌渐变描边）、光晕（状态灯 `color-mix` 借语义色）、呼吸（脉冲走 motion token）；**不新增任何颜色 token**，design lint 与 style-tokens 门禁全覆盖 |
| 前后端协同 | 一个只读 controller + 服务端口面 + 面板 + AdminNav 入口 | 让已经产出却无人消费的三份读数第一次对用户可见 |

关键取舍：**重试分类按计网正确性**——5xx / 网络错 / 超时 / 429 才退避重试，4xx（尤其 401）与坏形状立即失败、不缓存失败值（下一轮可重试，不把一次失败钉成永久）。判据用注入的假 `fetch` / `sleep(0)` / `now()` / `rng`，逐支验 4xx 不重试、部分失败隔离、stale 兜底、Redis fail-open，全程零网络零真实等待。

### 5. 判据抽纯模块，不渲染

沿用 `reclaim-state.ts` 的范式：展示判据（`null→Dash`、健康态映射、后台暂停轮询、非原子提示）抽进 `gateway-view.ts`，组件只消费，测试判纯函数。CSS 从 module 改为全局 `.gw-` 类并入 `globals.css`：这是全仓第一个 CSS Module，`noUncheckedIndexedAccess` 下 `styles.x` 是 `string|undefined` 需要额外 `.d.ts` 机制；并入 globals 让类名回到普通字符串，且 style-tokens 门禁本来就扫 `globals.css`，管得更统一。

## 诚实边界（不粉饰）

- **Redis 共享缓存的 `ageMs` 近似**：Redis 里存的是 JSON 字符串，没有"上游测量时刻"以外的写入时刻；`measuredAt`（上游自报）才是"测量到此刻"的真值，UI 以它为准，共享缓存的 `ageMs` 只反映取回耗时。
- **没有 `EXPLAIN ANALYZE` 就不碰 DB 索引**：探针确认 `schema.ts` 每个热读都有对应复合索引、96 个 `CREATE INDEX`（0043 还写了查询计划分析）。没有真库读数时凭空加索引是负债不是优化。另发现 `discover()` 热读无缓存且依赖 `viewerId`（关注排序 + 屏蔽名单），全局缓存会串味，**记为下一条独立片**（需按 viewer 分键 + 真库集成测隔离），本轮不冒险混改。
- **`typecheck:main` 有 3 条既存 `.mjs` TS8016**（`docs/evidence/**` 里 `.mjs` 写了 `as` 断言，`checkJs:false` 挡不住语法级错误），经 `git show HEAD` 核实非本轮引入、也不在 SC-40 范围。项目日常门 `npm run typecheck`（turbo 各包）14/14 全绿。
- **首屏取数失败不白屏也不画空图**：降级成三列 `unavailable`；轮询失败保留上一帧（旧图带日期，比空白诚实）。
- **没设 `NEXUS_GATEWAY_URL` 时**给 `127.0.0.1:8080` 默认，但这不是"平台在此"的承诺——三列取不到就显示未测。

## 验证

- 新增判据：`gateway-pure.test.ts`（18）、`gateway-client.test.ts`（14）、`gateway-view.test.ts`（12）= **44 条全绿**，零网络零真库。
- 相关横向门：`style-tokens`（24）、`route-security-gate`（5）、`jsx-text`/`control-names`/`api-response`/`observability-instrumented`/`doc-evidence`（43）——连同新增共 **116/116**。
- 项目日常门 `npm run typecheck` **14/14**；网关全套 Java `mvn -o -B test` **116/116 BUILD SUCCESS、无 fork 告警**（本轮零 Java 改动，做全仓回归确认）。
- 一次红测的价值：缓存判据首跑 `expected 5 to be 3`，诊断证明是**夹具**给三列都喂了 routes 形状、services/health 归一化失败故不缓存（读数的诚实行为），非生产缺陷；修正夹具后全绿。第一次 `typecheck` 的 5 个 `string|undefined` 与 className 裸标识符，都是 CSS Module 迁移过程中的真实类型问题，逐个修净。

## 仍欠

- `discover()` 热读按 viewer 分键缓存（本轮探针定位，数据隔离敏感，另立片 + 真库集成测串味）。
- 按实例粒度 breaker/bulkhead 聚合（ADR-0110/0111 的另一面）。
- 连接层黑洞独立看门狗（SC-36）。
- CI `topology` job 经真实 push 执行（需授权 push）。
- 修 `docs/evidence/**/*.mjs` 的 3 条既存 TS8016（属 `typecheck:main` 聚合命令，非日常门）。
