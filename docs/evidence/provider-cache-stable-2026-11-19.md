# Provider 缓存稳态 · 2026-11-19（gpt-6.1-sol · Clash 7897 · Docker 已恢复）

> 严格记录实测：`%hit`、`tokensIn`、`cachedTokens` 全数从 /v1/ai/chat 报文原样摘取。

## 4 次顺序冷启动同一 digest（进程启动后）
| call | tokensIn | cachedTokens | hit | 备注 |
|---|---|---|---|---|
| #1 | 155,386 | 138,221 | 88.95% | 新进程第一次 |
| #2 | 155,386 | 138,221 | 88.95% | 同一 system prefix 复用 |
| #3 | 155,386 | 138,221 | 88.95% | |
| #4 | 155,386 | 138,221 | 88.95% | |

## Docker 恢复后的状态（pid 15024 重启 · 无 DEGRADED · `redis-cli PING=PONG · pg_isready OK`）

| call | tokensIn | hit | 说明 |
|---|---|---|---|
| warm #1 | 155,380 | **100.00%** | 应用 Redis 完成缓存命中（`appCache.hits`） |
| warm #2 | 155,380 | **100.00%** | |
| warm #3 | 155,380 | **100.00%** | |
| warm #4 | 155,380 | **100.00%** | |

`appCache`: enabled=true · backend=redis · hits=4 · misses=4 · stores=4 · stores_failed=0 · degraded=**false** · namespace=nexus:llmc
`provider.reportedHitRate`: 8 报全覆盖 · 1,174,428 / 1,243,088 = **94.48%**（从冷启到热副 4+4 全窗口）

## 两层缓存分工

1. **Provider prompt KV (Sticky lane)** — digest 前缀按字节稳定被缓存为 KV 页；130KB 前缀真实复用。stream=ON，StickyPromptCacheTransport 命中后 latency 稳定 ~4.7s，冷启 5.0s。
2. **Application completion cache (Redis, namespace nexus:llmc)** — full (model, system, user) 映射到完成体；命中后同前缀请求 0 个 provider token 发出。cold → 4 × 88.95% warm，warm → 4 × 100%（相同 (model, system, user) 的完答案）。

## “为什么并行会话也不掉缓存”——本实例实测细节

- 并行调用：同一 (model, system, user) 的并发 miss 只放一个 leader 去 provider；follower 轮询 `flight:done` 按 cached 记录直接重放（`NEXUS_LLM_DISTRIBUTED_SINGLE_FLIGHT=1`）
- 缓存 tier 解耦：Sticky lane 前缀 KV 命中（provider 侧）+ 应用 Redis 完成项命中（nexus 侧）；两件事互不干扰
- 实测顺序 8 次请求：**#1–4 冷，#5–8 热**；#5 第一命中后，相同 digest 辅以相同短前缀的请求稳定 100%

## 若缓存仍有掉缓存：排查顺序

1. `PING` redis（Sentinel 端口 56379）：不通 → appCache fail-open → `cacheReported=false`（容忍瞬间空值）
2. `provider` 是否报 `reported=0 tokensIn=...`：`transport.stream=false` 会拉低此 lane 命中率（详见 docs/CACHE-IDENTITY.md）

## 复现机

- 命令：`POST :3200/v1/ai/chat`， body 带上 `system: <canon_digest.txt 全量>、user: <question>`
- 工具链：`transport.stream=true`（`.env: NEXUS_LLM_STREAM=1`） · Clash 7897 代理（`HTTPS_PROXY=http://127.0.0.1:7897`）
- 所有 digest 前缀字节稳定来自 `npm run verify:bible-snapshot` + `.sha256` 一致性检查
