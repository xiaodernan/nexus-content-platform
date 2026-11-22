# Spring Cloud 拓扑在本机复绿（2026-11-22 · §SC-VERIFY）

> `verify:topology` / `verify:loadbalance` / `verify:actuator` 此前连续失败，报的是
> Hibernate 的 `Unable to determine Dialect without JDBC metadata`。这句话把**三个不同的原因**
> 说成了同一件事，逐层剥开后分别修掉。

## 三层根因（同一句错话背后的三件事）

1. **库死了**：`nexus-postgres`（55433）自 2026-11-19 起 WAL 段 `000000010000000800000056`
   整段清零（`od` 看前 32 字节全 0），checkpoint 记录随之丢失，容器常驻重启循环。
   web 侧 `apps/web/.env.local` 早已切到 `nexus-platform-postgres`（5433 / `nexus_dev`），
   Java 侧三个 proof 却还指向 55433。
2. **库连错了**：5433 这台服务器上同时还有一个 `nexus` 库——**5 个用户、schema 旧**
   （没有 `users.bio`）。第一版修改把 URL 写成 `/nexus`，于是拿到
   `column u1_0.bio does not exist`——一句把"连错库"说成"实体映射错了"的错话。
   正确的是 `/nexus_dev`（1078 个用户，与 web 同一批表）。
3. **库没建**：`nexus-api` 的 throwaway 库 `nexus_api_smoke` 在 55433 时代是预先建好的，
   5433 上不存在；`nexus_app` 又没有 CREATEDB。补一条幂等 `CREATE DATABASE`（42P04 视为已存在），
   并给本地开发库的 `nexus_app` 授予 CREATEDB。

## 修法

- `scripts/verify-topology.mts` / `verify-loadbalance.mts` / `verify-actuator.mts`：
  默认 `NEXUS_DOMAIN_DB_URL` 改指 `5433/nexus_dev`，`DB_USERNAME/DB_PASSWORD` 改
  `nexus_app` / `nexus_dev_app_only`（与 `apps/web/.env.local` 同一组）；topology 增
  `ensureApiDatabase()`。
- `services/java-domain-service/src/main/resources/application.yml` 与
  `services/nexus-api/src/main/resources/application.yml`：datasource 默认值同改。
  两条 yml 里原本写着"指向别人/已死服务的默认值不是默认值，是陷阱"——这次就是那条纪律自己兑现。
- `DbReachableCondition.java` 的 55433 探测同步改 5433。

## 读数（本机实测）

```
verify:topology  PASS — 19/19
  ✓ eureka / config server / discovery holds NEXUS-DOMAIN-SERVICE + NEXUS-API
  ✓ domain-service circuitbreakers: ai-service=CLOSED · info build.artifact + runtime.java=25.0.1
  ✓ gateway answers · rate limit from config server (ratePerSecond=50.0) · discovery lists both
  ✓ community policy (contracts/community-policy.json) · billing balance · permission checks
  ✓ door-less billing / permission refused (400) · ai-health (degraded, honest) · realtime wire
  ✓ probe without operator token refused (403) · probe published · nexus-api through the gateway

verify:loadbalance  PASS — one service id, two instances, one gateway
  ✓ domain-a :8085 + domain-b :8086 both healthy, eureka holds both
  ✓ gateway discovery shows 2 distinct instances, allUp=true
  ✓ 10/10 sequential requests through /domain/** answered 200

verify:actuator  PASS — 5/5 services
  ✓ /actuator/health 200 UP (details hidden) · /actuator/info build.component pinned
  ✓ domain circuitbreakers visible
```

## 顺带记下的事

- `nexus-postgres`（55433）现在 `restart=no`、处于 exited——它已不在任何配置里，
  WAL 修复（`pg_resetwal`）没有做：1.1 GB 的开发库，内容已被 5433 取代，修它没有收益。
- `verify:topology` 顶部仍有一行 `warning: 127.0.0.1:5433 did not answer HTTP`——
  那是脚本用 `fetch('http://127.0.0.1:5433')` 探活 Postgres，端口是 DB 不是 HTTP，
  注定失败。它自己标了 not fatal，留着不改（改动会动到"Postgres 不在就拒启"的既有语义），
  但记在这里：那行警告不是故障。
- `ai-health via gateway (degraded, AiServiceUnavailableException)` 是**诚实读数**：
  domain-service 的 Feign 指向它自己预期端口上的 ai-service，本机 3200 由另一个项目持有。
  降级并说明原因，不假装 UP。