# ADR-0109 — Bulkhead 是声明出来的边界，不是库的沉默默认

- 状态：Accepted
- 日期：2026-11-11
- 关联：ADR-0095（Spring Cloud 拓扑）、ADR-0101（fallback 抢写响应）、ADR-0103（breaker 运维读数）、ROADMAP §SC 第三十三片

## 上下文

§SC 第二十六片曾**有意不接** Bulkhead，理由有两条：它在 gateway 的 Maven 树里是 `runtime` scope（经 `resilience4j-circuitbreaker` 传递，非 compile），且"并发在途数"的 wire 断言在本机 2.5GB 环境里看着时序敏感、易 flaky。于是 resilience4j 四件套（retry / timelimiter / circuit-breaker / **bulkhead**）长期只差一件，且没人说得清网关到底有没有舱壁。

本轮先用反编译（读字节码，不猜）查清了真实情况，结论与"没接"相反：

1. `ReactiveResilience4JCircuitBreakerFactory` 与 `ReactiveResilience4JCircuitBreaker` **都持有 `ReactiveResilience4jBulkheadProvider` 字段**；`ReactiveResilience4JAutoConfiguration$Resilience4jBulkheadConfiguration.reactiveBulkheadProvider(BulkheadRegistry)` 是一个默认注册的 `@Bean`。即 Spring Cloud 的 reactive 断路器**早就**在每条 route 的 Mono 上套了 `SemaphoreBulkhead`。
2. `ReactiveResilience4JCircuitBreaker.run(Mono, fallback)` 的字节码顺序是：`bulkheadProvider.decorateMono(...) → CircuitBreakerOperator → Mono.timeout(...timelimiter...) → onErrorResume(fallback)`。舱壁在**最内层**包原始请求。
3. id 绑定坐实：`gateway filter → create(id) → create(id, id)`，`decorateMono(groupName=id)` 从 `BulkheadRegistry` 按 id 取实例；而 id 正是 `GatewayConfig` 的 `setName(service)` = `nexus-api` / `nexus-domain-service`。所以 yml 里 `resilience4j.bulkhead.instances.<service>` 与 route 同源。
4. 默认值是 `BulkheadConfig.DEFAULT_MAX_CONCURRENT_CALLS = 25`（字节码常量坐实），`max-wait-duration=0`。

**所以真正欠的不是"接不接"，而是**：这个舱壁一直以库的沉默默认 25 在跑，**无显式配置、无 env 可调、无运维读数、无 wire 级行为证明**。一个决定"多少并发能打到后端"的边界，靠依赖库默认值是不合格的——它随版本变、看不见、也没人知道满时会发生什么。

## 决定

1. **显式化并参数化**：`application.yml` 为两个后端各声明 `resilience4j.bulkhead.instances.<service>`：`max-concurrent-calls: ${NEXUS_GATEWAY_BULKHEAD_MAX_CALLS:25}`、`max-wait-duration: 0`。**默认仍取 25（库默认）**，故声明行为不改变现状——这次改的是"谁在决定这个值"：从库默认变成平台显式选择、部署可 env 收紧。`max-wait-duration=0` 是刻意的：舱壁满时立即**减载**，不排队、不制造隐藏的延迟悬崖。
2. **运维读数**：`management.endpoints.web.exposure.include` 由 `health,circuitbreakers` 扩到 `health,circuitbreakers,bulkheads`。**诚实边界（探针实测）**：resilience4j 2.2.0 的 `BulkheadEndpoint` 默认只返回名字列表 `{"bulkheads":["nexus-api","nexus-domain-service"]}`，`/actuator/bulkheads/{id}` 是 **404**，**没有实时在途数可读**。这是"哪些 route 挂了容量边界"的读数，不是并发占用仪表；占用行为由 wire 测试证明，绝不把名字表包装成容量指标。
3. **保护面**：`bulkheads` 不进 `PlatformAuthFilter` 白名单（只有 `/actuator/health` 在）。auth-on 时无 token 401、带 token 200、health 仍开放——独立 context 实测，不假设 breaker 端点被覆盖就推出 bulkhead 也覆盖（每个 actuator handler 是独立 mapping）。
4. **wire 级判据**（`GatewayBulkheadWiringTest`，确定性夹具）：用 `StubUpstream.holdNext(n)` 把前 N 个后端 handler 线程**占住**，并用 `awaitHeld()` **证明**它们在途，再发第 N+1 个调用。钉三条不变式：
   - 满时第 N+1 个调用得**诚实 503**，`cause = io.github.resilience4j.bulkhead.BulkheadFullException`；
   - **拒绝发生在 wire 之前**：后端只见到被放行的 N 条，不放大、不把更多工作压给已满载的后端；
   - 与 OPEN 态区分：breaker 全程 CLOSED，cause **不是** `CallNotPermitted`。容量减载 ≠ 后端故障，两者不能混为一谈。
   - 释放后自愈：在途调用完成，新调用重新 200 且真到后端。
   - 每个判据连跑 3 轮，并把整套测试重复 3 次，证明稳定而非一次侥幸。

## 为什么此前判"易 flaky"如今能做

不是硬件变了，是**换掉了会抖的夹具**。旧思路靠 `sleep` 让请求"碰巧"重叠，读一个瞬时 wire 数——这在 2.5GB 机器上是竞态。新夹具用 `CountDownLatch` 做**确定性占用**：`holdNext(n)` 占住线程，`awaitHeld()` 是占用成立的握手，**占用是事实之后**才发下一个调用，没有" hope they overlap"。两个关键工程约束：

- **必须 `startConcurrent()`**：`HttpServer` 默认**串行**分派，一个被占住的 handler 会挡住后续请求，wire 假读（SC-34 抓到过同类桩谎言）。
- **等待必须有界、释放必须兜底**：`gate.await(5s, ...)` 有上界，`@AfterEach` 无条件 `release()`。SC-36 一支对比探针曾因非 daemon 线程未退 hang 住 JVM 退出 9 分钟被杀；本片绝不让红色断言钉死线程。
- **并发腿必须用非阻塞 `WebClient`**：`WebTestClient.exchange()` 是阻塞的，一个线程发不出两个在途请求——这正是一开始探针编译就拦下的工具选型错误。

## 后果

- 正面：resilience4j 四件套首次全部有显式配置 + wire 判据；"容量边界"从一个看不见的库默认变成可调、可读、可测的平台承诺；一套可复用的确定性并发夹具进 `StubUpstream`。
- 代价：`/actuator/bulkheads` 只给名字（库能力所限，ADR 明说）；全套 context 因新增测试类逼近堆上限，其根治见 ADR-0110。
- 无须改生产 Java：Spring Cloud 的舱壁接线本就正确，减载行为本就安全。本片是"把正确但沉默的事实变成显式、可测的承诺"。

## 验证

- `GatewayBulkheadWiringTest` 3/3（连跑 3 次稳定）；`BulkheadActuatorWiringTest` 3/3；`BulkheadActuatorAuthTest` 3/3。
- 网关全套 `mvn -o -B test`：110/110（三次成功，见 ADR-0110 的 context 缓存修复）；顶层 `npm run typecheck` 14/14。
- 一次性探针（跑完即删）：反编译 5 类字节码 + 3 轮真实并发读数（第三个调用 503/`BulkheadFullException`/wire 保持 2/释放后自愈）。
