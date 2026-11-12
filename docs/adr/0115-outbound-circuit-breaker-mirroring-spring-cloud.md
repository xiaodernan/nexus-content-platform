# ADR 0115 — 出站断路器：把 Spring Cloud CircuitBreaker 的教训跨语言镜像（v682）

- 状态：Accepted
- 日期：2026-11-12
- 相关：ADR 0114（v681 有界重试，本片的配对柱 + 头号 HONEST GAP）、
  ADR 0057 / ADR 0101（Java `DomainCircuitBreaker` 三个实测教训的来源）、
  ADR 0110（真线路 opt-in 门）、ADR 0112（复杂度门的正向锚 + 门间前提耦合）、
  ADR 0090/0094 X4（判据钉形状不钉字面）、ADR 0095（声称必须有门读）、§159（不谎称）

## 背景

v681 给 `OpenAICompatibleProvider.complete()` 加了有界重试（ADR 0114），但它的 HONEST GAP
**头号一条**就是"没有断路器：真网关持续 503 时重试会放大压力"。重试解决"瞬时抖动自愈"，
却让每个请求在放弃前都耗尽一整轮重试——上游真挂了时这等于持续加压。需要一根**上游熔断柱**：
失败率越阈值后直接拒门、不发任何 HTTP，给上游喘息，给调用方一个**命名的事实**。

Java `services/nexus-api` 已经用 Spring Cloud OpenFeign + Resilience4j `DomainCircuitBreaker`
解决同一问题，并在 2026-11-09 的拓扑实证里**踩过三个已记录的坑**（ADR 0057 / 0101）。
本片把它们**连同坑一起**跨语言镜像进 Python ai-service——不是照抄一个状态机，而是把
"配了没人用 / 把 404 当失败 / OPEN 后永不回 HALF_OPEN"这三个**静默失效**挡在门外。

## 决策：进程内三态断路器，真接进 `complete()` 门卫

新增 `apps/ai-service/src/ai_service/resilience.py`：`BreakerConfig`（旋钮，字段名对齐
Resilience4j）+ `CircuitBreaker`（CLOSED/OPEN/HALF_OPEN 三态机 + count-based 滑动窗口）+
`CircuitOpen`（拒门信号）+ `BreakerConfigError`（显式拒绝非法策略）。

配置经 `Settings`（`NEXUS_LLM_CIRCUIT_BREAKER_ENABLED` 等 6 个旋钮）→ `Registry` 构造
`BreakerConfig`/`CircuitBreaker` → **真注入** `OpenAICompatibleProvider(breaker=...)` →
`complete()` 的 `before_call()` 门卫真的读它。**默认 disabled（不构造 breaker），`complete()`
与 v681 字节级一致**（零回归）。

### 三个 Java 教训的跨语言镜像（本片的核心价值）

| Java 实测坑（ADR 0057/0101） | Python 对应与门 |
|---|---|
| **① 名与配置同源**：OpenFeign 两个 resolver 把 breaker 命名成没人猜到的串，YAML 配的实例根本没被用，breaker 静默跑默认值 | 配置经 `Registry` 真变成运行实例注入 `complete()` 门卫；门 `test_registry_breaker_knobs_reach_the_real_provider` 读"OPEN 后 `complete()` 真抛 `CircuitOpen` 且配置逐字段一致"，`test_open_complete_rejects_without_any_http` 读"OPEN 时 **0 次 HTTP**"。钉**行为**，不钉"配置块看起来对不对" |
| **② 404 is an answer**：默认把所有异常算失败，100 次后 OPEN，健康服务用 `503 No fallback` 回答"没有这个项目" | `record_ignored()` 让确定性失败（401/403/400/404/422/畸形 payload）**不进窗口**；只有 `record_failure()`（瞬时 429/5xx/网络，与 v681 `_RETRYABLE_STATUS` 同源）计失败。用 `TransientProviderFailed(ProviderFailed)` **子类**让类别由类型表达、门与臂共用判别，不解析错误文本。门 `test_deterministic_404_is_ignored_end_to_end` + 变异臂 `test_arm_404_counted_as_failure_goes_red` |
| **③ OPEN 必须能自动回 HALF_OPEN**：实测配 `automaticTransitionFromOpenToHalfOpenEnabled=true` 才不会"一次坏分钟变永久 outage" | 进程内无线程，按注入 `clock` **惰性判定**：读 `state`/`before_call()` 时若 OPEN 已过 `wait_duration`，自动转 HALF_OPEN（行为等价 Java 自动半开）。探测全成功→CLOSED（清窗口），任一失败→回 OPEN 并**重新计时**。门 `test_breaker_auto_transitions...` + `test_half_open_probe_failure_reopens_and_restarts_wait` |

