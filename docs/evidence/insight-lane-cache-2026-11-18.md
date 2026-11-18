# §PROOF-INSIGHT-LANE · 2026-11-18 · /insight ⑧ 的模型前缀缓存车道（同 frontier 体系）

**背景**：/insight ⑧⑨ 的模型调用使用独立 system 前缀 `INSIGHT_AI_SYSTEM_PROMPT`（95,656 chars，含 `CANON_DIGEST`），与 /bible/ask 完全不同的 prompt 头（`You are a product analyst …`），因此是独立的 KV 缓存车道。本轮对该车道做直打探针（绕过 web 层，直接打 ai-service `/v1/ai/chat`）。

**Digest**：`system` = 95,656 chars（CANON_DIGEST 嵌入；tokensIn ≈ 69,745）。digest 体系稳定后，全站所有 PRODUCT GRAPH system 均为 byte-stable 前缀。

**实测三次**：

| # | 请求 | tokensIn | cachedTokens | 复用率 | 延迟 | 说明 |
|---|---|---|---|---|---|---|
| 001 | cold（首次见到该 system） | 69,745 | 3,321 | 4.8% | 6.7 s | 正常冷启 |
| 002 | 同 system · 同问句（immediately after） | 69,745 | **69,745** | **100%** | 88 ms | L2 hit |
| 003 | 同 system · 变体问句（users=1287→1291） | — | — | — | — | **provider 连续 3 次 502**（上游： aizzz.xyz 网关抖动），ai-service 返回 `502 Bad Gateway` |

**解读**：

1. 同一车道、同一 digest → KV 命中 100%，零成本复用。
2. 变体问句按理应复用 `CANON_DIGEST` 前缀（同 13 章 + 116 回响 + 附录）— 本轮没等到 provider 配合（502 是上游网关侧挂断，不是我们发得过多或格式不对；健康检查及本轮 #001 / #002 都正常）。
3. provider 抖动不是个案：本轮直接观察到 `ai-service 502` 共 5 次（含先前 wave 的 2 次瞬断）。web 层所有 LLM 端点现已统一加 **800ms 后重试一次**（见本证据对应的工程变更 · `§LLM-RETRY-ONCE`）。

**边界**：

- 不伪造命中率；本报告全部由 provider 回 200 + usage 实报字段，未加速过任何东西。
- lane 003 的理想预期值（参照 `proof-transport-003` 93.8%）没有兑现 — **记账，不粉饰**。
- 本报告不覆盖 /bible/ask 与 角色对话车道（那两条见 `post-merge-live-2026-11-18.md` / `character-chat-live-v955-2026-11-18.md`）。
