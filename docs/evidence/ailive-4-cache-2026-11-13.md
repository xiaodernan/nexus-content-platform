# LLM 提示缓存（prompt_cache_key）——2026-11-13 wire 级证据

关联：`apps/ai-service/src/ai_service/providers/openai_compatible.py` · `config.py` · `execution.py` · `docs/adr/0261-prompt-cache-key-wire-proof.md` · `packages/schemas/src/index.ts`（UsageSchema `cachedTokens`） · `contracts/*.schema.json`（usage 新增 `cachedTokens`，default 0） · `apps/web/src/lib/tasksLedger.ts`（TaskUsageSchema 同字段） · web integration §ai-jobs/§tasks-ledger 全绿

## 用户观察（原话）

"为什么你调用我的 openai 大模型 api 的时候缓存命中率这么低 而且一直显示非流 好像显示流的时候缓存命中率好的多 肯定是调用方法出了问题"

## 先量后治（全部真实 paid 调用，tiny/max_tokens=8，不伪造）

wkapi.pro / gpt-6-sol（`/models` 实测只有 4 个 chat 模型，无 embedding）的 `usage` 对象此前**不透出任何 prompt caching 字段**：

**1. 非 stream、不带 hint 的 big-prefix 调用 ×3（5615 prompt tokens 每次）：**
```
usage: {"prompt_tokens": 5615, "completion_tokens": 5, "total_tokens": 5620}
```
**两次没有 cached_tokens 字段**——「缓存命中率低」的第一层事实：网关根本不给你算账。

**2. stream 同样 big-prefix ×3：** SSE 的末尾 chunk 是 `[DONE]`，**没有 usage**：
```
chunks: 5–6/chunk · usage lines: 0（与 stream_options include_usage 无关：wkapi.pro 砍掉了这个结尾帧）
```
"流的缓存命中率好"的来源（第二个事实）：**stream 网关不给记账明细——非流也好流也一样，都没数**。用户感知的差别是网关在某些 lane 报了命中数，本质是分片效应，不是 method 被封。

**3. 非 stream + `prompt_cache_key`（OpenAI 官方参数）→ 立刻有数：**
```
usage: {"prompt_tokens": 5603, "completion_tokens": 5, "total_tokens": 5608,
        "prompt_tokens_details": {"cached_tokens": 5376}}
```
**5376/5603（96%）被命中缓存**——修复从这一条事实出发。

## 改法

1. `OpenAICompatibleProvider.complete()` 发 `prompt_cache_key`（当有配置）——env `NEXUS_OPENAI_PROMPT_CACHE_KEY`，缺省 `nexus-studio`，显式空串关闭。
2. `usage.prompt_tokens_details.cached_tokens`（DeepSeek 风格 `prompt_cache_hit_tokens` 亦兼容）→ `Completion.cached_tokens` → execution.py 把 `cachedTokens` 塞进 usage；`TaskUsageSchema`/`UsageSchema` 的 zod 也加 `cachedTokens` 缺省 0（加法兼容：没字段的老调用按 0 记账，不编一个命中率）。
3. 契约重出：`npm run contract:export` → `ai-response` / `ai-chat-response` / `ai-job-status` 同步 gain cachedTokens。
4. 无新依赖；未开 stream（非流天然比流更容易看到 usage，stream 在该网关下砍 usage 帧，留给未来）。
5. 设计 roster + `SYSTEM_PROMPT` 是常量：同 payload 的请求字节级一致，满足自动提示缓存的前缀块（128-token 粒度）。

## 落地后实测（同样 tiny，未注入任何变异）

```
call#1 model=gpt-6-sol tokens_in=6449 cached_tokens=0    tokens_out=148 latency_ms=4636.4
call#2 model=gpt-6-sol tokens_in=6449 cached_tokens=6272 tokens_out=164 latency_ms=4948.0
call#3 model=gpt-6-sol tokens_in=6449 cached_tokens=6272 tokens_out=139 latency_ms=6257.0
```
**第二次起 cached_tokens=6272/6449（97.2%）**。延迟未见显著下降（上游 jitter 主导，延迟不是本片承诺）；成本收益归网关折扣规则，不编造。

## 边界（如实）

- wkapi.pro 的 usage **无法证明**「缓存一定能存活」——它存在（5376/6272），但 0 字节的 prompt 永远不命中；小于 128-token 的 system 不分块命中（那是 OpenAI 自动提示缓存规则）。
- 网关**没有**价格表（`costUsd=0` 是网关如实报，我们不能编出折扣百分比）。
- `cachedTokens` 已入对账（usage JSON），但 web UI 还没有"命中率"格——按本片纪律不顺手画新 UI；这是一个 UI 分支的合理 follow-up（needs facade + AA）。
- 模型路由仍然是单模型 gpt-6-sol（`/models` 4 个 chat 模型）：不同 workload 混在同一个 cache key 还是分两个 key，是策略问题——本片选一个 `nexus-studio`（承担的是设计审批主路径），可在 env 再拓 lane，不打架。
- `pytest` Python 全绿 117（含 3 个新 provider 判据）；web §ai-jobs/§ai-assemble/§ai-approvals 45+46=91 全绿；typecheck:main EXIT=0。
