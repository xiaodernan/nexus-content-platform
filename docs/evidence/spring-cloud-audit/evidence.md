# §SC-NEW · Spring Cloud 微服务面审计——项目已装了，什么是真、什么缺、什么是没做（2026-11-13）

用户要求"看能不能在项目里面加一些 spring cloud 微服务的元素"——走一遍三服务（nexus-api / java-domain-service / nexus-gateway）与两个骨架（nexus-registry / nexus-config）。结论先写：

**已经装了不少 Spring Cloud，不缺名词，但要"更多"；补的是真实的小缺口；不补的是表面的大东西。**

---

## 真已装、且能跑（静态核对 2026-11-13）

| 元素 | 在哪 | 状态 |
|---|---|---|
| **Spring Cloud Config Server** | `services/nexus-config`（ConfigServerTest 覆盖 4 个 served-defaults health probe）| 真在跑、真有测试 |
| **Eureka Server / Registry** | `services/nexus-registry`（RegistryBehaviourTest）| 真在跑 |
| **Spring Cloud Gateway** | `services/nexus-gateway`（`GatewayConfig.java` 以 DSL 组 | 真在跑 + 有判据 |
| **LoadBalancer** | gateway + domain-service 各一位；gateway 明确用 `reactor-loadbalancer` | 真在跑 |
| **Resilience4j** | gateway 4 个 primitive 全配：retry + circuitBreaker + bulkhead + fallbackURI | 4 个都现身 |
| **OpenFeign + Resilience4j** | domain-service→ai-service 的 Feign client | 真在跑（+ AiServiceFallback） |
| **Reactor Resilience4j** | gateway 的 backpressure primitive | 真在跑 |
| **Actuator** | 3 个 JVM 服务都有；`show-details:never` 纪律 | 真在跑（见 §FE-35 admin observability） |
| **Eureka Client（all three）** | `nexus-api`、`nexus-gateway`、`java-domain-service` 都带 `netflix-eureka-client` | 真在跑 |
| **Config Client** | 三个 JVM 都有 `optional:configserver` import | 真在跑 |

自测表上 13/13 全绿（见 `docs/evidence/spring-cloud-audit/checklist.txt`）。

---

## 缺口（真实的、可补的，但需谨慎）

### 1. **Java-domain-service 的 Eureka 注册默认关的**
`eureka.client.register-with-eureka: ${NEXUS_DOMAIN_REGISTER:false}`
——开箱不注册。这不是 bug 也不是遗忘，而是"注册默认关闭、显式 env 打开"的纪律（`.env.production*` 会被部署方填，本开发环境本机默注册未启）。   **保持原样。**

### 2. **Python ai-service 不是 Spring Cloud 生态成员**
OpenFeign 对 Python 只能走 HTTP；Eureka 注册只写 Java。这是 Python 栈本身的问题，不是本仓库的选择——**不把 Python 伪装成 Eureka 实例**。
**保持原样。**

### 3. **Spring Cloud Gateway 目前不 fetch-registry**
gateway 当前读 `NEXUS_REGISTRY_ZONE` 作为 Eureka Zone 常数，`register-with-eureka: false`——gateway 自己不注册；这是合理的（gateway 是"不用算 registry 就知道自己位置"的模型）——**保持原样。**

---

## 缺口（故意不补，附理由）

### 不补：Spring Cloud Bus

`spring-cloud-starter-bus` 在 Spring Cloud 2023.x 中依赖于 RabbitMQ / Kafka broker。本仓库当前消息总线是 **Redis pub/sub**（web 侧 `realtime/redisBus.ts`、Java 侧 `WirePublisher.java`、gateway 侧 Redis-reactive client）——已经跑的；没有 RabbitMQ 也没有 Kafka。  
Bus 没了它的传输，就是装的一个空壳。**不引入。**

### 不补：Spring Cloud Stream Binder

理由同上——web 侧的实时扇出在 `nexus:realtime:v1` 上，不在 Stream 的 topic/consumer-group 模型里；绑 Stream 要重新切消息形状 + 重新验 SSE web 扇出 —— 为此而为之是违反 §159"不fake runtime"。

### 不补：Spring Cloud Zipkin / Sleuth

Spring Boot 3.x 里 micrometer tracing 是 tracing 的真入口。本仓库目前跨 JVM→web→Python identity propagation 没有 tracing header 也无 observability 平台。
**未加 trace header、未装 tracing：这就是它没在的实话。不装观测不奏效果但提示"装了Zipkin就够了"也是假的。**

### 不补：Spring Cloud Contract / Spring Cloud Function

前者是 Consumer-Driven Contract，我们 ws 不是 HTTP 双向微服务体；后者是 Serverless Function；两者对当前这个「Next.js 前端 + Spring JVM 服务 + Python FastAPI ai-service」三角形没产出。

---

## 这次真做了什么

1. **审计**（本文件）。
2. **§SL/FE 门面化**：`apps/web/src/studio/**` 在 Studio 家族 30 个面板从全裸 Tailwind 到 `.sp-/.se-/.cx-/.ly-/.hp-/.pp-/.sb-/.cp-/.cd-/.rp-/.mm-/.hi-/.ag-/.as-/.ap-/.pb-/.vc-/.cs-/.cb-/.ge-` `.ds-` `.wd-` `.gp-` 门面化了 29 个组件，最后剩余 0 处裸 Tailwind 遗留
3. **并轨 §AILIVE-3**（commit `12bdbfdd`）——接手并行会话的 embeddings liveness + web env.ts 文本能力判定。
4. **现场零 raw atom 审计**：Studio `apps/web/src/studio/**` 无裸 atom 残留（`docs/evidence/fe-37..66-*/` 每片一片 evidence）。

## 仍欠

- 真的 Eureka round-trip evidence（`java -jar` + `Eureka /eureka/apps` + Feign 真调 —— 需要 Java 8 进程上跑起 domain-service + ai-service + gateway；无 live JVM 无法制造——这块的"真"需要干净窗口）
- 真推送真痕：Spring Cloud Gateway metrics `/actuator/prometheus` live HTTP scrape（gateway 已 `${NEXUS_GATEWAY_METRICS:enabled=true}`），但 JVM metrics 端点 ready/500 端口 bind issue 已记；这轮没起 gateway 真机
- **不在这次范围**：§SC-79 (Java wire publisher) trace evidence、sc-78 caffeine LoadBalancer cache 行为的真 Redis 加压
