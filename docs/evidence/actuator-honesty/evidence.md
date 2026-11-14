# §SC-68..§SC-73 Actuator 诚实网——实跑取证（2026-11-11/12）

本目录保存 Java Spring Cloud 五家族 actuator 诚实化的**实跑输出**，不是重说 ADR-0152，
而是给出可复核的证据：jar → boot 结果 → 断言形状。

## 1. §SC-68b：build-info 真在 jar 里（修正前缺位）

`jar --list` + 解出 `META-INF/build-info.properties`（重打包后）：

```
nexus-registry :: build.artifact=nexus-registry | build.component=nexus-registry | build.group=dev.nexus | build.name=nexus-registry | build.time=2026-11-11T18:57:25.334Z | build.version=0.1.0-SNAPSHOT
nexus-config   :: build.artifact=nexus-config   | build.component=nexus-config   | build.group=dev.nexus | build.name=nexus-config   | build.time=2026-11-11T18:58:24.904Z | build.version=0.1.0-SNAPSHOT
nexus-gateway  :: build.artifact=nexus-gateway  | build.component=nexus-gateway  | build.group=dev.nexus | build.name=nexus-gateway  | build.time=2026-11-11T18:59:19.646Z | build.version=0.1.0-SNAPSHOT
nexus-api      :: build.artifact=nexus-api      | build.component=nexus-api      | build.group=dev.nexus | build.name=nexus-api      | build.time=2026-11-11T18:59:58.505Z | build.version=0.1.0-SNAPSHOT
java-domain-service :: build.artifact=domain-service | build.component=nexus-domain-service | build.group=com.nexus | build.name=NEXUS Domain Service | build.time=2026-11-11T19:00:37.323Z | build.version=1.0.0-SNAPSHOT
```

修正前：`jar --list` 有该文件但**无** `build.component`（`Parameter 'buildInfo' is unknown` 警告被忽略数日）。

## 2. §SC-68/69/70/71：五家族的真实 boot 响应

（所有 boot 均为 override 端口临时实例，跑后全部 stopped。）

- domain-service :8087 → `GET /actuator/health` → `{"status":"UP"}`；`/actuator/info` →
  `{"app":{…"artifact":"domain-service"…},"runtime":{"java":"25.0.1",…},"os":{…},"build":{"artifact":"domain-service","name":"NEXUS Domain Service","time":"2026-11-11T17:14:24.349Z",…}}`
- nexus-api :8084 → health `{"status":"UP"}`；info → `{"build":{"artifact":"nexus-api","name":"nexus-api","time":"2026-11-11T18:20:15.940Z",…}}`
- nexus-gateway :8093 (memory backend) → health `{"status":"UP"}`；:8093 (redis backend, 56379) → health `{"status":"UP"}`
- nexus-registry :8776 → health `{"status":"UP"}`；info → `{"build":{"artifact":"nexus-registry","component":"nexus-registry",…}}`
- nexus-config :8887 → health `{"status":"UP"}`；info → `{"build":{"artifact":"nexus-config","component":"nexus-config",…}}`

## 3. §SC-71 / §SC-71c：`SHOWDETAILS=always` 一次取证（证明是内存 truth，不是 stub）

- registry :8778 `MANAGEMENT_ENDPOINT_HEALTH_SHOWDETAILS=always`：

```json
{"status":"UP","components":{…,"registryStandalone":{"status":"UP","details":{"mode":"in-memory-standalone","applications":0,"instances":0,"renewsLastMinute":0,"selfPreservation":false}},…}}
```

- config :8889 `MANAGEMENT_ENDPOINT_HEALTH_SHOWDETAILS=always`：

```json
{"status":"UP","components":{…,"configServedDefaults":{"status":"UP","details":{"mode":"native-classpath"}},"configServer":{"status":"UP","details":{"repositories":[{"sources":["classpath:/nexus-config/application.yml"],…}]}},…}}
```

## 4. §SC-72：`npm run verify:actuator` 全量输出

```
[verify-actuator] domain-service: starting (heap 512m, logs in C:\Users\18414\AppData\Local\Temp\nexus-verify-actuator)
  ✓ domain-service /actuator/health: 200 {"status":"UP"}, no details, no internals
  ✓ domain-service /actuator/info: artifact=domain-service component=nexus-domain-service version=1.0.0-SNAPSHOT
  ✓ domain-service /actuator/circuitbreakers: ai-service=CLOSED
  ✓ nexus-api /actuator/health: 200 {"status":"UP"}, no details, no internals
  ✓ nexus-api /actuator/info: artifact=nexus-api component=nexus-api version=0.1.0-SNAPSHOT
  ✓ registry /actuator/health: 200 {"status":"UP"}, no details, no internals
  ✓ registry /actuator/info: artifact=nexus-registry component=nexus-registry version=0.1.0-SNAPSHOT
  ✓ nexus-config /actuator/health: 200 {"status":"UP"}, no details, no internals
  ✓ nexus-config /actuator/info: artifact=nexus-config component=nexus-config version=0.1.0-SNAPSHOT
  ✓ nexus-gateway /actuator/health: 200 {"status":"UP"}, no details, no internals
  ✓ nexus-gateway /actuator/info: artifact=nexus-gateway component=nexus-gateway version=0.1.0-SNAPSHOT
[verify-actuator] PASS — 5/5 services: /actuator/health 200 UP (details hidden), /actuator/info build.component pinned, domain circuitbreakers visible
```

## 5. 回归：verify:topology（§SC-66 family）

2026-11-12T03:1x 实跑：全部 26 项断言 ✓（eureka 注册、config 轮询 ratePerSecond=50.0、
ai-health degraded 200、probe 403→200、@LB 双实例与本分支无关），**PASS**。

## 6. 故意不绿的事（撰写时） 

- 没有任何内容假装 Redis 时嗅到了 PONG（gateway memory backend 时 `probe: not_applicable`）。
- no fabricated "UP because JVM started"：JPA 一对要 SELECT 1 才给 UP。
- CI executor 从未真跑 main-line——本文件不声称它在跑。
