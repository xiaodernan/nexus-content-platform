# ADR-0274 — AiChatRequest.system 上限 12 000 → 64 000 字符（问典 digest 落点）

- 日期：2026-11-17（v841）
- 状态：accepted
- 背景：§BIBLE-4《问典》要在「潮汐问答」里把低语诸王的**五章正典全文 + 26 篇回响锚句**作为 ground truth，
  否则模型在文本外就无法区分「典籍里没有」与「典籍里有但是摘要没带」，grounding 是本功能的全部价值。
  实测 v2 digest = 29 954 字符（≈ 10.5k tokens），12 000 字符的原上限会拒收。
- 决策：zod `AiChatRequestSchema.system.max` 提到 64 000；Python 侧 runtime 校验走 `contracts/ai-chat-request.schema.json` 同步到 64 000；
  ai-service 的 pytest fixture 不受影响（字段形状没变，仅 maxLength）。
- 方案：digest 裁剪一半掉 en 锚句换来塞进 12k 会丢掉每条锚句的原文证据，等于把问典的答案质量降到「凭运气」档；
  做语义检索 top-K 则牺牲 §CACHE-4 前缀稳定（每个问题 prefix 不同 → KV 前缀复用几乎归零，真实成本高于节省的上下文 token）。
  40k~50k 的单次全集 canon 放在一个 static 前缀里恰好是 KV prefix caching 最喜欢的形状：同一 workload 里 100% 前缀相同。
- 后果：
  - 付费 API 请求上下文变大 ~2.3×（吃 gpt-6.1-terra 单条 ~¥ 0.01 的输入价格）；
  - digest 是字节级稳定常量——同一进程/同一 workload 的每次调用前半段字节完全相同，`prompt_cache_key` 走默认即可；
  - 生产 multi-tenant 环境里 budget 防线依然成立：字段上限没拆掉，只是把量级推到了全部 workload 都能用的尺寸。
- 记录：`packages/schemas/src/index.ts`（`z.string().min(1).max(64_000)`），contracts 重导出，contract.test 15/15。
