# ADR-0110 — 响应中途断开不说谎；以及测试 context 缓存必须封顶

- 状态：Accepted
- 日期：2026-11-11
- 关联：ADR-0101（fallback 抢写响应 / already committed）、ADR-0105（连接层断连重试）、SC-36（JVM 退出 hang）、ROADMAP §SC 第三十四片

## 第一部分：响应中途断开（SC-38）

### 上下文

后端故障有四种形状，此前三种已有 wire 判据：5xx 响应（`GatewayRoutingTest`）、连接拒绝/OPEN 快速失败（`GatewayCircuitOpenWiringTest`）、**任何响应字节之前**断连（`GatewayRetryTransportWiringTest` 的 `/drop`）。**第四种从没测过**：后端发出 `200 + headers + 一部分 body`，然后声明的 `Content-Length` 未满足就关闭 socket。这恰是最容易说谎的一种——网关可能把"半截 JSON"当成功转给调用方，调用方解析出空内容，报告"没有数据"，而真相是"后端死了"。§159 禁止用空列表冒充 outage，这里是它的近亲（部分响应冒充成功）。

### 一次性探针实测（先读数，不预设结论）

`StubUpstream.truncateResponses()`：`sendResponseHeaders(200, full.length + 4096)` 声明比实际更长的 body，只写前半就 close。GET/POST 各 3 轮读数一致：

- 调用方收到**连接级失败** `reactor.netty.http.client.PrematureCloseException: Connection prematurely closed DURING response`，**从未**收到 200 + 截断 body；
- 后端 wire 恒 **1**（GET 没有被重试——它已拿到 200 头进入 body 阶段才断，retry 的 `setStatuses(503)` 与 `setExceptions(IOException)` 都不覆盖"响应头已转发后的 body 断流"；POST 也不重放）；
- 健康基线 200 / bodyLen=42，夹具不污染。

### 决定与诚实边界

**不改生产：网关已经正确，没有缺陷。** 本片把安全属性变成 wire 不变量（`GatewayTruncatedResponseWiringTest` 3 条 × 3 轮）：①中途断开绝不返回"成功响应"（失败信号必须带 `PrematureCloseException ... DURING response`，不是伪造的 cause）；②GET/POST wire 恒 1、不重放不放大；③健康应答仍是真 200（守夹具不自欺）。

**必须说清的边界**：调用方看到的是**连接级异常，不是一个干净的 503**。原因见 ADR-0101 的 `ServerHttpResponse already committed`——body 断时网关已把 200 头转给下游，再把状态改写成 503 会撞"响应已提交"。所以平台**无法**在此承诺诚实 503，能承诺且已证明的是"不把断流伪装成成功"。若将来真要干净 503，需要**响应提交前全量缓冲 body**的更大生产改动，另立片评估，本片不假报已做到。刻意不 pin：每轮耗时（冷连 ~1.2s / 热连 ~30-50ms）、包装异常的确切类型（reactor 可能裸抛或包 `Exceptions$ReactiveException`），只钉语义。

## 第一部分附：多实例 retry × LB 的 committed 竞态（已探、有意不做成 wire 判据）

SC-38 期间顺手探了一个常被误解的 Spring Cloud 语义（一次性 3 轮探针，跑完即删）：**gateway 的 route-level retry 遇到一个宕机实例时，会不会 failover 到健康实例？** 配 SimpleDiscovery 的 `nexus-api[0]`（持续断连）+ `[1]`（健康），RoundRobin，breaker 强制 CLOSED（`minimum-number-of-calls=100`）。逐请求实测（6 轮，读数确定）：

- 每个请求 wire 上 dead=1、live=0/1（retry **确实**会重选实例，第二条 attempt 落到健康实例并答 200）；
- **但 caller 恒得 503**，`cause` 恒为 dead 实例那条 attempt 的 `PrematureCloseException`，breaker 全程 CLOSED；
- 停止断连后立刻全 200（dead=2 / live=3）。

**定论**：这是 ADR-0101 记录的 `ServerHttpResponse already committed` 竞态的**跨实例版本**——第一条（dead）attempt 的异常先被 breaker filter 的 `onErrorResume` 拿去 commit 503，第二条（live）attempt 的 200 随后到达却已无处可写。健康实例的应答白干，且 caller 从 cause **看不出**曾有健康实例答过 200。

