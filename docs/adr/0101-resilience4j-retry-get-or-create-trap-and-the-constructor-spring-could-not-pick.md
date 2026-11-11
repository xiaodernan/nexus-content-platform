# ADR-0101：Retry 的 get-or-create 陷阱，与 Spring 无法替我们选的那个构造函数

- 状态：已接受（2026-11-12）
- 相关：`docs/adr/0057-...`（breaker 名字"配了一个没人用的实例"那一课）、`services/nexus-api/src/main/java/dev/nexus/api/domain/{DomainServiceRetry,DomainProjectReader,DomainServiceClientConfig,DomainServiceRetryTest,DomainProjectReaderWiringTest,DomainServiceRetryAutoConfigTest}.java`、`services/nexus-api/src/main/resources/application.yml`

## 背景：v669 的 Retry 门红了三条，而红的原因和策略无关

v669 给 `nexus-api → domain-service` 那**一个** typed GET 加了 Resilience4j Retry（`application.yml` 的 `resilience4j.retry.instances.nexus-domain-service`）：只重试 `RetryableException` / `503`，并 `ignore` 掉 `404` / 开断 / 无实例三类"不该再问一次"的失败。`DomainServiceRetryTest` 用真 `RetryRegistry` 数调用次数来判分，其中三条断言——404、开断、无实例各**应只调用 1 次**——实测都是 **3 次**。表面看是 `ignoreExceptions` 没生效。

## 根因：`RetryRegistry.retry(name)` 是 get-or-create，不看名字取策略

读 Resilience4j **2.2.0** 源码（`resilience4j-retry`/`resilience4j-core` 的 `-sources.jar`）确认，不是猜：

1. `InMemoryRetryRegistry.retry(String name)` → `retry(name, getDefaultConfig())`。**它不按 name 查具名配置**；`getDefaultConfig()` 在没有 `DEFAULT_CONFIG` 项时是 `RetryConfig.ofDefaults()`——而 ofDefaults 是 `retryOnException = 全部`、`maxAttempts = 3`，即**什么都重试**。
2. 构造 `RetryRegistry.of(Map.of(name, config))` 时，那个 map 进的是 `configurations`（**共享配置名**表，`AbstractRegistry.constructor` 里 `configurations.putAll(configs)`），只被 `retry(name, configName)` 这条重载用 `getConfiguration(configName)` 读取；它**不预建任何实例**。
3. 所以测试里的 `retry(INSTANCE)` 走 `computeIfAbsent` 现造了一个 ofDefaults 实例：`ignoreExceptions`、`retryExceptions`、连 `waitDuration` 一起**全部没被应用**。三条红与策略组合逻辑无关——那条组合谓词 `(retrySet) ∧ ¬(ignoreSet)` 从头到尾是对的，测试从没让它跑过。
4. **生产路径恰好是对的**，但只是巧合：Spring 的 `RetryAutoConfiguration.retryRegistry(...)` 用 `retryConfigurationProperties.getInstances().forEach((name, props) -> retryRegistry.retry(name, createRetryConfig(name, ...)))` **按实例名预建**了 `instances.*` 每一项。于是生产的 `retry(name)` 在 `computeIfAbsent` 命中既有实例，拿到真策略。

一个"测试红、生产绿"的分裂，根子是测试用了一个**生产永远不会构造的形状**（`of(Map)` 只填共享配置表），却以为它等价。

## 顺带量出的第二个缺陷：服务根本起不来

`DomainProjectReader` 为兼容 pre-v669 单测保留了 `DomainProjectReader(DomainServiceClient)`，又加了 v669 的 `DomainProjectReader(DomainServiceRetry)`——两个**单参**构造、没有无参、都没标注 `@Autowired`。真 `AnnotationConfigApplicationContext` 测得：`BeanCreationException: Failed to instantiate … No default constructor found`（`NoSuchMethodException: <init>()`）。一个 `@Service` 这样写，**nexus-api 直接起不来**。拓扑证明上次跑在 v669 之前，所以没抓到。这正说明"单测全绿"不等于"Spring 能装配"。

## 一个潜在的生产隐患：`retry(name)` 会把缺失的实例悄悄变成重试 404

即便生产目前正确，`DomainServiceRetry` 若继续用 `retry(name)`，一旦 YAML 的 `instances.*` 块被删/改名（或配置中心覆盖掉），它不会失败，而会 get-or-create 一个 ofDefaults 实例——**把每个 404 重试三次**，正好是本支柱要消灭的行为，而且静默。原 Javadoc 写着"缺失实例会 FAIL AT STARTUP"，与实现不符。`retry(name, configName)` 虽能规避测试的坑，但把**实例名**和**配置名**两个命名空间混成一个词，且在 `of(Map)` 形状下会从同名共享配置悄悄造实例，仍不是那句"声明过的实例必须在"的契约。

## 决定

