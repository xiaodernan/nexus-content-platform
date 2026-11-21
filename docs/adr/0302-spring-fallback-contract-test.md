# ADR-0302 · Spring Cloud fallback 契约单测钉死 proof 断言（2026-11-21）

## 状态

已接受（2026-11-21）

## 背景

Spring Cloud proof（`docs/evidence/java/spring-cloud-proof.mjs`）的 §9/§14 在本线被修过断言：
- §9：`nexusApiCircuitBreaker` → `nexus-api`（ADR-0237 单家族改名）；
- §14：`upstream-unavailable` → `unavailable` 子串 + 点名服务。

这类"改断言"最有嫌疑变成"改测试让它绿"。用户要求真实、不许造假（§159/§60）。
全栈 proof 因本机内存约束无法重跑，所以需要一个**离线、单机、轻量**的方式证明断言与服务端真值一致。

## 选项

A. 重跑 16 节全栈 proof。否——需 4 jar + Docker PG + registry，本机空闲内存不足，硬跑会失败且耗时。
B. 静态读一遍服务端代码就算了。否——静态只能证明"代码长这样"，不能证明运行时真返回那个 body。
C. 加服务端契约单测 + 静态核验。采用。

## 决定

1. 静态核验 `FallbackController.java` / `GatewayConfig.java` / application.yml，确认断言字面量与真实产出一致（见 `docs/evidence/spring-fallback-contract-test-2026-11-21.md`）。
2. 新增 `FallbackContractTest.java`（nexus-gateway）：纯 JUnit + Mockito，直接调 `unavailable()`，
   钉死 HTTP 503 + `error=service_unavailable` + `service` 回显 + 诚实的 `cause`（缺失报 not-reported，
   有异常报类名）。不启 Spring 上下文、不拉 Docker。
3. 实测：`mvn -q -o -Dtest=FallbackContractTest test` → **Tests run: 3, Failures: 0, Errors: 0**（8.228s）。

## 后果

### 变好的事

- proof 的 §14 断言从"改过字符串、无法验证"变成"有服务端单测钉死真值"。
- 服务端 fallback 的 503 语义、点名服务、不编造 cause 三条纪律有了回归门。
- 这条验证路线完全离线，CI/self-hosted runner 都能跑，不依赖 Docker。

### 边界

- 不是全栈 E2E 重跑；§1–§16 的注册/路由/故障注入仍未在本机验证，证据文档如实写明。
- `-o` 离线模式依赖本机 Maven 缓存；换机需先在线拉依赖。

## 相关

- `docs/evidence/java/spring-cloud-proof.mjs` §9/§14
- `docs/evidence/spring-fallback-contract-test-2026-11-21.md`
- `services/nexus-gateway/src/test/java/dev/nexus/gateway/FallbackContractTest.java`
- ADR-0237（java-* → nexus-* 单家族改名）
