# ADR-0095：微服务拓扑先有三件真东西——注册中心、网关、会注册的后端

- 状态：已接受（2026-11-09，SC-1 / SC-2 / SC-3）
- 相关：`docs/decisions/0011-backend-service-boundaries.md`（Studio 只经网关说话；注意它在 `decisions/`
  而不是 `adr/`，本仓库两套编号并存）；`services/java-domain-service`（另一个 Spring Boot
  领域服务）；`services/nexus-api`（系统记录）；`docs/ENVIRONMENT.md` 端口段

## 背景

`docs/decisions/0011-backend-service-boundaries.md` 写着 "The Studio talks to the API gateway over typed
HTTP/WS contracts only"。但仓库里
**没有那个网关**：`apps/studio` 直接把地址指到 `nexus-api` 的 `127.0.0.1:8080`。与此同时仓库里已有
两个 Spring Boot 服务（`java-domain-service`、`nexus-api`），它们的地址只存在于启动脚本和文档里。
"微服务"在这里一直是个形容词，不是一个可运行的拓扑。

要让它变成真的，最少缺三件东西：

1. 一个**注册中心**：服务地址是它记着的事实，不是谁抄进配置文件的字符串；
2. 一个**网关**：Studio 只认识一个端口，路由按服务 id 解析；
3. 一个**会注册的后端**：否则注册中心是空的，网关只是一个更复杂的 503 机器。

## 选项

1. **Consul / Nacos**：功能更多，但引入一个新的有状态组件和它自己的运维面；Spring Cloud 的
   Eureka 客户端已经在本仓库的依赖版本线上，单独一个 Eureka Server 模块是最小增量。
2. **静态路由表（YAML 或 Java 里写死 `http://127.0.0.1:8080`）**：启动即可用，但它把地址又抄回了
   配置文件——那正是这组模块要消灭的东西。否。
3. **`discovery.locator.enabled=true`**：自动为注册表里每个服务发 `/{serviceId}/**`。它把"能访问注册
   中心"变成"能访问所有后端"，是一条未经评审的授权决定。否。
4. **路由表写 YAML**：Gateway 4.2+ 把 `spring.cloud.gateway.*` 移到了
   `spring.cloud.gateway.server.webflux.*`。前缀被依赖升级改名时 YAML 不会报错，只会静默地不再匹配。
   用编译期的 Java DSL，改名变成构建错误（选定）。
5. **网关兜底返回 `200 []`**：调用方分不清"系统记录里没有发布"和"系统记录挂了"，而 Studio 会在一片
   空库前面说谎（§159 禁止的形状）。兜底必须是 503 + 原因（选定）。
6. **让 `nexus-api` 默认注册**：所有单进程证明、单元测试、`java -jar` 都要先有一个注册中心才能启动。
   注册是部署决定，不是默认（选定：`NEXUS_API_REGISTER=false`）。

## 决定

### SC-1 `services/nexus-registry`

- 独立 Eureka Server（`spring-cloud-starter-netflix-eureka-server`），单节点。
- `register-with-eureka=false` / `fetch-registry=false`：单节点自我注册会把自己算进服务列表，
  网关按服务 id 路由时可能路由到注册中心本身。
- `enable-self-preservation=false`（单节点下它只会让死地址永久留在表里）、
  `use-read-only-response-cache=false`（去掉 30 秒的读缓存窗口）。
- 测试 `RegistryBehaviourTest` 6 条腿，全部走**真 HTTP + 真 servlet 容器**；注册体由 Eureka 自己的
  `EurekaJacksonCodec` 生成，而不是手写 JSON 字面量（端口、dataCenterInfo 不是普通 bean 属性）。

### SC-2 `services/nexus-gateway`

- Spring Cloud Gateway（reactive）+ LoadBalancer + Resilience4j，端口 8090。
- **一条**路由：`/api/**` → `lb://nexus-api`，`StripPrefix` 的段数从 prefix 计算，不写死 1。
- TimeLimiter 5 秒（库默认 1 秒会把冷启动的 4000 节点文档判成不可用）；熔断窗口 10 次 / 50%。
- 兜底 `/fallback/{service}` 永远 503，`cause` 读断路器实际记录的异常类名；读不到时写
  `not-reported`，不发明一个。
