# ADR-0124：给默认内存令牌桶装一只可注入的钟——refill 算法从"靠 sleep 也测不了"到逐支验电

- 状态：已采纳（2026-11-11，§SC-51）
- 关联：ADR-0076/0077/0081/0082（web 侧进程内限流桶的收口与读数——**不同文件、不同语言**，本片不改它）、
  ADR-0095（微服务拓扑）、SC-7（自研 `RateLimitFilter` + Caffeine 令牌桶）、SC-12（共享限流搬进 Redis）、
  `MemoryRateLimitBackend` / `RedisRateLimitBackend` / `RateLimitFilter` / `GatewayConfig`、
  `MemoryRateLimitBackendTest`（本片新增）

## 背景

网关有两只限流后端，由 `nexus.gateway.rate-limit.backend` 选：`redis`（SC-12，全实例共用一个原子桶）与
`memory`（进程内令牌桶，**默认**——"门要不靠第二个进程就能答"）。`RateLimitBackend` 接口一句话承诺
`tryAcquire(clientKey) → 放行/拒绝`。

**不对称是真的**：`RedisRateLimitBackend` 一直有 `RedisRateLimitBackendTest`（mock template，钉 key、参数、
TTL、脚本裁决）；默认的 `MemoryRateLimitBackend` **一只测试都没有**。唯一沾到它的是
`RateLimitFilterTest` 的 4 处，全部用 `new MemoryRateLimitBackend(0, burst, …)`——`refillPerSecond=0`
把补水关掉换确定性计数。也就是说，令牌桶最核心的那部分——**按速率补水、纳秒→秒的换算、补到 capacity 封顶、
不足一整个 token 不放行**——从来没被跑过一次。

原因是具体而朴素的：`Bucket.refill()` 直接读 `System.nanoTime()`。想验"过 100ms 补一个 token"，除了真
`sleep(100)` 没有别的办法，于是没人写。而这类靠墙钟的测试在并行会话压着这台机器时本来就不可靠。
一个**默认就在跑**的限流后端，其核心算法零判据：除数是 `1_000_000` 还是 `1_000_000_000`、封顶的
`Math.min` 还在不在、扣减有没有锁——写错了不会有任何一行测试变红。这正是"声明了令牌桶，却没兑现它的
可验证性"，和本项目一路抓的"报告与实现不许分叉"是同一件事。

## 为什么不顺手改那十几处 offset（探查中证伪的方向）

只读探查时，`nexus-api` 里十几处 `PageRequest.of(from / asked, asked)` 看着都像"声明 offset=ROWS、实际
按整页跳"的 bug（`from=25, asked=20` 只跳 20 行）。**逐处读了测试注释后确认不是**：
`LikeServiceTest:268`、`ReportServiceTest:287`、`TipServiceTest:238`、`AuditServiceTest:243`、
`FollowServiceTest:233`、`SubscriptionServiceTest:410`、`ModerationServiceTest:236` 等明写着
"handing the raw number to `PageRequest.of` would read it as page 40 / …"——即 `from / asked` 这个
**整页翻译是有意设计、且已被逐处固化的行为**；javadoc 里"offset is ROWS"与实现的措辞不一致是另一笔账，
把它当 bug 去"修"会同时撕裂十几个服务与它们的判据。**不动它**——这是拒绝二手结论、先读测试意图的结果。
`CommunityPolicy` 的"缓存声明"也被证伪：它是单例 `@Component`、构造只读一次，没有热路径收益。

## 决定

**一、钟是注入的，不是读墙的，且生产行为逐字不变。** 保留三参构造
`MemoryRateLimitBackend(refillPerSecond, burst, maxClients)`，它委托给 `System::nanoTime`；新增四参构造
多接一个 `LongSupplier clockNanos`（纳秒）。`Bucket` 一并接住这只钟。于是生产路径与改动前**完全等价**，
而测试可以把时间一格一格推进。没有改 `RateLimitBackend` 接口、`RateLimitFilter`、`GatewayConfig`、
`describe()`——范围钉死在这一个文件 + 一个新测试文件。

**二、把锁内多余的原子操作化成普通 `long`。** 原实现 `lastRefillNanos` 是 `AtomicLong`，在
`refill()` 里 `getAndSet(now)`；但 `refill()` 只被 `synchronized tryAcquire()` 调用，`tokens`（`double`）
与时间戳全在同一把锁下，这里的 CAS 是多余的，且 `AtomicLong` 暗示了一个本类并不主张的"无锁安全"。
改为普通 `long`。**并发正确性靠判据证明，不靠类型**——见验证里的臂 C。

