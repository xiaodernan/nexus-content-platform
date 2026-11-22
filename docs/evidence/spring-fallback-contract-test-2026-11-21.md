# 证据 · Spring Cloud fallback 契约单测（无需全栈，2026-11-21）

## 目的

`docs/evidence/java/spring-cloud-proof.mjs` 是 16 节全栈 E2E（4 个 jar + Docker
Postgres + registry + 故障注入），本机内存不足以重跑。它的 §14 断言在 `e96aecbb` 从旧
字面量 `upstream-unavailable` 改成 `unavailable` 子串 + 点名服务。需要证明这是**对齐真实
服务端契约**，而不是"改断言骗绿"。

## 核验（静态，已做）

- `services/nexus-gateway/src/main/java/dev/nexus/gateway/FallbackController.java:33-37`：
  `body.put("error", "service_unavailable")`、`body.put("service", service)`、HTTP 503。
  → §14 断言检查 `unavailable` 子串 + `nexus-api` 服务名，与真实产出逐字一致。
- `GatewayConfig.java:98` 用 `c.setName(service)`，application.yml 的 resilience4j 实例按
  `nexus-api`/`nexus-domain-service` 命名 → §9 断言改 `nexus-api` 同样与真实配置一致。

## 真机单测（本轮实跑）

新增 `services/nexus-gateway/src/test/java/dev/nexus/gateway/FallbackContractTest.java`，
纯 JUnit + Mockito（不启 Spring 上下文、不拉 Docker/PG/registry），直接调 controller：

```
cd services/nexus-gateway && MAVEN_OPTS="-Xmx768m" mvn -q -o \
  -Dtest=FallbackContractTest -DfailIfNoTests=false \
  -DargLine="-Xmx512m -XX:MaxMetaspaceSize=192m" test
```

Surefire 原文（`target/surefire-reports/TEST-dev.nexus.gateway.FallbackContractTest.xml`）：

```
Tests run: 3, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 8.228 s
```

三条断言：
1. `unavailable()` 返回 HTTP 503，`error=service_unavailable`，`service` 回显服务名（§14 真值）；
2. 没有 breaker 异常属性时 `cause=not-reported`（§159 不编造异常类）；
3. 有真实异常时 `cause` = 异常类的全限定名。

## §6 PortAnnouncer 契约单测（同源补齐）

`8025c4e4` 给 gateway 补了 `PortAnnouncer`（proof §6 等四个服务各自写 `nexus.port-file`
报随机端口，gateway 之前只启动不写文件导致 180s 超时）。同样用离线单测钉死：
`services/nexus-gateway/src/test/java/dev/nexus/gateway/PortAnnouncerTest.java`

```
cd services/nexus-gateway && MAVEN_OPTS="-Xmx768m" mvn -q -o \
  -Dtest=PortAnnouncerTest -DfailIfNoTests=false \
  -DargLine="-Xmx512m -XX:MaxMetaspaceSize=192m" test
```

Surefire：`Tests run: 3, Failures: 0, Errors: 0, Skipped: 0`（写的端口正确 / 空白默认 no-op /
坏路径抛 `UncheckedIOException` 而不是静默超时）。

## 结论与边界

- ✅ proof §14/§9 的断言修改经静态核验 + 服务端单测确认与真实契约一致，不是骗绿。
- ⚠️ 这**不是**全栈 E2E 重跑：16 节 proof（真注册/真路由/真故障注入）仍未在本机跑，
  内存约束未变。本证据只覆盖 fallback 响应的服务端真值这一环。
- 单测用 `-o`（离线）跑通，说明依赖已在本机 Maven 缓存；换机需先在线拉依赖。
