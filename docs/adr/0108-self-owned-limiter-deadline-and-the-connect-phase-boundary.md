# ADR-0108：共享限流器有了自持 deadline，但 connect 阶段的黑洞只能靠下游超时——诚实划定边界

- 状态：已接受（2026-11-11）
- 相关：`services/nexus-gateway/src/main/java/dev/nexus/gateway/RedisRateLimitBackend.java`（SC-36：`tryAcquire`
  叠 `timeout(backendTimeout)`，构造器 fail-closed 拒绝非正上界）、`GatewayConfig.java`（`rateLimitFilter`
  bean：注入 `nexus.gateway.rate-limit.backend-timeout-ms`，启动日志读出）、
  `services/nexus-gateway/src/main/resources/application.yml`（新增 `backend-timeout-ms`，默认 1000ms）、
  `RateLimitFilter.java`（SC-12 的 fail-open：`onErrorResume(error -> Mono.just(true))`，本片不改）、
  `services/nexus-gateway/src/test/java/dev/nexus/gateway/RedisRateLimitBackendTest.java`（单元层：never→
  界内 TimeoutException、上界可配置、非正值拒绝构造）、`GatewayRedisBackendTimeoutWiringTest.java`（wire 层：
  受控 `Flux.never()` backend 经真实网关链）、`docs/adr/0107`（SC-35：真实 connection-refused 的 fail-open）、
  `docs/ROADMAP.md` §SC 第三十二片。

## 背景：一条只在注释里、从未被证明的前提

ADR-0107 在**真实 Lettuce 连接失败**（端口 1，connection-refused）上证明了 fail-open：门不关、请求穿到后端
恰一次、告警被记。但它的诚实缺口写得很清楚：`RedisRateLimitBackend.tryAcquire()` 自身没有显式
`.timeout(...)`，把"不可达变成 error"交给 Lettuce 的 `connect-timeout`/`timeout`。ADR-0107 明确记下：
*"若要给 fail-open 一个与 Lettuce 内部实现无关的硬上界，将来可在 backend 上叠一个显式 `Mono.timeout`——
那是生产改动，须另立一片评估。"* 本片就是那一片。

`RateLimitFilter` 的 fail-open 只有一句：`.onErrorResume(error -> Mono.just(true))`。它有一条**从未被写下来的
前提**——backend 最终要**产生一个 error**。`Flux.never()`（连上但命令永不回、池耗尽在等槽位、Lua 卡死、
DNS hang）既不 emit 也不 error，`onErrorResume` 永不触发，请求永久挂在限流那一关。这不是"限流"，是**用一条
坏掉的护栏把整扇门焊死**——正是 `RateLimitFilter` 类注释发誓要避免的 "degraded limiter → full outage"。
把这条前提变成一个**承诺**（在任何形态下都有一条网关自己拥有的 deadline 把"没回答"变成 error），是本片的
目标。

## 先实测（三次一次性探针，跑完即删），并据此重新定位

项目纪律是先读真实读数、不猜。三次探针给出了一个**推翻初始方案**但更有价值的结果：

**探针①（`RedisBackendTimeoutProbeTest`，mock backend 返回 `Flux.never()`）**：

| 腿 | 读数 | 含义 |
|---|---|---|
| current（改前，无自持上界） | `IllegalStateException ← java.util.concurrent.TimeoutException: Timeout on blocking read for 600000000 NANOSECONDS` | backend 零 emit 零 error；脱离**只靠调用方** `block(600ms)`。真实网关里没有这个调用方超时 → 永久挂起 |
| controlled（链外叠 `+200ms timeout`） | `ReactiveException ← java.util.concurrent.TimeoutException: Did not observe any item or terminal signal within 200ms`，267ms 自行 error | 在 deadline 上由响应式链**自己**产生 error → `onErrorResume` 能消费 → fail-open |

两条 `TimeoutException` 的**来源不同**正是命门：current 的异常是调用方 `block` 强加的，backend 本身没发任何
信号；controlled 的异常是 `.timeout()` 操作符在订阅链上发出的，才是 fail-open 能接住的那一种。

**探针②（`BlackholeTimingProbeTest`，真实 Lettuce 连一个 TCP accept 后永不回字节的黑洞 Redis，Lettuce
`connect-timeout`/`timeout` 压到 3s）**：

| 项 | 读数 | 含义 |
|---|---|---|
| A：`template.execute(...)` 的**调用** | **4ms** | 是懒的；连接不在调用阶段同步发生（排除了"阻塞在 `.timeout` 罩不住的同步段"假设） |
| B：真实 backend 带 `.timeout(400ms)` 的 `tryAcquire` | round0 **4051ms**、round1 **3085ms**，异常 `RedisConnectionFailureException ← io.lettuce.core.RedisConnectionException: Unable to connect` | **400ms 自持上界没有先触发**；请求等到 Lettuce 自己的 ~3s connect 超时才 error → fail-open |

**探针③（同 context 对比 default vs 专用 single-thread scheduler 的 `.timeout`）**：该探针在专用 scheduler
`dispose` / Lettuce 非 daemon 线程清理阶段 **hang 住 JVM 退出**（跑了 9 分钟、日志 0 字节），按项目"遇阻塞
绕开、不把超时说成通过"的纪律主动 kill、**不作为任何结论的证据**，只如实记为一次探测失败。

