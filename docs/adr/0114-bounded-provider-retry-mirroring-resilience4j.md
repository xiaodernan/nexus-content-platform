# ADR 0114 — AI provider 有界出站重试：把 Resilience4j 的教训跨语言镜像（v681）

- 状态：Accepted
- 日期：2026-11-12
- 相关：ADR 0110（真线路 opt-in 门）、ADR 0113（缓存组件先立诚实边界）、
  ADR 0101/Java v669a `DomainServiceRetry`（本 ADR 的镜像来源）、§159（不谎称真实）、
  ADR 0090/0094 X4（判据钉形状不钉字面）、ADR 0095（声称必须有门读）

## 背景

真实网关 `wkapi.pro/v1`（`gpt-6-sol`）实测延迟 2–10s、曾见 503；一次瞬时 5xx/429
会让整个设计请求 502 失败。改造前 `OpenAICompatibleProvider.complete()` 对
`_client.post("chat/completions")` **一次即抛**：`ProviderFailed` 直接冒到 `execution.py`
报 502 `retryable=true`——把重试责任推给客户端，而服务端本可对**瞬时**抖动自愈。

Java 侧 `services/nexus-api` 的 v669a 已用 Resilience4j 解决同一问题（`DomainServiceRetry`），
并踩过两个已记入 ADR 0101 的坑：① Spring Cloud OpenFeign 的 breaker 集成**不取用** Resilience4j
Retry 实例，YAML 配了没人用 = 一次都不重试；② `RetryRegistry.retry(name)` 是 get-or-create，
未声明的实例静默给 `ofDefaults()`（**重试 404**），必须用 `find(name).orElseThrow`。

## 决策：有界、指数退避、只重试瞬时错，**真正接进 `complete()`**

### 与 v680 缓存的关键不同：这次**可以真接线**

v680 的缓存命中让 `usage` 语义分歧（命中算不算新调用），故只做组件不接线。重试**没有这个歧义**：
重试是"同一逻辑请求发多次 HTTP"，最终只产**一条成功 `Completion`**，`usage` 取成功那次；
`latency_ms` 反映**含退避的总墙钟**（更诚实，不把重试等待藏起来）。§159 干净，所以：

- `openai_compatible.py` 的 `complete()` 把单次 post 换成有界重试循环（**这是"配了真有人用"，
  避开 Java 坑①**）；
- `config.py` 的 `Settings` 加 `llm_max_attempts` / `llm_retry_base_s` / `llm_retry_cap_s`，
  `load_settings` 从 `NEXUS_LLM_MAX_ATTEMPTS` / `_RETRY_BASE_S` / `_RETRY_CAP_S` 读；
- `registry.py` 构造 provider 时把三个旋钮传入（**配置经由真实代码路径生效，不是摆设**）。

### 只重试瞬时错（镜像 Java「404 is an answer」）

| 类别 | 处理 | 理由 |
|---|---|---|
| `429`（限流）、`5xx`（500/502/503/504） | **重试**，指数退避，429 尊重 `Retry-After` | 真瞬时；服务端明确说"稍后再来" |
| 网络异常 `ConnectError` / `TimeoutException`（`httpx.HTTPError`） | **重试** | 抖动属瞬时 |
| `401`/`403` | **不重试** | 凭据错，重试浪费配额、放大攻击面 |
| `400`/`404`/`422` | **不重试** | 请求本身错，答案已给出，再问无用 |
| `200` 但 payload 畸形 | **不重试** | 确定性解析错，重试不会变好 |

退避 = `min(base·2^i, cap)`；若响应带有效 `Retry-After`（秒）则取 `max(指数, Retry-After)`，
坏头忽略、不崩。**幂等**：每次重试重发**同一 body**（chat completions 幂等；
`temperature=0.2` 会重新采样，但这仍是一次逻辑请求的合法重试，不是 v680 的缓存回放）。
**抛 `ValueError` 拒绝 `max_attempts<1`**（v669a 坑②的 Python 对应：显式拒绝无效策略，
不静默退化成"重试所有错"）。

### pass-through 默认零回归

`max_attempts=1`（默认、不配旋钮）时 `complete()` 与改造前**字节级一致**：1 次请求、0 次 sleep。
这是 Java v669a 双构造的跨语言镜像——**新增能力不改变没配置它的部署**，现有全部测试不重写。

## 门设计（先红后绿）

