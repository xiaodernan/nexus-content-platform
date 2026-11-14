# ADR-0137：Java→Python 这一跳上面板——AiHealthController + Feign 超时钉死

- 状态：已采纳（2026-11-11，§SC-59，承接 §SC-6 Java 服务、§SC-18 Feign 底座、§SC-55/§SC-58 探针家族）
- 关联：`AiServiceClient`、`AiHealthController`、`application.yml`（`feign.client.config.ai-service`）、
  ADR-0011（AI 服务只回计划/补丁，持久化在 web 层）、ADR-0026（FeignClient wire 判分）、
  `docs/AGENTS.md`（provider 只有两条路：ai-service / DEMO MODE mock）
- 触发（user 本轮点名）：**springcloud 微服务的元素**——把一块"形状好看、从没呼吸"的微服务梁柱叫成一等公民。

## 背景

domain-service 已经具备 Spring Cloud 全家桶：eureka 客户端、config 客户端、gateway
路由 + breaker + bulkhead、Feign 声明式客户端（`@EnableFeignClients`）+
`AiServiceClient.healthz()`——Wire 判分面全绿。但它**从来没有被调用过一次**：
没有 caller，没有请求，`ai-service` 在这条链上只是构造成功、没人知道活不活。

微服务健全的判据不是"类都建对了"，是"一跳真走了一下，且有东西能看"。

## 决定

1. **把一跳放到运维眼前**：`GET /api/v1/system/ai-health`——Feign 调 `ai-service` 的 `/healthz`（3秒内必回），返回**原样副本** + `status:"healthy" | "degraded"` + `responseTimeMs`。
2. **不代判绿红**：Python 端出什么（providers/capability/queue/Redis note——包括"缺 key 报 unavailable"），Java 原样端出。不造字段、不抹字段、不是这跳的 bug 也如实呈现。
3. **200 不是健康的承诺**：上游死 → `status:"degraded"` + 异常类名 + message + 200。探针不会"自己晕了"（不把 connect refused 翻译成 500），运维对 body 判。
4. **超时钉死**：`feign.client.config.ai-service`：connect 1s / read 3s，env 可覆盖（`NEXUS_AI_HEALTH_CONNECT_MS`/`NEXUS_AI_HEALTH_READ_MS`）。
   没有这两条就是库默认，一个探针挂住一次 pageload 就不叫探针。
5. **未鉴权**：同 `/policy`、`/realtime/stats` 口径——只读健康形状、零载荷；多实例回答的是"回答这次请求的那台"。

## 后果与证据

- `AiHealthControllerTest` **3/3**：上游活（原样保留 providers 单元素、queue backend）/ 上游死（degraded + error 类名 + message，providers 不编造）/ 上游最小报文（缺字段照旧成立）。
- **live 三笔**（8082 起 domain-service，8000 先空后起 Python）：
  #1 空 8000 → `degraded(RetryableException, Connection refused)` **93ms**；
  #2 起 Python → `healthy` service=nexus-ai-service、providers 5 条原样（四未实现/缺 key）、queue backend=redis、**306ms**；
  #3 停 Python → `degraded` responseTimeMs=**2ms**。
- java 全套 **129/129**；AiServiceClientWireTest 零回归。
- **零新依赖**（Feign 已在 dependency 里，只增一段 config + 一个 controller + 一套判据）。

## 诚实边界

- 只端 `healthz` 一跳；`/v1/ai/*` 主路径不受影响（web 仍直连 Python）。
- 探针看的是"端点能表演健康"，不是"provider 真能生成"（缺 key 一律如实 unavailable，Python 自己也说的）。
- 多实例部署每台各答各的；没聚合服务也没健康推导（永远在 catch 里说 degraded，不猜 healthy）。
- 1s/3s 超时按同机校准；跨机要 env。

## 仍欠

- `ai-health` 接 gateway LB + breaker（SC-9/SC-25 那一套，可一键）——另需决定 unauth 面是否要通过 door 或者照样 /platform/health 那类"门外可达"形状；
- provider 真 key（M2/M5）未授权前 capability=unavailable 永远如此；
- topology smoke 未含本端点；CI topology job 仍未经真 push。
