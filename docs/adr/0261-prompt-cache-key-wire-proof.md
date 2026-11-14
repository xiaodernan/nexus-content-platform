# ADR-0261：LLM 通路接入 prompt_cache_key——wkapi.pro 自动提示缓存的真实 wire 判据

- 状态：Accepted
- 日期：2026-11-13
- 关联：`apps/ai-service/src/ai_service/providers/openai_compatible.py` · `docs/evidence/ailive-4-cache-2026-11-13.md` · `packages/schemas/src/index.ts` · `contracts/` · `apps/web/src/lib/tasksLedger.ts`

## 背景

用户长期点名「token 利用效率 / 缓存的合理运用」。实测（2026-11-13 `docs/evidence/ailive-4-cache-2026-11-13.md`）：

1. 不带 hint 的 OpenAI 兼容调用，wkapi.pro 的 `usage` 返回 `{"prompt_tokens","completion_tokens","total_tokens"}`，**零 prompt caching 字段**——agent_dashboard 上看到的「缓存命中率低」是真实的，但原因是 method（没有 cache lane hint），不是账号。
2. Stream 的 SSE 末尾帧是 `[DONE]`，**没有 usage 帧**——"流的命中率好"是错觉（两个 lane 都没数；stream 里连数都没有更糟）。
3. `prompt_cache_key`（OpenAI 官方路由参数，限制 24-bit 字符）接入后，`usage.prompt_tokens_details.cached_tokens` 立刻出现：**同 payload 第二次起 cached_tokens=6272/6449（97.2%）**。

## 决定

1. **ai-service 默认配置 `NEXUS_OPENAI_PROMPT_CACHE_KEY` = `nexus-studio`**：unset → 缺省 `nexus-studio`；显式空串 → 关闭（两个显式语义分开，不再用同一口径「没配=默认开」）。
2. **`prompt_cache_key` 不是可选项**：这是该 API 的官方方式，不是 DeepSeek/Anthropic 方言；空串意味着"谁也不知道这次调用属于哪个 workload"，拒绝默默带值。
3. **usage 契约加法兼容**：zod `UsageSchema`/`TaskUsageSchema` + 三份导出契约新增 `cachedTokens`（default 0）——没该字段的 provider 一律 0，不用猜的 tokenizer 冒充精确计数（§159）。
4. **不强制 stream**：非流行为不变；stream 在该网关报不了 cache token，**不做**"改成 stream 来看更像命中更高"的假修复。
5. **设计工作流的前缀稳定性**：`SYSTEM_PROMPT` + `_agent_note` 是常量——同 payload 同语义走同一路由（自动提示缓存按 128-token 块粒度，块边界必须字节一致）。
6. **不变更**：model 名、json_mode、温度、max_tokens、审批挂起、`costUsd: 0`（网关如实报，不编折扣数）。

## 后果

- 全项目 LLM 调用一次起跑默认带 cache lane（非流、无依赖、无行为翻转）；
- 账本 `agent_tasks.usage.cachedTokens` 有数了，未来可画命中率面板（本 ADR 不画那个 UI，留给下一个 FE 片）；
- wkapi.pro 之外的兼容网关（Azure/Ollama/…）会**静默忽略**该参数——行为不翻转；
- 真嵌入式（§49）仍是一刀没有（`vectorAvailable:false`，wkapi 无 embedding 模型）——本片跟那条线无关；
- 并行任务（如网关侧迁移）不会被本片阻塞，LLM 调用路径保持开放。

## 诚实边界

- `cachedTokens` 只是网关**声明**的命中数，不是我每个 token 的实际促销折扣——wkapi.pro 没有价格表在线，`costUsd=0` 是网关如实报的数字，不编折扣百分比。
- 本次实测是**同 payload 连续三次**；不同 payload 间的前缀共享率取决于上下文装配（同一项目、同一缩写样式才能共前缀）——这是**装配层**的课题，不是本片；`design_prompt` 的稳定性已用"同 payload 拿到 97.2%"证明，异 payload 最大可能共用的是同一 SYSTEM_PROMPT 段，约 1.4k tokens。
- stream 路径行为**未在本片改过**（不改 SSE 解析，只补最小满足）：网关不报 cache 帧 ⇒ 账本在 stream 模式下仍然不会有 cachedTokens。
- `NEXUS_OPENAI_PROMPT_CACHE_KEY` 可在 env 逐 workload 拆 lane（例如 design-approval 与 chat 分两个 lane），拆 lane 的收益未证，先记为 env 能力，不在本片做。
