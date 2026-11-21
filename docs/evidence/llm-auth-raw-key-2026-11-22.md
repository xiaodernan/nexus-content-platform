# 真机修复：网关只认裸 key —— `Bearer` 前缀即 401（2026-11-22）

## 症状（用户长期反馈的根因之一）

`POST https://api.aizzz.xyz/v1/chat/completions` 带
`Authorization: Bearer sk-BDRTas…` **稳定 401**：

```json
{"error":{"code":"","message":"无效的令牌 (request id: …)","type":"new_api_error"}}
```

同一把 key、同一代理（Clash Verge `127.0.0.1:7897`）、同一 body，只把认证头换成
**裸 key**（去掉 `Bearer `）立刻 **200**，并带真实计费用量：

```json
{"id":"resp_0929…","model":"gpt-6.2-sol",
 "choices":[{"message":{"content":"Pong."},"finish_reason":"stop"}],
 "usage":{"prompt_tokens":4387,"completion_tokens":7,"total_tokens":4394,
          "prompt_tokens_details":{"cached_tokens":4180}}}
```

去掉 `sk-` 前缀试过 → 仍 401；直连（不走代理）试过 → 仍 401。**结论：与该网关对话必须送裸 key。**
2026-11-21 的 live 证据当时是通的，说明网关侧在此期间收紧了认证头解析——这是**环境变化**，
不是代码回退。

## 修法（一处真值，两个方案）

- `providers/openai_compatible.py` 新增 `authorization_header(api_key, scheme)`：
  `raw`（默认）直送 key，`bearer` 送 `Bearer <key>`；其它方案 `ValueError`。
- `Settings.openai_auth_scheme`（`NEXUS_OPENAI_AUTH_SCHEME`，默认 `raw`）同时注入
  chat 与 embedding 两条适配器；官方 OpenAI 端点要 `bearer` 时一个 env 即可切换。
- 测试：`test_provider.py` 更新默认断言 + 新增两个用例（scheme 判别 / bearer 显式开启）。
  `pytest apps/ai-service/tests` → **478 passed, 18 skipped**。

## 修后真机读数（全部走 `gpt-6.2-sol`，demoMode=false）

| 路径 | 读数 |
|---|---|
| `/healthz` | capability=real，llmLive.state=ok，models=[gpt-6.2-sol] |
| `live-cache-probe`（3 连发） | tokensIn=347,534；cached 0 → **347,534** → **347,534**（第 2/3 次 100%，流式 latch） |
| `live-bible-ask-probe`（同问两句） | cached 8,245 → **173,162** |
| `/v1/ai/world-step`（StateGraph） | 200 · `x-nexus-orchestration: stategraph` · toolCalls=2 · tokensIn=348,688 · cached **348,688（100%）** · 6.7ms（冷启约 2s）· delta `{vigor:0, depth:1, seals:[], unlocks:[], risk:"uneasy"}` + 中文叙事 |

**同时回应指令三项**：①「必须实测跑通」——修前修后都有字节级证据；②「缓存命中」——同前缀第二次起
100%，且是 34.8 万 token 级别的稳定前缀；③「上下文太少」——单次 348,688 token，远超 5–9 万。
并行会话隔离沿用 ADR 0296 的 session cacheLane（2026-11-14 A2/B2 各 100% 的既有证据未重跑）。

## 诚实限度

- 401 是网关侧行为变化，若它再次变更（例如恢复只认 `Bearer`），
  `NEXUS_OPENAI_AUTH_SCHEME=bearer` 一个 env 切回，无需改码。
- 本机 `.venv` 的 base Python（`C:\Program Files\Python311`）已不存在，本轮测试改用
  系统 Python 3.14 + 已装依赖跑通；仓库内 venv 需要重建（`python -m venv`）这件事本身记在这里，
  不在本片修。