**三、时间回退的边界由判据抓出来、由实现兑现，双方不许分叉。** 首版实现沿用
"无论补不补都把水位推到 `now`"，而新判据"时钟回退不补不扣"跑红：回退把水位拉到过去的小值，下一步前进
会把回退期间丢掉的时间当 elapsed 补回来、平白铸出 token。这对**单调**的生产钟不可达，但既然开了注入
这只缝，它就得有个诚实、全备的契约。现在水位**只在前进时推进**，回退被完全忽略；单调钟下行为零变化。
这条不是"为不可能的输入加机制"，是"既然声明可注入任意钟，就不许注入后行为与自己写下的注释相反"。

## 后果

1. **默认后端终于与 Redis 后端同等待遇**：一整套不 sleep、不上下文、不容器的毫秒级判据，覆盖满桶首击、
   按速率补水、封顶、不足一 token 拒绝、多 client 隔离、`rate=0` 纯 burst 上限、时钟回退、并发不超额、
   `maxClients` 有界、诚实 `describe`。换除数、删封顶、去锁，各有判据变红（见验证）。
2. **`maxClients` 被挤掉的那只桶下次进来重新是满的**——这不是新引入的，是 Caffeine 有界_map_ 既有语义，
   判据把"不抛、照常答"钉住，并把"可能白送一只桶一次满额"的代价写在注释里，而不是藏起来
   （与 ADR-0077 对 web 侧 LRU 淘汰"往更松方向错"的坦白同构，但两者是独立实现）。
3. **注入缝是全备契约，不是测试专属后门**：四参构造是包私有，与三参生产构造并存；不会有人在生产误传
   一只非单调钟而不知道——它若真传了，行为由第三条明确定义（回退忽略），不产生歧义。

## 验证（不粉饰）

- **新判据 `MemoryRateLimitBackendTest` 10/10 全绿**（`Tests run: 10, Failures: 0, Errors: 0`，0.645s，
  纯 `new` + `AtomicLong` 手摇钟 + 8 线程池，零 Spring 上下文、零容器）。
- **三条变异臂，各有牙，逐条还原**（项目 ADR-0077 纪律：一次只改一处、跑、立刻改回）：
  - 臂 A：除数 `1e9 → 1e6`（纳秒当微秒）→ 精确红 **2** 条（`elapsedTimeRefills…` / `lessThanOneToken…`）。
  - 臂 B：删掉 `Math.min(capacity, …)` → 精确红 **1** 条（`aLongWaitRefillsNoMoreThanTheCapacity`）。
  - 臂 C：删掉 `synchronized` → 并发判据红（40 个争抢、burst=5，放行数 > 5）。
- **gateway 全模块干净重跑：126 tests / 0 failures / 0 errors / BUILD SUCCESS / EXIT=0**（3m11s）。
  - 首跑曾报 `126 / Failures: 1`，定位后如实定性：那 1 条是 `GatewayCircuitHalfOpenWiringTest` 的
    **时序偶发红**（并行会话抢资源；单跑 2/2 全绿，干净全模块跑亦全绿），与令牌桶零因果。
  - 另有三份失败 `.txt`（`GatewayBehaviourTest` / `GatewayEmptyRegistryTest` / `BulkheadProbeTest`）
    时间戳为 **02:50 / 10:32 的陈旧报告**，其源文件当前已不存在（并行会话删/重构）；清掉
    `target/surefire-reports` 后重跑，它们不再出现。**不把陈旧报告当本次失败，也不掩盖本次那条偶发红。**
- 改动前先跑了 gateway 基线（同样 EXIT=0），保证任何红都能归因；改动后 `mvn -DskipTests compile` EXIT=0。
- 未改 web 侧任何文件、未碰真库/真 Redis、未碰并行会话正在改的 `nexus-registry/application.yml`、
  `nexus-config/application.yml`、前端 `page.tsx`/`globals.css`。测试解包出的 `BOOT-INF/` 副产物已清理。
- **全仓 web vitest 本片未复跑**：与 SC-48/49 同因——本机多 agent / 多项目并发跑 vitest 抢同一个
  `nexus-postgres(max=5)`，无干净窗口；本片是**纯 Java 改动**，验证全部落在 gateway 的 `mvn test`，
  与 web 套件无因果关系，故不以 web 全仓数作陈述。未 push。

## 仍欠

1. `redis` 后端的 refill 是**真 Redis `TIME` + Lua**（SC-12）原子完成，已有 mock 判据 + 真 Redis 演练；
   本片只补内存那只，**不假装两者已统一**——两台网关各数各的仍是 `describe()="memory"` 明说的代价。
2. SC-50（共享缓存 `retryStrategy:()=>null` 断后永不重连 + 恒报 `driver=redis`）仍停在探查
   （ADR-0125），待"外部 vitest 全停 + 干净全仓窗口"才实现——不在验证受限时动共享 fail-open 契约。
3. offset"ROWS vs 页"的 javadoc 措辞不一致（本片背景里点名、有意不动）另记一笔；真要统一是跨十几处
   服务 + 判据的产品决策，须单独一片、且要有干净全仓窗口，不在本片顺手做。
