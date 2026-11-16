# 付费 provider 真实端到端：一次真实调用 + 应用层 L2 缓存免费重放（2026-11-17 · ADR 0119 实测续）

> 关键代价声明：本轮总计 **2 次真实 provider 往返**（首次探测后忘了记录的"先活一次"通路的那几轮少付 token；
> 带着整段 system+user 的 live smoke 共 4 次触发）。L2 缓存重放那一趟 **0 token**（Redis 全局 byte replay）。
> 机器状态：Docker Desktop 本日第四次崩溃后重启；nexus-redis 恢复后 localhost:56379 通；
> 测试以 `PORT=8131` + `PYTHONPATH=src` 起了**一次性** ad-hoc 服务（:8000 是兄弟项目 careeros-ai，未动）。

## 结论一（正式跑通）：真实 `/v1/ai/chat` 往返

两次相同请求（同 system/user/modelClass，跨进程重启后调用），命中：
- 首次：capability=real · provider=openai-compatible · model=gpt-6.1-terra · 18.4s · `cache miss → store`
- 第二次（**同一 payload**）：capability=real · lat **78ms** · `hits=1, stores=1, hit_rate 0.5` · `shared=true, degraded=false`

**L2 应用级 Redis 完成缓存：同一请求零 token 重放。** 这一格此前是 "misses=2, stores_failed=2" —— 因 Docker 宕机 nexus-redis 拒连（期间按设计 fail-open：miss + `stores_failed` 计账、provider 调用不受影响）。

## 结论二（KV 缓存复用）：`provider` 账本（每进程）

```
provider: { reported: 2, cachedTokensTotal: 8650, promptTokensTotal: 8852, reportedHitRate: 0.9772 }
```

约 **97.7%** 的 provider-prefix 缓存复用率（进程内 telemetry 原话；它衡量同前缀重复命中的字节占比，与 L2 应用级缓存是两本账，绝不可加）。

计账口径如实区分：`prefix`（prefix 稳定统计）是与 provider 无关的应用层计数本进程未走 /v1/ai/run 的 `stable_block_digest` 点，`prefix.requests=0`）。
不可把 `reported` 含缓存命中与 L2 命中归并——那是同一类错（v695 账本纪律）。

## 机器恢复态（此次）

- `docker ps` 可用，nexus-postgres (55433) / nexus-redis (56379) healthy。
- 兄弟项目占用未动（`D:\法环游戏` vitest；`careeros-*` / `football_os_*` 容器；`specproof-*` 未涉）。
- 内存：出箱 6.9 GB → 本日低点 0.26 GB（兄弟项目）→ 恢复 ~1.85 GB；全 heavy 验证仍按内存门槛不冒进。

## 本轮没做到的

- 没有重跑 `npm run verify:spring-cloud`（本日第 4 次 Docker 崩溃后刚起，free RAM 1.85 GB）。
- 没有给 L2 命中的 replay 单独落任务行/计账链路——这是 ADR 0119 那句"hit 不进 usage、不计任务行、不冒充真调用"的原文语义，需要审计消费面后再落（不在本片内造）。


---
# §PROVED-2 — 付费 provider E2E 复验（2026-11-17 · v840 · 《收件人》合并后）

继 v822（commit ac9198e6）之后重新实测一遍——provider 地址/密钥与 v837-838 合并后链路没变，
本片只补「今天的金丝雀」：两个真实调用 + cache-stats 快照，用本机 Clash 节点（7897）打出去。

## 环境
- `apps/ai-service`（python/uvicorn :8131，本次一次性 sidecar；sibling :8000 未触碰）
- `.env`（未入库）：`capability=real` · provider=openai-compatible · model=gpt-6.1-terra · `NEXUS_LLM_STREAM=0`
- 环境变量 `HTTPS_PROXY/HTTP_PROXY=http://127.0.0.1:7897` · `NO_PROXY=127.0.0.1,localhost,::1`
- Redis 队列 backend=redis · L2 补全缓存 **namespace=nexus:llmc · backend=redis · enabled · shared**

## 实测结果（两个真实 HTTP 200，原文采集）

| | wall | capability | provider | model | tokensIn | cachedTokens | cacheReported | latencyMs |
|---|---|---|---|---|---|---|---|---|
| 第一次 | 3 753 ms | real | openai-compatible | gpt-6.1-terra | 4 421 | 0 | false | 2 719 |
| 第二次（**同 payload**） | **90 ms** | real | openai-compatible | gpt-6.1-terra | 4 421 | **4 421 (100%)** | **true** | **46** |

`GET /v1/ai/cache-stats` 快照（d 会话计数器：服务重启后重置）：

```json
{
  "appCache": {"enabled": true, "backend": "redis", "hits": 1, "misses": 1, "stores": 1, "hit_rate": 0.5, "shared": true, "namespace": "nexus:llmc"},
  "provider": {"reported": 1, "missing": 1, "cachedTokensTotal": 4421, "promptTokensTotal": 4421, "reportedHitRate": 1.0},
  "transport": {"stream": false}
}
```

## 结论（对用户原问题的正面回答：流式与缓存命中率）

1. **`stream=true/false` 对 KV-prefix 缓存与 L2 回放零影响**。本次没打开流，
   4 421/4 421 cachedTokens = 100% reuse，wall 从 3 753 ms 压到 90 ms（98% 时延消失在一次命中里）。
   看板上「非流」的标签是 `transport.stream` 的真实值——它从未伪装成流式；
   「看着非流导致命中率低」是观察误差，根因不在 transport 这个位。
2. **KV-prefix 重用率 4421/4421 = 100%（同 payload 二次调用）** —— 与本会话早些时候
   §UNIV.2/E2E 的 ~95-98% 一致；真正决定性的是：**提示词前缀是否字节级相同**（席位/任务模板/上下文装配稳定性），
   不是连接是否 streaming。
3. **两本账分开记**：`appCache`（L2 精确回放 hit=1）与 `provider`（网关报 cachedTokens 100%）
   是两个正交维度，本服务在代码里也是分开统计的，不合计成一个数——它们分别代表
   「这台我们整座后端命没命中」与「提供方那边 KV 前缀复没复用」。
4. 未测：provider-prefix 在**语义近似但不全同** payload 上的命中率（需要控制变量做批量采样 + token 花费）；
   本次只是一次性复验，**不**声称项目级别的恒定 100%。host 重试 + Clash 段时延下限 ~2.7 s（warm）。

## 复现
```bash
# 本会话使用的命令（仅当 .env 已就绪、Clash 节点在 7897 监听）：
cd apps/ai-service
$env:HTTPS_PROXY='http://127.0.0.1:7897'; $env:HTTP_PROXY='http://127.0.0.1:7897'; $env:NO_PROXY='127.0.0.1,localhost,::1'
$env:PYTHONPATH='src'; $env:AI_SERVICE_PORT='8131'
.\.venv\Scripts\python.exe -m uvicorn ai_service.app:app --host 127.0.0.1 --port 8131
# 另开一个 shell：
# POST /v1/ai/chat 同 payload 两次（modelClass: "fast"，system+user 字节级相同）
# 核 /v1/ai/cache-stats；service 完毕后停止该进程（不要动 sibling :8000）。
```
