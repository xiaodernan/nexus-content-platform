# ADR-0102：发现页 anon 缓存的跨实例失效——Redis 键共享、代号不共享的那个缝

- 状态：accepted
- 日期：2026-11-12
- 版本片：v670
- 关联：ADR 0095（anon 缓存契约）、ADR 0096（HTTP 应答头）、ADR 0097（single-flight + generation guard）、ADR 0028（realtime Redis fanout 的同源连接纪律）

## 背景：一道在所有单进程测试里都绿的 guard，挡不住另一台机器的旧飞行

ADR 0097 给 `/api/discover` 的 anon 路加了 single-flight + `generation` guard，关掉了**单实例内**
"失效前开算、失效后才落地"的旧飞行写回竞态。`generation` 与 `inFlight` 放在
`discoverRouteCache.ts` 的模块级变量里——这在单进程里是对的，但多实例部署下漏了一半：

- `discoverRedis.ts` 的 Redis 驱动让三个 sort 键（`new` / `popular` / `following`）在实例间**共享**：
  一台 `SET` 的结果，另一台能 `GET` 到，这正是"N 台实例只有一份 15s 底本"的用意。
- 但 `generation` / `inFlight` 是 **process-local**：实例 A 上 publish/过审调用
  `invalidateDiscoverRoute()` 时，只 bump 了 A 自己的代号、清了 A 自己的飞行表、`DEL` 了共享键；
  实例 B 的代号**没有任何变化**。

于是有一台真实竞态（此前没有一个门能看见，因为所有门都在一个进程里跑）：

1. 实例 B 在本地 generation=G 开算一次 discover，compute 在途，flight 登记进 B 的 `inFlight`。
2. 实例 A 上有人发布 / 过审，A bump 自己的代号 → G+1，清自己的飞行表，`DEL` 共享 Redis 键。
3. B 的旧 compute 落地：B 的本地代号**仍是 G**，于是判定"窗口未失效"，照常 `SET` 回**共享**键。
4. A 刚删掉的旧内容在 15s 窗口里**复活**，ADR 0097 承诺的"新发布 15s 内可见"被绕过。

**关键判断**：B 自己那道 generation guard 挡不住这件事——它只比较 B 自己的代号，而失效发生在 A。
"键共享、失效状态不共享"是隐蔽之处：单进程测试全绿，恰恰因为它们把 A 和 B 压成了同一个进程、
同一份代号。

## 决定

把"窗口失效"升格为一件**跨实例广播的事实**：

1. **新模块 `discoverInvalidation.ts`**：`DiscoverInvalidationBus` 接口 + 两个驱动 + 一个纯函数帧解析器。
   - `RedisInvalidationBus`：生产驱动，用一个**专用版本化频道** `nexus:discover-invalidate:v1`
     走 Redis pub/sub。发布帧 `{ v, origin, at, nonce }`，`origin` 用于把自己回环的帧摘掉。
   - `MemoryInvalidationHub` + `MemoryInvalidationBus`：进程内驱动，零依赖；单进程开发/测试用它，
     两个 bus 实例共享一个 hub 即可模拟"两台机器"的扇出，不碰 Redis。
   - `parseInvalidationFrame(payload)`：线路字节不可信——畸形 JSON / 非对象 / 版本不符 / origin 空 /
     at、nonce 非有限数一律返回 `null`，调用方记账丢弃，绝不触达本地失效逻辑。
   - 驱动选择 `getDiscoverInvalidationBus()` 与 `getDiscoverCache()` **共用 `NEXUS_REDIS_URL`**：
     设了 → 真 Redis 总线；没设 → 进程内。避免"缓存共享了、失效没共享"这种半截配置。
2. **连接纪律沿用 `realtime/redisBus.ts`（ADR 0028 的同源先例）**：
   - **两条连接**：订阅连接进入 subscriber 模式后不能再发普通命令，`publish` 另起一条。
   - **参数不对称**：发布侧 `enableOfflineQueue:false` / `maxRetriesPerRequest:1`（发失效的是一条写
     业务请求，不该等线路、也不该在重连后把积压的旧失效突然灌出去）；订阅侧 `enableOfflineQueue:true`
     / `maxRetriesPerRequest:null`（Redis 晚起来也要自动订上，否则"重启窗口里没赶上趟的实例永远收不到
     别机失效"）。
   - **构造即订阅**：总线是进程级单例，不等第一个订阅者——晚订的代价是这段时间里所有别机失效都收不到。
   - **publish 永不抛/永不 reject**：连不上只让 `errorCount` 动一下 + 记日志，把正在写库的请求放过去。
   - **每个 error 都挂监听者**：Node 里无监听的 `error` 事件是 uncaught exception，一个连不上的 Redis
     会把进程带走。
   - **订阅回执按形状判**：ioredis 6 实测 `subscribe()` 回执是"该连接订了的频道数"（数字），不是
     boolean；认不出的回执算没订上并记账，不把陌生形状读成成功。
