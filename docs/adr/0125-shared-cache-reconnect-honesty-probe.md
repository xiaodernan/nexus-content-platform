# ADR-0125：共享缓存"断后永不重连 + 恒报 driver=redis"的诚实读数缺口——先钉失败模式，待干净窗口再实现

- 状态：Proposed（本轮只探查定稿、未改生产代码）
- 编号沿革：本文件初稿占过 `0123`，与并行会话的 `0123-fe-elevation-redline.md` 撞号；2026-11-11 本轮以
  `git mv` 让位并重编为 `0125`（`0124` 归同轮的令牌桶判据片），全仓 ADR 编号恢复唯一。
- 消歧：本文件的 **SC-50 专指「共享缓存 `retryStrategy` 断后永不重连 + `driver` 诚实读数」** 这条缺口；
  请勿与并行会话一个同样标了 `§SC-50` 的 commit（`0410ba24`，修 Java `/actuator/info` live 实测、改
  `application.yml` + `ActuatorShapeTest`）混淆——那是一条独立的 Java 元数据修复，与本文件无关，且
  未在 ROADMAP 登记正式片号。本片仍是**探查定稿、代码待干净全仓窗口**，状态未变。
- 日期：2026-11-11
- 相关：ADR-0112（`BoundedCache`）、ADR-0114（Redis pub/sub 双连接骨架 / fail-open）、ADR-0115（没接上绝不画成四账 0）、§SC 第四十四/四十五片同一"诚实读数"纪律

## 背景：一处"报告与实况分叉"

网关态势读数（SC-40）的进程内缓存之外，可 opt-in 接一层 Redis 共享缓存（`NEXUS_REDIS_URL`，`server/gateway/index.ts:30-63` 的 `makeRedisShared` + `client.ts` 的 `shared` 注入）。读码确证两个事实叠在一起，构成一处与本项目一贯"诚实读数"纪律相悖的分叉：

1. **`index.ts:40` `retryStrategy: () => null`**：显式关掉 ioredis 重连。这条连接一旦断开（Redis 重启 / 网络抖 / 启动瞬间没连上且 `lazyConnect:true`），**永久不再自愈**——`enableOfflineQueue:false` 让断线期读写立即抛错、`client.ts` 的 `readShared`/`writeShared` fail-open 吞错退回进程内缓存，于是共享缓存从那一刻起**静默失效到进程结束**。
2. **`client.ts:275` `driver: shared ? 'redis' : 'in-process'`**：`describe().shared.driver` 在构造时按"有没有传 shared 对象"定死，只要配了 `NEXUS_REDIS_URL` 就恒报 `'redis'`，**与连接此刻是否健康无关**。

叠加后果：Redis 断后，管理面板 `describe().shared.driver` 仍显示 `redis`（看着像"跨实例共享已接、健康"），实际所有读都在 fail-open 走进程内缓存。**配置意图被当成连接实况报告**——这正是 ADR-0115 钉过的 `bus:null` 不能画成四账 0、SC-45 空波榜不能说"没有惊群"的同一类诚信事故的另一副面孔。

**但要诚实收窄，不夸大**：`client.ts:128-159` 的 `sharedProbeState` **已经如实记账**——每次 `get`/`set` 抛错都会 `lastError = msg`、`fallbacks += 1`（并回调 `sharedProbe.recordError`）。也就是说断线**并非完全无观测**：`fallbacks` 持续上涨、`lastError` 非空，运维有能力发现。真问题精确说是两条：①`driver` 这个**单字段会误导**（它报的是"配没配"，不是"连没连上"）；②`retryStrategy:()=>null` 让"配了却断了"**永不自愈**，与同仓另三处 Redis 连接纪律不一致（见下）。

## 决定（探查定稿，实现待干净窗口）

### 1. 先盘点同仓 Redis 重连纪律：`retryStrategy:()=>null` 是唯一异类

只读盘点 `apps/web/src/server` 下 3 个 Redis 连接 family：

| 模块 | 连接 | 重连策略 | 断线后 |
|---|---|---|---|
| `gateway/index.ts:36` 共享缓存 | 单连接 | **`retryStrategy:()=>null`（关重连）** | **永久 fail-open，不自愈** |
| `domain/invalidation-bus.ts:375` 失效总线 | pub/sub 双连接 | ioredis 默认有界重连 | 自愈，帧丢靠 TTL 收敛（ADR-0114） |
| `realtime/redisBus.ts:146` 实时总线 | pub/sub 双连接 | ioredis 默认重连 | 自愈 |
| `security/rateLimitRedis.ts:379` 共享限流 | 单连接 | ioredis 默认重连 | 自愈 |

三处都靠 ioredis 默认重连自愈，唯独网关共享缓存显式关掉。注释写的是"连接层的自愈不是这一片的职责"——但那片早已交付，这句**历史边界如今已过期**：既然 `makeRedisShared` 就是这条连接的唯一所有者，自愈本就该在这里闭环，而不是永久放弃。

### 2. 两条修法取舍（本轮不实现，钉死方向避免将来重踩）

