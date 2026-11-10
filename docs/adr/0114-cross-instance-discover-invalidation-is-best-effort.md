# ADR-0114：跨实例发现页失效用 Redis pub/sub 广播——最终一致，绝不冒充隐私强一致

- 状态：Accepted
- 日期：2026-11-11
- 相关：ADR-0113（按 viewer 分键缓存 / 单调水位线 `globalGen` / 明确留下的"跨实例共享失效"欠账）、ADR-0028（realtime Redis pub/sub 骨架）、ADR-0081/0112（`NEXUS_REDIS_URL` 单一旋钮与 fail-open）、§SC 第四十二片

## 背景（这一轮填的格子）

ADR-0113 把发现页热读按 viewer 分键缓存做成了本机正确，但**诚实划了一条边界**：进程内缓存，多实例部署各持各的，A 实例 `setBlock` 失效了 A 的缓存，B 实例仍可能持有该 viewer 最多一个 TTL（默认 15s）的旧视图；要跨实例即时一致需"Redis pub/sub 广播失效或共享 generation 存储"，当时记为更大改动、刻意未做。

本片正面接上这块欠账，落用户点名的 **Redis 运用 + 计网（发布订阅）+ 缓存 + 计网最终一致性**。先把话说明白：**这一步把 ADR-0113 已接受的"跨实例最多 15s 旧视图"上界尽力缩短到毫秒级，但绝不、也不能把它说成隐私强一致**——pub/sub 会丢帧，丢帧就退回 TTL 自愈。真正的强一致要共享权威存储，那是另一条路（见"否决的方案"）。

## 决定

### 1. 选 pub/sub 广播失效，不选共享 generation 存储

两种办法都能让跨实例失效，取舍如下：

| 方案 | 机制 | 代价 | 一致性 |
|---|---|---|---|
| **pub/sub 广播（采用）** | 写路径发一帧"viewer u1 变了"，各实例 bump 本地 `globalGen` 派生键 | 热读路径**零网络**；写路径多一帧 fire-and-forget；线路可丢帧 | 最终一致，丢帧退回 TTL |
| 共享 generation 存储（否决） | 把 `gen[viewer]` 放 Redis `INCR`，所有实例读同一个值拼键 | 热读路径**每次都要一次 Redis GET**——把省 DB 的缓存变成每读一跳网络，且 Redis 抖动直接打在发现页首屏 | 强一致（读同一权威 counter） |

决定性理由：**发现页是热读，把 Redis 放进 `keyFor` 等于给每一次渲染加一跳网络往返，还让缓存的可用性绑死 Redis**——这违背 ADR-0113"热读纯内存、隐私新鲜度靠写路径主动失效"的整个立论。pub/sub 把网络成本只放在**写路径**（低频，且 fire-and-forget）和**后台 message handler**，热读一行不改。可用性上，Redis 挂了只丢广播、本机即时失效照旧；共享存储方案里 Redis 挂了连热读都退化。

### 2. 热读零网络，写路径广播，后台 bump——三段严格分离

- **本地永远先失效**：`invalidateDiscoverFor` 先 `bumpLocal`（本机隐私即时生效，fail-open 的最后一道），**再** `s.bus?.publish(ids)`。广播是同步 `void`、绝不 `await` 网络、绝不抛、绝不阻塞正在写库的那条请求。SC-41 的单机语义一字不改（16 单测 + 6 真库测全部保持全绿，见下）。
- **远端帧共用同一内核**：收到帧 → `bumpLocal(s, ids)`，与本地写路径**同一个函数**，杜绝两处逻辑漂移。`loadDiscoverCached` / `keyFor` / `generationFor` 一行未动。
- **bus 缺省即零变化**：不设 `NEXUS_REDIS_URL` → 不建 bus → 行为与 SC-41 完全相同。这是默认形态。

### 3. 复用 `redisBus.ts` 的双连接骨架，不重新发明

