# §PROOF-BIG-CONTEXT · 大上下文落地实测（2026-11-18 · aizzz.xyz / gpt-6.1-terra）

**背景**：用户长期诟病「一次上下文打进去远少于 Codex（5 万~9 万 tokens）」。2026-11-18 路线稿（ADR-0286 / cont.351）：digest 全量重构为**分层上下文**：

- 正文完整的 13 章正典全文 + 附录（地理志/名录/年谱）保留；
- 125 篇回响：**newest-first 配额制**——zh 正文按 `newest→oldest` 累计，≤125k chars 全部打包；更老的写「题名 + zh 锚句编号」（用于 canon-answer-graph 的 unknown-anchor 门检）；
- EN 锚句仅留在 docs/world-bible 供对比（digest 只需 zh 编号即可通过机检），节省 ~43k chars；
- `AiChatRequestSchema.system.max` 从 112,000 → **256,000**（packages/schemas + contracts/ai-chat-request.schema.json，contract:export 重导）；
- `SYSTEM_PROMPT_CHAR_BUDGET` = 256_000。

**结果（2026-11-18 实测）**：digest **229,140 chars**（öncesi 96,679）→ 全线 zh/en 锚句拆分后对照验证：`verify:world-bible 768/768 ✓ · verify:bible-snapshot ✓ · canon-answer-graph 13/13 ✓ · fe-gates 1370/1370`。

**直打 ai-service `/v1/ai/chat` 12 问顺序实测（下面 4 发）**：

| # | 问题 | tokensIn | cachedTokens | 复用率 | 首包延迟 |
|---|---|---|---|---|---|
| 1 | cold（潮汐不动为什么） | 147,519 | 7,024 | 4.8% | 6.8 s |
| 2 | 同一问题重问 | 147,519 | **138,531** | **93.9%** | 5.2 s |
| 3 | L2 hit（同问题） | 147,519 | **147,519** | **100%** | **29 ms** |
| 4 | 不同问题（盐灯守灵日记） | 147,521 | **147,521** | **100%** | **54 ms** |

`cacheReported=true` · provider 首日就接受了 229K 字符的 system 前缀；冷样本（7,024 = 4.8%）只有一次，第二发起全部 ≥ 93.9%（Codex 对照见 ADR-0282/ADR-0284；cache lane 稳态 ≈ 97%）。

**与 lineage-2 支线对照**：该支线 c8eaae7f 按相同思路把 `system: max` 解锁到 256_000、digest 扩成 177,006 chars、实测 119,904 tokensIn、题库扩展而非改 digest。本片把该方针应用到 main-line 的全量 digest（148K tokensIn），锚句仍是 verify 全对（728→768）。

**边界**：
- 12K → 成熟 256K 的"正文全量"路线会放大 token 采购成本（每问 148K in）；用户自己选的路线（不弱化），93.9→100% 复用已足额摊销。
- 本报告不覆盖 /v1/ai/run（design-graph）；该车道也在 digest 之上，其 envelope contract 仍 ≤112k chars digest 的一半头寸——本片只动 `/v1/ai/chat` 这一条。