- **修法 A：给 `retryStrategy` 有界重连**（返回 ms 而非 `null`，如 `Math.min(1000, attempt*100)` + 上限）。好处：断后自愈，`driver:'redis'` 重新接近实况。风险：重连期 `enableOfflineQueue:false` 仍让读写即时 fail-open（不阻塞管理页，符合原设计），但要防止无限重连在 Redis 长期不可达时空转打日志/CPU；须保留常驻 `error` 监听（现 42 行已有）且** swallowing** 不抛。判据需注入假 Redis 构造器观察 `retryStrategy` 被调用、返回正数、有上限。
- **修法 B：把 `driver` 的语义诚实化**，不再让"配了"冒充"连上了"。可选：①改名 `configured`/加 `connected` 字段，由 `sharedProbe` 的成功/失败推导连接实况（连续失败 N 次标 `degraded`）；②`driver` 保持"配置意图"但在面板旁注明说"driver=redis 只表示已配置、不代表此刻连着；看 fallbacks/lastError 判断实况"。**必须与前端 `gateway-view.ts` 的形状门/旁注同步**，否则改了字段语义面板仍按旧的读。

**推荐组合**：A + B②——有界重连让"配了"更可能等于"连着"，同时用旁注把 `driver` 的真实语义（`configured` 而非 `connected`）说清，`fallbacks`/`lastError` 作为实况判据。**不推荐**贸然改 `driver` 的取值语义（会波及 `gateway-view.ts` 形状门与面板多个断言，且"连接实况"在 pub/sub 语义下本就没有瞬时权威，容易从一个诚实问题制造另一个）。

### 3. 为什么本轮只探查、不落代码（诚实的克制）

本轮实现该片需要：动态 `import('ioredis')` 的可注入替身（现 `makeRedisShared` 不可注入，只能改文件测）、`client.ts`/`gateway/index.ts`/`gateway-view.ts` 联动、以及一次能验证"重连自愈"的假连接时序判据——这些都不难，但**需要一次干净的全仓 + 定向验证窗口**。而本轮验证期出现了一个罕见的**基础设施竞争**：

> 同一台开发机上有**多个 agent / 多个项目**并发跑 `vitest run`（本仓并行会话 + `D:\终极项目` 的集成测），它们共用本机**同一个 `nexus-postgres`（localhost:55433，`max=5` 连接池）**。`vitest.config.ts` 的 `fileParallelism:false` 只保证**单个 vitest 实例内**串行，**挡不住两个实例并发**；两边把彼此的 `testTimeout/hookTimeout=30s` 拖爆，主进程 20+ 分钟 CPU 仅 10s、卡在等库，纯逻辑分卷也因 CPU 争抢 `timeout 300` 超时。这些外部进程非本轮所起、按 `AGENTS.md`"本机有其它项目的容器/进程不要动"纪律**不 kill**。

在无法获得全仓绿灯的状态下改共享缓存的连接契约（会动 fail-open 行为面），正是本项目 SC-45/46/47/48 反复拒绝的"无充分验证就动共享机制"。故本片**探查定稿、代码待干净窗口**——这是克制不是欠账。

## 判据设计（下一片实现时照此落地，零真库）

全部走 `setGatewayClientForTest` / 注入假 `shared`，不连真 Redis、不连真库：

1. `retryStrategy` 可注入且**有界重连**：假构造器捕获 `retryStrategy`，断言断线后返回正整数、`attempt` 增大时不越过上限（不自愈失败也不无限空转）；
2. 断线期 fail-open 不被重连破坏：`shared.get` 抛错时 `readShared` 仍返回 null、`fallbacks` 如实 +1、`lastError` 非空（回归现有 37 判据里的 fail-open 用例）；
3. `driver` 诚实：断线且 `fallbacks>0` 时，面板/旁注**不声称"已连接健康"**，而是把 `driver` 解释为"已配置"、把 `fallbacks`/`lastError` 摆成实况（沿用 `busTag`/`hitRate(0,0)` 的诚实判据家族）；
4. 形状门 `gateway-view.ts` 纳入任何新增字段，坏回执挡掉、不画 `undefined`；
5. `error` 监听 swallow 不抛、进程不 hang（`dispose` 语义）。

## 后果与仍欠

**已交付**：把一处"配置意图冒充连接实况 + 唯一一个关掉自愈的 Redis 连接"钉成有据可查的诚实读数缺口，盘清同仓 4 处 Redis 重连纪律，定下 A+B② 修法与零真库判据设计，并如实记录本轮因多 agent 并发抢库而主动不改生产代码。

**仍欠（待干净验证窗口）**：实现 A+B②（有界重连 + `driver` 语义旁注诚实化，联动 `gateway-view.ts`）、落 5 条零真库判据、补 ROADMAP §SC 第五十片 / CURRENT-STATE 置顶（本轮为避免与并行会话写冲突，暂不登记这两处）。可与 SC-24 欠账"Redis/Lettuce connect 阶段黑洞独立看门狗"合看——那条是 Java 网关侧，本片是 web 侧，同一类连接生命周期问题。

## 验证

本片零代码改动、无判据净增、无 typecheck / 全仓变化。所有结论来自只读读码（`gateway/index.ts`、`gateway/client.ts`、`invalidation-bus.ts`、`realtime/redisBus.ts`、`security/rateLimitRedis.ts`）与本轮亲历的多 vitest 抢库事实。实现与验证数字在下一片回填。未 push。