**有意不做成永久 wire 判据（诚实，避免 flaky 负债）**：① `liveWire`（0/1）与最终 status 受 retry/fallback 调度竞态支配，钉任一精确值必 flaky，与 ADR-0101/0106 同源；② 本质不是独立新缺口，是已记录 committed 边界在多实例下的重演，重复钉它没有新信息；③ 本探针用 **SimpleDiscovery 静态列表（无健康剔除）**，而真生产用 eureka——坏实例会被心跳摘除，从源头减少该竞态触发。**部署含义（值得记）**：`/actuator/circuitbreakers` 的 OPEN/失败读数是 **service-id 级**，无法告诉你"是哪个实例坏了"；在 eureka 摘除窗口内，单实例故障仍可能以整组 503 的形式出现。若将来要根治，方向是"响应提交前全量缓冲"或"按实例粒度的 breaker/bulkhead"，两者都是更大生产改动，另立片评估。

## 第二部分：测试 context 缓存封顶（本轮被迫发现并根治）

### 上下文与真实现象

SC-37 新增 4 个 `@SpringBootTest` 后，网关全套从 98 涨到 110 条。连跑两次全套，**每次各红一条不同的既存测试**（`GatewayRetryTransportWiringTest` wire=0、`GatewayRoutingTest` 读到残留 `"/drop"`），第三次三条不同的既存测试同时红（含两个 actuator 的 `/actuator/health` 报 **503**、`ServiceHealthProbeTest` 变 UNKNOWN）——但**每一条单独跑都稳定**。同时稳定出现 `Surefire is going to kill self fork JVM. The exit has elapsed 30 seconds after System.exit(0)`。

逐个改断言是错的。对照实验给出根因：**排除本轮 4 个新类后全套 62 条 BUILD SUCCESS、零告警**。即抖动由新增 context 触发，但**病灶是测试基础设施**：全套有 **21 个 RANDOM_PORT `@SpringBootTest`**，每个带不同 properties → Spring context 缓存默认 `maxSize=32` 会把**全部 21 个 Spring + Netty context 常驻在同一个 `-Xmx512m` fork 里**。新增 4 个把常驻数推过堆临界点 → GC 压力拖慢 health 探测（报 503）、拖慢 in-flight wire 记录（时序漂移）、拖住非 daemon 线程（fork 退出告警）。

### 决定

给 surefire `argLine` 加 `-Dspring.test.context.cache.maxSize=4`（属性名经 `spring-test` 的 `ContextCacheUtils.retrieveMaxCacheSize()` 字节码核实，经 `SpringProperties` 读取、`-D` 生效）。缓存上限 4 让 Spring **淘汰最久未用的 context**，常驻数不再随测试类线性增长。这是**测试夹具界**的改动，零生产影响、不削弱任何断言。取舍明确：context 淘汰带来额外重启，全套耗时升到 ~3:06，换来的是**确定性**——这正是"测真实读数不粉饰"该付的代价。

顺带把两条被环境压力揪出的**既存过度紧断言**改成语义等价的稳健形式（不放宽）：

- `GatewayRetryTransportWiringTest`：wire 读数改经有界 `StubUpstream.awaitPathsAtLeast(1, 250)`，等"至少 1 条 attempt 落 wire"这个 floor（retry 第 2 条可能晚于 fallback 提交 503 才落），再钉上界 ≤2。保留"真到后端(≥1)"和"不放大(≤2)"两条不变式，只消除读取竞态。
- `GatewayRoutingTest` domain 腿：`assertThat(apiUpstream.paths()).isEmpty()` 改为 `doesNotContain(domain 那条路径)`。原断言声称"api stub 全程空"，比它的本意"domain 路径没被错路由到 api"更强；前一条 `/drop` 测试的 retry 尾请求会在 `clearPaths()` 之后落到 stub，留下无害的 `"/drop"`。新断言照样抓住真 bug（route 把 `/domain/**` 发去 nexus-api 会出现 domain 路径），却不误伤别的方法的 in-flight 尾巴。

### 验证

- context 封顶前：连跑三次全套，三次各红不同既存测试 + 稳定 fork 告警。
- context 封顶后：三次独立全套 `mvn -o -B test` 均 **110/110 BUILD SUCCESS、fork 告警消失**（capped RUN1/RUN2/final 各一次）；顶层 `npm run typecheck` 14/14。

### 经验（供接手）

1. **多个不同测试红、且各自单独绿 = 先怀疑共享资源/上下文累积，别逐条改断言**。对照实验（排除新增类跑基线）是最快的定性工具。
2. **加 `@SpringBootTest` 就要想 context 缓存**：真实 socket 的 context 很重，`maxSize` 默认 32 是给小套件用的；套件一大必须封顶，否则堆临界点上的 health 探测和时序断言会随机红，还伪装成"业务 bug"。
3. **有界等待 + 语义上界** 优于"瞬时读数 + 宽区间"：前者既抓放大又抗竞态，后者容易在"floor 没到"时假红或为求绿放宽成假绿。