`invalidation-bus.ts` 的双连接 pub/sub 直接沿用 ADR-0028 打真 Redis 跑出来的结论：

- **两条连接参数不对称**：发布侧 `enableOfflineQueue:false` + `maxRetriesPerRequest:1`（断线不排队、不做重试马拉松，写库请求不该等线路）；订阅侧 `enableOfflineQueue:true` + `maxRetriesPerRequest:null`（`SUBSCRIBE` 在连接建立前发出，队列一关就永远订不上——首版会全红且不体现在单测里）。重连/自动重订交 ioredis 默认。
- **构造即订频道**（不等第一个订阅者，进程级单例晚订会漏窗口），频道名带版本段 `nexus:discover-invalidate:v1`（换帧格式时旧帧因版本不符被丢，不被误读）。
- **origin 回环去重**：帧带 `origin=pid:时间戳:序号`，同一频道发布者也听得见自己，靠 origin 摘掉，不重复通知本地。
- **线路字节不可信**：`parseInvalidationFrame` 校验版本/形状/`viewerIds` 条数上限（128）与单个 id 长度上限（128），坏帧记账丢弃，绝不把线路字节直接当成要 bump 的集合。不写 `as` 伪装类型。
- **生命周期防 hang**：两条连接都挂常驻 `error` 监听（Node 里无监听者的 error 是 uncaught exception，会带崩进程）；`dispose()` 用 `disconnect()` 不用 `quit()`（对从没连上过的死连接，quit 要和服务器一来一回，会吊住 vitest 退出——仓库有先例）；`publish(...).catch(...)` 必须接住，不制造 unhandled rejection。
- **最小接口**：`InvalidationBus { publish(viewerIds): void; subscribe(cb): () => void; dispose(): void; stats() }`，两种驱动（生产 Redis、测试内存）共用，上层 `discover-cache` 只认接口不认 Redis。

### 4. 三版判据：隐私正确性不压在会丢帧的网络上

| 层 | 文件 | 跑法 | 证什么 |
|---|---|---|---|
| 线路帧 / 驱动 | `invalidation-bus.test.ts`（10） | 必跑，假连接注入 | 坏帧/回环/大帧丢弃、publish 失败不抛、构造即订、dispose 幂等、error 监听常在 |
| **跨实例语义（主路径）** | `discover-cache.multi-instance.test.ts`（9） | 必跑，内存 hub 双 store | A 失效→B bump→B 重查、不误伤他人、匿名不广播、幂等、fail-open、热重载退订 |
| 真 Redis 往返 | `discover-bus.redis.integration.test.ts`（1） | **opt-in**：设 `NEXUS_DISCOVER_BUS_LIVE=1` 才跑 | 两条独立 bus 经真 Redis（56379）端到端互通、generation bump |

**为什么不把隐私正确性压在真 Redis 测上**：pub/sub 会丢帧、ioredis 会重连、Docker 引擎死后端口仍 LISTENING（假绿），且这套驱动有吊住 vitest 退出的历史。所以确定性主路径用**同进程内存 hub 造两个独立 store**（复用生产同一套 `loadFromStore`/`invalidateInStore`/`keyFor`/`bumpLocal` 内核，测试工厂不复制任何逻辑），真 Redis 层只验"线路通不通"且默认 skip。这一层是本片能诚实说"跨实例语义已被证明"的底气，真 Redis 是加分不是地基。

**真 Redis 层实测**（2026-11-11，设 opt-in 跑）：两实例经 56379 互通、B 的 generation bump、B 重新查库、线路读数 `published≥1 / received≥1`，**328ms 干净退出不 hang**。日常全仓 vitest 里它默认 skip（0 条真连接），不拖慢、不拖挂。

### 5. 注入与生命周期（globalThis 单例）

