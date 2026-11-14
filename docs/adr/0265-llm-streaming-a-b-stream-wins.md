# ADR-0265 · LLM 流式 vs 非流缓存 A/B：数字、决策、以及不替"上游用哪片 KV"背锅

**Date**: 2026-11-14
**Status**: Accepted

## 背景

用户反复反馈：wkapi.pro（gpt-6-sol）缓存命中率低；"显示流的时候命中明显好很多"。
机械验证路径——`scripts/probe-cache-stream.py`（本次新增，与 `probe-cache-warm` 同 digest
`23aa0d15b1f4843b`）实测：同机、同字节、同 `prompt_cache_key=nexus-ab-stream-2026`，仅改
`stream` 一个字段，连续 4 轮得到 27348/27345 全命中（warm 段 **100.0%**）。
而非流：
- 早些时候 5 轮全暖命中（turn2+ 100.0%）；
- 或落在 80.0%/82.8%/81.8%（另一回合），与 distributor 随机分片直接相关，
  不是 prompt 本身的问题、也不是代码的问题。

## 决策

1. **保留 `llm_stream: True`（默认）**：不退回非流。
2. **`/v1/ai/cache-stats` 新增 `transport.stream`**；`/admin/ai-cache` 新增"流模式"5th KPI。
3. **`/v1/ai/cache-stats` 判定门看到 `transport.stream === false` 时**在 detail 末尾追加
   `nonStreamCaveat()`——明说这一屏说明的是"退回非流模式"，不是 prompt 坏了。
4. **任何运维要把 `NEXUS_LLM_STREAM=0` 退回非流**：必须先跑一次 `probe-cache-stream.py` A/B
   并把读数粘贴到变更记录里——分布器随机不可控制，事后无法归因。
5. **§159** 继续：不把 100.0% 写成 SLA；分布器再改一次同一种传输方式都可以反转读数。

## 不承诺的东西

- 任何缓存命中率 ≥ 某个百分点的容量政策承诺；
- "切非流即可修复"或"切流模式即可修复"的因果故事——本证据里的两个形状都在同一个 fleet 上出现过；
- 谁告诉你"改了什么就能保证更高命中"——只有固定上游/计费车道的 KV-粘滞路由才有书面保证。

## 后果

- 运维面板（`/admin/ai-cache`）现在能区分：zero-hit 是 payload 变化、prompt_cache_key 错配，
  还是运维主动退回非流——这些根本不能混成一句诊断。
- 流式不是"为了让人避免关掉它而成为默认"，而是由测量直接驱动的默认（§159）。
- 同一字节目录结论可复现：任何需要决定 cut/stream 的人都能重放这次 A/B。

## 引证

- `scripts/probe-cache-stream.py`（新）
- `docs/PERFORMANCE.md §2026-11-14 §CACHE-4-AB`
- `.github/workflows/` 里没有任何 provider-facing 行为断言（按构造）：
  §159：非流退回的责任方必须是决定退回的运维，本机制只是提供可读性。
