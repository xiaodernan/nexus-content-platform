# Spring Cloud Blueprint

NEXUS 的 Java 侧是一个真 Spring Cloud 微服务拓扑，不是玩具 demo。本文描述它今天的样子、
每个模块做了什么、下一步是什么。所有测试读数以本机 2026-11-12 实测为准；如实写，不夸大。

## 拓扑（compose 里看得到、证明里跑得通的那一份）

- **java-registry**（Eureka Server）：心跳与上下线；任何服务死活不需要靠轮询猜。
- **java-gateway**（Spring Cloud Gateway + lb）：唯一入口，`lb://nexus-api` 按 Eureka 解析；
  下游 503 时网关如实回 503，不伪造成功。
- **nexus-api**（业务 API，951/951 验证绿）：Java 侧主业务进程，领域事件与对外面向。
- **nexus-domain-service**（领域服务，39/39 验证绿）：`lb://nexus-api` 解析到的那一跳；
  带 Resilience4j 熔断与有界重试；打不上就 503，不挂着。
- **java-config-server**（Spring Cloud Config，5/5）：共享配置门，profile-driven 分发，
  与每个消费者自己的 `application.yml` 共同点到 actuator `health,info,metrics,prometheus`。
- **verify:spring-cloud**（16 节证明，全绿）：48 个迁移回放 + 4 个 jar + 发现轮回 + lb 真转发
  + 503 行为 + 断路器十秒内真开。

## 与现行纪律的对应

- **发现与定位**：Eureka + lb://，不是硬编码地址（本机曾被邻居项目的 config server 占 8888，
  把 domain 服务喂进别人的 eureka，整轮证明空等 60s；配置门改 18888，证明对每个服务带
  -Dspring.cloud.config.enabled=false，可复查）。
- **熔断与重试**：`DomainCircuitBreaker`（Resilience4j）→ v682 Python 复刻 → v683 Redis
  跨实例共享（fail-open/local/closed 三档，degraded 如实标注）→ v684 抖动打破并发同拍
  → v685 jitter 真接进生产 retry（NEXUS_LLM_JITTER_STRATEGY，opt-in）。
- **有界重试 + 死信**：v686/0120 有界重试；毒消息死信；v688/0121 有界死信（LTRIM 配额）。
- **限流/网关**：`verify:rate-limit-rules` 单一真值 + 进程内桶/Redis 共享桶（DB7 实测跨双网关）。
- **队列与死信**：作业平面 Redis 队列（jobs.py）；死信归档 + 有界化（db7 实腿）。
- **指标**：actuator prometheus 五个部署物全量，Micrometer registry + scrape 验过 Accept 读数。
- **配置治理**：config-server 默认端口 18888（避开邻居 8888），消费者侧禁用证明不需要的门。

## 今天不在里面的东西（诚实清单）

1. **分布式链路追踪**：Micrometer/OTel 有依赖门（java-tracing-surface），但 zipkin/Tempo
   容器没有真起；span 的端到端追踪证据不存在，不写成"有 tracing"。
2. **Stream 绑定器实装**：作业平面目前是 Redis 队列 + 死信；没有 Kafka/RabbitMQ 实装的证据，
   说"消息队列真跑通了"不成立——`specproof-rabbitmq` 属于另一个项目，不属于本仓。
3. **Sidecar/服务网格**：没有 Envoy/Istio 的任何字节。
4. **Spring Security OAuth2**：网关注入 JWT 边界，但 STS 不是 Spring 一员。
5. **多 AZ / 多 DC**：单宿主 Compose，不是分布式部署。

## 下一步（按价值/风险排序）

- **P0**：LLM 路径的完整集成压测（ai-service + lb:// + 真 gpt-6-sol），量化 p95、错误率、
  熔断触发条件；在观测页暴露这些数（不造指标）。
- **P1**：redis DLQ 与真 RabbitMQ 的决定记录——市场选择前不移植 Stream 绑定器。
- **P2**：镜像 one-hot 校验（每次启动的 pod identity + discovery 对账），防"Eureka 过期条目喂旧"。
- **P3**：DLQ 完整生命周期（v689：dead_letters() 的有界窗口分页 + 导出器 + admin 面板只读面）。