另外镜像了 v669a 的"**显式拒绝无效策略**"：`BreakerConfig.__post_init__` 对
`sliding_window_size<1`、`minimum_number_of_calls<1`、`minimum>window`（样本门永远不满足=
静默失效）、阈值不在 `[0,100]`、负等待时长、半开许可 `<1` 一律抛 `BreakerConfigError`
——不像 `RetryRegistry.retry()` 那样静默退化成"啥都做"。

### 与 v680 缓存 / v681 重试的分野：这次**可以真接线**

v680 缓存命中让 `usage` 语义分歧，故只做组件不接线。断路器**没有这个歧义**：它只决定
"这次逻辑请求**要不要发**"，不改变成功 `Completion` 的形状；OPEN 根本不发网络，也就不产生
usage。§159 干净。所以本片**真接进生产**（同 v681），并且是 ADR 0114 仍欠的头号柱落地。

- 一条逻辑请求（内部多次物理重试）只记**一次** breaker 结果——组合语义由
  `test_breaker_records_one_outcome_per_logical_request` 钉（重试的物理多次 attempt 不重复计数）。
- `CircuitOpen` **继承 `ProviderFailed`**（仍是独立可识别子类）：`execution.py` 的
  `except ProviderFailed` 无需改动即把拒门映射成诚实的 502 retryable，而非漏成未处理 500
  ——默认 disabled 的部署**零回归**；`isinstance(exc, CircuitOpen)` 让关心"到底有没有打过
  网络"的调用方精确区分（§159 不谎称调用过）。

### 数据结构：O(1) 增量滑动窗口（热路径优化）

滑动窗口是每次调用的**热路径**。`deque(maxlen=sliding_window_size)` 做定长窗口 +
增量维护 `_failure_count`：`record_*` 与失败率查询都摊还 O(1)，`record_ops` 如实计每次
更新的代理步数；**不用** `sum(window)` 遍历（O(n)）。按 ADR 0112 给这条复杂度承诺配了
**三件**门（缺一即假绿）：

1. **正向锚**：`test_window_update_cost_is_o1_across_window_sizes` 断言 `record_ops == m`
   且 `>0` 且随调用线性——否则实现一换代理量恒 0，"整数/上界/两档相等"会全绿假绿。
2. **两档规模成本相等**：窗口 20 vs 200 跑同样 M 次，`record_ops` 相等（与窗口大小无关）。
3. **静态前提耦合**：`test_window_update_source_stays_o1` 读源码，断言仍是 `deque` +
   `_failure_count` 增量、无 `sum(self._outcomes)` 遍历——否则换回 list 全量求和后，
   动态门的 `record_ops` 会静默失真。变异臂 `test_arm_on_source_rewrite_goes_red` 证明这条
   真会红。

## 门设计（先红后绿）

`apps/ai-service/tests/test_provider_breaker.py`，沿用 ADR 0110/0114 三段式：

1. **先红**：组件尚不存在时真值门 18 条红（`resilience.py` 未落），**离线变异臂 11 条恒跑绿**
   （含正向对照）、真腿 1 条 skip——缺口坐实、离线臂有牙、CI 无 key 不发假绿。
