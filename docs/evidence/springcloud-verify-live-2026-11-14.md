# verify:spring-cloud · live topology proof — 2026-11-14 (exit 0)

输入：`npm run verify:spring-cloud`（JDK 25 + pgvector/pgvector:pg16 scratch 容器 + 48 条迁移在线回放）。
注册是本机真实 JVMs 互认的发现：domain 与 nexus-api 均真正注册进了全新的 scratch registry（Eureka）。

## 输出（裁剪自实机日志）

```
[§1] registry built: nexus-registry-0.1.0-SNAPSHOT.jar
[§1] gateway built: nexus-gateway-0.1.0-SNAPSHOT.jar
[§1] api built: nexus-api-0.1.0-SNAPSHOT.jar
[§1] domain built: domain-service-1.0.0-SNAPSHOT.jar
[§2] the registry answered on port 55629 and reports UP
[§3a] the scratch source nexus-proof-source-1794638003907_3224 is up on host port 32769; replaying 48 migrations
[§3a] the schema exists on the CI plane too — 48 migrations replayed
[§3] two throwaway databases: nexus_cloud_proof_api_1794638003907_3224 (empty) and
      nexus_cloud_proof_domain_1794638003907_3224 (the REAL schema, copied with pg_dump — 95923 bytes)
[§4] the domain service answered on port 55889 and reports its database reachable
[§4] the registry now NAMES the domain service — it found itself through discovery
[§5] nexus-api answered on port 51207 against the throwaway database nexus_cloud_proof_api_1794638003907_3224
[§5] the registry now NAMES nexus-api — the service found itself through discovery
[§6] the gateway routed lb://nexus-api to the live service, which named itself:
       {"service":"nexus-api","version":"0.1.0-SNAPSHOT","uptimeSeconds":40,
        "database":{"reachable":true,"latencyMs":218}}
[§7] edge → nexus-api → lb://nexus-domain-service → PostgreSQL chain returned the row:
       {"state":"found","project":{"id":"3660a547-92a4-4321-b96d-4b319df67c87",...}}
[§8] an id the domain service does not hold answered 404:
       {"state":"not-found","project":null,"reason":"the domain service answered and holds no project with that id",...}
[§9] both breakers visible and named: nexus-api's `nexus-domain-service` (closed gauge 1, 0 calls refused)
       and the edge's `nexusApiCircuitBreaker`
[§10] registry/edge/nexus-api all answered 200 UP
[§10b] the four CONSUMER doors answer the prometheus scrape in exposition format
[§10c] ONE trace id crossed all three hops — the id the CALLER minted
       (6c3b8d953f75dd576860afdcd060b807), with a different span at each:
       edge a5132b6b36bf0e68, api 97b951068359a89c, domain 64b4be828f2094c5
[§11] with the registry GONE the same chain still answered 200 — measured, not promised
      (40 s after the registry died — one Eureka fetch interval plus cache TTL)
[§12] with the domain service gone the service-to-service door answered 503, named it,
       and said which failure it was (timeout); the same call through the edge answered 503 too
[§13] the breaker opened and took the blame: refused 1 calls, OPEN-state gauge read 1,
      the answer says "circuit-breaker-open"
[§14] with nexus-api gone the edge answered 503 and named it:
      {"ok":false,"reason":"upstream-unavailable","upstream":"nexus-api","failure":"connection-refused",...}
[§15] with the edge gone the caller got a connection error, not an invented answer:
      TypeError fetch failed <- Error ECONNREFUSED connect ECONNREFUSED 127.0.0.1:60306
[§16] tearing down the throwaway databases, the processes and the build copies
[§16] the throwaway databases, the four processes and the build copies are gone
```

退出码：**0**。

## 这次之前没全绿的证明是怎么回事

上一个版本的证明 PASSED §1–§6 然后卡死在 §5「nexus-api to appear in the registry」60s 超时。
根因不在代码：domain / nexus-api **自己**的注册契约是分线命名（`NEXUS_DOMAIN_*` / `NEXUS_API_*` + `NEXUS_REGISTRY_ZONE`），
而 proof 一直按旧合并前的共享名 `NEXUS_EUREKA_ENABLED` + `NEXUS_EUREKA_URL` 传参——service 健康但就是不注册，
60s 超时面上「503 → 60s 无响应 → 失败」。修名后照
第 §1–§16 一气呵成退出 0。

## 复现

`npm run verify:spring-cloud`（需要：可写 `D:\nexus-proof-planes` 的磁盘、docker 的 pgvector/pgvector:pg16
与 node:22 镜像在本地或可拉、约 4.5 GB 空闲内存——本机此刻空闲 ≈ 4 GB 时一次跑通；JVM 无需预热，scratch 容器随跑随删）。
