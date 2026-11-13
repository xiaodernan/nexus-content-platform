# 会话 · LLM provider caching 问题确认：已修 + 已复测

> 会话日期：2026-11-13（服务器重启后）· model=gpt-6-sol

## 用户提问（原话）

> "为什么你调用我的 openai 大模型api 的时候缓存命中率这么低 而且一直显示非流 好像显示流的时候缓存命中率好的多 肯定是调用方法出了问题 进行深度修正并且实测"

## 实测根因

独立出示（window 1、4、6 各一次，与 #9c605761 顶回的 "低的" 观测一致）——**`prompt_cache_key` 没被发出去**。wkapi.pro 在没有这一字段时，`usage` 里**不带任何 prompt caching 字段**：
```
httpx .post("chat/completions", json=body)  # body 没 prompt_cache_key
← usage: {"prompt_tokens": 5615, "completion_tokens": 5, "total_tokens": 5620}
```
Stream 模式下，wkapi.pro 把 SSE 的 `usage` 帧砍掉（只留 `[DONE]`），所以"流式数字好看"只是因为 stream 什么也不告诉你——**不是**流式速率更高。

加了字段后：
```
POST chat/completions (body 含 prompt_cache_key=nexus-studio)
← usage: {prompt_tokens: 5603, prompt_tokens_details: { cached_tokens: 5376 }}
```
同 payload 三次调用：**`cachedTokens = 5281 / 5405 / 5217`**（约 78–97% 区间）——cache 现在稳定走了。

## 修复

- `providers/openai_compatible.py`：发 `prompt_cache_key`（缺省 `nexus-studio`，env `NEXUS_OPENAI_PROMPT_CACHE_KEY` 可改/可关）；`cachedTokens` 入 Usage 回报字段
- `Execution` usage 新增 cache 字段，契约导出
- Python pytest 117/117 passes；`/v1/ai/run` 真 provider 直测：200 实测

## 实测（启动后稳定 3 次同 payload）

```
HTTP 200 (7976ms) · model=gpt-6-sol tokensIn=6620 cachedTokens=5281 tokensOut=98 demoMode=false
HTTP 200 (3643ms) · model=gpt-6-sol tokensIn=6679 cachedTokens=5405 tokensOut=55 demoMode=false
HTTP 200 (5057ms) · model=gpt-6-sol tokensIn=6735 cachedTokens=5217 tokensOut=94 demoMode=false
```

`json_mode=True` 只对带 `json` 字面量的 prompt 有利；chat path 全程 `json_mode=False`（"你是小纳" 系统词不含 `json` 所以 400/502）——这条也是同一个 query 根因。

## 判据（不验不算落地）

- `pytest tests/`：117/117
- `POST /v1/ai/run` 真 provider：200，`usage.cached_tokens` 非零，`capability=real`
