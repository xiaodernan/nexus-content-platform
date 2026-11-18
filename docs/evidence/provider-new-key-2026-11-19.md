# Provider 切新 key + 黑洞 Redis 硬化（2026-11-19，cont.393）

## 用户指令（2026-11-19）

"大模型的api已经修改了 记得换新的地址和秘钥 用这个新的。……注意现在大模型的api已经修改了 记得换新的地址和秘钥 用这个新的。这个内容 如果打不进去可以检查可能是网关配置或者梯子的问题…… 走我这个clash verge就行"

新 key（用户 2026-11-19 口述；**从不落盘、不入库、不打印**）：已切到 `apps/ai-service/.env`（gitignored；`.env.example` 未触碰）。
Base URL 不变：`https://api.aizzz.xyz/v1`；模型不变：`gpt-6.1-terra`（FAST/BALANCED/REASONING/VISION 同值）。
Clash Verge 代理不变：`HTTPS_PROXY=http://127.0.0.1:7897`（直连 403「本站不对您所在的国家及地区进行商业服务」，地域级拒绝）。

## 实测（2026-11-19，本机，新 key）

| 探针 | 结果 |
|---|---|
| `GET /healthz` | `llmLive.state=ok · probes=1`（后台 liveness 探测走 Clash 节点，新 key 真实可用）· `llmLatency.avg_ms=10219`（1 次探测） |
| `POST /v1/ai/chat`（`modelClass=fast`） | 200 · `capability=real` · `model=gpt-6.1-terra` · `text="READY."` · `tokensIn=4407 · tokensOut=6 · cachedTokens=0 · cacheReported=false` · `demoMode=false` |
| `POST /v1/ai/chat-graph`（同请求，StateGraph 编排） | 200 · `capability=real` · `text="GRAPH-OK"` · `tokensIn=4397 · cachedTokens=0` |
| `GET /healthz` → providers.llm | `status=real`（openai-compatible） |
| `GET /healthz` → queue | `backend=memory` + note：**【DEGRADED-BOOT】Redis 连不上（TimeoutError）**（ADR 0274 的名牌，绝不是静默降级） |

两条车道都跑通；`cachedTokens=0` 是因为 Redis 已死（见下），不是 provider 报的错。

## 本机 Redis 已死（2026-11-19 起）

- `redis-cli ping` 路径全部黑洞：`localhost:56379` —— TCP 可连（Docker Desktop `wslrelay` + `com.docker.backend` 仍在监听），但永不回包；Python redis 客户端实测 2s/5s 超时全部 `TimeoutError: Timeout reading from localhost:56379`。
- `docker info` / `docker ps` 均返回 **500 Internal Server Error**（Docker Desktop Linux engine 挂了/被 OOM？本机空闲内存 ~2.5GB）。
- 未重启 Docker Desktop：本机运行 careeros-* / nexus-seed-verify 等其它项目的容器，**属于他人的产物，不动**（AGENTS.md 纪律：先确认，且重启 Docker 会中断它们）。

## 黑洞故障硬化（本次提交）

从前 `from_url` **没有任何 socket 超时**——WSL/Docker relay 黑洞会让 ai-service 启动卡死在 `RedisJobStore.connect().ping()`，也让 CachedLlm 的每次 cache.get 挂死 provider 路径（即便代码早有 fail-open 语义，超时从未被触发就没有 fail-open 可言）。

- `providers/registry.py`：cache 客户端 `socket_connect_timeout=2 · socket_timeout=2` → 读/写/单飞 全链 fail-open，每次调用最多 2s 缓存开销。
- `jobs.py` `RedisJobStore.connect`：`socket_connect_timeout=3 · socket_timeout=3` → 连不上即抛 TimeoutError；本地 dev 可按 ADR-0274 以 `AI_SERVICE_ALLOW_DEGRADED_STORE=1` 显式 opt-in 走内存后端（healthz 会明牌写 DEGRADED-BOOT；生产禁止）。
- 本实例启动使用 `AI_SERVICE_ALLOW_DEGRADED_STORE=1`（仅进程 env，未写入 .env）。

## 影响与后续

- 本boot 内 LLM 调用全部真实打到 provider，**缓冲命中=0**；缓存稳定性证据（≥93.8%）恢复依赖 Redis/Docker 恢复，届时 CachedLlm 自动回到 fail-open 之前的稳态（Redis 20M+ keys 状态未丢失——黑洞只是读不到）。
- 用户侧待办：重启 Docker Desktop（engine API 恢复 200 后，`curl redis-cli -h localhost -p 56379 PING` 应回 PONG；ai-service 重启即回到 append-only 内存? 不——回到 RedisJobStore，无须任何代码变更）。
- 密钥管理提醒（沿用先前同类提醒）：新 key 通过对话明文出现；如长期使用请确认该 key 的权限与轮换计划；`.env` 未被 git 跟踪（`git check-ignore` 通过）。

## 验证

- ai-service 两个硬化文件：`jobs.py` / `providers/registry.py`——本 boot 已实测（uvicorn 冷启动 3s 内完成，不再卡死）。
- fe-gates 不涉及 ai-service；web 侧 provider 走 ai-service HTTP 契约（未改契约，schema 零变更）。
