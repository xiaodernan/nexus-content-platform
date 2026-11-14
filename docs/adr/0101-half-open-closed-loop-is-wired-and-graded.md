# ADR-0101：断路器 HALF_OPEN 的闭合回路已接线并有 wire 级判据（后端恢复能自愈、探测失败能重屏蔽）

- 状态：已接受（2026-11-11）
- 相关：`services/nexus-gateway/src/test/java/dev/nexus/gateway/GatewayCircuitHalfOpenWiringTest.java`、
  `services/nexus-gateway/src/test/java/dev/nexus/gateway/StubUpstream.java`（新增可恢复的 `startDropping`/`stopDropping`）、
  `services/nexus-gateway/src/main/resources/application.yml`（`resilience4j.circuitbreaker.instances.nexus-api` 下
  `permitted-number-of-calls-in-half-open-state` / `wait-duration-in-open-state` /
  `automatic-transition-from-open-to-half-open-enabled`）、`docs/adr/0095-*`（SC 起线）、
  `docs/ROADMAP.md` §SC 第二十四片（§SC-24，OPEN 失败快）、`docs/ROADMAP.md` §SC 第二十五片（本决定读数）。

## 背景

§SC-24 用 `GatewayCircuitOpenWiringTest` 钉住了断路器的一整半：`sliding-window=4`、阈值 50% 的连续
连接拒绝后，第 5 次调用被 fallback 直接拒，`cause` 含 `CallNotPermitted`、stub 没收到新请求——
「OPEN 会失败快」从此是一个被 wire 级量过的事实。

但一个只会开、不会合的断路器是一次**穿着韧性外衣的永久停机**：后端重启之后门Still答 503，
流量永远回不来。而 `application.yml` 里那三行 HALF_OPEN 设置——
`automatic-transition-from-open-to-half-open-enabled: true`、`wait-duration-in-open-state: 10s`、
`permitted-number-of-calls-in-half-open-state: 3`——**从写下那天起没有任何测试证明它们真的生效**。
这与 §SC-20（Config 配了没证明送进服务）、§SC-24（breaker 一直在但 OPEN 没量）是同一类欠款：
配置在、接线在、没读数。

## 选项

1. **只补「探测失败→重开」**：抓住了后端没恢复时不能放量的性质，但漏掉真正要紧的「恢复后能不能自愈」，
   而后者才是永久停机风险的正面。否。
2. **只补「恢复→闭合」**：证明门能合，但没证明半开是**受控探测**（后端仍坏时会不会无脑 CLOSED 把流量
   再次砸向脆弱后端）。否。
3. **两条腿都补，且都读平台自己的状态机**（选定）：后端恢复→自动半开→探测成功→CLOSED→流量重新到达
   后端；后端仍坏→半开探测失败→重回 OPEN→后端被重新屏蔽。两条合起来才构成「闭合回路」。

## 决定

- 新增 `GatewayCircuitHalfOpenWiringTest`，两条 `@Test` 覆盖上面两条腿，均跑在
  `SpringBootTest.WebEnvironment.RANDOM_PORT` + 真 socket stub + 真网关上，`eureka` 关、simple discovery
  指向 stub、`rate-limit` 关（免得探测突发被当 429）、`sliding-window-type=count-based`（显式固定，
  自动半开转换只对 count-based 有定义）、窗口缩到 4、等待缩到 1.5s、permitted 缩到 2
  （与 §SC-24 缩窗口同理：让这一片花几通电话、两秒，而不是 10 秒与 3 次）。
- **断言读 `CircuitBreakerRegistry` 里网关路由真正建出来的那个 breaker 的 `getState()`，以及 stub 真正收到的
  请求**——不 pin resilience4j 内部事件计数、不 pin 具体异常类、不 pin「几次探测才重开」这种库细节。
  半开探测失败的腿用有界循环（至多 3 次逻辑调用）等状态最终回到 OPEN，并断言期间**从不 CLOSED**。
- `StubUpstream` 新增 `startDropping()`/`stopDropping()`：一个**可恢复**的中段断连开关，区别于永久 `/drop`
  路径；同一 socket 先制造 OPEN、再宣布后端「回来了」，才能测自愈。所有既有测试因 `reset()` 清零该开关
  而不受影响（全套 64/64 复跑确认）。

## 后果与证据

- `mvn -o -B test -f services/nexus-gateway/pom.xml` = **64/64 BUILD SUCCESS**（基线 62 + 新增 2），
  单类复跑 2/2 PASS；新增判据与既有 62 条同跑无端口/registry 时序互相干扰。
- **恢复腿 PASS**：连续 drop 打开电路（OPEN 态一次调用答 503 且 stub 收不到新请求）→ `stopDropping()`
  后**不发任何请求**，纯等待即观测到状态自动到 HALF_OPEN（`automatic-transition` 三行里的第一行第一次
  被证明生效）→ 2 个探测各答 200 且 `$.from == stub-upstream`（fallback 只会答 503，所以 200 本身就证明
  越过响应线到了后端）→ 状态 CLOSED → 随后普通调用 200 且 stub 收到新路径：**门真的自愈了**。
- **首跑如实红一次，且是有价值的红**：负向腿初版断言「单次失败探测后立刻 OPEN」，实测停在 HALF_OPEN。
  查日志是 Spring Cloud Gateway 的 GET retry（`setRetries(1)`、`setStatuses(502/503)`、`setExceptions(IOException/
  TimeoutException)`）在半开探测上也花掉第二次 wire attempt，使「一次逻辑调用」与「一次 wire 失败」不是
  一一对应——pin「一次探测就重开」等于 pin 库+filter 编排细节。**改为测平台语义**：有界探测直到状态回到
  OPEN、期间绝不 CLOSED、之后后端被重新屏蔽。没有放宽为「接受 HALF_OPEN」，也没有把断言改成恒真。
  日志里 retry 与 fallback 争抢响应提交产生的 `UnsupportedOperationException: ServerHttpResponse already
  committed (503)` 一并如实记录：它是 filter 编排在半开失败路径上的噪声，caller 仍拿到诚实 503；本决定
  不为此改生产 route 语义（retry 只重试 GET、fallback 恒 503 是刻意的），记入已知边界。
- 未验证：`wait-duration` 用的是测试缩放到 1.5s，生产的 10s 值只改了数字未改语义；CI 的 `topology` job
  仍从未被真实 push 执行过（沿用 §SC-17 起的诚实声明）。真实 Eureka 下的半开（本测试用 simple discovery）
  未单独测——半开是 breaker 自身行为，与发现实现无关。
