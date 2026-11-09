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

**已知边界（如实记）**：

- 经网关取回的回执里 `url` 是 `http://192.168.1.5:8081/projects/...`，即**后端实例地址**，不是网关
  地址：网关透传 `Host`，`nexus-api` 用它构造自身 URL。要给出对外地址，需要 `X-Forwarded-Host`
  处理或配置化的 public base URL——下一片。
- `nexus-api` 在本机旧库上启动时 Hibernate 报
  `column "target_type" of relation "audit_entry" contains null values`：`ddl-auto: update` 无法给已有
  行加 NOT NULL 列。读路径不受影响，写审计的路径会失败。这是既有技术债，需要迁移工具或带默认值的
  列演进，不在本片修。
- 网关没有 auth、限流、TLS、WebSocket 升级、重试、Caffeine 缓存；生产形态未做。

## 仍欠

1. 网关的 `X-Forwarded-*` / public base URL 策略（上面那条边界）。
2. `audit_entry.target_type` 的迁移（Flyway/Liquibase，或带 DEFAULT 的列演进）。
3. 网关鉴权、限流、TLS、WebSocket；多实例时的共享限流与 breaker 状态不在进程内。
4. `java-domain-service` 尚未接入注册中心——它是第二个后端，接入后网关才有多路由的意义。
