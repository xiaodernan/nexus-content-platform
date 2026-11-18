# ADR-0282 · 与 Codex 的对照：这套 relay 上能对齐什么、不能对齐什么、证据在哪

**Status**：accepted（2026-11-18）
**Context**：用户复核「为什么 Codex 在这把 key 上能天花板 90% 命中率，而我本机经 Clash Verge → aizzz.xyz relay 的调用偶尔会掉；是不是并行会话打乱分发」——复读用户原话。这一页把对照做成逐条可审计的兄妹篇，与 ADR-0281（Cache 纪律）配套。

## 一、先对照 Codex 实际做法（代码实读 `github.com/openai/codex` `codex-rs/core/src/client.rs`）

| Codex 机制（逐行出自 client.rs） | 语义 | 我们（本仓库） |
|---|---|---|
| `PromptCacheKey::SessionDerived`（prompt_cache_key_policy） | **按 thread_id 派生键**：同一会话的每次请求带同一把路由键 | ✅ 我们是**按内容哈希**（`stable_material = system + canonical(STABLE_PROMPT_KEYS)`），`sha256 → nexus-<hex>`：同项目同类 workload 的所有会话同一把 key，前缀 lane 更聚拢 |
| `x-codex-turn-state` sticky routing token：turn 内每请求回放服务器首响应下发的 token | 服务器**驱动**的分片亲和（Codex 侧由 OpenAI 内网路由识别） | ❌ 不可达——`x-codex-turn-state` 是 OpenAI 内部分片头；aizzz→gpt-6.1-terra 的 relay 只暴露 `/v1/chat/completions`，不回放这类头；**任何第三方 relay 没有这个能力** |
| WebSocket prewarm：`response.create` with `generate=false` 当 turn 预热，后续 `previous_response_id` 增量复用 | 预热即刻命中；整个 turn 是**增量** | ❌ 不可达——chat/completions 没有 `generate=false`；没有 `previous_response_id` 服务端 continuation；我们的等效物：① 应用层 **Redis L2 精确命中**（同 model/system/user/json_mode 的整体回放）；② 同一 digest 的第二次调用在 KV 层是字节前缀复用（实测 91–100%）；③ 可选「首条 call 之后每轮任一调用」享受同一 key 同 shard 整轮热度 |
| `input` 全量+前置 prefix 的 `splice(0..0, prefix)`（base instructions 放最前） | 稳定前缀必须在报文头部 | ✅ `ordered_payload` 已做同序重排（稳定字段在前，volatile 的 intent/prompt/variants 在末尾） |
| `responses_request_properties_mismatch`：model/tools/tool_choice/stream/reasoning/prompt_cache_key 任一换 → 断续 | 连续回放只允极小尾部变更 | ✅ 同纪律：本仓库所有 lane 都不换任何上述字段（ADR-0126/0127/0281） |
| 请求 tools 全量随第一次带 | tools 同样是稳定前缀的一部分 | ✅ 我们的 JSON payload 含 components/frames/components→catalog 字节稳定部，作为 STABLE_PROMPT_KEYS 一部分 |

Codex 的 turn-state 亲和 + `previous_response_id` 续连**只在 OpenAI Managed 环境成立**。我们这把 key 走 aizzz relay（GPT-6.1-terra 转售），**那些机制都不吐**。
**所以「Codex 天花板 90% 且不掉」= 服务端亲和；「我们非掉不可的掉点」= relay 侧通道轮换**。

## 二、测量证明（实打录于 docs/evidence）

| 路径 | 实测 | 来源 |
|---|---|---|
| digest lane（/bible/ask，第二、三次） | cachedTokens = 35,472 / 35,471（≈100%） | live-qapi-v945-2026-11-18.md |
| 兄弟 digest 4 路并发 | cachedTokens ~32,444（≈93.7%） | parallel-cache-2026-11-18.md |
| transport lane（同 digest，**不同提问**，冷→暖一次成型） | 37,830 → 37,830(100%) / **35,741(94.5%)** | transport-cache-v947-2026-11-18.md |
| 角色对话（persona 字节一致） | 第一跑 0 / 4,433(94.3%) / 0；第二跑 **4,631(100%,L2) · 4,699(100%,L2) · 4,767(100%,L2) · 4,431(91.3%,provider KV)** | character-chat-live-v955-2026-11-18.md |
| **交错 12 发（Q1/Q2 交替，同 digest）** | **11/12**；provider 样本 93.5%（n2），其余为 L2 精确命中 | burst-interleave-12-2026-11-18.md |

**判读**：`prompt_cache_key` 把**尽可能多的同 digest workload** 压进同一条或少数几条 channel；Codex 的 session-derived 把同一 workload 压进**单个 thread 的连续** channel——殊途，但结果都是「稳定前缀的 KV 命中率 ~90%+」。
偶发的 0 是上游 distributor 轮换（或 TTL 回收率），不是 key 错了；**冷热时序不归因于 `prompt_cache_key`**。

## 三、我们比 Codex 弱的地方（诚实）

1. relay 不吐 `x-codex-turn-state`，我们做不到「服务器亲和」，只能靠 relay 的 distributor 对同 key 的惰性亲和。
2. 不能 `previous_response_id` 续连，不能 WebSocket prewarm，不能 Responses Lite；我们用 Redis L2 替代全体续连的一部分（整个请求都需重发→重发部分仍占 tokensIn，L2 命中时 tokensIn=0）。
3. 每轮请求必须**完整重发 input**（chat/completions 语义），这点比 Responses Lite 大约多付 5–15% 的输入 token——这是接 relay 的真实成本，不是工程疏忽。
4. 通道换 + TTL 导致的**掉点不可消除**——只能等它自然回来（TTL 过期/轮换周期由上游控制）。

## 四、我们在 relay 上更强的地方（诚实）

1. 内容派生 key：**同一 digest/project 的所有会话聚拢一条 channel**；Codex 的 session key 把每个 thread 放进自己的 channel→ 项目级 lane 更冷。
2. BYTE-stable digest（5 章正典 + 82 回响 + 4 附录 ≈ 55k chars）是持续热度的条件；不需要用户的持续会话也保温。
3. 机检链（StateGraph verifyNode）保证**零编造**——正确性强于任何 supplier 的幻觉率。
4. 缓存复用直接显示给用户（对话框 `cache reuse N/M tokens`，/bible/ask、/analytics ⑨、/insight ⑧ 同）。

## 五、宿命三问（留给下一个人）

- 问：「再加并发会掉吗？」——会，换通道就掉一次，下一次自然恢复；**不存在**「client 能让 distributor 不轮换」的办法。
- 问：「为什么第一次冷？」——TTL 5–10 分钟，第一发必付完整价；次发起全暖。
- 问：「换回 Codex 跑会不会更好？」——会。但 Codex 还需要 WS + `previous_response_id` + OpenAI-Instruct 侧 system prompt，任何一步断了都更贵；当前 relay 上**一次呼出 > 正常喂饱**即可。