2. **转绿后 31 条**（离线恒跑）：三态转移（持续失败→OPEN、样本门前不开、越阈值开）、
   坑②（连续 20 次确定性错/404 不熔断、窗口不进、端到端 404 走 `record_ignored`）、
   坑①（OPEN 零 HTTP、Registry 旋钮逐字段一致、门卫生效）、坑③（自动半开、探测成功闭合、
   探测失败重开并重新计时）、显式拒绝 6 种非法配置、组合语义、瞬时耗尽计一次失败、
   pass-through 零回归、O(1) 三件门；**12 条恒跑变异臂**逐条逼红每个判据 + 正向对照
   （换阈值/窗口/等待/名字仍绿，ADR 0094 X4）。判据纯函数、真值门与臂共用（ADR 0095）。
3. **真线路 opt-in 腿**（`NEXUS_LIVE_LLM=1` + 真 key，函数级 skipif）：真 `gpt-6-sol`
   连续两次成功，断言 breaker 保持 CLOSED、2 次真实网络、`recorded_outcomes=2`、
   `failure_count=0`——证实接线不误伤健康路径。

**本片三次"红"都是门自己的 bug，不是生产 bug**（按"红一条先判三件事"归为**我假设错**）：
① 两个变异臂喂的观测同时违反多条断言、先撞上不含目标关键词的那条 → 让臂只违反目标性质；
② pass-through 臂的 `match` 关键词与实际先触发的断言消息不符 → 对齐消息。全程**只改门，
生产逻辑自始正确**。

## 验证

- 先红：真值门 18 红 / 离线臂 11 绿 / 真腿 1 skip（组件未落）。
- 转绿：门文件 **30 passed / 1 skipped**（CI 模式）。
- 全套 ai-service：CI **166 passed / 7 skipped**（基线 v681 的 135/6 → +31，零回归）；
  opt-in 真网关 **172 passed / 1 skipped**（6 条真腿全打真 `gpt-6-sol`，含 breaker 真腿）。
- `verify:record-encoding` exit 0，0 chargeable / 2254 files（新 CJK 注释干净）。
- 5 个文件 staged 无真 key（key 只在 gitignore 的 `.env`）。

## 仍欠（如实记）

1. **进程内、非持久、非跨实例**：重启即失、多实例各自为政。跨实例熔断共享是 Redis 另一片
   （ akin ADR 0102 的失效总线），别把本组件当分布式真相。
2. **embedding 路径未接 breaker**：`OpenAICompatibleEmbeddingProvider.embed()` 仍单次直发；
   该网关无 embedding 模型（`NEXUS_MODEL_EMBEDDING=none`），接了也没用。
3. **breaker 状态未上可观测面**：`stats()` 已可消费，但还没接 `/healthz` /metrics 的连线
   （会碰 web/prd，另片）。当前门读的是组件 `stats()` 与生产 `complete()` 行为。
4. **滑动窗口是 count-based，非 time-based**：与 Java 本例配置一致；时间窗是另一档配置。
5. **无抖动 / 无半开并发上限细化**：HALF_OPEN 用"累计成功数达许可则闭合、任一失败重开"，
   是 Resilience4j 语义的最小镜像；多实例同拍、并发探测的细分留压力场景。
6. 无浏览器/pixel 验证；hosted CI 默认无 key 只跑配置门 + 离线臂（真腿仅在注入 secret 时跑）。

## 结论

把 Java v669a/`DomainCircuitBreaker` 的 Resilience4j Retry + CircuitBreaker **两根容错柱**
在 Python ai-service 集齐，且**带着三个实测静默失效坑一起迁**：配置经 `Registry` 真生效
（拒门零网络）、404 是答案不计失败（健康服务不被自己熔断）、OPEN 自动回半开（一次坏分钟
不变永久 outage）。滑动窗口 O(1) 增量更新按 ADR 0112 配齐正向锚 + 两档相等 + 静态前提耦合。
默认 disabled 零回归、opt-in 显式开启，真网关健康路径实证不误伤。这是「微服务容错 + 数据结构
复杂度优化 + 前后端同一套语义」的又一块集大成。