3. **重构 `discoverRouteCache.ts`**：把模块级 `inFlight` / `generation` 封装进
   `createDiscoverRouteCacheRuntime({ cache, bus })`，返回一份独立运行时。
   - 构造即 `bus.subscribe(...)`：收到别机失效 → 执行和本地失效**同款**动作（bump + 清飞行表 +
     清缓存驱动），但**不再 publish**（否则回环成失效风暴）。
   - `invalidateDiscoverRoute()`：先同步 bump + 清飞行表，再 `bus.publish()`，最后 `await cache.clear()`。
     bump 必须在 publish 之前同步发生，让在途旧飞行落地时立刻自我判定过期。
   - `cache` 是 **lazy getter 而非捕获的实例**：`createDiscoverRouteCacheRuntime` 的调用方注入
     `() => DiscoverCache`。这是为了兼容既有测试的 `__resetDiscoverCacheDriverForTests()`——它重建
     驱动单例而不动 runtime，若构造时抓死一个实例，第二份测试就会读到第一份的残留而串味。生产单例
     注入 `getDiscoverCache`，每次调用现取进程级 lazy 单例，等价于重构前的写法。
   - 顶层导出 `cachedDiscoverAnonymous` / `invalidateDiscoverRoute` / `discoverResponseHeaders` 的
     **签名一字未改**，委托给进程级默认 runtime：既有门与两个写调用点（`publish.ts` / `moderation.ts`）
     零回归。
4. **两道防线合起来才闭合**：generation guard 挡本实例的迟到飞行；pub/sub 让**别机**的代号也 bump，
   从而挡住别机的旧飞行写回**共享**键。少任何一道，缝都还在。

## 为什么不选别的

- **不用 Redis keyspace notification**：那要 `CONFIG SET notify-keyspace-events`，托管 Redis 常禁用、
  也不该由应用改服务器配置；它报的是"键变了"而非"业务窗口失效了"的意图，且不带 `origin` 无法过滤
  回环。pub/sub 显式、可控、带 origin，且项目已有 `realtime/redisBus.ts` 的同形先例。
- **不引入实时总线 `WIRE_CHANNEL`**：realtime 帧走 `@nexus/schemas/RealtimeWireFrameSchema`，语义是
  "事件送达订阅者"；discover 失效是"每个实例清自己的窗口"，线路格式、回环处理、失败容忍都不同，
  混用会让一条线的改动牵连另一条。故用专用频道 + 专用纯帧解析器。
- **不追求强一致**：discover 是幂等只读，没有上分布式锁 / 版本号条件写的必要（见下"取舍"）。

## 实测读数（measured, not assumed）

- **新门 `apps/web/test/discover-cross-instance.test.ts` 15/15**，用**真的 `RedisInvalidationBus`
  类**（只把底层 ioredis 换成共享 channel registry 的 fake 连接）跑两台"机器"：
  - `parseInvalidationFrame` 纯数据门 2 条：合法帧字段原样 / 八类畸形帧一律拒绝。
  - `MemoryInvalidationHub` / `Bus` 1 条：A publish → B 收一次、A 收不到自己的回环、退订后不再送达。
  - Redis 编排 5 条：发布/订阅参数不对称（逐格钉 `PUBLISH_OPTIONS` / `SUBSCRIBE_OPTIONS`）、
    A 的帧只触发 B 且落在专用版本化频道、畸形帧/陌生频道记账丢弃不触达本地失效、publish 当场失败
    也不抛只记账、订阅回执形状不认识 → `wireReady=false`。
  - **核心竞态 4 条**：① **线路通**——A 失效广播让 B 的代号 `genBefore+1`、B 飞行表清空，B 的旧飞行
    落地后**不写回**共享键，下一请求真的重算拿 fresh；② **反向对照**——两实例各连互不相同的 registry
    （等价于线路断了 / 压根没接），同样时序下 B 代号不变、stale **必然复活**、下一请求命中 stale 且
    `freshCalls=0`；③ 总线 publish 失败时 A 本地照样失效、写请求不 reject；④ 别机失效后新请求不与
    别机旧飞行合并。
  - 静态接线门 3 条：写路径确实 `deps.bus.publish()` 且 runtime 确实 `deps.bus.subscribe()`、生产单例
    接的是 `getDiscoverInvalidationBus()`；`getDiscoverInvalidationBus()` 设 env 时构造
    `RedisInvalidationBus` 且两条连接都挂 error 监听、构造即订阅；两个写调用点仍调
    `invalidateDiscoverRoute()`。
