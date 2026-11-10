# ADR-0111 — 路由表要可读，但绝不把写面一起交出去

- 状态：Accepted
- 日期：2026-11-11
- 关联：ADR-0101（单一真值源 / 编译期 DSL）、ADR-0104（双认证面共用一个策略）、ROADMAP §SC 第三十五片、SC-39

## 上下文

网关最核心的资产是路由表——「此刻哪些前缀会被路由到哪个后端」。到 SC-38 为止，breaker（SC-31）、bulkhead（SC-37）、registry（`/platform/services`）、后端健康（`/platform/health`）都已有运维读数，**唯独路由表本身读不到**：它的唯一真值是 `GatewayConfig.nexusRoutes()` 里那段编译期 Java DSL，运维想知道「现在生效的是哪几条」只能去读源码。

Spring Cloud 其实自带 `/actuator/gateway` 端点能读路由表。但一次性探针 + 字节码揭示了一个不能轻率接线的真相：

- `GatewayControllerEndpoint` 标注 `@RestControllerEndpoint(id="gateway", enableByDefault=false)`——**默认禁用是库的有意设计**。光把它加进 `management.endpoints.web.exposure.include=gateway` 仍全部 **404**（探针实测 routes/routesdef/refresh/save/delete 全 404），还须额外 `management.endpoint.gateway.enabled=true`。
- 它**不是只读的**：父类 `AbstractGatewayControllerEndpoint` 带 `@PostMapping("/routes/{id}")`（save）、`@DeleteMapping("/routes/{id}")`（delete）、`@PostMapping("/refresh")`（refresh），能在运行时**动态增删路由、触发路由表刷新**。
- 而本网关**打包默认 auth-off**（`nexus.gateway.auth.enabled:false`，为了让离线 truth 能跑、测试不需要 token 服务）。一次误配把 `enabled=true` 打开，就等于在无 token 的门口挂了一个能改路由的写面——这是路由注入，比信息泄露严重得多。

同时，受控启用 discovery locator 也不成立：`DiscoveryClientRouteDefinitionLocator.buildRouteDefinition()` 从 `DiscoveryLocatorProperties.predicates/filters`（字符串 `PredicateDefinition`/`FilterDefinition`）和 SpEL `urlExpression/includeExpression` 拼路由。要把现有 `edgePolicy`（retry / circuitBreaker / stripPrefix / setRequestSize / secureHeaders）接上去，必须把这条**编译期 Java DSL 整条复制成运行时字符串配置**，制造第二套会漂移的真值源——正是 `GatewayConfig` 从 SC-1 起选 Java DSL 要避免的。故「有意不开 discovery locator」（`GatewayConfig` 类注释，SC-1 起）这一既有决策**站得住，本轮不推翻，而是把它第一次变成可观测事实**。

## 决定

1. **新增只读控制器 `PlatformRoutesController`，暴露 `GET /platform/routes`**，注入 Spring Cloud `RouteLocator#getRoutes()`——与路由管线**同一个** locator。刻意不用 `RouteDefinitionLocator`：本网关路由由编译期 DSL 直接构造运行时 `Route`，从不注册 `RouteDefinition`，读 definitions 会返回空、是一句谎话。
2. **绝不启用官方 `gateway` 端点**。只给读数、不给写面。`PlatformRoutesWiringTest.theReadOnlyControllerDoesNotShipTheDangerousWriteEndpoint` 故意把 `gateway` 放进 exposure 里，钉住 GET/POST/DELETE **仍全 404**——证明「exposure 单独开不了它」，且本网关没有把写面带进默认配置。
3. **只报稳定身份字段**（`id` / `uri` / `order`）。运行时 `Route` 的 predicate 是 `AsyncPredicate<ServerWebExchange>`、filter 链是 `List<GatewayFilter>`，都是**编译后函数对象**；反编译官方 `serialize(Route)` 证明连 Spring Cloud 自己都只对它们调 `toString()`，没有结构化表达式可读。本控制器不伪造一个读不出的路径模板或 filter 列表，在 `note` 里明说边界，指向 `GatewayConfig` 去审计 edge policy。`uri`（`lb://<service>`）是最有价值的一列：它点明该路由经注册中心 + LB 解析到哪个 service id，与 breaker / bulkhead 读数是**同一个 id**，三份运维读数因此互相对账而非三套真值。
4. **「registry 里有、读数里没有」= 无路由**，写成恒真陈述（`note`）：即使某部署将来真开了 discovery locator，那些自动路由也会出现在本读数里，声明依然成立，不会变成过时的假话。
5. **鉴权零改动**：`PlatformRoutesAuthTest` 实测 auth-on 时无 token 401、带 token 200、health 仍开放，401 body 与 route edge / 其它平台面逐字一致（沿用 ADR-0104 的 `AuthPolicy` 单一方言）。新控制器是 gateway 自有 controller，先于 route pipeline 由 reactive 栈应答，只有 `PlatformAuthFilter`（`WebFilter`）覆盖得到它——`AuthFilter`（`GlobalFilter`）从不运行。测试证明既有过滤器无需任何生产改动就覆盖到这个**新** controller。

## 一次性探针读数（跑完即删）

`GatewayActuatorProbeTest`（3 服务：nexus-api / nexus-domain-service / rogue-service；exposure 含 `gateway`、auth-off）：

- `/actuator/gateway/{routes,routesdef,globalfilters,routefilters,routepredicates}`、POST `/refresh`、POST `/routes/{id}`、DELETE `/routes/{id}` — **全部 404**（端点未启用）；
- `GET /api/publications` → 200、`api.wire=[/publications]`；`GET /rogue-service/anything` → **404、`rogue.wire=[]`**（registry 里有它，但没有任何路由指向它）——「缺席即无路由」的 wire 事实；
- 404 body 带 `requestId` 字段，确认请求确实穿过网关链，不是路由层之外的东西在应答。

## 验证

- `PlatformRoutesWiringTest`（3 条 × 3 轮）、`PlatformRoutesAuthTest`（3 条 × 3 轮）：读数与 live `RouteLocator` 逐字段对账（非印死的字面）、rogue 缺席且 wire 为空、命名路由真到后端、写端点 404、auth 方言一致、health 开放。
- 网关全套 `mvn -o -B test` **116/116 BUILD SUCCESS**（两次独立全套，context 缓存封顶 maxSize=4 后无 fork 告警）；顶层 `npm run typecheck` **14/14**。

## 后果 / 仍欠

- **得**：路由表第一次可读，且读的是真值；「不开 discovery locator / 不交写面」两条安全决策从源码注释变成 wire + readout 事实；运维三张读数（breaker / bulkhead / routes）共享同一 service-id 命名空间。
- **代价 / 边界**：读不出路径模板与 filter 链（库的运行时表示所限，官方端点也一样），审计 edge policy 仍需读 `GatewayConfig`；本端点泄露 service id 拓扑，故刻意不进白名单、auth-on 时站在门后，auth-off 是「离线 truth 可本地读」的部署选择（与 `/platform/services` 一致）。
- **仍欠**：多实例 breaker/bulkhead 按实例粒度聚合（service-id 级读数的另一面，ADR-0110）；连接层黑洞独立看门狗（SC-36）；CI `topology` job 经真实 push 执行（需授权 push）。
