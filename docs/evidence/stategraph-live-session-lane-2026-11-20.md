# 证据 · `/v1/ai/chat-graph` 真机复核（gpt-6.2-sol + 会话级 cacheLane） — 2026-11-20

## 纪律

本文件只记录本次会话实测；不冒充其他 lane、不把推断写成测量。命令/响应数字来自当前工作树合并收口后（`29afd9c9`）的本地 ai-service。

## 环境

- 当前 HEAD：`29afd9c9`（包含 `00668e43` 合并与 ADR-0297 文档增量）。
- 服务：`NODE_OPTIONS= PYTHONPATH="D:/终极项目/apps/ai-service/src" /tmp/nexus-ai-venv/Scripts/python.exe -m uvicorn ai_service.app:app --host 127.0.0.1 --port 8001`。
- `/healthz` 实测：provider llm `openai-compatible` / `status=real` / `models=["gpt-6.2-sol"]`；embedding/image/video/speech 仍如实 unavailable。
- Redis 56379 正在监听；缓存后端 `redis`，namespace `nexus:llmc`。

## 实测请求

两轮同会话负载（仅 `requestId` 不同）：

```json
{
  "requestId": "live-session-lane-001|002",
  "system": "你是《低语诸王》的问典助手。只回答：灯是谁照看的？用中文一句话。",
  "user": "灯是谁照看的？",
  "modelClass": "balanced",
  "cacheLane": "live-proof-session-A"
}
```

`POST http://127.0.0.1:8001/v1/ai/chat-graph`，两轮均 HTTP 200，响应头 `x-nexus-orchestration: stategraph`。

| 轮 | model | capability | text | tokensIn / cachedTokens | latencyMs | provider cache |
|---|---|---|---|---|---|---|
| #1 | `gpt-6.2-sol` | `real` | 灯由守灯人照看。 | 4416 / 4416 | 3.299 | `cacheReported: true` |
| #2 | `gpt-6.2-sol` | `real` | 灯由守灯人照看。 | 4416 / 4416 | 3.660 | `cacheReported: true` |

两次回答逐字一致；`toolCalls: 1`；`demoMode: false`。

## 服务侧 cache-stats（两轮后读）

```json
{
  "prefix": {"requests": 4, "reused": 3, "uniquePrefixes": 1, "capacity": 512, "evictions": 0, "reuseRate": 0.75},
  "appCache": {"enabled": true, "backend": "redis", "hits": 3, "misses": 1, "stores": 1, "stores_failed": 0,
               "evictions": 0, "hit_rate": 0.75, "shared": true, "degraded": false, "namespace": "nexus:llmc"},
  "provider": {"reported": 3, "missing": 1, "cachedTokensTotal": 13248, "promptTokensTotal": 13248,
               "reportedHitRate": 1.0},
  "upstream": {"comparable": 1, "observed": 4, "drifted": 0, "capacity": 256, "evictions": 0, "maxDrift": null, "band": 0.1},
  "transport": {"stream": true}
}
```

说明：

- `provider.reportedHitRate=1.0`、`cachedTokensTotal==promptTokensTotal==13248` 是本次请求中上报缓存命中的读数；不是对所有历史流量的承诺。
- `appCache.hit_rate=0.75` 是服务进程累计（含此前探针），两轮自身在 L2 上先 miss 后 hit；provider 侧两次均全量命中，符合“L2 不吞掉会话 lane、provider 前缀缓存仍工作”的设计。
- `transport.stream=true`：当前配置 `NEXUS_LLM_STREAM=1`，该端点以非流 JSON 返回，但 provider 传输仍标记为 stream。

## 结论与边界

- 会话级 `cacheLane` 已在真 provider / 真状态图路径上通过：同 lane 两轮均返回真实 `gpt-6.2-sol` 输出，且 provider 缓存自报全量命中。
- 本证据不宣称“稳定 90%”一类的泛化命中率；只声明这次双轮读数。
- 若要在并行会话场景量化隔离收益，需另跑 A/B 多会话交错实验；本次没有做，不冒充已做。

## 相关

- ADR-0296（会话级 prompt cache lane）
- `docs/evidence/stategraph-live-verify-gpt62-2026-11-19.md`（上一版真机快照）
- `docs/evidence/cache-ab-parallel-2026-11-19.md`（历史并行 A/B）
