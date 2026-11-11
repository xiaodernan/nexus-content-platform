# ADR-0139：Feign breaker 从假到真——注册表、名称解析、windowed 失败判分

- 状态：已采纳（2026-11-11，§SC-60）
- 关联：ADR-0137（SC-59 Feign 健康探针）、ADR-0126（SC-52 MQ-1 失效总线，同模板家风：真管线钉判据）、
  `services/java-domain-service/src/test/java/com/nexus/domain/feign/AiHealthBreakerOpenTest.java`、
  ADR-0028（线路 fans 案例）、docs/ROADMAP §SC-60
- 触发（user 本轮点名）：**Spring Cloud 微服务元素 + 消息队列 + 计网**。

## 背景

Spring Cloud 家族挂了一圈"形状好看的微服务"（Registry/Config/Gateway+breaker/bulkhead/Feign client），
但 domain-service 的 Feign client（`AiServiceClient`）从没人压过它：表面上它 idle、实则常常直接抛错落地。
SC-59 把它端出来一跳后发现：circuit breaker 没接入 Feign 或窗口永远不会触发。所以"Spring Cloud 有 breaker"
是"形状好看"，不是"真的有保护"。

## 决定

1. **入场动作就是让每次失败都"记一笔"**——Feign 4 + Spring Cloud 2025.0.3 + Boot 3.5.16 需要显式开启
   `spring.cloud.openfeign.circuitbreaker.enabled=true`；没这个 -> 任何失败就是直接 Fallback、不归 breaker
   管、`getNumberOfBufferedCalls()` 恒为 0（这也是 SC-60 的铁证）。
2. **Alphanum resolver 陷阱**：默认 `DefaultCircuitBreakerNameResolver`-based Alphanumeric resolver 把
   `AiServiceClient#healthz()` 剥掉非字母数字后得到 `AiServiceClienthealthz`（无下划线）。拿常见
   "ai-service" 找的是另一个空 breaker。生产中 resolve 是自动的；但 operator 直看线上 actuator 名字就得知道
   这个名是不一样的。
3. **默认库不是平台**：resilience4j `minimum-number-of-calls` 默认 100。永远不会用 5 次失败来断路。
   在 yaml 里写 `resilience4j.circuitbreaker.configs.default.*`，`instances.ai-service` 继承；
   Feign group 模式使用 Feign-client 名，resolver customize 模式用稳定的 "ai-service" key。
4. **controller 新增 `breakerState`**（可选注入 `CircuitBreakerRegistry`）——`"CLOSED" | "OPEN" | "HALF_OPEN" |
   null`（`NEXUS_FEIGN_BREAKER=false` 时出 null，不编造"部署没开"为"健康"）。
5. **Fallback 不伪造健康 payload**：`AiServiceFallback.healthz()` 抛 `AiServiceUnavailableException`
   （RuntimeException、消息明示"不是健康的证明、等 10s 重试"），接口契约看见 class name 后能分辨
   "provider-broken" 与 "breaker cut in"。

## 后果与证据

- **判据**（`AiHealthBreakerOpenTest`）：
  - `@SpringBootTest(properties = {"NEXUS_DOMAIN_PORT=0", "NEXUS_AI_SERVICE_URL=http://127.0.0.1:9"})` 启动一个
    完整的（最小）上下文；失败 5 次后 Feign-breaker metrics bufferedCalls=5, failedCalls=5, failureRate=100.0，
    状态非 CLOSED。port 9 是 discard 端口不承载服务，`assumeTrue` 保护 CI/开发者机被真 Python 服务占用的本地前提。
- **live 序列**：domain-service up + Python 未起；6 次连续探针闭环状态 `CLOSED→CLOSED→CLOSED→CLOSED→OPEN→HALF_OPEN`，
  错误类恒为 `AiServiceUnavailableException`；接着启动 ai-service 时 healthy 返回 200 + breakerState=`CLOSED`；
  熄掉 ai 后短时间内重新跳 OPEN、如实报 `HALF_OPEN`。
- **全套 java 131/131**（AiHealthBreakerOpenTest 1/1、AiServiceFallbackTest 1/1、AiHealthControllerTest 3/3、AiServiceClientWireTest 1/1）。

## 诚实边界

- Alphanum resolver 命名（`AiServiceClienthealthz`）只有 group=false 时使用；组模式使用
  `feignClientName=ai-service` 稳定 breaker key。两个模式任一都会活动，`ai-service` 是稳定名。
- OPEN 10s 是 env-configurable；不硬编码到 code 里。
- `currentBreakerState()` 退居 optional，注册表缺 bean 时返回 null（部署 opt-out 就是健康判断的"看不见"）。
- `/api/v1/system/ai-health` 不推断 provider 是否 OK；只透传 Python `/healthz` 的真相。
- 全程未闷气的另一会话：他们改的是 `/n/[handle]/[slug]`；Stack 不共享。

## 仍欠

- Feign OPEN 未与 gateway circuitBreaker 串成同一信号；
- `verify:topology` 目前用端口 8093 跑 smoke，Feign-breaker 行为未纳入 topology assertion；
- `breakerState` 没有接进 admin 面板（但 `/api/v1/realtime/stats` 这一侧已从后台进 admin； breakerState 可以是下一片 seam）。
- CI topology job 未含本端点、等 push 驯服。