- 沿用 `gateway/index.ts` / `realtime/bus.ts` / `rateLimit.ts` 的 globalThis 单例 + 测试注入范式。`resetDiscoverCacheForTest({ bus })` 可显式注入 bus（同步挂载、不读 env、不连真 Redis），显式 `bus:null` 强制单机，不传才走 `NEXUS_REDIS_URL` opt-in。
- 生产首次惰性读 env，异步建 Redis bus；**脏写防护**：只有 store 仍是全局当前实例、且尚未挂 bus 时才接纳异步落定的连接，否则 dispose 掉（热重载/测试 reset 期间旧异步不能把连接挂到已废弃 store）。
- `resetDiscoverCacheForTest` 重建前先退订旧订阅 + dispose 旧自有 bus，杜绝连接泄漏与"旧回调 bump 新 store"。
- `discoverCacheStats().bus` 暴露线路读数（`published/received/errors/applied`），供判据与将来 admin 面板可观测。

## 诚实边界（绝不假报）

1. **最终一致，不是强一致**：订阅掉线/重连窗口内到达的帧会丢（pub/sub 不补发），对方最坏多用一个 TTL（默认 15s）的旧 generation 后自愈。拉黑全集群瞬时生效**不是**本片承诺；要那个得走共享权威存储（方案否决项）或接受一次额外 Redis 读。
2. **权威状态在库，缓存是加速器**：帧丢了不丢数据，`user_blocks`/`follows` 是唯一真值源，TTL 到期重查即收敛。
3. **多实例 Redis 可观测性有限**：`stats().bus` 只数本实例的收发，pub/sub 查不到远端订阅者名册（与 ADR-0028 同界）。
4. **opt-in**：默认单机；只在设了 `NEXUS_REDIS_URL` 的实例上开跨实例广播。混合部署（部分实例设了、部分没设）时，没设的实例只靠 TTL 收敛——这是配置责任，代码不假报全员在线。

## 判据与读数（不粉饰）

- **三层**：`invalidation-bus.test.ts` **10/10** + `discover-cache.multi-instance.test.ts` **9/9** + 真 Redis 层 **1/1（opt-in 实测）/ 默认 skip**；连 SC-41 既有 `discover-cache.test.ts` **16/16** + `discover-cache.integration.test.ts` **6/6** 一起 = **41 passed + 1 skipped**（默认形态）。
- **回归**：`npm run typecheck` **14/14**；**全仓 vitest 一次全绿 `402 文件 / 5752 测试 passed + 1 skipped, EXIT=0`**（对比 SC-41 基线 400/5733：新增 `invalidation-bus.test.ts` + `discover-cache.multi-instance.test.ts` 两个必跑文件、+19 判据；真 Redis 层 opt-in 默认 skip 计入文件数但不跑连接）——横向门（route-security / doc-evidence / style-tokens 等）全过，既有真库套件与网关判据不受影响（网络隔离只加在写路径广播，未碰 `discover` 函数体 / DB / 索引）。
- **首跑真信号**：多实例判据首版有两条不诚实——一条用 `as unknown as {bus}` 访问私有字段、一条标题承诺"reset 退订无脏回调"却自认"无脏写可观察"。**没放过**：前者改用公开的 `stats().bus.published` 观察，后者重写为可观察判据（热重载后另一实例广播，新全局 store 的 generation 不被旧订阅误 bump）。这是"判据标题必须真被证到"纪律的一次自检。

## 影响与仍欠

- 生产改动：新增 `server/domain/invalidation-bus.ts`；`discover-cache.ts` 加可选 bus（Store 字段 / `attachBus` / `bumpLocal` 抽取 / `invalidateInStore` 参数化内核 / 测试工厂）。**未改 `discover` 函数体 / DB 查询 / 索引 / 依赖 / 两个入口**；SC-41 单机语义与 16+6 判据零回归。
- 仍欠：共享权威 generation 存储（要强一致时，代价是热读一跳 Redis）；把 `discoverCacheStats().bus` 与命中率接进 admin 可观测面板（可复用 SC-40 前端读数骨架）；把"跨实例最终一致"与"丢帧退回 TTL"的读数做进运维可视化。