`apps/ai-service/tests/test_provider_retry.py`，沿用 ADR 0110 三段式：

1. **真值门（先红）**：改造前 14 条红（`__init__` 还没有 `sleep`/`clock`/`max_attempts`），
   坐实缺口；改造后全绿。钉：瞬时 503/429/网络错被重试直到成功（usage 取成功那次）、
   每次重发同一 body（幂等）、确定性错（401/403/400/404/422）只发 1 次、
   200 畸形 payload 只发 1 次、重试耗尽抛 `ProviderFailed`（不假成功）、
   退避每次 ≥ 指数基线下界且封顶、429 尊重 `Retry-After`、
   `latency_ms` ≥ 退避总等待（用联动假时钟+假 sleep）、`max_attempts=1` pass-through、
   非法 `max_attempts` 被拒。
2. **恒跑变异臂（CI 无 key 也跑）**：不重试→红、确定性错被重试→红、退避低于指数基线→红、
   超封顶→红、不尊重 `Retry-After`→红、`latency` 藏掉等待→红，外加**正向对照**（正确观测全绿，
   含"Retry-After 打破单调是正当的"——判据**刻意不钉单调不减**，钉下界+封顶+尊重服务端，
   ADR 0090/0094 X4）。判据纯函数、真值门与臂共用（ADR 0095）。
3. **真线路 opt-in 腿**（`NEXUS_LIVE_LLM=1` + 真 key，函数级 skipif）：真 `gpt-6-sol`
   一次成功，断言回合法 JSON mode、usage 双向 >0、**0 次退避**（健康路径不被凭空重试）。

**本片两次"红"都是门自己的 bug，不是生产 bug**（按"红一条先判三件事"归为**我假设错**）：
① LRU 式"退避单调不减"判据被 `Retry-After=[0.05,0.02,0.03]` 合法打破——改钉下界+封顶；
② latency 门注入的假 sleep 只记录不推进时钟，导致 `latency_ms=0`——改用联动的
`_FakeClockSleep`（sleep 时推进 clock）。两次都**只改门、生产逻辑自始正确**。

## 验证

- 先红：改造前重试门 **14 failed / 6 passed / 1 skipped**（缺口坐实、臂有牙）。
- 转绿：重试门 **21 passed / 1 skipped**。
- 全套 ai-service：CI **135 passed / 6 skipped**（基线 v680 的 114/5 → +21，零回归）；
  opt-in 真网关 **140 passed / 1 skipped**（真腿全打真 `gpt-6-sol`）。
- `verify:record-encoding` exit 0，0 chargeable / 2251 files（新 CJK 注释干净，2248→2251 入扫）。
- 三处生产文件 + 一测试文件 staged 无真 key（key 只在 gitignore 的 `.env`）。

## 仍欠（如实记）

1. **没接断路器**：Java 侧 breaker/time-limiter 是另外两根柱；这里只有 retry。真网关持续
   503 时重试会放大压力——`max_attempts` 有界（默认 1、显式配才开）是唯一约束，生产建议
   配小值 + 上游 breaker（另片）。
2. **embedding 路径未接重试**：`OpenAICompatibleEmbeddingProvider.embed()` 仍单次；该网关无
   embedding 模型（`NEXUS_MODEL_EMBEDDING=none`），接了也没用，等真有 embedding  provider 再镜像。
3. **重试不跨进程/不持久**：进程重启即失，无重试历史；不是队列，别当消息重放用（§162 归作业队列）。
4. **`Retry-After` 只支持秒值**：HTTP-date 格式忽略、退回指数退避（下游网关实测无此头）。
5. **无抖动（jitter）**：多实例同时退避可能同拍重试；当前有界且默认关，记为压力场景仍欠。
6. 无浏览器/pixel 验证；hosted CI 默认无 key 只跑配置门+离线臂（真腿仅在注入 secret 时跑）。

## 结论

把 Java v669a 的 Resilience4j Retry **跨语言镜像**进 Python ai-service，且避开它记过的
"配了没人用 / 静默重试 404"两个坑：配置经 `Registry` 真传入 `complete()`，不可重试的
确定性失败一次即抛，只让瞬时抖动自愈。默认 pass-through 零回归，opt-in 显式开启。
这是「微服务容错 + 计网（429/Retry-After/指数退避/幂等）+ 前后端同一套语义」的又一块集大成。