- `/platform/services` 返回注册中心**当下**持有的地址，并写明"这是注册表里的地址，不是网关做的健康检查"。
- 测试 7 条腿：`GatewayRoutingTest` 6 条（真 socket 上游：StripPrefix 看**后端收到的路径**、
  500 透传、超时 503、断连 503、`/platform/services` 读数、无 DiscoveryClient 的单元分支）+
  `GatewayUnknownServiceTest` 1 条（注册表里没有该服务 ⇒ 503）。

### SC-3 `nexus-api` 会注册

- 加 `spring-cloud-starter-netflix-eureka-client` 与 Spring Cloud BOM；`eureka` 段进 `application.yml`。
- `register-with-eureka` / `fetch-registry` 默认 **false**；两者都关时 Eureka 客户端不启动任何网络任务，
  单进程证明与 43 个既有测试的行为不变。
- 部署（或三服务联调）设 `NEXUS_API_REGISTER=true`。

## 后果与证据

2026-11-09 真三服务联调（本机）：

- registry 8761 起来；`GET /eureka/apps/NEXUS-API` = 200；
- `nexus-api` 在 8081 启动并注册（8080 被外部项目占用，未动它）；
- gateway 8091 启动后 `/platform/services` 读到
  `{"nexus-api":["http://192.168.1.5:8081"],"football-edge":["http://192.168.1.5:18080"]}`——注册表里
  同时有另一个项目的服务，这恰好证明读数是"注册表持有的事实"而不是本项目的编造；
- `GET http://127.0.0.1:8091/api/projects?limit=1` = **200**，返回真实 publication
  `doc_19d8pa`（PostgreSQL 55433）。这条链是：网关 → 服务 id → 注册中心 → 后端 → 库。

**SC-5 已修（2026-11-09）**：经网关的回执 URL 曾指向后端实例地址（`192.168.1.5:8081`）。现在网关对每条
路由请求设置自有头 `X-Nexus-Original-URL`（调用方实际输入的 scheme + authority），`nexus-api` 优先采用它。
不用 `X-Forwarded-Host` 的原因：框架自带的 `XForwardedHeadersFilter` 会在此后重写它（实测后端收到空串）。
真三服务复验：经 8091 的回执 `url` = `http://127.0.0.1:8091/projects/doc_19d8pa`；直连 8081 仍为
`http://127.0.0.1:8081/projects/doc_19d8pa`。网关测试断言 stub socket 实际收到的头；`nexus-api` 侧
`PublishControllerTest` 断言有头用调用方地址、空头回落本机地址。

### SC-6 `java-domain-service` 接入：第二条 `lb://` 路由

- 网关路由表现在是**两条**：`/api/** → lb://nexus-api`、`/domain/** → lb://nexus-domain-service`，
  各自 StripPrefix 自己的段数、各自独立 breaker 实例。测试用**两个 stub socket**，断言 domain 调用
  只落在 domain stub 上——一个把两条前缀都发往同一服务的路由表不会被这种断言放过。
- `java-domain-service` 从 Boot 3.2/Java 21 升到 Boot 3.5.16/Java 25，与 `nexus-api` 同代；
  Spring Cloud 2025.0.3 + Eureka client，`NEXUS_DOMAIN_REGISTER`/`NEXUS_DOMAIN_FETCH` 默认 false。
- 这个服务映射的是 **web 层拥有的 schema**（`apps/web/src/server/db/schema.ts` + Drizzle 迁移）：
  `ddl-auto: none`、删掉 Flyway——第二个 DDL 写入者就是两个系统对同一张表产生分歧的方式。
- 三个"老路"修复，全部有实测错误原文：
  1. `projects.kind/visibility`、`users.role` 是 PostgreSQL ENUM；String 以 varchar 绑定失败
     （`column "kind" is of type project_kind but expression is of type character varying`）→ 连接池设
     `stringtype=unspecified`（**pool 级**，URL 被覆盖也不会丢）。
  2. 枚举标签是小写（`creator`/`admin`、`free`/`studio`），`@Enumerated(STRING)` 绑 `CREATOR` 且
     `valueOf("free")` 失败（`invalid input value for enum user_role: "CREATOR"`、
     `No enum constant ...UserPlan.free`）→ `UserRoleConverter`/`UserPlanConverter`。
  3. `projects.brand_kit/visual_dna/modes` 是 `jsonb`；省略字段时 NULL 以 varchar 绑定失败
     （`column "brand_kit" is of type jsonb but expression is of type character varying`）→
     `@JdbcTypeCode(SqlTypes.JSON)`。
- `SecurityConfig` 显式 `permitAll`：没有 filter chain 时 Boot 会把所有路径锁在生成的密码后面；鉴权是
  网关尚未做的一刀，所以这个服务**不得直接暴露端口**写在 README 边界里。
