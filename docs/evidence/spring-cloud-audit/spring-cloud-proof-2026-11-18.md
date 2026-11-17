# §SPRING-CLOUD-PROOF 实跑记录 — 2026-11-18

## 环境与命令

- OS：Windows 11 · Java：Temurin 25.0.1.8（`C:\Program Files\Eclipse Adoptium\jdk-25.0.1.8-hotspot\` ambient `JAVA_HOME`）· Maven 3.9.15 · Docker Desktop 29.9.3（本轮第 7 次从 0 拉起过）
- `pgvector/pgvector:pg16` 本地已有镜像（未拉取）
- 运行命令：`$env:JAVA_HOME=$null; npm run verify:spring-cloud`
  （shell 在运行时清空它自己 `$env` 注入的一次错指——该任务 shell 环境最初把 `JAVA_HOME` 错指到一个不存在的 `C:\Program Files\Java\jdk-25`，导致第 1 次运行 FAILED：「JAVA_HOME environment variable is not defined correctly」——**这是 shell 注入的，不是脚本 bug；第 2 次清掉该注入、Ambient Adoptium JDK 当场构建出 jar，整条链全部 pass**。ambient JDK 完好。这条记录专门说明：第一次红了一切都没跑通，第 2 次绿——两次都写。）
- 脚本：`docs/evidence/java/spring-cloud-proof.mjs`（首行自述 sweep-budget-ms: 1200000，即约 20 分钟）

## 每一节（逐字引用，不可增删）

> [§1] registry built: nexus-registry-0.1.0-SNAPSHOT.jar
> [§1] gateway built: nexus-gateway-0.1.0-SNAPSHOT.jar
> [§1] api built: nexus-api-0.1.0-SNAPSHOT.jar
> [§1] domain built: domain-service-1.0.0-SNAPSHOT.jar

> [§2] the registry answered on port 53990 and reports UP

> [§3a] the scratch source nexus-proof-source-1794934859405_28952 is up on host port 32768; replaying 48 migrations from infra/migrations
> [§3a] the schema exists on the CI plane too — 48 migrations replayed
> [§3] two throwaway databases: nexus_cloud_proof_api_1794934859405_28952 (empty) and nexus_cloud_proof_domain_1794934859405_28952 (the REAL schema, copied with pg_dump — 95923 bytes)

> [§4] the domain service answered on port 55414 and reports its database reachable
> [§4] the registry now NAMES the domain service — it found itself through discovery

> [§5] nexus-api answered on port 55489 against the throwaway database nexus_cloud_proof_api_1794934859405_28952
> [§5] the registry now NAMES nexus-api — the service found itself through discovery

> [§6] the gateway routed lb://nexus-api to the live service, which named itself: {"service":"nexus-api","version":"0.1.0-SNAPSHOT","startedAt":"2026-11-17T17:04:59.301654300Z","uptimeSeconds":17,"database":{"reachable":true,"latencyMs":3}}

> [§7] the edge → nexus-api → lb://nexus-domain-service → PostgreSQL chain returned the row the proof inserted: {"state":"found","project":{"id":"c9d46060-b75f-4442-8cd9-5beb49831082","ownerId":"9396650d-34b2-4880-aa5f-92264005b378","slug":"cloud-proof-project","name":"Cloud Proof Project","kind":"website","visibility":"private",

> [§8] an id the domain service does not hold answered 404 and said so: {"state":"not-found","project":null,"reason":"the domain service answered and holds no project with that id","failure":null,"unavailable":false,"found":false}

> [§9] both breakers are visible and are named what the configuration says: nexus-api's `nexus-domain-service` (closed gauge 1, 0 calls refused) and the edge's `nexusApiCircuitBreaker`

> [§10] the registry answered 200 {"status":"UP"}
> [§10] the edge answered 200 {"status":"UP"}
> [§10] nexus-api (the operator door) answered 200 {"status":"UP"}
> [§10] all four services answered their own health question, and said UP about themselves
> [§10b] the four CONSUMER doors answer the prometheus scrape in the exposition format — measured with the header a scraper sends, not assumed
> [§10c] ONE trace id crossed all three hops — the id the CALLER minted (7a56be5894c2c94bdd963215f6b487bb), with a different span at each: edge 65366932f1169628, api 0a7c5b42e1673677, domain 73f8aa3567c6c33d

> [§11] with the registry GONE the edge → nexus-api → domain-service → PostgreSQL chain still returned the row: {"state":"found","project":{"id":"c9d46060-b75f-4442-8cd9-5beb49831082","ownerId":"9396650d-34b2-4880-aa5f-92264005b378","slug":"cloud-proof-project","name":"Cloud Proof Project","
> [§11] 40 s after the registry died (one Eureka fetch interval plus its cache TTL) the same call answered 200 — measured, not promised: {"state":"found","project":{"id":"c9d46060-b75f-4442-8cd9-5beb49831082","ownerId":"9396650d-34b2-4880-aa5f-92264005b378","slug":"cloud-proof-project","name":"Cl

> [§12] with the domain service gone the service-to-service door answered 503, named it, and said which failure it was (timeout): {"state":"downstream-unavailable","project":null,"reason":"the domain service could not be reached: the call did not finish in time","failure":"timeout","unavailable":true,"found":false}
> [§12] through the edge the same call answered 503 too: {"state":"downstream-unavailable","project":null,"reason":"the domain service could not be reached: the call did not finish in time","failure":"timeout","unavailable":true,"found":false}

> [§13] the breaker opened and took the blame for it: it refused 1 calls, its OPEN-state gauge read 1, and the answer says "circuit-breaker-open"

> [§14] with nexus-api gone the edge answered 503 and named it: {"ok":false,"reason":"upstream-unavailable","upstream":"nexus-api","failure":"connection-refused","detail":"the gateway could not reach nexus-api: the connection was refused; no answer was invented on

> [§15] with the edge gone the caller got a connection error, not an invented answer: TypeError fetch failed <- Error ECONNREFUSED connect ECONNREFUSED 127.0.0.1:60455

> [§16] tearing down the throwaway databases, the processes and the build copies
> [§16] the throwaway databases, the four processes and the build copies are gone

## 结论（如实）

- **§1–§16 全部 PASS**——registry → domain → api → gateway → PostgreSQL 整条微服务链路真实跑通：发现是名字（`lb://nexus-api`）而不是地址；**一个 trace id 横贯三层**；registry 挂掉 chain 仍工作；domain 下线吞吐 503 + 超时；断路器真的打开并被 `circuit-breaker-open` 命名；api-gone 时 edge 报 503 upstream-unavailable 并点名；edge-gone 时**不 invent answer**。每一项都是真实机器回路，而是不是「看起来像」
- **失败的记录**：第一次跑红（JAVA_HOME 指向不存在路径），属 shell 环境误注入，**已修正**；不是脚本也不是 ambient JDK 的问题。⚠️ 真的还值得追的后续 issue：证明脚本应**清楚地打印自己**正在哪一步时，JDK 为什么找不到——但 env 故障本身耐烦，脚本要到后面才能 warn。
- 生产级残留：**零个进程、零个容器、零个数据库**（§16 teardown 完）。所有文件的数据回到 `docs/evidence/` 下的纯文本流程文档；数据没被 PM **无**任何生产数据库被访问——全部落到 throwaway container 上
- 费用：无——本机 Java 编译 + Docker · 没有 provider 调用

## 技术问题（ honest 自白 ）

- 所有端口都是分配的：§2 53990 · §3 32768→5432 · domain 55414 · api 55489 · trace 7a56be5894c2c94bdd963215f6b487bb · project c9d46060-…
- 本次未修改任何 Java 源码；只读环境与同一份浮现的 `services/java-*` 测试套件一致；Java 25 LTS 本分 build 好了
- 并行会话：之前在同一台机器上跑过 opencode 子会话；Docker 桌面某些进程由父会话残留——本轮无影响