- **反向对照的意义**：正向门与反向门走**同一份业务代码**，唯一变量是"线路通不通"。反向门红着证明
  正向门的绿来自真修复，而不是碰巧——没有广播时 stale 必然复活。
- **零回归**：`discover-singleflight.test.ts` + `discover-route-cache.test.ts` 仍 **15/15**，合计
  三文件 **30/30**。
- `tsc`（只含改动文件及其导入图的窄 tsconfig，继承 web 配置 + `skipLibCheck`）**exit 0**；
  `eslint` 三个文件逐个足堆（`--max-old-space-size=2000`）**各 exit 0**。类型检查中途真正抓到并修掉
  一个 lint：`publish()` 里对 Promise 做布尔防御判断触发 `@typescript-eslint/no-misused-promises`——
  契约明确返回 `Promise`，直接接 `catch` 即可，防御是多余的。

## 取舍：这是"尽快失效"，不是强一致

- pub/sub 是 **fire-and-forget**：断线窗口里漏掉一条失效的实例，最坏 15s 后由 TTL 自然收敛，不会
  永久陈旧。选的是 CAP 里可用性那一半——写请求不等线路、总线坏了业务照常。要"绝不陈旧"得上分布式
  锁 / 版本号条件写，那是另一个量级的复杂度，且 discover 是幂等只读、没有那个必要。
- 收到别机失效后清本地 Redis 驱动会 `DEL` **共享键**，可能顺手删掉别的实例刚算出的新值——代价是一次
  **多余重算**（single-flight + TTL 很快收敛），不损正确性。
- `generation` guard 仍是 **read-then-await-set**（ADR 0097 已记），跨实例的 clear 是 fire-and-forget；
  在"判定代号未变"与"`SET` 落地"之间的极小间隙里仍可能有一次别机失效交错进来，最坏是一个 15s 的
  陈旧头部。这是被记录的**界**，不是事故；为它上 Lua/WATCH 对这个只读路径不划算。
- 单进程 memory 驱动下 hub 里只有自己，广播被回环过滤掉 = no-op——正确：本地失效由
  `invalidateDiscoverRoute()` 自己同步做，总线只负责**别机**那半边。

## 仍欠（如实记）

1. **没有真 Redis pub/sub 端到端腿**：本机 6379 / 56379 都连不上、`ioredis-mock` 未安装、Docker
   engine 当前拒绝启动容器。所以"两台真进程经真 Redis 的 `PUBLISH`/`SUBSCRIBE` 字节往返"**未跑**，
   不是已验。行为门用的是真 `RedisInvalidationBus` 类 + fake 连接工厂（确定性覆盖发布/订阅/过滤/记账
   的编排）+"真类 + 共享 channel registry"模拟两台机器。真线路那一格仍欠，记为 still-owed。
2. **没有真 HTTP 两实例腿**：没在 `next start` 下开两个进程、打一次真 publish 再从两台的
   `/api/discover` 读回，故"线上两实例"的组合行为未实测。
3. **`origin` 依赖进程内唯一**：默认 origin 是 `${pid}:${Date.now(base36)}:${seq}`，同进程内唯一；
   跨进程靠 pid 区分。极端情况下（容器重启、pid 复用撞上同一 base36 毫秒）理论上可能撞——真部署
   应配一个显式稳定的实例 id；本片没引入该配置旋钮，记下这个界。
4. **`RedisInvalidationBus` 的帧版本只有 v1**：将来换格式时 v1 实例会把 v2 帧记为"不合契约"并丢弃
   （不会误读），但那台 v1 实例的窗口就此收不到失效、只能靠 TTL 收敛——这是滚动升级期间可接受的
   降级，没有做双版本并行订阅。
5. **`DiscoveryCache` 两个驱动的 mutate 别名差异**（ADR 0095 已记）本片未触碰，与本片正交。
