# ADR-0106：超时是重试的活触发源——钉住慢写不被重放，并抓出一只会说谎的测试桩

- 状态：已接受（2026-11-11）
- 相关：`services/nexus-gateway/src/main/java/dev/nexus/gateway/GatewayConfig.java`（`edgePolicy` 的
  `.retry(...)`：`setExceptions(IOException, TimeoutException)` 两个异常触发源，均受 `setMethods(GET)` 约束）、
  `services/nexus-gateway/src/main/resources/application.yml`（`resilience4j.timelimiter`：生产 5s，
  测试普遍 override 到 800ms——写下至今**从无专门判据**）、
  `services/nexus-gateway/src/test/java/dev/nexus/gateway/GatewayTimeoutWiringTest.java`（新增，超时 wire 判据）、
  `services/nexus-gateway/src/test/java/dev/nexus/gateway/GatewayRetryTransportWiringTest.java`（§SC-33，
  IOException 那一半）、`services/nexus-gateway/src/test/java/dev/nexus/gateway/StubUpstream.java`（新增
  `startConcurrent()` 并发分派 + 保留默认串行 `start()`）、
  `services/nexus-gateway/src/test/java/dev/nexus/gateway/GatewayRoutingTest.java`（既有的弱 cause 断言，
  本 ADR 用真值断言补强但刻意不改它）、`docs/adr/0105`（对称的 IOException 半）、
  `docs/adr/0101`（同源的 `already committed (503)` 时序边界）、`docs/ROADMAP.md` §SC 第三十片。

## 背景

`GatewayConfig.edgePolicy()` 的重试声明了两个异常触发源：

```java
.setExceptions(IOException.class, TimeoutException.class)   // 两个都受 setMethods(GET) 门约束
```

§SC-33（ADR-0105）把 `IOException` 那一半——后端连接层直接断——钉在了 wire 上：断连的 POST 恒 1 次、
GET 至多 2 次。但 `TimeoutException`（后端还连着、只是**慢到超过 timelimiter**）那一半从没被测过，而它
是 resilience4j 四件套（breaker / retry / bulkhead / timelimiter）里唯一没有独立判据的一块：
`application.yml` 的 `timeout-duration` 从写下起被所有测试当成"背景参数"override 掉，没有一条断言问过
"后端真的慢超时时，门做了什么"。

这不是补一个差不多重复的测试。风险与 §SC-33 同源但触发机制不同：`TimeoutException` 若不受
`setMethods(GET)` 门约束，一次慢 POST 会被重放成两次投稿——正是路由注释
"a proxy that repeats a write is how one click becomes two publications" 要防的数据级事故。既有
`GatewayRoutingTest.aBackendThatOutlivesTheTimeLimitAnswers503NamingTheFailure` 只证明"慢后端回 503 不是
空成功"，且 cause 断言弱到 `isNotEqualTo("not-reported")`（对**任何**非默认 cause 都放行），既没测慢写
是否被重放，也没证明记录的 cause 真的是超时。

## 先实测，不猜（一次性探针，跑完即删）

按项目"先实测再断言"纪律，用 5 轮探针打真实慢后端（`timelimiter=250ms`、后端 `delay(1200ms)`、
breaker 保持 CLOSED 以隔离纯超时），读 caller status / `$.cause` / 后端 wire 计数。第一轮读数：

| 探针首轮 | POST wire | GET wire | status | cause |
|---|---|---|---|---|
| 5 轮 | **1,0,0,0,1** | **0,0,0,1,0** | 全 503 | 全 `java.util.concurrent.TimeoutException` |

**wire 大量为 0 是说谎的读数**——不是网关没转发，而是 `StubUpstream` 底下的 `HttpServer` 默认**串行**
分派：一个 `delay(1200ms)` 的慢请求占住唯一分派线程后，后续请求根本进不了 `handle()`，而 `paths.add()`
正在 `handle()` 里，于是 wire 读成 0。在这种桩件上，即使网关真把 POST 重放了也测成 0——**它会假绿**。
status 与 cause 之所以全对，是因为那两样不依赖后续请求进桩。

