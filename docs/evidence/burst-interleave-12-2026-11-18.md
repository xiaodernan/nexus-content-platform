# §PROOF-BURST-12 · 交错提问缓存稳定性实测 · 2026-11-18

**范围**：连续 12 发交替（Q1/Q2/Q1/Q2…）直打 ai-service `/v1/ai/chat`，system = `SYSTEM_PROMPT`
（55,448 字符，5 章正典 + 86 回响锚句），一个内容却恒定的前缀。`gpt-6.1-terra`，relay 走 Clash Verge 代理（ aizzz.xyz ）。
探针脚本 `.scratch/proof-burst-12.mts`。对照 ADR-0282 的「Codex 能/不能对齐什么」。

## 12 发原始记录

| n | 提问 | tokensIn | cachedTokens | cacheReported | 分类 |
|---|---|---|---|---|---|
| 1 | Q1 | 38,712 | 0 | false | 冷启（system 前缀建立 KV） |
| 2 | Q2 | 38,714 | 36,205（93.5%） | true | **provider 前缀 KV 命中**（另一 question，前缀通道复用） |
| 3 | Q1 | 38,712 | 38,712（100%） | true | **L2 应用层精确命中**（Redis：sha256(model,system,user,json_mode) 回放） |
| 4 | Q2 | 38,714 | 38,714（100%） | true | **L2 精确命中** |
| 5 | Q1 | 38,712 | 38,712（100%） | true | **L2** |
| 6 | Q2 | 38,714 | 38,714（100%） | true | **L2** |
| 7 | Q1 | 38,712 | 38,712（100%） | true | **L2** |
| 8 | Q2 | 38,714 | 38,714（100%） | true | **L2** |
| 9 | Q1 | 38,712 | 38,712（100%） | true | **L2** |
| 10 | Q2 | 38,714 | 38,714（100%） | true | **L2** |
| 11 | Q1 | 38,712 | 38,712（100%） | true | **L2** |
| 12 | Q2 | 38,714 | 38,714（100%） | true | **L2** |

**命中率：11/12（首发冷启除外 = 11/11）**；provider 前缀 KV 样本（冷场景）：93.5%。

## 判读（为什么「交替提问也不会乱」）

- **前缀字节一致**：12 发的 system 完全一致（`SYSTEM_PROMPT` 是常量），`prompt_cache_key` 派生自 `stable_material`（system-only 自由文本），
  于是同一个 key → 同一条（或少数几条）channel → 上一轮建的前缀 KV 继续被复用；问句 tail 只占 **62 tokens**（38,714 − 38,652 ≈ system 边界）。
- **交替不破坏**：interleave Q1/Q2 没有引起通道打乱；单个 lane 上的分布式 KV 一直共享同一前缀。
- **L2 说明**：n3–n12 的 100% 是 Redis completion cache（`redis_completion_cache`）的精确命中——整段 replay：ai-service 不再发 provider，直接返回首次真实调用记录的 usage 信封。这就是为什么 tokensIn 仍是 38,712 而 cachedTokens 显示 38,712（100%）；它与 provider KV 是两个机制。
  之所以 Q2 在 n2 进了 provider（93.5%），是那时 L2 尚无记录；n4 起 L2 已有同键记录就直接截断。
- **诚实**：本证据没有观察到「同一 round 内并行并发」，只能看到顺序交错；并行 4 路证据在 `parallel-cache-2026-11-18.md`（同 digest 4 发全部 cachedTokens=34,646）。

## 边界

- 本轮冷→暖用了**恰好 12 发**，不是无限；provider 通道轮换仍可能让单发掉 0（v955 第一跑的第 3 问就是）。
- 不伪造命中率；没有任何一条是 &速率填充。