- 测试：domain-service 22 条（此前 0 条）——`ProjectServiceTest` 5、`ProjectControllerTest` 5、
  `UserServiceTest` 7、两个 converter 5。网关 8 条（原 7 + domain 路由 1）。
- 真联调（2026-11-09）：经 8091 `POST /domain/api/v1/projects` = **201**、`GET` 同 id = **200**（`kind=game`）、
  `DELETE` = **204**、再 `GET` = **404**；`/platform/services` 读数含 `nexus-api`、`nexus-gateway`、
  `nexus-domain-service`（以及共享注册表里另一项目的 `football-edge`，只展示不路由）。探针行已从库里清掉。

### SC-7 边界策略：拒绝要有读数，重试要有边界

- 起点（第一片仍欠③）：网关的 auth / 限流 / TLS / WebSocket / 重试 / 缓存都为空。
- 决定：
  1. 两条路由共享一个 `edgePolicy(...)`，顺序即语义：StripPrefix（段数由前缀计算）→ RequestSize
     （`NEXUS_GATEWAY_MAX_REQUEST_BYTES`，默认 1 MiB）→ SecureHeaders → **仅 GET** 的一次重试 →
     CircuitBreaker（最后，统计重试后的最终结果）。
  2. 重试条件写成 `502/503 + IOException/TimeoutException`，并**主动清空 series**。只设 methods 时
     框架默认 series=SERVER_ERROR，500 也会被重试（实测：stub 收到两次 `/publications`）；500 是后端的
     真实回答，不是瞬态故障。
  3. 自研 `RateLimitFilter`（`GlobalFilter`，`HIGHEST_PRECEDENCE + 10`）：Caffeine 有界缓存 + 每客户端
     令牌桶，默认 100/s、burst 200、maxClients 10000；超限 429 + `Retry-After: 1` + JSON 错误体。
- 为什么不用 `RequestRateLimiter` + Redis：那会把 Redis 变成**每个请求**的硬依赖——Redis 挂 = 门挂。
  本阶段网关必须不依赖第二个进程就能诚实回答。代价写明：桶按**实例**计，两台网关 = 两倍速率；共享
  限流是独立的 Redis 片，仍欠。
- 见证：网关 17 条测试全绿（`GatewayRoutingTest` 7、`GatewayUnknownServiceTest` 1、
  `GatewayEdgePolicyTest` 4、`RateLimitFilterTest` 4、`GatewayRateLimitWiringTest` 1）。真联调
  2026-11-09：三项安全头齐全；1.2 MB POST → 413 且 DB 0 行；桶强制 rate=0/burst=3 时前 3 次被转发
  （探针路径本身 404，说明已到路由），后 3 次 429 + `Retry-After: 1`；启动日志逐字
  `gateway rate limit: enabled=true ratePerSecond=0.0 burst=3 maxClients=10000`。
- 发现并如实记：`/platform/services` 是网关自己的 controller，`RequestMappingHandlerMapping` 先于
  `RoutePredicateHandlerMapping` 匹配，`GlobalFilter` 看不到它——诊断端点不在路由边界策略内。它不是
  "已加固的入口"，不得按入口暴露；若要同等限流，应移到路由后或在 controller 内自己做。

### SC-8 拓扑健康读数：把"注册了"和"能答话"分开

- 起点（SC-3 边界仍欠）：`/platform/services` 只列地址，注册表只列租约；两者都不是健康检查，运维看到
  地址只能猜哪个服务真的会答话。
- 决定：
  1. `nexus-api`、`java-domain-service`、`nexus-gateway` 各加 `spring-boot-starter-actuator`，只暴露
     `health`，`show-details: never`（不把 datasource URL、异常文本放进未鉴权响应）。
  2. 网关新增 `GET /platform/health`：对注册表里的**每个实例**发一次 `GET /actuator/health`，逐实例
     返回 `uri/httpStatus/status/detail`，并汇总 `allUp`。探测并发上限 8，单实例超时
     `NEXUS_GATEWAY_HEALTH_TIMEOUT_MS`（默认 1500 ms）。
  3. 三种状态写死定义：`UP` = 2xx 且 `status=UP`；`DOWN` = 非 2xx、自报 DOWN/OUT_OF_SERVICE、或连接被
     拒绝；`UNKNOWN` = 超时、读不懂的 2xx、其它传输错误。超时**不**折算成 DOWN。
  4. `/platform/health` 在探测执行后恒返回 HTTP 200（`allUp` 才是结论）。网关自己答话了；某个后端挂了不
     等于门不健康，503 还会让"端点不存在"和"后端挂了"无法区分。
  5. 探针必须**全响应式**：它由 WebFlux controller 在 Netty event-loop 线程调用，第一版里的 `block()`
     会被 Reactor 立即拒绝（`PlatformHealthWiringTest` 第一次运行把每个实例都读成 UNKNOWN，正是这个
     真 bug）。现版本用 `Mono` 组合，实例并发探测。
