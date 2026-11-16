# 2026-11-17 压力测试档案（cont. 156 / v786）

> 同 v779 的格式：每项的**环境、结果、结论、欠项**都如实记。没有 SLA，没有偷偷裁决竞争实例；先写 dev 路径，生产路径的欠项写在最后。

## 1 · ai-service `/healthz` 洪水（无业务库、无 LLM——纯队列+计数器）

| tier | 并发 | 请求 | ok | p50 | p95 | p99 | wall | req/s |
|---|---|---|---|---|---|---|---|---|
| baseline | 1 | 20 | 20 | 0ms | 16ms | 16ms | 0.30s | 67.3 |
| tier-16 | 16 | 160 | 160 | 62ms | 156ms | 203ms | 0.70s | 227.6 |
| tier-48 | 48 | 240 | 240 | 172ms | 593ms | 797ms | 1.23s | 194.5 |
| tier-96 | 96 | 288 | 288 | 359ms | 1093ms | 1438ms | 1.64s | 175.5 |

**708/708 200，零失败零超时。** 时延随并发近似线性排队，非崩溃；不堵对端、不虚耗连接。

## 2 · Web 登录撞库（`POST /api/auth/login`，假邮箱 ×5 轮 ×12 并发；错误口令 = 九的公开口令 123）

每一轮：**10 × 401（invalid_credentials）+ 2 × 429（rate_limited）**

判定闸：`rateKey('auth/login', ip, email.toLowerCase())` 上限 10 次/15 分钟/邮箱——并发撞上来时，第 11 笔起全部被挡。
（"撞库" 场景的正确形状：攻击者在**一个**邮箱上并发试口令，爆开的是这一道闸，而不是把库打挂；web 非 SQL 注入界面也照例被 zod 挡在外面。）

## 3 · Web `/api/pulse` 洪水（重 Postgres 聚合端点）· 修复前 → 修复后

| tier | 请求 | ok | p50 | p95 | p99 | req/s |
|---|---|---|---|---|---|---|
| baseline (before) | 10 | 10/10 | 62ms | 141ms | 141ms | 2.4 |
| tier-16 (before) | 48 | 48/48 | 718ms | 1235ms | 1360ms | 20.8 |
| tier-48 (before) | 96 | 96/96 | 3110ms | 5656ms | 5859ms | 14.3 |
| **baseline (after)** | 10 | 10/10 | **31ms** | **47ms** | **47ms** | **20.0** |
| **tier-16 (after)** | 48 | 48/48 | **547ms** | **750ms** | **813ms** | **26.9** |
| **tier-48 (after)** | 96 | 96/96 | **1437ms** | **2000ms** | **2188ms** | **29.4** |

**根因**：每请求 **15 条** count/sum/distinct 的 Promise.all，打 $maxPool=$5 连接池 → 96 请求排队 → 好像"系统慢了"，实则队死了连接池。
**修复**：30 秒 Redis 聚合缓存（`nexus:pulse:aggregate:v1`，key 带版本段；失败降级 = 读端重算，不藏 503；响应体逐字节不变）+ 进程内 in-flight 单飞（先登记后探测，先到先得）+ TTL 门（`platformPulseCached(now, load)` 可注入，4 用例钉 TTL/过期/飞行共享/失败释放）。
**开工效果**：tier-48 p50 **4.5×**、p99 **4.1×**，吞吐 14.3 → 29.4 rps，0 失败。tier-48 剩余开销是 **dev 路径 + vmmemWSL**（见 v779 同一条），不是应用侧 IO。
**生产路径定容欠**：`next start` + 同档重测（本机 free ≈ 1.1–2.5GB 出不了稳定构建）——与 v779 的欠项合并记录，不是"完成"。

## 4 · 行为纪律提醒（不许把本档当 SLA）

- 这三组全是**本机当日读数**：Windows + WSL2 + Docker（redis/postgres），单实例，无 CI 固定负载。
- 所有 failed=0 是"这一轮没崩"，不是"永远不会崩"；所有结论只适用于同形状压力。
- 撞库测量用的是**假邮箱**，没动真账号；没有压到真实 LLM 网关（那个钱的、且会让网关风控一起上场）。

RAW：`docs/evidence/stress-pulse-ai-2026-11-17.{json,md}`（healthz counts 原始分档、login 5 轮 status_counts、pulse flood 三表）。