1. **测试按生产的形状建 registry**：`RetryRegistry.ofDefaults()` 后 `registry.retry(INSTANCE, CONFIG)` 预建实例——这正是 `RetryAutoConfiguration` 装配 `instances.*` 的方式。三条 ignore 断言于是第一次真正跑在声明的策略上。
2. **生产用 `find(name)` + 失败即抛**：`registry.find(INSTANCE).orElseThrow(IllegalStateException)`。`find` 是只读查既有实例，把"实例没声明"这个事实暴露出来，在启动时拒绝，而不是静默造一个重试全部的策略。注释与 Javadoc 与实现对齐；`retry(name, configName)` 被明确否掉（混两个命名空间）。
3. **给 reader 的 v669 构造加 `@Autowired`**（全限定名，避免多一个 import）：明确告诉 Spring 两个单参构造里选哪个。pre-v669 的 `DomainProjectReader(client)` 保留，单测仍可不靠上下文直接 new。
4. **补一扇真自动配置门**（`DomainServiceRetryAutoConfigTest`）：用 `ApplicationContextRunner` + `AutoConfigurations.of(RetryAutoConfiguration.class)` + 与 `application.yml` 同形的 `resilience4j.retry.instances.nexus-domain-service.*` 属性，**实测**自动配置确实 `find(name)` 得到声明实例、且 404 只调 1 次、瞬时抖动调 2 次——把"生产形状"从巧合升级为被门钉住的事实。
5. **补一扇真 Spring 装配门**（`DomainProjectReaderWiringTest`）：真 `AnnotationConfigApplicationContext` 里 `refresh()` 后 `read(id)` 必须走 `DomainServiceRetry.getProject`、不碰裸 client。若 Spring 选错构造或再起歧义，此门红。

## 实测读数（measured, not assumed）

- `DomainServiceRetryTest` **9/9**：三条 ignore 断言（404/开断/无实例各 1 次）终于绿在真策略上；新增 ① `InternalServerError` 只调 1 次（500 既不在 retry 集也不在 ignore 集，组合谓词为假——**这条专门证明跑的是 YAML 策略而非 ofDefaults**，后者会调 3 次）、② 未声明实例 `find` 为空时 `DomainServiceRetry` 构造即抛、且 client 零调用。
- `DomainServiceRetryConfigTest` **6/6**：实例名与 Feign client 同名、attempts/wait 有界、404/开断/无实例被 ignore、只重试瞬态、retry 与 breaker 对 404 一致。
- `DomainProjectReaderWiringTest` **1/1**：真上下文装配成功并走 retry 路径（修复前实测为 `No default constructor found` 的红）。
- `DomainServiceRetryAutoConfigTest` **3/3**：真 `RetryAutoConfiguration` 下 `find(name)` 命中且 `maxAttempts=3`、404 只 1 次、瞬时抖动 2 次成功。
- **nexus-api 全套 `mvn -o -B -q test`：951 tests / 0 failures / 0 errors / 0 skipped**。
- 结论：三条红是**测试夹具**错，不是策略错；两个真缺陷（装配歧义、静默 get-or-create）是这次红门顺带量出来的，都已补门钉住。

## 仍欠（如实记）

1. 未重跑 `docs/evidence/java/spring-cloud-proof.mjs` 的 14 节端到端拓扑（本片宿主内存紧，`mvn` 都得 `MAVEN_OPTS=-Xmx1400m` 才不被 SIGTERM）；v669 的 retry 在**完整拓扑里随请求实际发生一次重试**没有端到端证据，只有 `ApplicationContextRunner` 的同形自动配置门。真库/真注册中心的链路上一次绿在 v669 之前。
2. `application.yml` 的 wait 是固定 `200ms`（2 次重试最多 400ms）；指数退避属性未启用——2.2.0 的 Spring Boot binding 是否支持未确认，宁可不配也不留一行静默无效的旋钮。
3. Retry 与 breaker 是两个独立实例、各自读同一份 404 规则；`DomainServiceRetryConfigTest` 钉了两者对 404 一致，但 "breaker open → CallNotPermittedException → retry 也不重试" 只在单测用真异常对象覆盖，未在拓扑里让 breaker 真开一次再量 retry 的行为。
4. 与 v668 的 web 侧门一样：`find(name)` 是静态装配契约，证明"声明的实例在、且被应用"；不证明"每一次失败都按预期分类"——那需要拓扑级故障注入。

## 共享树注记

本片与并行 lane 在同一工作树上同时推进 v669：我先做完源码级根因诊断（读 `-sources.jar`）与 `find()` 方向、写好真自动配置门；并行 lane 独立得出同一诊断并落了 `489afd7`（`find()+orElseThrow`、`@Autowired`、Spring 形状夹具、两条新门全在其中）——**两条线收敛到同一解**，无互相覆盖。我的 `DomainServiceRetryAutoConfigTest.java`（`489afd7` 未含）与本 ADR/ROADMAP/CURRENT-STATE/memory 作为后继补上。期间并行 lane 另有 `apps/web/src/app/page.tsx` 在飞改动（未暂存），按纪律未碰、未 `git add -A`。
