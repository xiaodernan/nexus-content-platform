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
  `gateway rate limit: enabled=true backend=memory ratePerSecond=50.0 ...`——本地文件是 100，50 只能来自
  配置中心（SC-12 给同一行加了 `backend=` 字段）。不带该开关时同一 jar 用本地 100 启动。配置模块 3 条测试全绿
  （文件内容、共享合并、未知应用仍回共享文档）。
- 仍欠（当时）：api/domain 的客户端接入；Git 后端；鉴权；动态刷新；配置变更的审计。其中客户端接入已由
  SC-11 关闭，其余仍欠。

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

### SC-12 限流计数搬进 Redis：一个集群一个桶，后端挂了门不关

- 起点（SC-7 仍欠）：桶按**实例**计，两台网关就是两倍速率；一个客户端在两台之间轮换，等于没有上限。
  ADR-0077 已在 web 层还过同一笔债，网关这层一直欠着。
- 决定：
  1. 新增 `nexus.gateway.rate-limit.backend: memory|redis`，默认 **memory**（既有测试与离线运行的行为不变）。
     未知值启动失败，不静默回落到 memory——一个"要了共享限流却悄悄拿到本地桶"的部署，正好是这道开关要
     防的那种错误。
  2. redis 后端用 `spring-boot-starter-data-redis-reactive`（Lettuce，懒连接）＋**一个 Lua 令牌桶**：
     `HMGET tokens/ts` → 用 Redis `TIME` 补水 → 扣 1 → `HSET` + `PEXPIRE`。一次 EVAL 原子完成。
     为什么用服务端时间：实例是不同机器、不同时钟；按 JVM 时钟补水会让额度取决于"这次是哪台接的"，
     那正是共享后端要消灭的东西。
  3. key = `<prefix><client>`（前缀默认 `nexus:gateway:rate:`，可配）；TTL = 补满一桶的时间 + 1 秒
     （rate=0 时 1 小时）。调用方决定的 key 集合不会永久驻留。
  4. **fail-open**：后端异常或空答复 → 放行 + 10 秒一条 WARN。限流是上界、不是鉴权；让"负责减速的组件"
     变成"关闭所有流量的组件"是更坏的故障。代价明写：Redis 故障期间网关不设防。
  5. Redis 默认 `127.0.0.1:56379`（不是本机别人的 6379），命令/连接超时各 1 秒——"没有答复"要快速变成
     放行，而不是把每个请求都拖成慢请求。
- 见证（2026-11-09 真三进程：registry 8761 + api 8081 + 两个网关 8092/8093，同一 Redis、`rate=0 burst=2`）：
  8092 两次 → `200`、`200`；8093 第三次 → `429` +
  `{"error":"rate_limited","note":"per-client bucket shared by the gateway deployment; Retry-After is seconds"}`
  ＋ `Retry-After: 1`。这一刻 B 自己的本地桶是满的，429 只可能来自共享计数。Redis 读数：
  `nexus:gateway:rate:127.0.0.1` = `tokens=0`、`TTL=3588`。
  另一实例 8094 指向死端口 56380、`burst=1 rate=0`：连续两次均 `200`（未限流），日志逐字
  `gateway rate limit backend 'redis' failed; request allowed unthrottled (fail-open): ...RedisConnectionFailureException`。
  单测 **30 条**全绿（`RateLimitFilterTest` 6、`RedisRateLimitBackendTest` 5，其余 19）。启动行现在读作
  `gateway rate limit: enabled=true backend=redis ratePerSecond=0.0 burst=2 maxClients=10000`。
- 边界：Redis 是**可选**依赖，但一旦选了 redis，它就在请求路径上（失败即 fail-open，不阻断）;
  key 在 TTL 窗口内计数精确，跨窗口只承诺"整桶上限 + 连续补水"，不是滑动窗口; `X-Forwarded-For` 的信任
  边界与 SC-7 相同; 网关自己的 controller 仍不受限流（SC-7 实测）。
