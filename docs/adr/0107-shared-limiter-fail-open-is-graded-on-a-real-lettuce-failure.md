# ADR-0107：共享限流器的 fail-open 在真实 Lettuce 故障上被钉住——门不关、请求到后端、告警不静默

- 状态：已接受（2026-11-11）
- 相关：`services/nexus-gateway/src/main/java/dev/nexus/gateway/RateLimitFilter.java`（SC-12 的 fail-open：
  `doOnError(warnBackendFailure)` + `onErrorResume(error -> Mono.just(true))` + `defaultIfEmpty(true)`）、
  `services/nexus-gateway/src/main/java/dev/nexus/gateway/RateLimitBackend.java`、`RedisRateLimitBackend.java`、
  `GatewayConfig.java`（`rateLimitFilter` bean：`backend=redis` 时 `redis.getIfAvailable()`）、
  `services/nexus-gateway/src/main/resources/application.yml`（`spring.data.redis.{timeout,connect-timeout}`）、
  `services/nexus-gateway/src/test/java/dev/nexus/gateway/GatewayRedisFailOpenWiringTest.java`（新增，真实
  Lettuce 连接失败的 wire 判据）、`RateLimitFilterTest.java`（既有，mock backend 单测）、
  `GatewayRateLimitWiringTest.java`（既有，正常路径 429）、`docs/adr/0105`/`0106`（对称的 retry 判据）、
  `docs/ROADMAP.md` §SC 第三十一片。

## 背景

SC-12 给网关的门装了每客户端令牌桶，两种后端：`memory`（每实例）与 `redis`（全实例共享一个原子桶）。
选 `redis` 是把配置速率变成**整个集群**的速率，代价是给边缘加了一跳网络和一个可选依赖。`RateLimitFilter`
对此有一条明确声明：

```java
return backend.tryAcquire(key)
        .doOnError(this::warnBackendFailure)
        .onErrorResume(error -> Mono.just(true))   // FAIL-OPEN
        .defaultIfEmpty(true)
        .flatMap(allowed -> Boolean.TRUE.equals(allowed) ? chain.filter(exchange) : refuse(exchange));
```

注释写得很硬：*"a rate limit is a bound, not an authentication decision. Refusing every request would turn a
degraded limiter into a full outage: the door would be closed by the component whose only job is to slow
traffic down."* 但这条承诺此前只有 `RateLimitFilterTest.aFailingBackendAllowsTheRequestInsteadOfClosingTheDoor`
用** mock backend 立即返回 `Mono.error`** 验证过——那是把 `onErrorResume` 的 Java 语义测了，没测真实 Redis
依赖故障时的连接池、重试、超时、以及"请求是否真的穿到后端拿一个诚实答复"。而**共享限流依赖恰好是那种
一挂就想关门的组件**：门是可用性资产，限流是它的护栏，护栏坏了不该把门焊死。

## 先实测，不猜（一次性探针，跑完即删）

配 `backend=redis` 指向**端口 1（无监听，确定性 connection-refused）**，把 `spring.data.redis` 的
connect/command 超时压到 300ms，后端 stub 正常回 200。3 轮探针实测：

| 轮 | caller status | 耗时 | 后端 stub wire |
|---|---|---|---|
| 0 | **200** | 1205ms | **1** |
| 1 | **200** | 22ms | **1** |
| 2 | **200** | 19ms | **1** |

日志同步给出：`gateway rate limit backend 'redis' failed; request allowed unthrottled (fail-open):
RedisConnectionFailureException: Unable to connect to Redis`。

读数把三件事一次钉死：①**门没关**——真实 Lettuce 连接失败下 caller 拿到后端诚实的 200，不是 500/429/
空成功；②**请求真穿到后端且只一次**——`hasSize(1)` 同时证明 fail-open 放行了整条链、且限流失败没有重放
请求；③**告警被记、且节流**——3 轮故障只打 1 条 WARN（`BACKEND_WARNING_INTERVAL_MILLIS=10s` 生效），
一次宕机不会刷爆日志。这三点合起来才是完整的 fail-open：放行 + 到达 + 可观测。

## 落下的判据（钉稳定量，不 pin 浮动耗时）

`GatewayRedisFailOpenWiringTest`（1 条方法 × 5 轮，真实 Lettuce 故障）：

1. **每轮 200 + 后端恰收 1 次**：availability-over-throttling 的 SC-12 取舍在真实依赖故障上成立，
   无放大、无被关门。
2. **无 hang**：8s 宽松上界只抓"真挂死"——fail-open 存在的首要理由就是不让坏护栏把门拖住。
3. **fail-open 决策被记入日志**：用 `OutputCaptureExtension` 断言至少一条含 `fail-open` 与后端名 `redis`
   的 WARN。这是诚实性的另一半：门放行了，operator 必须能把"门开着且未限流"与"限流器在岗"区分开。
   只钉"至少一条"（节流，故非每轮一条），不 pin 精确条数——“3 轮恰好 1 条”依赖 10s 窗口与机器时序。

## 诚实边界与决定

- **刻意不 pin**：每轮精确耗时。探针读 1205ms（首轮冷 Lettuce 连接失败 + 重试）→ 22ms / 19ms（失败被
  缓存后快速失败）。这是 Lettuce 连接池状态与机器速度的函数，钉死即 flaky。8s 上界只兜"真 hang"。
- **诚实缺口（记下，不假装已解）**：`RedisRateLimitBackend.tryAcquire()` 自身**没有显式 `.timeout(...)`**，
  把"不可达变成 error"交给 Lettuce 的 `connect-timeout`/`timeout` 与响应式链。一个**黑洞型**依赖（连上但
  永不回、慢于该上界）会先拖住请求、到边界才 error → fail-open。对本探针的 connection-refused 形态，
  这条链是活的；对 blackhole 形态的精确延迟本片未测（需不可路由地址，依赖本机网络，易 flaky）。
  若要给 fail-open 一个与 Lettuce 内部实现无关的硬上界，将来可在 backend 上叠一个显式 `Mono.timeout`——
  那是生产改动，须另立一片评估，本片不越界。
- **不 pin 日志精确条数**、不断言异常具体类名（`RedisConnectionFailureException` 是本次形态，blackhole
  会是 timeout 类；钉"fail-open 发生了"而非"以哪种异常发生"）。
- **不改生产**：SC-12 的 fail-open 契约在真实连接失败上成立，无缺陷可修；本片把一条只被 mock 证明的
  韧性承诺升级为 wire 级事实，并把它对可观测性的要求（告警）一并钉住。
- **验证**：单类 1/1 PASS（含 5 轮真实连接失败采样）；网关全套与顶层 typecheck 读数见 ROADMAP
  §SC 第三十一片。整仓 eslint 仍是本机内存超时边界（非 lint 报错），如实记；未推送（无明确指令）。
