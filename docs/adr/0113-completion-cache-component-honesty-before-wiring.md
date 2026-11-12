# ADR 0113 — Completion 缓存组件：接线之前先立诚实边界（v680）

- 状态：Accepted
- 日期：2026-11-12
- 相关：ADR 0110（真线路 opt-in 门）、ADR 0111（provider 清单职责分档）、§159（不谎称真实）、
  ADR 0090/0094 X4（判据钉形状不钉字面）、ADR 0095（声称必须有门读）、ADR 0108（代理量门正向锚）

## 背景

真实网关（`wkapi.pro/v1`，`gpt-6-sol`）按 token 计费，实测一次设计请求 `prompt_tokens≈4159`、
延迟 2–10s。重复相同 `system+user+model` 的调用会重复烧钱、重复等延迟。用户诉求里明确有
「各种缓存的合理运用」+「一定用真 API 测试改善项目」。项目里**没有** completion 缓存：
只有 `contract.py` 的 schema `lru_cache`（与模型输出无关）和 `jobs.py` 的 Redis 作业队列。

## 决策：只交付**可复用组件 + 门 + 真线路实证**，**不接进生产调用链**

新增两个文件，均为纯新增、零生产改动、零 lane 领地改动：

- `apps/ai-service/src/ai_service/completion_cache.py`
  - `LlmCompletionCache`：TTL + LRU 的 `(model, system, user) → Completion` 进程内缓存。
    TTL 用 `time.monotonic()`（免系统时钟回拨），LRU 用 `OrderedDict`，`stats()` 如实记
    hits/misses/stores/evictions/expirations。
  - `CachedLlm`：实现 `LLMProvider` 全表面（`kind`/`name`/`models`/`model_for`/`complete`）
    的装饰器。命中返回缓存的 `frozen Completion`，未命中透传并 `store`；`ProviderFailed`
    原样抛出、**不留毒条目**。`registry.llm.complete(...)` 那条生产路径**一行未改**。
- `apps/ai-service/tests/test_completion_cache.py`：判据单一真值的组件门 + 恒跑变异臂 +
  真网关 opt-in 腿。

### 为什么不接进 `registry` / `execution.py`（本 ADR 的核心）

一旦缓存命中，响应里 `usage` 该怎么填？三个字段立刻产生**语义分歧**：

| 字段 | 真调用时 | 命中时可选语义 | 冲突面 |
|---|---|---|---|
| `toolCalls` | `1` | `0`（没真调）/ `1`（这次请求由 1 次调用满足，含缓存里的） | web 账本按它记「工具调用次数」 |
| `tokensIn/Out` | 本次计费 token | `0`（本次没花钱）/ 复用那次的值（被省下的成本） | 计费对账、成本看板 |
| `latencyMs` | 本次墙钟 | `≈0`（缓存读）/ 复用那次的值 | 性能 SLA、前端 loader |

而这三处**不能由 ai-service 单方面改**：

- `contracts/ai-response.schema.json` / `ai-chat-response.schema.json` 根
  `additionalProperties=false`，要表达「命中」必须新增字段并改契约；
- web `apps/web/src/lib/tasksLedger.ts` 的 `TaskUsageSchema` 是**精确 zod 形状**，
  加字段会撞 web 账本门；
- §159「不谎称真实」：把一次**缓存回放**原样报成 `capability:real` + 真 token + 真 latency，
  等于宣称「这次又真花钱调了模型」——这是**计量层面的不诚实**，与 cont.42 修掉的
  「DEMO 冒充 real」同构，只是更隐蔽。

按 ADR 0090/0094 X4「语义未定就不钉门、别用测试逼共享树上的生产改动」的既有纪律：
**语义没定，不接线、不钉 usage 判据**。先把组件做对、做全、可复用、可测，把「命中不是新
调用」这条事实**在组件的 `stats()` 里诚实计量**（省了几次 = hits），接线推迟到语义决策之后。

## 门设计（判据钉不变量，不钉未定语义）

沿用 ADR 0110 已验证的三段式：

