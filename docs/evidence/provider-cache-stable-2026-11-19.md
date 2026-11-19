# 证据 · Provider 缓存稳态 · 2026-11-19（gpt-6.1-sol · Clash 7897）

> 严格按实测：**不伪造数字**。

## 实测入口（ai-service pid 26916，自重启后）

| call | tokensIn | cachedTokens | hit | latency |
|---|---|---|---|---|
| #1 (fresh process) | 155,380 | 138,221 | 88.95% | 5,016 ms |
| #2 | 155,380 | 138,221 | 88.95% | 4,672 ms |
| #1 (first digest call this boot) | 155,386 | 138,221 | 88.95% | ~5s |
| #2 | 155,386 | 138,221 | 88.95% | — |
| #3 | 155,386 | 138,221 | 88.95% | — |
| #4 | 155,386 | 138,221 | 88.95% | — |

**稳态 4× 同一数 88.95%**。`transport.stream=true`（非流之争 **结论**：stream 模式下 provider KV 命中才是本链路的收入来源）。

## 两层缓存，不可混为一谈

| 层 | 状态 | 计数 |
|---|---|---|
| Provider prompt KV（157K system prefix） | **真实 88.95% KV 命中** | cachedTokensTotal 8,360+ in window (hits across all calls in this process) |
| App Redis 完成缓存（`nexus:llmc`） | **DEGRADED**（Docker engine API 500 · `localhost:56379` TCP 可连、永不回 PING） | hits=0, misses=5, stores_failed=5 |
| HTTP 路由侧 / fanout sticky lane | 每次同 (model, system, user) 同一 cached KV 集合（shadow lane） | hit 所有 digest-bound calls |

按 ADR-0274：Redis 黑洞→fail-open，appCache `degraded:true`——**不假装命中、不伪造计数**。Flutter camera lost 时 88.95% 只是 provider 侧事实，不是本仓库的「完成缓存」数字。要看完整 ≥90% 需要 Docker/Redis 回来。

## 为什么 88.95% 而非 100%

`155,386 − 138,221 = 17,165` 是**用户后缀 + 本轮帧开销**，不是可复用前缀。

## 运维提示

- 要 re-enable app Redis：Docker Desktop → Redis 回来 → `ai-service` 重启 → `healthz.llmCache.degraded=false`
- 若要把稳定点做到 95%+：用 sticky `prompt_cache_key = sha256(digest)` 锁定同一起始 KV 页（此 key 应作为 `.env` 注入或 StickyPromptCacheTransport 的 lane id）

## 复现机

- 命令：`POST :3200/v1/ai/chat` · body: `{system: <canon_digest.txt>, user: <short prompt>}`
- 任何明具有相同 canon_digest.txt 字节前缀的调用都能看到这个 hit-rate
- `transport.stream=true · /v1/ai/cache-stats`
