# ADR-0152：Actuator 契约的诚实网——SELECT 1 / PING / 内存真值 / 共享默认校验，宁不报景，勿装圣

- 状态：Accepted
- 日期：2026-11-12
- 关联：§SC-66/§SC-66b（build-info 出 jar）、§SC-68（五家 `/actuator/info` 出 build 段）、§SC-69/§SC-69b（SELECT-1 探针，domain-service + nexus-api）、§SC-70（gateway PING/not_applicable）、§SC-71（registry 内存 truth）、§SC-71c（config shared-default 形状校验）、§SC-72（`npm run verify:actuator`）、§SC-73（main-line.yml 第四步）。本文收束全分支，只记录事实，不新增契约。

## 背景

五个 Java Spring Cloud 服务的 `/actuator/health` 之前全部是 Spring Boot 默认的静态 `UP`——
任何一条 JVM 活到端口能连上，就谎称"一切安好"，哪怕 Postgres 已经被谁顺手关了、
Redis 里的 token bucket 已经悬空、registry 里已经没有人。

同时，§SC-64/§SC-65 出过真事故：共享 `nexus-config/application.yml` 被放宽暴露面，
domain-service 继承之、`/actuator/circuitbreakers` 反而 404（而非 401/403）——共享默认值本身就是
箭靶，没人替它"闭门检查"。

## 决策

**每个服务的 health 都必须讲一个它真正知道的故事；不知道的一律少在细节上跋扈。**

| 服务 | 探针逻辑 | 成功时 | 失败时 |
|---|---|---|---|
| domain-service | `JdbcTemplate("SELECT 1")`（Hikari 池握手，不碰 schema） | UP | DOWN + `probe: <短类名>` |
| nexus-api | 同上（同模式、另一 jar） | UP | 同上 |
| nexus-gateway | `memory backend`（默认）→ `probe: not_applicable`（无 Redis 可 ping，探之即谎报）；`redis backend` → `ReactiveStringRedisTemplate.ping()` 实跑 PING，2s deadline | UP | DOWN + `probe: <短类名>` / `not_pong` |
| nexus-registry | 直接读 `PeerAwareInstanceRegistry` 内存真值（`applications`/`instances`/`renewsLastMinute`/`selfPreservation`） | UP | DOWN + 类名 |
| nexus-config | classpath 上 `nexus-config/application.yml` 必须存在且仍把暴露面收窄到 `health,info` | UP | DOWN + `shared_default_missing` / `shared_default_too_wide` |

统一安全阀：`management.endpoints.web.exposure.include` 各服务 = {`health,info`[+必要时 `circuitbreakers`]}；
`show-details: never` 不放松；任何 failure → 只暴露异常**短类名**，host/port/schema/stacktrace 永远不出。

## §SC-68b：build-info 参数名的诚实

五个 pom 的 `<buildInfo><additionalProperties>` 从来没被 spring-boot-maven-plugin 3.5.16 接收过
（日志里有 `Parameter 'buildInfo' is unknown ...`，被我们忽略了很久）：jar 里一直没有 `build.component`
坐标，§SC-68 的"五家族都带 component"声称**不成立**。`javap -p` 反汇编确认真参数名是
`additionalProperties`；统一拍平后五个 jar 都真带 `build.component=<service>`；`/actuator/info` 实测
返回 `build.build.artifact + component + time`。已逐个重打 jar 并实机命中（verify:actuator）。

## 验证面（全部本机实跑 PASS）

1. `npm run verify:actuator`（§SC-72，新增）——五个 JVM 逐个真起：health 200 UP + 无
   `components/details` + 无 JDBC/55433/密码/Hibernate/stacktrace pattern；info 的
   artifact/component 与本仓产物逐一对账；domain circuitbreakers 出 `ai-service=CLOSED`。
2. `npm run verify:topology`（§SC-66 family + 本分支回归）——26 个端点断言全绿。
3. registry 6/6、config 6/6（含新增 `ConfigServedDefaultsHealthIndicatorTest` 锁死共享默认）、
   domain 137/137、nexus-api 903/903——`mvn -o -B test` 无回归。
4. `main-line.yml` 新增第四步 `verify:actuator`（§SC-73，8788/8083/8094/8775/8886 不与其它步重叠），
   ci.yml 12-step census 未动。

## 后果

- JVM 活着 ≠ UP——外部监控拿到 `{"status":"UP"}` 时，内部已经替你查过了 DB/Redis/内存/共享默认。
- 任何一个 health DOWN 现在都是**特定契约**失效（而非"机器累了"）：DB 没了、Redis 没 PONG、
  registry 起不来、或有人又想放宽共享默认——后两类已在 CI 层留下门。
- 未覆盖也不假装覆盖：nexus-config 没有 DB；registry 无持久化——两者都用了它们真正知道的真相，
  不冒充 JDBC。
- 债务：CI executor 从未真跑过 main-line（注释如实写着）；`show-details: never` 让外部探针永远
  看不到 components——运维抓包看到 detail 只在 SHOWDETAILS=always 时发生过一次，那是手工取证，
  不是默认。

## 触发条件（将来要改本 ADR 时）

- 新服务进 fleet → 必须选择自己的真相并回答，不得继承 Boot 默认空壳。
- 暴露面需要放宽（如 `/actuator/refresh`）→ 改共享默认前先改本文及 `ConfigServedDefaultsHealthIndicatorTest`。
- CI executor 真正跑过 main-line → 删掉"never run by a real CI executor yet"注释。
