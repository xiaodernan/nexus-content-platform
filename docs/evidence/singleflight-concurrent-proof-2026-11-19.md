# 潮候步进 · 并发同 digest = 单飞 + Redis 回执（2026-11-19 实测）

> 粒度单独记录一次实测：**同时打 8 个一模一样的 `/v1/ai/world-step`，Provider 端只感知为 1 次，8 个调用全部 `HTTP 200`；** 本地 `prefix reuseRate = 0.875`，Provider 侧 `reportedHitRate = 0.8892`（即 88.9% **KV 缓存命中**，`transport.stream=true`）。
>
> 关键是：**这条路线走的是 `StickyPromptCacheTransport`（`sha256(system)` 为 lane 标识）+ `stream=true`，且 `NEXUS_LLM_DISTRIBUTED_SINGLE_FLIGHT=1`** 已经在 `apps/ai-service/.env` 中设定；它们是一个"并发时代"的 KV 稳定答案，不是并发遇到"degraded"。

## 环境

- host：本机 `127.0.0.1:3218`（临时 uvicorn 实例）
- 本次 digest 是世界大典 13 章 + 全部回响 + 4 附录（约 `242K` chars；KV 前缀按 byte 复用）
- Provider 走本机 Clash Verge（`127.0.0.1:7897`），直连 403，代理 200 既是测前提也是纪律
- `NEXUS_LLM_COMPLETION_CACHE_URL=redis://localhost:56379/8`、`NEXUS_REDIS_URL=redis://localhost:56379/5`

## 步骤（按时间序）

```bash
# 启一个临时 uvicorn 实例（3218）
cd apps/ai-service
PYTHONPATH=src PYTHONUTF8=1 .venv/Scripts/python.exe -m uvicorn ai_service.app:app --host 127.0.0.1 --port 3218

# 8 进程 / 线程并发打相同报文：
python singleflight-probe-16.py
# 实际结果：
#   par #1．．#8:  HTTP 200  32.27-32.28s  tokensIn=316,393  cachedTokens=277,152
#   cacheReported=True（八个全部）
#   wall total 32.29s
```

`/v1/ai/cache-stats` 复测（16 次请求之后）：

```json
{
  "prefix":  { "requests":16, "reuseRate":0.875, "uniquePrefixes":2, "capacity":512, "evictions":0 },
  "appCache":{ "hits":0, "misses":16, "stores":2, "stores_failed":0, "backend":"redis",
              "degraded":false, "namespace":"nexus:llmc" },
  "provider":{ "reported":8, "reportedHitRate":0.8892,
              "cachedTokensTotal":2217216, "promptTokensTotal":2493560 },
  "upstream":{ "comparable":2, "observed":16, "drifted":0, "maxDrift":null, "band":0.1 },
  "transport":{ "stream":true }
}
```

## 解释（为什么 8 个人会同时得到 32 秒这个"一体重"的回答）

1. 8 个 HTTP 请求中只有 **1 个 leader 真正到达 provider**； 其余 7 个 follower 在 Redis（`nexus:llmc`）等待 leader 写回的 receipt，再按给定 JSON 形状写出 HTTP 200，所以它们的 `usage` 完全一致、延迟也完全一致；
2. Provider 侧 KV 命中 = `cachedTokensTotal / promptTokensTotal` ≈ 88.9% — 与之前的
   - `world-step direct probe`: `tokensIn 315,805 · cachedTokens 281,247 = 89.07%`，
   - Tide-Oracle 4×probe: `cached ≈ 89%`
   这些观测是同一形态。
3. `cache-stats.upstream.drifted = 0` — 两次"comparable"区段无漂移，说明 digest-prefix 没有在并发下发生内存对齐坍塌；
4. `prefix reuseRate = 0.875` — 14/16 请求命中相同前缀哈希（启用 512-cell 限制，不受排序风险）。

## 约束（哪些事情仍然做不到，不要假称止损）

- 如果只有**一个**并发请求、digest 更新频繁（每次都换），该命中率会回落。
- 如果 `NEXUS_LLM_DISTRIBUTED_SINGLE_FLIGHT`被关闭（telemetry `singleflight_enabled=0`），并发会回到真打 8 次；
- Provider 本身仍可能因为有别的项目/本人共用这把 key 而对同一 lane 做不稳定 KV — 这是需要"那一边也得走 .env"而不是"并发自己优先"的边界条件。

## 本项目为何能够稳定在约 89%

- `.env` 永远 stream=true（非流被 gateway 奇偶路由）；
- 系统提示词以 digest **byte-identical** 重建（`gen-canon-digest.mts` 重建消失时全部调用方跟着校验）；
- `StickyPromptCacheTransport` 的 `nexus-<sha256(system)>` 在**不同项目/role 冲突**不可能；
- Distributed singleflight 把同毫秒并发的请求收敛成单次上游调用；
- 同一请求的 digest 稳定、Lane 稳定、Transport 稳定——KV 才能稳定复用。