**据此重新定位（关键决策）**：初始方案以为"在 backend 叠一个 `.timeout` 就给 fail-open 拿到了与下游无关的
硬上界"。探针②证伪了它对**连接层黑洞**的覆盖：Reactor 的 timer 无法中断 Lettuce **connect 阶段**的订阅
（Netty connect/cancel 语义），那种形态的兜底本来就该是 `spring.data.redis.connect-timeout`（application.yml
默认 1s，本探针故意拉到 3s 才显出 3-4s）。而 `.timeout(backendTimeout)` 真正能守的是**连接已建立之后、
命令答复永不返回**的形态（探针① 的 `Flux.never()` 是其确定性等价）：那正是 backend 自己该负责、且下游
command timeout 可能因配置过长而没守住的窗口。**不改变生产方案，但把它的承诺边界说清楚**：它是网关自持的
**命令阶段** deadline，不是连接阶段的替代；连接阶段由 Lettuce `connect-timeout` 兜底，两者是分工不是竞争。
把这点假装成"全形态自持硬上界"就是假绿，故本 ADR 与 ROADMAP 一并如实写明。

另外两次旁证：SC-36 的第一版 wire 测试用真实 TCP 黑洞 + `connect-timeout=10s`，3 轮断言**只在耗时那一行
变红**（11953ms > 6s 上界），而 `status==200`、`upstream.paths()==1` **全部通过**——即黑洞下门**最终没有
焊死**、每轮诚实 200、请求穿后端恰 1 次，只是兜底耗时由 Lettuce 决定。这条"不焊死"不变式在任何形态下都
成立，是本片可用性承诺的真正底线。

## 决定

1. **给 `RedisRateLimitBackend.tryAcquire()` 叠自持 deadline**：`.timeout(backendTimeout)` 放在 `map` 之后，
   把"backend 永不回答"在 deadline 上变成 `TimeoutException` error，交回 SC-12 原有的 `onErrorResume`
   fail-open 链。**不改 `RateLimitFilter`**（它的 fail-open 语义无需变，缺的只是"error 会来"这个前提）。
2. **上界可配置、fail-closed 配置**：`nexus.gateway.rate-limit.backend-timeout-ms`（env
   `NEXUS_GATEWAY_RATE_LIMIT_BACKEND_TIMEOUT_MS`，默认 1000ms），经 `GatewayConfig` 注入；构造器拒绝
   `null`/零/负（fail-closed 配置：一个禁用了自身保证的限流器不该被静默构造），启动日志读出实际值。
   与 `spring.data.redis.timeout` 配合：两者谁先到谁触发 fail-open，都不改变"allow-unthrottled"的语义。
3. **双判据，各钉各的、不越界**：
   - **单元层** `RedisRateLimitBackendTest`（3 条新增）：`Flux.never()` → 在宽松上界内以
     `java.util.concurrent.TimeoutException` 结束（不 pin 精确毫秒）、上界就是配置值而非字面量、非正上界
     构造期拒绝。这条**确定性**证明"自持 deadline 把 never 变 error"的语义本身成立。
   - **wire 层** `GatewayRedisBackendTimeoutWiringTest`：用 `@Primary` 的 `Flux.never()` Redis 模板（受控源，
     刻意移除网络 confounder）经**真实网关过滤器链**证明：deadline 触发后门不焊死（诚实 200）、请求穿到
     后端恰 1 次（不放大、不重放）、fail-open 告警不静默、无 hang（宽松上界只抓真挂死）。
4. **与 SC-35 构成完整故障谱**：SC-35 = 真实 connection-refused（连接建立前就 error，Lettuce 兜底）；
   SC-36 = backend 逻辑永不返回（连接已建立，网关自持 deadline 兜底）；连接层黑洞的边界本片如实记录
   （由 Lettuce `connect-timeout` 兜底）。三者合起来把"共享限流器坏掉时的每一种主要形态"钉在 wire/单元上。

## 刻意不做 / 诚实边界

- **不 pin 精确耗时**。400ms 是配置值，实际 error 到达时间受 Reactor scheduler 抖动影响；wire 只设 8s
  宽松上界抓"真挂死"，单元层只要求"远小于调用方 3s 逃生口"。钉死毫秒数即 flaky。
- **不宣称连接阶段有自持硬上界**。真实 TCP connect 黑洞由 Lettuce `connect-timeout` 兜底（探针②实测），
  Reactor `.timeout` 中断不了 connect 订阅。这是与实现相关的边界，不是缺陷；要消除它需改 Lettuce/Netty 层
  或引入独立连接看门狗，属更大的生产改动，本片不越界、记下待评估。
- **探针③ hang 不作为证据**。它自己卡在清理阶段被 kill，如实记，不粉饰成"测过但没差别"。
- **memory 后端不受影响**：进程内直接回答，没有等待可 bound；`backendTimeout` 只对 redis 后端生效。
- **不改 `RateLimitFilter`、不改 SC-12 的 fail-open 取舍**：可用性仍优先于限流；本片只补上"error 一定会来"
  这条前提在命令阶段的实现。
- **验证**：单类（单元 8/8、wire 单类）与网关全套、顶层 typecheck 读数见 ROADMAP §SC 第三十二片。整仓
  eslint 仍是本机内存超时边界（非 lint 报错，本轮零前端文件），如实记；未推送（无明确指令）。
