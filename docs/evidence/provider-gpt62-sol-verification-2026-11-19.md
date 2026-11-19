# 证据 · gpt-6.2-sol 全链路复测 — 2026-11-19（用户在本会话切换模型：gpt-6.1-sol → gpt-6.2-sol）

> 纪律：这一页只记真实探测结果。切换发生于本会话（ai-service 已按用户新指令签于题中），未经测试不发出去。

## 1. 服务恢复记录

- 用户在消息尾部明示：**已经更换模型名为 `gpt-6.2-sol`**。本会话直测：
- `.env` 四条 `NEXUS_MODEL_*` 全部改为 `gpt-6.2-sol`（gitignored，未入库）。
- ai-service（127.0.0.1:8001）按 ADR-0274 以 `HTTPS_PROXY=http://127.0.0.1:7897` + `AI_SERVICE_ALLOW_DEGRADED_STORE=1` 重启；**Redis（56379）已恢复**，healthz：`queue.backend=redis` · `llmCache: backend=redis shared=true degraded=false hits=0` · `llmLive.state=ok probes=1`。

## 2. 探测结果（Clash 7897；`POST /v1/chat/completions`）

| 探针 | 结果 |
|---|---|
| tiny（max_tokens=8） | **200** · PONG · prompt_tokens=4,392（与此前同代一致） |

## 3. 全 digest（241,652 chars · E157 · tokensIn≈156K）三轮实测

| 轮 | status | ms | tokensIn | cached | 命中率 |
|---|---|---|---|---|---|
| service 冷启动 #1 | 200 | 6,461 | 155,923 | 7,424 | 4.8%（新 sticky lane） |
| service 暖车 #2 | 200 | **36** | 155,923 | **155,923** | **100%（appCache 命中——provider 零调用）** |
| service 暖车 #3 | 200 | 54 | 155,923 | 155,923 | **100%（appCache）** |

`/v1/ai/cache-stats`：`transport.stream=true` · `appCache: hits=2 misses=1 stores=1 stores_failed=0 degraded=false`（Redis 腿完整活）· `provider.reported=3` · `reportedHitRate=0.6825`（含冷场计入）。

**Redis 恢复后双层缓存首次同时实测活为**：provider 前缀 KV（冷 7,424 → 醒车这跑 155,923 = 100%）与 appCache 完整答整体命中（36/54 ms 返回）。

## 4. 跟踪源码的模块名归一

`gpt-6.1-sol` → `gpt-6.2-sol` 统一替换：`apps/ai-service/.env.example`、`apps/web/src/lib/guideCopy.ts`（用户手册「调用时打 gpt-6.2-sol」措辞同步）、六套 `*-behavior.test.ts` fixture 字符串。**未触碰**：`docs/evidence/*` 与 `docs/adr/*` 的历史证据文件逐字保持原样（它们记录"当时测得"，改字就是改账）。

## 5. 用户侧仍需处理（如实）

- `gpt-6.1-terra` 渠道被撤这一事实没有变化（/v1/models 仍不提供）；当前真模型一律 `gpt-6.2-sol`。
- Docker Desktop 引擎在本会话早些时候已经恢复（careeros/football_os 等 container 已健康），`nexus-redis` 与 `nexus-postgres-alt` 皆 Up——本页第 3 节的 appCache 命中是真 Redis，不是 DEGRADED-BOOT 路径。
