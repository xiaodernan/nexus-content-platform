# §47 chat 502/400 — wkapi.pro `json_object` 用 `user` 里不带 `json` 这个词就拒了

**时间**：2026-11-13 · **发现路径**：`/v1/ai/chat` 真用户触点（角色小纳） · **复现**：`node .scratch/chat-probe3.mjs`

## 实测（修前）

```
POST /v1/ai/chat HTTP 502
{
  "code": "provider-failed",
  "message": "provider 返回 400：{\"error\":{\"message\":\"Response input messages must contain the word 'json' in some form to use '***.format' of type 'json_object'.\",\"type\":\"upstream_error\",\"param\":\"\",\"code\":null}}",
  "hint": "",
  "retryable": true
}
```

Python 层 traceback（ai-service 日志）显示在 `OpenAICompatibleProvider.complete()` 抛 `ProviderFailed`，来源 HTTPConnection → 400。

**根因（精确）**：

```python
# apps/ai-service/src/ai_service/providers/openai_compatible.py
if self._json_mode:                     # True by default
    body["response_format"] = {"type": "json_object"}
```

`NEXUS_LLM_JSON_MODE=1` 把 `json_mode=True` 钉死到**全部** chat 调用，包含 `system="你是守夜人…"` / `user="今晚的山口安静吗？"` 这种**从不携带 `json` 字样**的用词。wkapi.pro 的严格实现直接拒 400——与它自己的文档一致，不是它乱判。

**与 design path 的差别：**  design-edit 的 `SYSTEM_PROMPT` 自身就写了「输出必须只有一段 JSON：…」→ 字面包含 `json` 字样所以过；chat system prompt 从不带 `json` → 拒。

## 修复

`OpenAICompatibleProvider.complete()` 加 `json_mode: bool | None = None`；响应代码 path：

```python
want_json = json_mode if json_mode is not None else self._json_mode
if want_json:
    body["response_format"] = {"type": "json_object"}
```

`execution.py` 的 chat 一路显式传 `json_mode=False`；design-edit 保持缺省。

## 实测（修后，warm instance）

```
POST /v1/ai/chat HTTP 200
{"requestId":"chat-probe-once-3","capability":"real","text":"你好，我是小纳。有什么需要我帮你处理？",
 "usage":{"provider":"openai-compatible","model":"gpt-6-sol","modelClass":"balanced",
          "tokensIn":4583,"tokensOut":17,"cachedTokens":0,"latencyMs":14576.3,
          "costUsd":0,"toolCalls":1,"demoMode":false}}
```

## 实测（4 次同 payload，/v1/ai/run，prompt_cache_key=nexus-studio）

```
call#1 HTTP 200 (8861ms) · model=gpt-6-sol · tokensIn=6668 · cachedTokens=5321 (80%) · tokensOut=97
call#2 HTTP 200 (8952ms) · model=gpt-6-sol · tokensIn=6682 · cachedTokens=0 (0%) · tokensOut=93
call#3 HTTP 200 (6574ms) · model=gpt-6-sol · tokensIn=6664 · cachedTokens=0 (0%) · tokensOut=97
call#4 HTTP 200 (9842ms) · model=gpt-6-sol · tokensIn=6712 · cachedTokens=5366 (80%) · tokensOut=111
```

**同 payload 命中率在 wkapi.pro 是 per-worker，不是全球 prefix cache**：同一段 prompt bytes 经过它不同的内部 worker，命中与否取决于那一台 worker 此前是否服务过同字节序列的请求；`tokensIn` 在 ~50 以内也漂（不同 tokenizer build）。结论：本仓无法把 80% 钉成保证值，但从 0 → 稳定可追踪。

## 判据

- `pytest` Python **117 passed**（含新加一条：chat 路径 `calls[0]["json_mode"] is False`）
- `npm run typecheck:main` 未改动涉及 TS；未触
- `scripts/probe-prompt-cache.py` 的 L1/L2 供两个 callstack 仍 ≥1024 cached：5120 / 6272（6480B token 模板）

## 边界

- 本修复**没有改 cache 代码也没有改 token 计量**。cache 要在 request Prefix 稳定后自然显现；固定这一条就解决了「低命中率且一直非流」那一半神秘感——剩下的命中率只是装配/用法层的问题，**不是 wkapi.pro 特性**。
- 不提交 ai_service/.env（gitignored），不提交 key。
- 本片和 §AILIVE-4 §49/§93 三处独立修复互补，详见 `docs/CURRENT-STATE.md` 条目。
