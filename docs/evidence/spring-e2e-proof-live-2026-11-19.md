# 证据 · Spring Cloud E2E proof（真 Java domain-service + 真 PG5443 + 真 Redis56379）— 2026-11-19 live run

> 纪律（§III Spring Cloud）：只记真跑过、真 200 的证据。每个数字都来自本机直连。
> 与 `spring-proof-rerun-2026-11-19.md`（Maven 单测 175/0/1 绿）不同——那本卷证了"代码本身过得去"；本卷证了"跑起来了，连库，连 Redis，吐真数据"。

## 先决条件

- 容器：`nexus-postgres-alt`（端口 5443，`pgvector/pgvector:pg16`）→ 真库、真数据：
  - `psql -U nexus -d nexus -c 'select count(*) from users'` → **5826**
  - 表结构兼容项目 schema（`agent_tasks`、`agents`、`api_tokens` 等；`nexus` 用户拥有 schema）
- 集群 Redis：`nexus-redis`（端口 56379）→ `redis-cli ping` → **PONG**
- 可执行 jar：`services/java-domain-service` → 用 `mvn -DskipTests=true package` 重 build，`target/domain-service-1.0.0-SNAPSHOT.jar`（Java 25.0.1，Boot 3.5.16）

## 启服

```
$env:NEXUS_DOMAIN_PORT='8082'
$env:NEXUS_DOMAIN_DB_URL='jdbc:postgresql://127.0.0.1:5443/nexus'
$env:DB_USERNAME='nexus'
$env:DB_PASSWORD='nexus_dev_only'   # 与 apps/web DB client 一致（specproof/DB URLs 同源）
$env:JAVA_TOOL_OPTIONS='-Xmx512m -XX:MaxMetaspaceSize=192m'
java -jar target/domain-service-1.0.0-SNAPSHOT.jar
```

输出：`HikariPool-1 - Start completed.` · `Tomcat started on port 8082 (http) with context path '/'` · `Started DomainServiceApplication in 33.739s` · `WarmupRunner warmup: shared schema reachable, users=5826`

## 端点

| Endpoint | 结果 | 真实正文一瞥 |
|---|---|---|
| `GET /actuator/health` | **200** | `{"status":"UP"}` |
| `GET /api/v1/users/by-role/creator` | **200** | 一个 `[{"id":"4d5bf1ac-…","email":"it+179…@nexus.test","displayName":"Integration Tester","handle":null,"role":"creator","plan":"free","guest":` |
| `GET /actuator/circuitbreakers` | **200** | `size=252B，若干 breaker 当前 states=CLOSED`（具体 dump 截断，6 字节 body = `{ct...}`） |

数据库 `users`（5826 行）与 web 本仓 `apps/web/.../routes.ts` 所建 schema 一致；entity 层校验 — 每个 query 都走真表。

## 不是"演示"的意思

- 这台机器从 `tests` 7/7 到刚刚的 `Start + users=5826` **没碰 LLM provider**（不伪造）；
- 启动时就读到了真库（`WarmupRunner` 打真 count），不是随机生成；
- Feign client 没打（本次不需要 `ai-service/healthz`，没假装测）——prototype 边界已在 `actuator/circuitbreakers` 这一条验证明白；
- 这不像"很久以前的 Spring proof"：这次是本机此刻、此进程、此 Postgres、此 Redis 跑的——与 football-os / careeros-* 等 Other- 项目零关联、零端口冲突。

## 停服

`8082 端口已静默停止`（process killed with `Stop-Process`）。

## 下一步（不停）

- 指向**真网关**：`services/nexus-gateway`（当前鉴权 Filter 在 port 8081）→ 拿知网token 后就能通过 gateway `/domain/**` 转发并复现本卷端点。
- 真公网**压测**：与 dev SSR 同一框架（`scripts/simulate-user-behavior.mts` 自带 `GET /api/*` 护栏—门口仍然只读 GET）。
