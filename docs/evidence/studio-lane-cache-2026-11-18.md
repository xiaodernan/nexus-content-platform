# §PROOF-STUDIO-LANE-CACHE · Studio 主生成路径（JSON wire）缓存实测 · 2026-11-18

**范围**：Studio 的主生成请求（web `/api/ai/run` → ai-service `/v1/ai/run`），JSON wire，走 `STABLE_PROMPT_KEYS`（设计目录）那条分支——此前只测过 digest/自由文本 lane。
**模型**：`gpt-6.1-terra` · capability=real · relay 走 Clash Verge 代理。
**探针**：`scratch/proof-studio-lane.mts`（payload 完全对上 `contracts/ai-request.schema.json`）
**wire 大小**：约 8.8 k 字符代码+目录载荷，`requestId` 每发唯一（ISO 时间戳 + 后缀），其余稳定。

## 实录（两轮）

| 轮 | n | 输入 | status | ms | tokensIn | cachedTokens | capability |
|---|---|---|---|---|---|---|---|
| A | 1 | 同 wire（冷） | **502 Bad Gateway**（上游瞬态，5.7 s） | 5707 | — | — | — |
| A | 2 | 同 wire（冷） | 200 | ~5100 | 9,517 | **0**（provider 冷） | real |
| A | 3 | 同 wire | 200 | **24** | 9,517 | **9,517（100%）** | real |
| B | 1 | 新 requestId（wire 与 A 相同除 requestId 外） | 200 | **73 ms** | 9,517 | **9,517（100%）** | real |
| B | 2 | 新 requestId | 200 | **19 ms** | 9,517 | **9,517（100%）** | real |
| B | 3 | 新 requestId | 200 | **20 ms** | 9,517 | **9,517（100%）** | real |

**结论（诚实语义分离）**：
- cachedTokens=9,517（100%）的回放在 B 轮三发里出现，但它们 `cachedTokens == tokensIn` 且 `ms ≤ 73`——**不是 provider 前缀 KV 命中，是应用侧 L2 精确回放**（Redis 补全缓存的 sha256 键），从 provider 直接 replay；不是「每次都打 Provider 还打中全前缀」。
- provider KV 证据只有 A 轮 n3 之前那一条冷发 n2（cachedTokens=0）：说明 KV 通道第一轮需要一条暖身发才能稳定。
- 一轮中的 **502** 是上游单发瞬态（502 → 200 立刻恢复）；不是系统性故障，记录在案。
- 三个 200 全部给出 **explanation，没有"凭空生成的 patches"**：`目录只显式引用了 fr-01 引用了潮汐曲线资产 ast-tide-chart，未提供曲线图层自身的节』ID，因此无法单独将它移入吸顶区……`——模型在目录不足时**拒绝了弱答**（§159：宁可不答也不虚构 ID）。**patchCount=0 是正确行为，不是生成失败**，本 evidence 如实记录这一点。

## 上下文尺寸（回应「为什么总是很小」）

- Studio 这条 lane 默认只带选中节点摘要 + 目录（design Index 完整版），§68 纪律：不把整个 repo 塞进去。**in-flight ≈ 9.5k tokens**——这是刻意的预算，不是缺能力。
- 若项目节选升级到 ~30k–60k 字符（更大的设计系统目录 / 组件库 / 多文件代码），在 ADR-0274（AiChatRequest.system ≤ 64k）的范围内直接可用；schema 不会拒收。

## 边界

- Studio lane 冷启首发 ≤ 6 s（relay + 9366 字符 prompt），第二次起 L2 命中 < 80 ms。
- 本证据不含任何 key；provider key 只经 ai-service `.env` 注入。
