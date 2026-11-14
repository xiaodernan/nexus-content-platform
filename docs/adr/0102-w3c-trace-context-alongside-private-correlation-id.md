# ADR-0102：网关说 W3C Trace Context（traceparent/tracestate），与私有 X-Request-Id 并存

- 状态：已接受（2026-11-11）
- 相关：`services/nexus-gateway/src/main/java/dev/nexus/gateway/TraceContextFilter.java`（新增）、
  `services/nexus-gateway/src/main/java/dev/nexus/gateway/GatewayConfig.java`（注册 bean）、
  `services/nexus-gateway/src/main/java/dev/nexus/gateway/CorrelationFilter.java`（既有私有 id，本决定不替换它）、
  `services/nexus-gateway/src/test/java/dev/nexus/gateway/TraceContextFilterTest.java`（5 条无服务器）、
  `services/nexus-gateway/src/test/java/dev/nexus/gateway/GatewayTraceContextWiringTest.java`（4 条 wire）、
  `services/nexus-gateway/src/test/java/dev/nexus/gateway/StubUpstream.java`（`clearPaths()` 现同清记录型集合）、
  `docs/ROADMAP.md` §SC 第二十六片、`docs/adr/0010-*`（DEMO MODE / 无 vendor）、`docs/adr/0101`（上一片）。

## 背景

§SC-14 的 `CorrelationFilter` 给每个请求盖一个 `X-Request-Id`：NEXUS 私有，让自家后端日志与调用方响应
引用同一个串。它解决了「我们自己的一跳怎么对齐日志」，但**外部世界不读这个头**——Jaeger / Zipkin /
OpenTelemetry collector、上游 service mesh、任何说 W3C 的服务，都认的是 `traceparent`（W3C Trace Context），
而不是一个自造的 header。于是出现一个真实的互操作缺口：一个 NEXUS 发起的调用，跨出平台边界后其链路
在外部追踪系统里是断的。

用户本轮明确要求「在项目里加一些 Spring Cloud 微服务的元素」「集大成」。可观测性的跨系统传播是微服务
教科书元素，而 W3C Trace Context 是它的开放标准内核。

## 选项

1. **引入 micrometer-tracing / OTel bridge**：完整的 span/sampler/exporter 栈。本机无 tracing backend，
   引入 vendor 栈会把平台拖进「配了 exporter 却没有 collector」的空转，且与 §160/ADR-0010 的 DEMO-MODE
   诚实纪律相冲（不能假装有可观测后端）。否。
2. **把 `X-Request-Id` 改名成 `traceparent`**：破坏既有契约（Studio/后端已读私有头），且丢掉「私有 id 可
   自由格式」的灵活性。否——两个头解决的是两个不同的问题，不是同一个问题的两种写法。
3. **新增 provider-free 的 W3C 头解析/生成 filter，与私有头并存**（选定）：只按 W3C 格式解析/生成随机 id、
   透传 `tracestate`，不采样、不导出、不连任何 vendor。平台因此能说标准、可被外部系统接入，同时对
   「没有 tracing 后端」保持诚实。若将来接真 collector，只需在下游加 span 导出，本 filter 的头部契约不变。

## 决定

- 新增 `TraceContextFilter`（`@Order(HIGHEST_PRECEDENCE + 21)`，紧跟 `CorrelationFilter` 的 +20，路由前）：
  - 入站 `traceparent` **合法**（`00-` + 32hex trace-id + 16hex parent-id + 2hex flags、非全 0、全 hex）：
    **保留 trace-id 与 flags，但生成新的 parent-id**。理由是本网关是一「跳」，不是原始调用方：后端看到的
    父 span 必须是本跳的 span；把入站 parent-id 原样转发，会让整条链共用同一个 span id——看起来连着，
    实际在 span 形状上撒谎。这是真懂 W3C 与「复制字符串」的分界。
  - 入站**缺失或畸形**（长度错、非 hex、全 0、版本非 `00`）：**不传播垃圾**，生成全新 context
    （新 trace-id + 新 parent-id + flags `00`）。
  - `tracestate` **原样透传**：mutate 只重写 `traceparent`，其余头天然保留，符合 W3C「不理解 vendor 条目
    也不得丢弃」的要求。
  - 生成的 `traceparent` 回显到响应，让调用方引用后端实际看到的那一份。
- 随机源 `SecureRandom`；id 用 16 字节 trace-id + 8 字节 parent-id 的规范长度。
- **不改动 `CorrelationFilter`**：私有 `X-Request-Id` 与标准 `traceparent` 各司其职、可同时存在。

## 后果与证据

- `mvn -o -B test -f services/nexus-gateway/pom.xml` = **73/73 BUILD SUCCESS**
  （SC-29 基线 64 + 本片新增 9：`TraceContextFilterTest` 5 条无服务器 + `GatewayTraceContextWiringTest` 4 条 wire）。
- **wire 级读数**（真 socket stub + 真网关 + random port，stub 记录它实际收到的每个请求头）：
  - 无入站头 → 生成合法 W3C context，后端实收到，且与响应回显逐字相同；
  - 合法入站 → 后端实收到的 traceparent **保留 trace-id/flags、parent-id 已换**（≠ 调用方值）、
    tracestate 逐字不变、响应回显同一份；
  - 畸形入站 → 后端实收到的不是那段垃圾，而是一份新 mint 的合法 context；
  - 私有 `X-Request-Id` 与标准 `traceparent` 同一请求并存，各自按自己的规则传播、互不覆盖。
- **首跑如实红 3 条，且是测试桩的真 bug 不是 filter 的错**：wire 类 4 条里「合法入站」那条 PASS
  （证明 filter 真注册进链、换 parent 在线上成立），另 3 条读 `backendSaw(0, ...)` 时读到的是上一个测试
  留下的请求——`StubUpstream.clearPaths()` 只清 `paths`/`forwardedHosts`/`probeHeaders`/`originalUrls`，
  **没清 `requestHeaders`**，而 `@BeforeEach` 依赖它做跨测试隔离。修法：让 `clearPaths()` 一并清
  `requestHeaders`（所有记录型集合共生命周期），三条随即全绿。**没有放宽断言、没有改成恒真**。
  期间还自查掉一次自己引入的重复 `requestHeaders()` 方法定义（编译前已删），未留痕。
- 诚实边界：本 filter **只做头部层**——mint/延续/透传/回显，不做 span 记录、采样决策、导出；没有 tracing
  backend 就不假装有分布式追踪 UI（§159/§160）。`tracestate` 只透传不解析其 vendor 条目。版本只接受 `00`
  （W3C Trace Context Level 1）；将来 `00` 之外的版本一律按畸形重新 mint，不猜格式。
- CI 的 `topology` job 仍从未被真实 push 执行（沿用 §SC-17 起声明）；本片是网关单测，不新增 JVM 冒烟进程。
  未推送（无明确指令）。
