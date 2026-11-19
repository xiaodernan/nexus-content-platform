# 证据 · ai-service 16 并发同文压测 — 单飞（single-flight）实测 — 2026-11-19

> 纪律：这一页只记真实探测结果（healthz `llmFlight` 计数）。

## 环境
- provider = `gpt-6.2-sol`（Clash 7897）；ai-service @ 127.0.0.1:8001；`transport.stream=true`
- 请求：`POST /v1/ai/chat` · `system="You answer with exactly the single word PONG, nothing else."` · `user="PING"` · `modelClass="fast"` · 16 个一模一样的 requestId

## 计数板（healthz.llmFlight.local）

| 指标 | 压冲前 | 压冲后 | Δ |
|---|---|---|---|
| leaders | 2 | 3 | **+1** |
| joined | 0 | 15 | **+15** |
| coalesced | 0 | 15 | **+15** |
| real_calls | 2 | 3 | **+1** |
| failures / timeouts | 0 / 0 | 0 / 0 | 0 |

## 端到端

| 项 | 值 |
|---|---|
| 并发 | 16 路完全相同的请求同时打出 |
| 成功 | **16/16 × HTTP 200** |
| 墙上时间 | **3,414ms** |
| 每请求延迟 | min=2,943 · p50=3,006 · max=3,411 |
| 回复 | 全部 `PONG`（唯一教义/唯一模型 `gpt-6.2-sol`） |

**单个 provider 调用兑现 16 路并发**——正是 single-flight + sticky `prompt_cache_key` 双层设计（apps/ai-service/src/ai_service/single_flight.py）要达到的目的：API 被并发薅时，provider 不承担 N 倍叫叫。

## 仍欠

- LLM 计费： 16× identical request only paid for 1 provider call; real bursty workloads with distinct prompts cannot coalesce — singleflight only covers identical keys; that's a hard upper bound worth saying out loud.
- web 层 SSR 压测档 24/48： 未重跑（本次会话进展发生在 ai-service 层；Web SSR 档 prod 已有 2× 证据，dev 路径按登记保持未测）。