- 观察（未修，记下来）：注册表为空时一次 `/api/projects` 探测在 503 已提交后又抛
  `UnsupportedOperationException`，`HttpWebHandlerAdapter` 记为 "ServerHttpResponse already committed"。
  只出现在"注册表无实例"的故障路径，不属于 SC-12；列为待查。
  **补记（2026-11-10，第十一片接手时量到）：这条观察的范围写窄了。** 本机 `mvn -o test` 一趟里，
  `GatewayEdgePolicyTest` 的 `/api/drop`、`/api/slow` 与 `GatewayUnknownServiceTest` 的
  `/api/projects?limit=1` **三处都打了同一句** `Error [java.lang.UnsupportedOperationException] … but
  ServerHttpResponse already committed (503 SERVICE_UNAVAILABLE)`。所以它不是"注册表为空"独有的，
  而是**走 fallback 那条路**就会发生；测试只断言 503 的正文，没有任何一条断言"提交之后不许再写"，
  于是 30 条全绿与这句 ERROR 同时成立。**说明（2026-11-10，第十二片接手）**：此处的"SC-13"原指修这条
  503 已提交噪声；接手后 SC-13 被定为**网关鉴权**（仍欠①），故上面那条 fallback 路径的
  `ServerHttpResponse already committed` 噪声作为**独立待修边**保留：它只是一条被记录、测试仍断言 503
  正文的 ERROR，不污染答案，修它需要动 retry/fallback 的交互（有把 30 条测红的风险），故未随 SC-13 一并改。
- 补记（2026-11-10，第十一片）：上面那段两实例见证是上一线量的；接手这一遍自己量的是**脚本那一层**。
  `RedisRateLimitBackendTest` 把 template 换成 mock，脚本正文此前在自动化里零读者，现在有了常驻的一支：
  `npm run ratelimit:gateway-lua`（`scripts/gateway-rate-lua-live.mts`）从 Java text block 里**读出**脚本
  （不抄第二份，打印 sha256 前 12 位），在真 Redis 上跑 6 条判据：共享桶第三次拒（1/1/0、tokens=0）、
  每实例一份的对照（1/1/1）、三条独立连接 13 次问门合计只放 3、补水用服务端钟且被 capacity 夹住
  （剩恰好 1 枚）、未来 ts 不倒扣出令牌、TTL 是传进去的数且真的到期。L1–L5 五条臂各自红一次
  （读数与还原 md5 见 ROADMAP §SC 第十一片）。**仍欠**：两个网关**进程**共用一只桶这一格本机没复现
  （空闲内存 357MB，起不来三个 JVM），上面那段进程级见证仍是上一线的读数。

### SC-13 网关鉴权：门先认人，再决定是否放行（关闭"仍欠①"的网关鉴权项）

- 起点（SC-7 / 仍欠①）：门对能摸到它的人完全敞开——`/api/**`、`/domain/**` 任何客户端都能直达后端，
  没有任何身份断言。ADR 把"网关鉴权"列为仍欠已久。本片把它还清，且**不引入第三方、不引入 JWT 库、
  不给一个能悄悄开门的默认密钥**（§159 同样适用于"门"，鉴权要么用真实密钥验真实签名、要么拒，不能假装）。
- 决定：
  1. 新增 `nexus.gateway.auth.enabled`（默认 **false**）＋ `nexus.gateway.auth.secret`。**开启但 secret 为空
     → 启动失败**（`IllegalStateException: refusing to start an open door`），而不是带着空密钥启动一扇开着的门。
     这扇门要防的"配了鉴权却悄悄拿到空密钥"的部署，正是这道开关存在的理由。
  2. `AuthFilter`（`GlobalFilter`，`ORDER = HIGHEST_PRECEDENCE + 5`，**先于**限流 `+10`，所以未认证的请求
     不占用令牌桶）：读 `Authorization: Bearer <token>`。token 是仓库**自己签**的 HMAC-SHA256 紧凑令牌——
     `base64url(payload) + "." + base64url(sig)`，`payload = {"sub","scp":[],"iat","exp"}`，
     `sig = HMAC-SHA256(payloadBytes, secret)`。签名的字节就是规范化 payload 的 UTF-8，所以不存在"两边
     JSON 规范化不一致导致篡改令牌验过"的空子；先常量时间比签名，只有签过的 payload 才解析 exp。
  3. **白名单（免令牌）**：`/platform/health`、`/actuator/health`、`/fallback/**`。门自己要先能被探活
     （探活不需要先亮证件），fallback 是门在够不到后端时自己说的话，自然也不能要求令牌。
  4. 成功 → 向下游注入 `X-Nexus-Subject` / `X-Nexus-Scopes`（**覆盖写、不追加**：伪造这两个头的客户端
     不能让后端以为它是别人；后端信任它们，因为只有这扇门在受信任的请求上设置它们）。
  5. 失败（缺令牌 / 格式坏 / 签名错 / 过期）→ `401`，请求**不到达**任何后端。
  6. **fail-closed，与限流相反**：鉴权没有"放行"兜底。secret 缺失启动即失败；验签若抛异常（本不该），
     拒而非放行。一扇因为 crypto 失败而开着的门，比关着的门更糟。
