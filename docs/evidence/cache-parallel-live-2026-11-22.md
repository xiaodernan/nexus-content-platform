# Cache — 并行会话与「上下文太少」的生产路径实测（2026-11-22 · §CACHE-PARALLEL）

> 用户本轮第二次点名两件事：**「并行会话同时打 API 导致缓存互相干扰、命中混乱」** 与
> **「我这边输入上下文总是太少」**。前者在 2026-11-19 的
> `docs/evidence/cache-ab-parallel-2026-11-19.md` 里量到过「4 路同毫秒齐发 ⇒ 全部 0 KV」，
> 但那条结论停在**直连 provider** 层，且探针用的是 `stream=false + 常量 lane`——那不是生产形状。
> 本文补的是**生产路径本身**的可复检判据，并回答第二个问题。

## 平台

- provider `aizzz.xyz · gpt-6.2-sol · via Clash Verge 127.0.0.1:7897`
- 探针 `scripts/probe-parallel-cache.py`（`npm run probe:cache-parallel`），POST `/v1/ai/chat`
- system = 24,009 字符的中文设定文本（≈25k tokens）；本脚本只验「并发形状下 lane 稳不稳」，
  不在体量上重复烧钱——真实生产的体量见 `cache-digest-live-full-2026-11-19.md`（158,112 tokens）

## 主读数：**全新 lane**（salt 随机 ⇒ 应用缓存与 provider KV 双冷）

```
cold:      8.45s tokensIn=24903 cached=0     ( 0.0%)   ← provider KV 冷
warm:      7.37s tokensIn=24903 cached=21964 (88.2%)   ← 同文第二次，lane 已建
par/0:     7.75s tokensIn=24907 cached=21964 (88.2%)
par/1:     8.69s tokensIn=24906 cached=21964 (88.2%)
par/2:     7.34s tokensIn=24905 cached=21964 (88.2%)
par/3:     8.69s tokensIn=24907 cached=21964 (88.2%)

appCache delta: hits=0  misses=6   ← 六发全是真 provider 调用，没有一发是应用缓存回放
provider delta: reported=5  cachedTokens=109820  ← 5 × 21964，四次并发各自都拿到了同一段前缀
```

## 结论一：并行会话不再互相干扰

四路并发、**同一份 system 前缀、四个不同的问题**，四发全部命中同一段前缀 KV（21964/24906 ≈ 88.2%），
没有一发掉到 0。这与 2026-11-19「4 路同发全部 0%」的读数**相反**——差别在三件当时不在探针里的事：

1. `NEXUS_LLM_STREAM=1`（`.env`）：流式通道在本网关下前缀稳定；非流会在两台 KV 承载机之间
   奇偶交替（0 / 88.1 / 0 / 88.1 …）；
2. sticky per-lane `prompt_cache_key = nexus-<sha256(system)[:16]>`（ADR-0284）：同前缀同车道，
   四路并发不会因为常量 lane 被分派到不同承载机；
3. 进程内 single-flight（ADR 0128）对**同文**并发做合并——上一段读数里同文并发的两发延迟
   0.07s / 0.10s，是真回放，不是各打一次。

> 注：`NEXUS_LLM_DISTRIBUTED_SINGLE_FLIGHT` 在 `.env` 里仍未打开。它是**多副本**部署下
> 跨进程合并同 key miss 的解法；本机单实例，上面的读数已经证明并发 lane 稳定，故不引入
> Redis 租约的复杂度（ADR 0129 记着打开前要同步调大租约与超时）。

## 结论二：「输入上下文太少」的真实形状

用户观察是对的，但**不是所有通道**：

| 通道 | system 前缀体量 | 说明 |
|---|---|---|
| 设计主链路 `/v1/ai/run` · `/v1/ai/design-graph` | **≈158,112 tokens**（`canon_digest.txt` 全量） | `design_prompt.py` 的 `SYSTEM_PROMPT = CANON_PREFIX + SYSTEM_RULES`，已经是 Codex 五～九万的 **1.8～3 倍** |
| 问典 / 世界步进（`world-step`、`chat-graph`） | 同一份 canon digest | `world_step_stategraph.py` / `chat_stategraph.py` 复用同一个 `CANON_PREFIX` |
| 角色对话 `/v1/ai/chat` | 由 web 侧拼（persona + 记忆 + 语料） | persona 是字节级稳定的 system，历史与语料在 user 侧 |

所以「上下文少」的**可改之处**在角色对话： persona 只是单个角色档案（几百字），
历史记忆只取最近 5 条 `memories` 行，语料只取 3 条 `knowledge_chunks`。
它既没有把 canon digest 这个大前缀用上（对话里聊到世界设定时模型没有依据），
也没有把同一会话的多轮历史按 token 预算装配进去。这是下一片（§LLMCTX-1）的题目。

## 判据（可复检）

`npm run probe:cache-parallel` 四条门：A 预热第 2 发 ≥50% · B 并发异文过半 ≥50% ·
C 同文并发中位延迟低于异文并发（被合并）· D 并发后顺序发仍 ≥50%（不掉了回不来）。
本轮全绿。

## 不在本文档内

- 真机 iOS / 软键盘下的延迟与可视高度；
- 多副本（≥2 个 ai-service 进程）下的跨进程合并——本机单实例，未测；
- 网关侧 KV 的 TTL 与淘汰策略不可观测，只能从 `cachedTokens` 反推。