- 为什么不用注册表的 lease 状态：那只能说明"进程还在续租"，不能说明它现在能否处理请求，也不能区分
  503 与超时。
- 见证（2026-11-09 真联调）：`/platform/health` → `allUp:true`，`nexus-api` / `nexus-domain-service` /
  `nexus-gateway` 均 `UP`；停掉 domain 后同一端点 → `allUp:false`，该实例 `UNKNOWN` +
  `"no answer within 800 ms"`（LAN 地址被静默丢包，没有否定答案）。网关测试 23 条全绿（新增
  `ServiceHealthProbeTest` 4、`PlatformHealthWiringTest` 2）。
- 调参（实测驱动）：上述 domain 重启后**第一次**探测又读到 UNKNOWN，直接 `curl` 同一地址却 167 ms 返回
  UP——冷启动时 servlet 初始化让首个探测超过 800 ms。默认值因此上调到 1500 ms；再探 `allUp:true`。
- 边界：这是**点测量**，不缓存、不是监控历史；探测端点自身仍是网关 controller，不在路由边界策略内。
  另外本机 `localhost:6379` 是另一个项目的 specproof-redis（要 AUTH）；domain 的 Redis 默认端口已在
  SC-10 改为 56379，不再依赖启动脚本显式传 `REDIS_PORT`（见下）。

### SC-9 配置中心：环境真相是一个地址，而不是一串 shell 变量

- 起点：网关的边界参数来自本地 `application.yml` + 一串 `NEXUS_GATEWAY_*`。单机可行；两个环境要不同值
  就得靠脚本记住每个变量，漏一个就是悄悄用了错误的值。
- 决定：
  1. 新增 `services/nexus-config`（Spring Cloud Config Server，`native` profile，端口 8888），从自身
     classpath 的 `nexus-config/` 读 YAML。`native` 是实验室选择，不是生产结论：生产把同一服务器的后端
     换成 Git，HTTP 契约不变。
  2. 只服务两个文件：`application.yml`（所有客户端共享且完全相同的设置）与 `nexus-gateway.yml`
     （网关的环境真相）。目前**只有网关**是客户端；api/domain 仍读打包文件，未接入就不写进文档冒充。
  3. 网关加 `spring-cloud-starter-config`；`spring.config.import=optional:configserver:...`，
     `spring.cloud.config.enabled` 默认 **false**。配置中心挂了不能把门带停；本地文件始终是离线真相。
  4. 不注册进 Eureka、不做鉴权/加密（文件里不放 secret）、不提供写 API、不做动态刷新
     （`@RefreshScope` 未接，改值要重启客户端）。
- 为什么不用 Consul/Zookeeper：本阶段只需要"按应用名下发 YAML"，Config Server 的 native 模式零外部状态、
  可离线测试；引入 Consul 会同时引入一个必须常驻的共识集群，收益与成本不匹配。
- 见证（2026-11-09）：`GET /nexus-gateway/default` 返回两个 property source（`nexus-gateway.yml` 在前，
  `application.yml` 在后），`rate-per-second=50`；`NEXUS_CONFIG_ENABLED=true` 启动的网关日志逐字
  `gateway rate limit: enabled=true ratePerSecond=50.0 ...`——本地文件是 100，50 只能来自配置中心。不带该
  开关时同一 jar 用本地 100 启动。配置模块 3 条测试全绿（文件内容、共享合并、未知应用仍回共享文档）。
- 仍欠：api/domain 的客户端接入；Git 后端；鉴权；动态刷新；配置变更的审计。

### SC-10 默认值即环境真相：domain 的 Redis 默认端口

- 起点：SC-8 联调时 domain 的 health 曾 503，日志 `NOAUTH`——`localhost:6379` 是**另一个项目**的
  specproof-redis，而本项目的 nexus-redis 在 56379。当时靠启动脚本显式 `REDIS_PORT=56379` 绕开；
  "默认值指向别人的服务"意味着漏传一个环境变量就会静默用错库，且只在 health 上暴露。