1. **真值门**（组件实测）：同键命中不重发、model/system/user 三维各自独立、
   失败不缓存、TTL 过期重调、LRU 真按最近用淘汰（非 FIFO）、`stats` 算术自洽、
   非法 `ttl_s`/`max_entries` 拒绝、装饰器对 `LLMProvider` 表面透明。
2. **恒跑变异臂**（CI 无 key 也跑）：漏 user 维 → 红、失败也缓存 → 红、
   第二次又发网络 → 红、回放内容错 → 红、**正向对照**（正确观测）→ 绿；
   另有一条 **monkeypatch 退化组件臂**：把 `LlmCompletionCache.key` 真值退化成 2 维，
   `test_all_three_key_dimensions_are_independent` 必须红——证明门真连着生产组件，
   而非只在 dict 上自嗨（ADR 0095 反面）。
3. **真线路 opt-in 腿**（`NEXUS_LIVE_LLM=1` + 真 key，函数级 skipif）：注入
   `_CountingTransport` 包住真实 `httpx.HTTPTransport`，用真 `gpt-6-sol` 同 prompt 连调
   两次，断言网关**只收到 1 次请求**（第二次命中 0 网络 = 真省钱）、回放内容仍是合法
   JSON mode；首次双向 usage>0 证是真调用。key 从 gitignore 的 `.env` 读，不打印。

判据**刻意不钉**命中 `Completion` 的 `tokens/latency/identity`——那正是上面未定的语义；
钉死会惩罚将来「命中时把 latency 归零以更诚实」这类正当修复（ADR 0094 X4）。只钉
**同键不重发网络 + 回放内容 + stats 诚实记账**三个与语义选择无关的不变量。

## 验证

- 离线（CI-safe，无 key）：组件门 + 臂 **18 passed / 1 skipped**（真腿 skip，不假绿）。
- 真网关（opt-in）：**19 passed**，真线路腿真发网络 1 次、第二次命中 0 次；全套 ai-service
  CI **114 passed / 5 skipped**、opt-in **118 passed / 1 skipped**（基线 96/4，零回归）。
- `verify:record-encoding` exit 0，0 chargeable / 2248 files（新 CJK 注释干净，2245→2248 入扫）。
- `git diff --cached` staged 无真 key（两文件从不接触凭据值）。

## 仍欠（接线前必须先定的语义，按依赖排序）

1. **usage 语义决策**：命中时 `toolCalls` / `tokensIn/Out` / `latencyMs` 各填什么；
   是否在契约新增 `cacheHit` 布尔字段（连带 schema + web zod + web 账本消费方一起改）。
2. **opt-in 旋钮**：如 `NEXUS_LLM_CACHE_TTL_S` + `max_entries`，默认关（不掩盖真调用语义）；
   构造 `Registry` 时只对 `llm` 档包 `CachedLlm`，`embedding` 暂不缓存。
3. **key 完整性**：当前适配器硬编码 `temperature=0.2`（`openai_compatible.py:56`）；
   若将来开放 temperature / `response_format` / 其它采样参数，必须同步进键，否则串台。
4. **single-flight**：当前单进程单 worker，并发同 key 可能重复真调——是「宁可多花一次钱
   也不返回半条毒缓存」的取舍；如要消除需加 in-flight 注册（且失败要唤醒所有等待者）。
5. **进程内边界**：重启即失、多副本不共享，绝不声称跨实例；若将来要跨实例，走 Redis
   （与 §94 作业队列、ADR 0107 跨实例失效同源），是另一片。
6. 无浏览器/pixel 验证真前端成效；hosted CI 默认无 key 只跑配置门+恒跑臂+离线组件门
   （真线路腿仅在注入 secret 时跑）。

## 结论

把「缓存合理运用」落地成一个**语义诚实、可复用、可测、真网关实证省钱**的组件，同时
**守住不擅自改 usage / 契约 / 生产调用链**的纪律。省下的真调用次数由 `stats().hits`
如实计量——这是「命中不是新调用」最朴素的诚实账本；接线留到 usage 语义被明确决策之后。
