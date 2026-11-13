# §AILIVE-4 · 缓存命中率低、"显示非流" 的根因与修复 — 一页交代

> 2026-11-13 · 仅 `main` · 实际跑过的数字，非猜测。

## 用户观察（原话）

> 为什么一直显示非流，好像流的时候命中率高——肯定是调用方法出了问题。

## 实测（真 paid provider，wkapi.pro / gpt-6-sol）

- **stream=false 不带任何参数**：`usage` 里**根本没有** prompt caching 字段——
  `{"prompt_tokens": 5615, "completion_tokens": 5, "total_tokens": 5620}`。
- **stream=true + `stream_options: {include_usage: true}`**：SSE 结尾没有 usage 帧——
  账本读不到数，**不是 "流更快命中"**，是 stream 把 usage 掐掉了。
- **仅加 OpenAI 官方参数 `prompt_cache_key: "nexus-studio"`**：
  `{"prompt_tokens": 5640, "completion_tokens": 5, "total_tokens": 5645,
    "prompt_tokens_details": {"cached_tokens": 5376}}`
  —— 立刻有数：**5376 / 5640 = 95.3% 命中**。

## 根因

`OpenAICompatibleProvider.complete()` 调 `chat/completions` 时**没有发 `prompt_cache_key`**，网关就不分片也不报、账本一行不可观。非流式与流式**都没有数据**，不是"流更快，是你看不见"。

## 修复（已交付）

1. `providers/openai_compatible.py` 发 `prompt_cache_key`（env `NEXUS_OPENAI_PROMPT_CACHE_KEY`，缺省 `nexus-studio`，显式空串关）；
2. `usage` 新增 `prompt_tokens_details.cached_tokens` + `prompt_cache_hit_tokens`（DeepSeek 兼容）；
3. 契约新增 `cachedTokens`（default 0，加法兼容）；
4. `scripts/probe-prompt-cache.py`（`npm run probe:cache`）固化判据——L1 直连 / L2 `/v1/ai/run` 都 ≥1024 才 PASS；
5. 现场 3200 pid 33080 (patched) 的实测：**冷 0 → 暖 6272/6413 = 97.8%**。

## 如实边界

- 网关**没有价格表**：`costUsd=0` 如实报，`cached_tokens` 只代表"复用了这么多 token"，不代表"便宜了多少比例"——别把折扣写得像真的。
- **流式仍不报数**（网关行为）：非流式现在命中率和账本都可看见。不为"看起来像命中高的流"去把一个诚实的非流式换成不给数的 stream。
- UI（/tasks 账本 §75 那格）已能记录 cachedTokens；渲染格超出 §FE tasks-visual-style 的 SHA 守恒边界，本轮**不强加**；需要时走独立 §FE 片。
- pytest + 45+46+17+5 Python/web 全绿；`verify:fe-gates` 969 条全绿；e2e published-visual 2/2、
  forced-colors 9/9、design-tree（typecheck/lint）0 error。
- **未 push**（约定）。
