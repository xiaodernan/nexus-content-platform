# ADR 0123 — LLM 调用：SSE 流式默认 + completion 缓存默认就绪 + prompt 前缀序（v690）

- 状态：ACCEPTED（2026-11-13）
- 上游：ADR 0119（Redis completion cache）/ ADR 0114-0118（retry/breaker/jitter）/ ADR 0120/0121（DLQ）
- 范围：`apps/ai-service`（适配器、注册表、配置、prompt 装配、chat 路由、usage 暴露）
- 兄弟：ADR 0119（缓存的正确性落地在 v686）、ADR 0109（style-tokens）同系风格

## 背景与诉求

用户报告："调用我的 openai 大模型 api 的时候缓存命中率这么低，而且一直显示非流，流的时候
缓存命中率好的多，肯定是调用方法出了问题。"

用真机（wkapi.pro / gpt-6-sol）实测，结论分三层：

1. **流 SSE 路径从首发就报 cached_tokens**；非流冷启动不报或中后期才报；原因不明确（后端池策略，
   但现象稳定）——默认改流。
2. **应用层 Redis completion cache 是唯一能稳定 100% 命中**的地方；这片把它接通：`NEXUS_LLM_COMPLETION_CACHE_URL`
   → 真 Redis，`Registry` 构建时包 `CachedLlm`。默认不设 = 零回归。
3. **提示词前缀决定 provider 前缀缓存是否拼得上**：旧版 payload 先放 intent/prompt（最变），
   整段 8-18k 的稳定 catalog 被前缀截断；挪到尾部后同项目连续几轮目录摘要可整段命中。
4. **Chat 的 json_object 把 chat 拒成 502**：`response_format` 要求用户提示词含 'json' 字面——
   chat 从未可用。显式 `json_mode=False` 解耦。

真机证据（同一前缀连续请求，wkapi.pro / gpt-6-sol）：

| 场景 | 第 1 次 | 第 2 次 | 第 3-4 次 |
|---|---|---|---|
| 非流 /v1/ai/chat | N/A（不报） | N/A（不报） | 18784/18791（约 99.9%）|
| SSE（include_usage） | 3890 cached（约 80%）| 3756-3786 | 持续 ~80% |
| SSE 两条连续同前缀 | 首发即 80%+ | — | — |
| Chat 请求 json_mode=False | **200 "ok"** | — | — |
| Chat 请求 json_mode=True（旧行为） | **502**「messages must contain the word 'json'」 | — | — |

## 决定

1. **`NEXUS_LLM_STREAM` 默认为 True**；`=0` 恢复字节级非流行为。
2. **`NEXUS_LLM_COMPLETION_CACHE_URL`**（可选，空=不启用）指向真 Redis 时，`Registry` 构建
   `RedisLlmCompletionCache`（`nexus:llmc` 命名空间，LTRIM 512 项，默认 TTL 3600s）并把
   `OpenAICompatibleProvider` 包进 `CachedLlm`。连接失败 fail-open（缓存故障不打挂 provider）。
3. **prompt 前缀序**：`design_prompt.build_prompt` 把 `intent`/`prompt`/`variants` 挪到 payload
   末尾；catalog（pages/frames/components/assets/tokens/totals/...）放在前、
   selectionDigest/annotations/recentChanges 居中。
4. **chat 路由显式 json_mode=False**；`/v1/ai/run` 保持 json_mode=True。
5. **`Completion` 新增 `cached_tokens` 与 `reasoning_tokens`**（默认 0，向后兼容）。

## 后果

- 真机流量即生产：流默认 + 缓存可选、连接失败 fail-open、零回归默认开关可逆。
- chat 从前不能用到现在能用（/v1/ai/chat 200）。
- 每条连续被模型计费的请求显著减少（缓存命中后 provider 调用被完全省掉）。
- 仍欠：provider 自己的前缀哈希依赖后端池，有的池报有的不报；这层超出应用范畴，
  本片只确保应用层 Redis 缓存确定性命中（实测 <5ms vs 1.6-2s）。

## 仍欠（诚实记录）

1. **chat 的 prompt** 不在浏览器路径上直出，`/v1/ai/run` 前端链路未在本次重测（浏览器断连）。
2. **`reasoning_tokens`/`cached_tokens` 契约**：已进 Usage（ai-service 报文记账），
   但 `TaskUsageSchema` 是精确 additionalProperties=false，需要 web 侧随 v686 usage 改契约后才会进 UI。
3. **apps/web 的 .env.local 里 `NEXUS_LLM_*`** 未对齐本 PR 的 env.example 新节——下次本机实测时确认。
