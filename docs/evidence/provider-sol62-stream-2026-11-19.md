# 证据 · gpt-6.2-sol 真链路 · 2026-11-19（晚）

> 用户命令指定切换：`model: gpt-6.1-terra` → `gpt-6.1-sol` → **`gpt-6.2-sol`（最新指令）**

## 直连（经 Clash Verge 127.0.0.1:7897）

每条请求都带 `.stream` + 自带的 `include_usage=true` 标，能拿到 provider 报回的 `cached_tokens`。

| call | status | prompt_tokens | completion_tokens | cached_tokens |
|---|---|---|---|---|
| #1 | 200 | 155,657 | 8 | **138,460 (88.95%)** |
| #2 | 200 | 155,657 | 8 | 138,460 (88.95%) |
| #3 | 200 | 155,657 | 8 | 138,460 (88.95%) |
| #4 | 200 | 155,657 | 8 | 138,460 (88.95%) |

回复语料（四次）都返回了 `DIGEST-OK`。cacheReported=true。

## 入站（ai-service · /v1/ai/chat）

- 启动 log：`[dotenv] Loaded from apps/ai-service/.env, NEXUS_REDIS_URL='redis://localhost:56379/5'`
- `/healthz` → `llmLive.state=ok · probes=1`（Startup probe 通过）
- `POST /v1/ai/chat` → `200 OK · capability=real · model=gpt-6.2-sol · cachedTokens=4180 (95.0%)`
- `POST /v1/ai/chat-graph` → `200 OK · GRAPH-OK · 4180 cached (95.0%)`
- `POST /v1/ai/chat · tokensIn=155,657 · cachedTokens=138,460 · 88.95% hit`

## 关键纪律

- 流式（`stream=True`）实测 88.95% KV 命中（stream 不是非流的标识；cached_tokens 依然回报）
- sticky prompt_cache_key 钉住了相同 system，模型切换也让 cache 88.95% 稳定
- 旧 gpt-6.1-terra 渠道 10:00 起被撤，新渠道 6.2-sol 7×24 通

## 复现

本文件**不**抄 key。`.env.example` 已经把密钥设成**占位空值**，
开发者在本地用 `apps/ai-service/.env`（gitignored）填入真实 key 即可。

> `https://api.aizzz.xyz/v1/chat/completions` 模型 `gpt-6.2-sol`，
> `Authorization: Bearer <从 .env 读>`，经 `HTTPS_PROXY=127.0.0.1:7897` 走 Clash 节点。

## 影响面

- `ai_service/config.py`：当前 4 档模型全 `gpt-6.2-sol`
- `.env`: 不挂 key in git · 4 档已是 gpt-6.2-sol（Clash 出网有效，redis 5/8 通）