- 决定：`java-domain-service` 的 `application.yml` 把 `REDIS_PORT` 默认值改为 **56379**，并写明注释
  （"A default that points at someone else's service is not a default, it is a trap."）。
  这只是改默认值，不改变 `REDIS_PORT`/`REDIS_HOST` 的覆盖语义。
- 见证（2026-11-09）：停掉旧进程 → `mvn package`（22 条测试绿）→ **不带** `REDIS_PORT` 启动 →
  `GET /actuator/health` 200 `{"status":"UP"}`；网关 `/platform/health` → `allUp:true`、
  `nexus-domain-service` `UP`。
- 边界：56379 是**本机实验室拓扑**的默认值；部署到别处仍必须显式给 `REDIS_HOST/REDIS_PORT`。
  不改 `REDIS_HOST` 默认 `localhost` 的理由相同但方向相反：默认远端主机才是更坏的陷阱。

### SC-11 api/domain 接入配置中心：默认关，开启后注册由中心说了算

- 起点（SC-9 仍欠）：配置中心只有网关一个客户端；api/domain 的部署参数仍靠一串
  `NEXUS_API_REGISTER` / `NEXUS_DOMAIN_REGISTER` 环境变量，漏一个就是"服务起来了但没有进拓扑"。
- 决定：
  1. 两个服务都加 `spring-cloud-starter-config`，与网关同一契约：`optional:configserver:` 导入，
     `spring.cloud.config.enabled` 默认 **false**。配置中心不可达不是启动失败；打包文件仍是离线真相。
  2. 新增 `nexus-api.yml` / `nexus-domain-service.yml`，只放这一条本实验室的部署真相：
     `eureka.client.register-with-eureka: true`。打包文件继续默认 false（独立运行不依赖注册表）。
  3. 不把 datasource/redis 地址搬进中心：那些必须由运行环境决定（每个 proof 指向自己的库），
     搬进来反而制造"中心配错一处、所有服务连同一个库"的新陷阱。
- 为什么用注册开关当证据：它是**可观测**的布尔值。本机打包默认为 false，环境里不设
  `NEXUS_API_REGISTER` 时若实例出现在注册表，`true` 只可能来自中心文件。
- 见证（2026-11-09 双臂）：配置中心在 8888 应答、环境无 register 变量时——
  客户端关（默认）→ `/actuator/health` 200 但 `/eureka/apps` 无 `NEXUS-API`；
  客户端开 → `NEXUS-API`（8081）出现，网关 `/platform/health` 该实例 `UP`。
  domain 同一次启动的日志逐字：
  `ConfigServerConfigDataLoader : Fetching config from server at : http://127.0.0.1:8888`、
  `Located environment: name=nexus-domain-service`、`Registering application NEXUS-DOMAIN-SERVICE ... UP`。
  配置模块测试 5 条全绿（新增两份文档的断言）；api 全量测试、domain 22 条测试绿。
- 边界：配置中心仍是单点（optional 导入把"中心挂了"降级为"用打包文件"）；仍无鉴权、无动态刷新；
  api/domain 的其它参数不搬家（见决定 3）。SC-9 的"api/domain 客户端接入"欠项就此关闭。

**已知边界（如实记）**：

- `nexus-api` 信任 `X-Nexus-Original-URL`，与任何 forwarded 头同一信任边界：网关覆盖写、不追加；能直连
  后端的客户端可以伪造它。部署不得把 `nexus-api` 直接暴露给不可信客户端。
- `nexus-api` 在本机旧库上启动时 Hibernate 曾报
  `column "target_type" of relation "audit_entry" contains null values`。已按"写入端强制、schema 对历史
  行诚实留 null"修复（53c77e04）：实体去掉 `nullable = false`，不伪造历史行的 kind；真发布探针 201、
  审计新行带 `publication`，旧行保持 null。要把列重新收紧为 NOT NULL，仍需要一次真正的迁移回填。

## 仍欠

1. 网关鉴权、TLS、WebSocket；多实例时的共享限流（Redis）与 breaker 状态不在进程内；网关自己的诊断
   端点不受路由边界策略约束（SC-7 实测）。
2. 配置中心只有网关一个客户端；Git 后端、鉴权、动态刷新、变更审计都未做（SC-9 已写明"未做"）。
3. `java-domain-service` 的 community/permission/billing 三个服务仍是桩：没有控制器、不可达、README 已
   如实标注；它们不是"能用"，是"还没建"。