- 验证（2026-11-10，本机 `mvn -o test`）：**9 条** `AuthFilterTest`（MockServerWebExchange，无服务）：
  关闭即透传、无令牌 401、有效令牌放行且注入头、伪造 subject 被覆盖写、篡改签名拒、过期拒（签名仍有效，
  单独隔离到期检查）、格式坏拒、健康探针白名单放行、fallback 白名单放行。**4 条** `GatewayAuthWiringTest`
  （真 socket + StubUpstream）：无令牌 `/api` → 401 `missing_token`、有效令牌 `/api` → 200 且后端实测收到
  `X-Nexus-Subject: studio` / `X-Nexus-Scopes: read,write`、篡改签名 → 401 `bad_signature`、鉴权开着时
  `/platform/health` 仍 200（不被 401）。网关测试总计 **43 条**全绿（原 30 + 13）。`mint` 与 `verify` 同一
  代码路径，测试用同一密钥签发再验——§159 不造假，这里也没有可造假之处。
- 边界：secret 由部署提供真实密钥；本机默认关，离线/测试的"真相"仍是关着的门。`X-Forwarded-For` 的信任
  边界与 SC-7/SC-12 相同；网关自己的 controller 仍不受鉴权约束（它们在路由之前由控制器应答）。令牌有效期
  由签发方决定，门只验签名 + `exp`（含 1 秒宽限，是这扇门唯一授予的时钟偏移，且是显式的）。

**已知边界（如实记）**：

- `nexus-api` 信任 `X-Nexus-Original-URL`，与任何 forwarded 头同一信任边界：网关覆盖写、不追加；能直连
  后端的客户端可以伪造它。部署不得把 `nexus-api` 直接暴露给不可信客户端。
- `nexus-api` 在本机旧库上启动时 Hibernate 曾报
  `column "target_type" of relation "audit_entry" contains null values`。已按"写入端强制、schema 对历史
  行诚实留 null"修复（53c77e04）：实体去掉 `nullable = false`，不伪造历史行的 kind；真发布探针 201、
  审计新行带 `publication`，旧行保持 null。要把列重新收紧为 NOT NULL，仍需要一次真正的迁移回填。

## 仍欠

1. ~~网关鉴权~~ **已还清（SC-13）**：`auth.enabled=true` 且 `auth.secret` 非空才开门，否则启动失败；
   白名单 `/platform/health`、`/actuator/health`、`/fallback/**`。仍欠：TLS、WebSocket；breaker 状态不在
   进程内；网关自己的诊断端点不受路由边界策略约束（SC-7 实测）。~~多实例时的共享限流（Redis）~~
   **已还清（SC-12）**：`backend=redis` 时计数在一个 Redis 里，故障 fail-open。
2. 配置中心仍无 Git 后端、鉴权、动态刷新（`@RefreshScope` 未接）与变更审计；api/domain 客户端已接入
   （SC-11），SC-9 的欠项关闭。
3. `java-domain-service` 的 community/permission/billing 三个服务仍是桩：没有控制器、不可达、README 已
   如实标注；它们不是"能用"，是"还没建"。
