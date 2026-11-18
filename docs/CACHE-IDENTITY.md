# 缓存身份模型 · 本项目为什么命中 90%+

> 这篇文章是给任何翻代码的接手人看的。它把"我们为什么命中率好／不好"从工程感觉落成可审计判据。
> fable 无。事实全部有具名 evidence 指针。

## 1. 核心命题
**Distributor（上游 aizzz）使用 channel-local cache。每条 channel 是独立的 KV，能跨多轮携带同一前缀保存。**

同一 `prompt_cache_key` → 同 channel → 同一 prefix cache。换一个 key 或不用 key，会落到别的 channel → miss。

## 2. 本项目命中是怎么做到的

### a. digest 字节级稳定（SYSTEM_PROMPT v2）
来源：`apps/web/src/lib/bibleAsk.ts` — `SYSTEM_PROMPT` 是常量、构建器输出可重复。
- 五章正典全文 × 锚句 × 139 篇回响锚句；
- 每次重渲染都是字节一致；
- 任何一章改一个字符 → 历次 cache miss（所以修 digest = 重新静候重灌）。

### b. Sticky `prompt_cache_key`
来源：`apps/ai-service/src/ai_service/sticky_prompt_cache.py` — `stable_material`
- `user`（free text）= `(system, system-only)`
- `user`（JSON 业务 payload）= `(system, canonical(stable_keys))`
- 散列出 `sha256` → 稳定 `nexus-<hex>` — 注入每个 POST `/v1/chat/completions` 的出站 JSON
- **2026-11-18 起已是本仓缺省**（ADR-0284）：`NEXUS_OPENAI_PROMPT_CACHE_KEY` 不设置/空 → sticky per-lane 即生效；此前 provider 先钉常量 `nexus-studio` 把 sticky 路径废掉，实测常量 lane 12 发交替 **6 次 502**、sticky lane **12/12 200 · cached≈100%**（evidence `docs/evidence/cache-key-ab-2026-11-18.md`）。

### c. 应用侧 Redis L2
来源：`apps/ai-service/src/ai_service/redis_completion_cache.py`
- key = `sha256(model,system,user,json_mode)`，一会话一把；
- 第一次 miss 真正请求 provider → 存 Redis；
- 后续同一 prompt 直接 hit → `tokensIn=0, cost=0, latencyMs=0`。

### d. 稳定前缀
全部出站 HTTP 请求（流式、非流式）共享同一个 32k-token 前缀，channel 直接算 reusable cache。这是不可绕的 prerequisite，不是可选项。

## 3. 实测命中
每次实测命中心：**22,600 / 24,066 ≈ 94%**（见 /docs/evidence/paid-provider-e2e-2026-11-17.md §PROVED-9/13/17/18 连续四次实测）。

第二次实录（2026-11-18，evidence `docs/evidence/transport-cache-v947-2026-11-18.md`，直打 ai-service `/v1/ai/chat`，不经 Next dev）：
- call#1 (cold)：tokensIn=37,830，cachedTokens=0
- call#2 (同一问题再问)：cachedTokens=37,830（100%，应用侧 L2 命中，延迟 ~103 ms）
- call#3（**不同的问题**，同一 digest）：cachedTokens=35,741 / tokensIn=37,831（**94.5%** prefix 复用，冷→暖一次成型，与 Codex 行为一致）

结论：同一 digest 前缀（system 字节一致）+ 不同问题尾巴 → prefix reuse 94.5%；前缀缓存在 channel 上成立，不依赖"问题完全相同"。

## 4. 为什么有（罕见）的不命中时期
回响篇数 4 次更新（26 → 33 → 36 → 37 → 38 → 39 → 40 → 41 → 42 → 43 → 44 → 45 → 46 → 47 → 48）各自改变了 digest 字节，每次都对应 cache 淘汰冷启动一次——正常；对齐后回归 94%。

## 5. 为什么 user 会看到"命中不稳定"
### a. 并行 concurrent 打打，确实会因为 channel-allocator 分配到不同 channel
每次齐发的调用，q1/q3 可能落到 channel-B 吃 cold 一次；下行还是能跑 94%；race 是上游的。

### b. `stream:true` 路径的 `cached_tokens` 不复报
本 distributor 只在 non-stream 模式下报 `prompt_tokens_details.cached_tokens`；流式的 usage chunk 直接省略——这不是我们产品 bug，是网关的会计选择。

### c. "redis 命中 vs provider 命中"两个数字有差
Redis L2 hit（我们控制）vs provider-reported hit（distributor 控制）——二者同时可见 `/admin/ai-cache`，一般 provider 报 ~94%，L2 报 100%。

## 6. 想让下游成员更好理解？
直接把实测 evidence 贴给他们：`docs/evidence/paid-provider-e2e-2026-11-17.md §PROVED-8/§PROVED-9/§PROVED-13/§PROVED-17/§PROVED-18` 的实测原文（10 路并发、5 次背靠背、3 轮对话同 fingerprint 94%+ 命中）。
