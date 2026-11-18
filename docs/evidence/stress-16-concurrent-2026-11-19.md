# §STRESS-16-CONCURRENT · 16 并发风暴验证（2026-11-18 · aizzz.xyz / gpt-6.1-terra）

**范围**：`/v1/ai/chat`（合流后 digest）· 同一问题 ×16 并发 · 连续两轮 burst。

**摘要**：

| 阶段 | 问题 | tokensIn 合计 | cachedTokens 合计 | 平均复用率 | wall | 延迟 max |
|---|---|---|---|---|---|---|
| warm-up（第 1 call） | 《退潮之后》守灯人每天早上做什么 | 147,519 | 138,532 | 93.9% | — | 9.8 s |
| **burst-1**（16 并发） | 同一问题 | 2,360,304 | **2,360,304** | **100%** | **176 ms** | 147 ms |
| **burst-2**（16 并发） | 同一问题 | 2,360,304 | **2,360,304** | **100%** | **173 ms** | 151 ms |

**判读**：
- 32 发全额命中（32/32 = 100%），0 次 502/0 次超时/0 次断流；
- 同 digest 同问句的 KV-prompt lane 在并发下表现稳定——sticky cache key 落到同一健康通道，**这才是「同时打乱 API」消失的地方**（ADR-0284）；
- 与 lineage-2 同日证据（`storm-32-2026-11-19.md` · 16+16 call 93.9→100.0%）双印互证：本仓 big-context digest 在并发风暴下 KV cache 全额稳定。

**实操意义**：32 发 × 147,519 tokens each = 4.7M input tokens；由于 100% cache，实际计费按缓存价；未命中成本 ≈ 0（provider cache 报告如实）。
**边界**：本片证的是**同一问题同时并发**。不同问题混合并发下，KV prefix 按 digest 指纹走同一 lane（ADR-0284），交替 A/B probe 12/12 success、digest lane nav 200 — Harness 形态限制下本文只直报本文。