## 修桩件，不修生产

给 `StubUpstream` 加 `startConcurrent()`：一个 cached thread pool 作为 `HttpServer` 的 executor，让并发/
在途请求真实抵达 `handle()`。默认 `start()` **完全不改**（executor 为 null、不 setExecutor），保证既有
90 个 wire 测试的实测语义一字不动。同一探针在并发桩上重跑：

| 探针并发轮 | POST wire | GET wire | status | cause |
|---|---|---|---|---|
| 5 轮 | **1,1,1,1,1** | **1,2,2,2,2** | 全 503 | 全 `java.util.concurrent.TimeoutException` |

这才是对网关的真实测量。同时查 `resilience4j-timelimiter:2.1.0` 源码订正因果：
`TimeLimiterImpl.decorateFutureSupplier` 在 `future.get(timeout)` 超时时，经
`TimeLimiter.createdTimeoutExceptionWithName` 抛出的是 **`java.util.concurrent.TimeoutException`**，
正是 `GatewayConfig` 引的类——**这个异常触发源是活的**，不是配了却从不命中的死配置。再叠加 §SC-33
已源码确认的 "`RetryConfig` 的 exception 谓词命中后 `return retryableMethod`、套同一个 `setMethods(GET)`
门"，慢写不被重放是**方法门的必然**，与实测 wire 恒 1 一致。

## 落下的判据（钉稳定量，不 pin 时序）

`GatewayTimeoutWiringTest`（3 条，每条多轮把稳定性编进断言）：

1. **`aWriteIsNeverReplayedWhenTheBackendOnlyTimesOut`**：慢 POST × 5 轮，每轮后端 wire **恰 1**、
   caller 诚实 503 + cause 精确为 `TimeoutException`。wire `hasSize(1)` 同时证明"真到了 wire"与"没有第二次"。
2. **`aTimedOutReadIsRetriedAtMostOnceAndAlwaysAnswersHonestly`**：慢 GET × 5 轮，每轮 wire **∈[1,2]**
   （不放大）、caller 诚实 503 + cause 精确。`honestAnswers==ROUNDS` 钉住"永不空 200 / 500 / 挂死"。
3. **`theTimeoutIsReportedAsTheCauseInsteadOfBeingInventedOrHidden`**：单轮把 fallback 五个诚实字段 +
   cause 精确类名钉死——这是 `GatewayRoutingTest` 那条弱断言的** graded 替代**，但建在不会说谎的桩上。

## 诚实边界与决定

- **刻意不 pin**：GET 单轮精确 wire（1 或 2）。重试的第二次 wire 是否被记录，取决于是它先到桩、
  还是 breaker fallback 先 commit 503——与 ADR-0101 的 `ServerHttpResponse already committed (503)`
  同源的调度竞争。`isBetween(1, 2)` 钉"上界"，不钉"这一次是几"；钉死即 flaky 假绿。
- **不改 `GatewayRoutingTest`**：它的桩是默认串行、且只有一条慢读腿，本 ADR 用新类在真桩上补一条
  真值断言即可，动它反而要重验它的历史语义。弱断言留着不删、由强断言在别处覆盖，账在这里记清。
- **不改生产**：超时异常触发源活、方法门挡写、答复诚实，没有缺陷可修。本片的价值是把这条安全不变式
  从"配置存在 + 源码可推"升级为"wire 实测 + 多轮稳定 + cause 真值"，并**堵上一只会假绿的桩**。
- **一条工程教训**：`HttpServer.create` 的默认 executor 是串行的；任何用 `delay`/长 sleep 又断言 wire
  计数的测试，都必须在并发桩上跑，否则测到的是桩的排队、不是网关的转发。这个坑记在此，防后来者复踩。
- **验证**：单类 3/3 PASS（含 5×2 次真实慢超时采样）；网关全套与顶层 typecheck 读数见 ROADMAP
  §SC 第三十片。整仓 eslint 仍是本机内存超时边界（非 lint 报错），如实记；未推送（无明确指令）。
