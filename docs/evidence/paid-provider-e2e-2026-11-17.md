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
