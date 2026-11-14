# ADR-0103：把断路器状态从「只有测试能读」变成运维读数——暴露 /actuator/circuitbreakers 且默认受保护

- 状态：已接受（2026-11-11）
- 相关：`services/nexus-gateway/src/main/resources/application.yml`（`management.endpoints.web.exposure.include:
  health → health,circuitbreakers`）、
  `services/nexus-gateway/src/test/java/dev/nexus/gateway/CircuitBreakerActuatorWiringTest.java`（动态/静态读数）、
  `services/nexus-gateway/src/test/java/dev/nexus/gateway/CircuitBreakerActuatorAuthTest.java`（安全面）、
  `services/nexus-gateway/src/main/java/dev/nexus/gateway/PlatformAuthFilter.java`（白名单，未改）、
  `docs/adr/0024?` 不适用；承接 `docs/adr/0101`（§SC-29 HALF_OPEN 自愈）、`docs/adr/0095`（SC 起线）、
  `docs/ROADMAP.md` §SC 第二十七片。

## 背景

§SC-24 让网关的断路器会「失败快」，§SC-29 让它会「自愈」——但截至那时，**能读到 breaker 状态的只有测试**
（往 `CircuitBreakerRegistry` 注入一个实例、调 `getState()`）。一个真在值班的运维没有任何办法回答
「现在哪个后端被熔断了、失败率多少、门自己合上没有」，除非挂调试器。resilience4j-spring-boot3 其实
**自带** `CircuitBreakerEndpoint`（`/actuator/circuitbreakers`），jar 一直在 classpath 上，但网关的
`application.yml` 只暴露了 `health`——读数存在，没人读得到。

用户本轮要求「集大成」「把内容汇集起来」「继续演进」。把前两片的弹性能力接到平台可观测面上，正是这种
「汇合」：能力不再只活在测试断言里，而是成为 operator 能看见的事实。

## 选项

1. **自造一个 `/platform/breakers` 控制器读 registry**：多一个平台自己的真值投影，和 actuator 已有的
   端点重复；还得多测一条「它和 registry 对不对得上」。否。
2. **暴露 actuator 端点、但把它加进 auth 白名单**：省事，但把「哪些后端正在失败 + 失败率 + 调用数」
   公开给任何能到达网关的人——这是一张免费的弱点地图，helpful to an attacker。否。
3. **暴露 actuator 端点、保持它不在白名单**（选定）：端点由 resilience4j 现有 bean 提供（零生产代码、
   零新依赖），改一行 `exposure.include`；保护由既有 `PlatformAuthFilter` 提供，auth 开着时需 token，
   health 探针仍开放。运维得读数，未授权者得 401。

## 决定

- `application.yml`：`management.endpoints.web.exposure.include: health → health,circuitbreakers`。
- **不改 `PlatformAuthFilter` 白名单**（仍只 `platform/health` + `actuator/health` + `fallback/**`）：
  `/actuator/circuitbreakers` 因此在 auth 开启时落在 fail-closed 路径上。这是刻意的：「health 可公开，
  失败率读数不可」。
- **不改任何生产 Java 代码**：保护靠的是既有 WebFilter 覆盖 reactive handler 这一事实，由
  `CircuitBreakerActuatorAuthTest` 量出来——而不是靠「我以为 WebFilter 会覆盖」的假设。

## 后果与证据

- `mvn -o -B test -f services/nexus-gateway/pom.xml` = **78/78 BUILD SUCCESS**（SC-30 基线 73 + 新 5），
  且**首次尝试全绿**：先用一次性探针实测了端点的真实 JSON 形状（`{"circuitBreakers":{"nexus-api":{...,
  "state":...},"nexus-domain-service":{...}}}`），再写断言，没有猜 DTO 字段名、没有靠库版本碰运气。
- **静态面**：端点列出 `nexus-api` 与 `nexus-domain-service` 两个后端（与路由表一致，没有多造第三个），
  初始 `state=CLOSED`、`failureRateThreshold=50.0%`；并与 `CircuitBreakerRegistry` 的真值对账——端点是
  **同一组状态机的投影**，不是第二份独立真相。
- **动态面（集大成）**：§SC-24 的连续 drop 打开电路 → 端点显示 `state=OPEN` 且 `failedCalls>0`、
  `failureRate` 是带 `%` 的真实读数（不是给测试写死的字符串）、另一后端仍 `CLOSED`（一个被熔断不等于
  全站停摆）；§SC-29 的半开探测恢复后 → 端点回到 `CLOSED`。**「门自己愈合」第一次成为 operator 可见
  的事实，而不只是测试里的一个断言。**
- **安全面**：auth-on 的真实网关上，`/actuator/circuitbreakers` 无 token → `401 missing_token`；
  带有效 token → `200` 且能读到 state；`/actuator/health` 仍无需 token。这里专门验证了 §SC-27 那类
  陷阱的变体：actuator 端点由 reactive handler 应答，`PlatformAuthFilter`（WebFilter）**确实先于它执行**，
  所以暴露端点不会开洞。**零生产 Java 改动**即成立。
- 诚实边界：本片只暴露「读」，不提供写操作（resilience4j actuator 的 circuitbreakers 端点是只读）；
  端点读数反映的是**本网关实例**的内存状态，多实例部署下每个实例各报各的（聚合要另一个组件，未做）；
  `verify:topology` 冒烟脚本未改为断言该端点（它跑服务进程，本片是网关单测）；CI `topology` job 仍从未
  被真实 push 执行过；未推送（无明确指令）。
