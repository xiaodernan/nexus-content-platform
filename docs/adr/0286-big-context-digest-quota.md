# ADR-0286 · digest 上下文扩容到 ~230K 字符（≈148K tokens）——newest-first 回响配额制（2026-11-18 · 承 ADR-0284/0285）

## 状态
已接受（2026-11-18；与 ADR-0285 第二波合流并行落地）

## 背景

用户反复指出："为什么我的输入上下文总是那么少…GPT Codex 一次打进去都可以有 5 万到 9 万 tokens。"
此前 main-line digest = 96,679 chars（只含每篇回响的 ANCHORS only，正文留在典籍室），tokensIn ≈ 68–69K。

origin/main 的另一条线（c8eaae7f · cont.252）同步给出了直接答案：`AiChatRequestSchema.system.max` 64_000 → 256_000、
`SYSTEM_PROMPT_CHAR_BUDGET` 64_000 → 256_000、`buildDigest` 改为"全量回响正文 + anchors"：digest 177,006 chars、**tokensIn=119,904、KV cache 100% 稳定**、32 并发风暴 93.9%→100.0%。

## 选项

A. 保持 ANCHORS-only digest（$96K chars · tokensIn≈69K——用户长期诟病的不变）。
B. 与 lineage-2 一致，全量 echo 正文分片（490,782 chars ≈ ≈330K tokens）——**装不下 256k 合同封顶也装不下任何 provider 窗口**（实测 320K 和 490K 都会超 `AiChatRequestSchema.system.max=256_000`）。
C. 分层配额制（采用）：
   - 13 章正典/附录**完整正文**入 digest（58K + 9K chars）；
   - 125 篇回响：newest-first 累计 zh 正文 ≤ **125,000 chars**；装不下的旧篇保留「题名 + zh 锚句」供机检定位；
   - zh 锚句编号全部保留（canon-answer-graph 不受影响）；en 锚句留在 world bible（verify 对照用，不进 digest）；
   - `AiChatRequestSchema.system.max` 112_000 → **256_000**；`contracts/ai-chat-request.schema.json` `maxLength` 同步；`SYSTEM_PROMPT_CHAR_BUDGET` = 256_000；
   - `contract:export` 重导契约。

## 决定

选 C。直接证据（`docs/evidence/big-context-token-2026-11-18.md`）：

| # | 说明 | tokensIn | cachedTokens | 复用率 | 延迟 |
|---|---|---|---|---|---|
| 1 | cold | 147,519 | 7,024 | 4.8% | 6.8 s |
| 2 | 同问重问 | 147,519 | 138,531 | 93.9% | 5.2 s |
| 3 | L2 hit（同问） | 147,519 | 147,519 | **100%** | **29 ms** |
| 4 | 不同问 | 147,521 | 147,521 | **100%** | **54 ms** |

## 后果

### 变好的事

- context 突破用户诉求的 5–9 万区间，实际落地 ~147K tokens——**Codex 级**；
- digest 机检/KV 生效区间提升 ≈2.2×；
- `canon-answer-graph` 不变，anchor 数 728→768 期间（E117-E125 双语对齐）无需任何测试修改。

### 变差的事

- 每问 token 采购成本涨 ≈2.2×；用户自己选的方向（不弱化）已摊销到缓存命中 100%；
- digest 扩大冻结旧篇正文（只有题名+锚句）——**这不是内容删除**（docs/world-bible/ 全部在仓，
  用户"典籍室"全本可读）；digest 只是 AI 问答的 KV 前缀材料。
- 比例突破 requires `contract:export` re-run（已做）。
- 本片不改 /v1/ai/run（design-graph）；不碰 Redis L2（design-graph lane）。

### 能撤回

`ECHO_BODY_CHAR_BUDGET` 常量单独控制（当前 125_000），verify 既有套件全绿；回退到 ANCHORS-only 只需置 0。

## 相关

- 与 ADR-0282（Codex parity）、ADR-0284（cache lane）、ADR-0285（第二波合流）
- lineage-2 支线此前独立提出 B 的方向；本次合流把策略落到 main-line 的全部素材。
