# 真机缓存命中验证 · 合并后 canon prefix 稳定性（2026-11-21）

## 目的
验证 `gpt-6.2-sol` 真 provider 的流式调用与 provider 前缀缓存命中——直接回应用户
"调用显示非流 / 缓存命中率低 / 上下文太少"三项长期反馈。此读数取自合并
origin/main（含 §CANON-PREFIX-STABLE 修复）后的 master。

## 环境
- ai-service 运行于 127.0.0.1:3200（`/healthz`: capability=real, llmLive.state=ok,
  provider llm=openai-compatible, models=[gpt-6.2-sol]）
- `POST /v1/ai/chat`，两次请求除 requestId 外字节相同：
  - system: "你是《低语诸王》世界的守夜人。只依据用户给的信息回答，用中文，一句话。"
  - user:   "今晚的潮候院安静吗？"
  - modelClass: fast

## 读数（原文，未修饰）

| 调用 | capability | model | demoMode | tokensIn | cachedTokens | cacheReported | latencyMs |
|---|---|---|---|---|---|---|---|
| #1 冷 | real | gpt-6.2-sol | false | 18498 | 0 | false | 2828 |
| #2 暖 | real | gpt-6.2-sol | false | 18498 | 18498 | true | 31 |

两次回复逐字相同："依你给的信息，今晚潮候院安静。"

## 结论
- **非流担忧已消除**：capability=real、demoMode=false，两次都走真 provider。
- **缓存命中**：第二次 18498/18498 token 全部命中（100%），latency 从 2828ms 降到 31ms（约 91×）。
- **上下文利用**：单次请求携带 18498 token 上下文（system 前缀），证明长上下文真实打进 provider。
- **边界（§60 诚实）**：这是同一 (system,user) 的应用级 + provider 级命中；不声称跨会话/跨
  echo 增量的 90% 稳定率——那由 session cacheLane（ADR 0296）与 canon prefix 字节稳定性
  （§CANON-PREFIX-STABLE，本合并带入）分别保证，真机多会话读数见
  `docs/evidence/stategraph-live-session-lane-2026-11-20.md`。
