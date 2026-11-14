# SC-24 — nexus-api 进拓扑：四服务全经 service discovery（2026-11-10）

前五片把 registry / domain-service / gateway 这条链跑通了。nexus-api 一直在那里，但没被纳入
活验证——它有自己的 `NEXUS_API_REGISTER` 开关，默认关（独立进程、独立库、独立端口），而且它的
`/api/**` 路由此前无人证明能经 discovery 打通。这一片把它收进来，**拓扑满员**。

## 布置

- 演示库：`nexus_api_smoke`（本机 55433 容器上 `CREATE DATABASE`；nexus-api 的
  `ddl-auto:update` 自己建表，web 迁移与它无关）。
- 启动：`NEXUS_API_REGISTER=true NEXUS_API_FETCH=true NEXUS_API_PORT=8084
  NEXUS_DB_URL=jdbc:postgresql://127.0.0.1:55433/nexus_api_smoke NEXUS_CONFIG_ENABLED=false`
- 网关用 `NEXUS_GATEWAY_PORT=8091`（:8090 被本仓之外的进程 PID 39424 占着，不抢不杀）。

## 实跑读数（`npm run verify:topology`，port 8091）

```
eureka is answering
domain-service registered itself
eureka holds NEXUS-DOMAIN-SERVICE
eureka holds NEXUS-API                     ← 新增
gateway is answering
domain-service answers through the door (warm-up)
gateway discovery lists nexus-domain-service, nexus-api   ← /platform/services 真的列出两者
community policy (source: contracts/community-policy.json)
billing balance 0 (X-Request-Id echoed verbatim)
door-less billing refused (400)
permission check refused (User not found, X-Request-Id echoed)
door-less permission refused (400)
nexus-api answers through the gateway /api/health (200,
  {"service":"nexus-api","version":"0.1.0-SNAPSHOT","startedAt":"2026-11-10T11:26:…"})   ← /api/** → lb://nexus-api
[verify:topology] stopped registry / domain-service / nexus-api / gateway
[verify:topology] PASS — registry, gateway, domain-service and nexus-api, all through service discovery
```

`/api/health` 是 200 **只当数据库应答**（`HealthController`：database 可达 200，否则 503），
所以这一条同时证明了：gateway → `lb://nexus-api` → nexus-api → `nexus_api_smoke` 整条链活着。

## 诚实的边界

- gateway 的 `/api/**` 路由在 **auth 关闭**（`NEXUS_GATEWAY_AUTH_DISABLED` 本机默认）时是通的；
  auth 开着时同样的路径需要 token——两种形状都不是这片新加的，是一直就在的。
- 演示库 `nexus_api_smoke` 是**一次性**的：本机手工建，CI 每次跑前显式 `CREATE DATABASE`（psql），
  不复用 `nexus`（e2e 的库）也不复用 `nexus_regress`（集成测试的库）。
- nexus-api 自己的测试（903/903）不受本次改动影响；本片只动了 smoke 脚本与 CI，不动 Java 源码。
- 唯一真实风险：CI runner 若没有 `psql`，`postgresql-client` 会先被 `apt-get` 装上；
  `CREATE DATABASE` 用 `|| true` 兜底（库已存在时复用）——**但这条 CI 路径在没有实际 push 之前仍未被 CI 实跑**。
