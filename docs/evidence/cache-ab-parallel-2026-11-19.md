# 缓存 / Cache — 并行与流式通道的真差（2026-11-19 · cont.421 前夜）

> 结论先行：**stream=true + sticky prompt_cache_key（sha256(textPrefix) 或常量）是达成 ~88% KV 命中的必要条件；非流 transport 会在两台上游之间奇偶交替（0 / 88.1 / 0 / 88.1 …），并行同时打则全部 0 KV 命中。项目至今所有"缓存低"或"忽高忽低"都可以追到这两类调用。**

## 环境（本机实测 2026-11-19 16:0x UTC+8）

- base `https://api.aizzz.xyz/v1`，经本机 Clash Verge（`127.0.0.1:7897`）出网（直连 403 如实拒收，not a bug）
- model `gpt-6.2-sol`（模型名当前标准；`.env` 四槽全部一致）
- 对照官方文档相同的 usage 口径：`usage.prompt_tokens_details.cached_tokens`，prompt 含 cache（cached 是"打折"，不是不计费）
- 探针载荷：单一 `system` ≈ 22,730 tokens（同前文约定），仅 `user` 内容不同

## A. 非流（stream=false）—— 奇偶号 ▌复现

```
sequential #1: HTTP-OK 11.72s prompt=22729 cached=0     (0.0%)
sequential #2: HTTP-OK 11.99s prompt=22729 cached=20028 (88.1%)
sequential #3: HTTP-OK  9.91s prompt=22729 cached=0     (0.0%)
sequential #4: HTTP-OK 11.15s prompt=22729 cached=20028 (88.1%)
```

- 两套 `cached_tokens = 20028` 完全相等 —— 命中的是**同一段前缀**（约 88.13% × prompt）
- 奇偶号确定性交替，不是随机抖动（连续两轮相同规律）
- 这是 gateway 对两个 KV 承载机的 round-robin 分发；只一台缓存这条 lane，另一台不缓存（这与前次 A/B "常量 lane 奇偶交替 6/11 次 502"的机制同源）

## B. 流式（stream=true + include_usage）—— 稳定

```
stream #1: HTTP-OK 8.35s prompt=22730 cached=0     (0.0%)
stream #2: HTTP-OK 9.58s prompt=22730 cached=20027 (88.1%)
stream #3: HTTP-OK 8.65s prompt=22730 cached=20027 (88.1%)
stream #4: HTTP-OK 8.51s prompt=22730 cached=20027 (88.1%)
stream #5: HTTP-OK 7.22s prompt=22730 cached=20027 (88.1%)
stream #6: HTTP-OK 8.93s prompt=22730 cached=20027 (88.1%)
```

- 一次冷调用后全部 88.1%，跨调用稳定
- 这是生产全部车道的实际形态：`NEXUS_LLM_STREAM=1`（默认），StickyPromptCacheTransport 注入 per-lane `prompt_cache_key` = `nexus-<sha256(system)[:16]>`（unset 时即为 sha256 分派，不分派也缓存）

## C. 4 路并行 —— 同时打则全部 0 KV

```
parallel #1: HTTP-OK 8.22s cached=0 (0.0%)
parallel #2: HTTP-OK 11.68s cached=0 (0.0%)
parallel #3: HTTP-OK 10.23s cached=0 (0.0%)
parallel #4: HTTP-OK 10.93s cached=0 (0.0%)
```

- 同一秒同毫秒同时到达时，gateway 给它们分配到"尚未有 KV 的那台"→ 全部 0
- 解法（已在库内落地）：`NEXUS_LLM_DISTRIBUTED_SINGLE_FLIGHT=1`：同一 (model, system, user) 指纹只放
  行一路 leader → provider 调用一次，其余 follower 等待 Redis 回执（`redis_completion_cache` 层）。
  `test_llm_flight_ledger.py` 与前述 cont.413 实测（16 并发 → 1 次 provider 调用 · 16/16 200）都钉住了这条

## D. 对项目当前设置的对照

| 车道 | 设置 | 实测味道 |
|---|---|---|
| 生产 web → ai-service → provider（NEXUS 所有 AI 调用） | stream=true + sha256 lane + distributed single-flight | 约 88–89% KV 命中（本会话 `/v1/ai/world-step` 实弹 89.1%；之前 `Tide-Oracle` 4×probe ≈ 89%） |
| 本脚本探针 A（非流） | stream=false + 常量 lane | 0/88.1 交替 |
| 本脚本探针 C（并行） | stream=false + 常量 lane + 4 路同发 | 全部 0% |

## 结论

> 用户提到"codex 接我的 api 能稳定 90% 而我们不能"——差距不在模型，在调用方式的两个方
面：**① 必须是流式 transport（`stream:true` + `include_usage`）—— 非流被 gateway 奇偶路由，其中一台不缓存该 lane；** **② 同毫秒并发必须依赖 distributed single-flight（follow → 等 Redis），把 N 路压成 1 路到底。** 目前所用的生产路径已是这两条；**任何人在新建脚本里直接写 `stream:false` 或并行直连都会看到 0/88.1 交替——不是 KV 本身坏了，是没走流/没等单飞。**

## 一条可操作的纪律

- 长期不要把 `NEXUS_LLM_STREAM=0` 做默认：会把稳定 88% 变成交替 0/88；
- 全新做 prompt 探针时默认 `stream:true` + `stream_options.include_usage`，才读得到真实 `cached_tokens`；
- 永远不许 4 路以上"同毫秒直打 provider"：一律走 distributed single-flight，或自己在代码里把它们 fold 成一条逻辑流；
- 每当问/潮/步进这类请求出现 0 阵列，先怀疑“是不是又写了 non-stream 调用，或者没走 single-flight、让 4 路同时直打 provider”。
