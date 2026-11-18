# §PROOF-INSIGHT-LANE-V973 · /insight ⑧ 车道重探（2026-11-19 · 合流后 digest）

**背景**：此前（cont.347）`/insight` 车道探针 lane 003（变体问句）曾被 provider 连续 502 掐掉，当时如实记账；初判是上游网关抖动。既然 big-context digest 已让全站 cache KV 全额稳定（ADR-0286 + §STRESS-16），本片在合流后新 digest 下重放 insight ⑧ 车道，确认该车道现状。

**方法**：直打 ai-service `/v1/ai/chat`（绕过 web 层），system = 当时 web `InsightAiAnalysis` 实际发出的 `INSIGHT_AI_SYSTEM_PROMPT`（含 CANON_DIGEST 嵌入；regen 时 229800 chars — bytes vs 200,779 变长版本），user = 聚合后的伪 digest（30 days ratios/series，无个人字段）。

**digest 重生成**：`CANON_DIGEST` 从 96,679 → **229,140** chars（见 ADR-0286）；`INSIGHT_AI_SYSTEM_PROMPT` 从 95,656 → **229,800** chars。

**实测三次**：

| # | 说明 | tokensIn | cachedTokens | 复用率 | 首包延迟 |
|---|---|---|---|---|---|
| 001 | cold（新 digest 首次出现） | 148,228 | 7,058 | 4.8% | 9.8 s |
| 002 | 同一问句（立刻重问） | 148,228 | **148,228** | **100%** | **17 ms** |
| 003 | 变体问句（users=1289→1291 · opens[0] 120→124） | 148,228 | **138,651** | **93.6%** | 8.1 s |

**判读**：
- 同车道、同问句 ≥ 93.6%、L2 hit ~100%；variant 问句 93.6% prefix reuse（**此前被 provider 502 掐掉，本次全绿**）。
- 这对应 `/insight` ⑧ 现场管理员视角："模型现在用稳定前缀把 150K-token 聚合 digest 读一遍，只说证据 · 证据数字不得编造"——cacheReported=true · verified=true 候选值持实。
- 失败不冒充、没一次 502；与 §LLM-RETRY-ONCE（cont.347 · 全站浏览器侧 800ms 重试）互为补偿。

**边界**：本片直打 ai-service，不覆盖 Next dev 层至浏览器的 fetch path（那条链路经 `/api/insight/analyze` · CSRF · 超时 15 s · 429→honest）；该链路 err 模式与本片无关。
