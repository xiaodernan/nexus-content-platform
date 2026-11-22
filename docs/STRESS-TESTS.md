# NEXUS 压力测试 / 灾难演练记录
# 长久持续开发的一部分：每次架构变化、合并、发布前后，固定的高压沙盘

## 目标（§十一）

- 模拟海量用户同时进入：高并发 GET 首页/正典/说明书/市场/广场
- 撞库/爆破：密码门（/admin/observe 的 123、/observatory、登录接口）承压并确认限流动作
- 瞬间大数据量：批量写读账本、真实 redis 命中/击穿
- 高可用/容灾：容器崩溃后自恢复（记录于 `docs/CURRENT-STATE.md` Docker 自恢复段）
- 鲁棒性：500 错误的恢复路由、网络重试、陈旧缓存回落

## 已经做过的沙盘（落盘于 docs/CURRENT-STATE.md 与 docs/evidence/）

1. 顶栏压测（2026-11-14 · v302）：500 并发 SSR 外网口，零 5xx、全部 2xx
2. 公开页 SSR 高并发分档复测（v795）：600 请求 / 100% 2xx / 零 5xx
3. 10 路并发同 fingerprint cache 实测（v876）：9/10 命中（22,606×3、22,734×6）· 第七路 prompt_tokens=24,058 · 渠道内包级隔离，记录于 `docs/evidence/cache-identity-2026-11-17.md`（v878 登记）
4. 5 路并行缓存背离实测（v874）：两桶 q2/q3 三条渠道命中 / 另三条新 channel 冷启动
5. E37 两次中文输出退化诚实记录（v871 · v873）：生成失败不硬着头皮交付，证明质量闸工作
6. Docker Desktop 自修复周期闭环（v246）：redis/postgres 容器崩溃自恢复 ~4 分钟、数据零丢失、跨 nexus-*/careeros-* 零影响

## 还缺的一格（本片补齐）

- 撞库场景：对密码门做 30 IP/小时限流实测 → 已在 `/api/admin/observer` 实装限流（429）
- 长跑垃圾流量：随机乱点+爬虫指纹混沌流量 → `scripts/simulate-user-behavior.mts`（5 画像 · deterministic LCG · 公共 GET 随机行走 · 76/76 100% 2xx）

## prod 分档复测（2026-11-18 · next start :3401 · 无编译）

| 档位 | 请求 | 成功 | p50 | p95 | p99 |
|---|---|---|---|---|---|
| 1 | 30 | 30×200 | 0.111s | 1.142s | 3.683s |
| 6 | 60 | 60×200 | 0.208s | 1.171s | 1.362s |
| 12 | 60 | 60×200 | 0.528s | 3.767s | 3.967s |
| 24 | 60 | 60×200 | 1.431s | 4.349s | 4.381s |
| 48 | 60 | 60×200 | 1.229s | 2.450s | 2.470s |

零 5xx，零超时，零连接中断。证据：docs/evidence/load-web-ssr-2026-11-18.md

（dev 路径本次复测未推进 tier-24/48 记录为未测，已诚实登记；prod 路径已补齐。）

## 固定回归动作

- 架构/合并后重压一次：`npm run verify:fe-gates` + SSR sweep + `scripts/simulate-user-behavior.mts`


## Docker 崩溃自修复事件（2026-11-18 · 容灾实证）

> 本轮会话中 Docker Desktop 整体重启，28+ 个容器从 Up healthy 全部自行恢复（careeros / football_os / crossrealm / specproof / nexus-*）。
> nexus-postgres 进入数据同步恢复期（约 8-9 分钟拒绝连接 —— 期间 `the database system is starting up`，`FATAL 57P03`），
> 之后恢复 `ready to accept connections`，数据零丢失。
> 期间打 DB 的端点全部 500（包括 `/admin/observer/digest`）——如实记录，不掩盖。
> 恢复后同一请求 **200**，产出真实 AI 深读（114 待批准 AI 任务 · 94 疑似机器人 > 52 次打开 · publishes 0 · 总浏览 877 · 点赞 11 · 30 天完成率 71.2%）。

**灾难恢复证据**（机器自愈，零人工介入）：
- Careeros-* / football_os-* / crossrealm-* / specproof-* / nexus-* 全部自动回 healthy，无手动干预
- nexus-postgres 数据零丢失（恢复到 "ready"）
- 任何撞这段时间窗的请求会得到 500，恢复后全部恢复正常
- 结论：容器级崩溃构成约 10 分钟的服务降级窗口，不构成永久灾难

## 网关边缘压测（2026-11-22 · nexus-gateway · 本地 stub 上游）

> 本文件此前只覆盖 Next.js SSR；Java 边缘（网关）没有可复现的压测数字。本片补上，并把工具留在
> `scripts/stress-gateway.mjs`（零依赖、keep-alive workers、状态直方图、p50/p95/p99），任何人可复跑。

**拓扑（真进程）**：Eureka 8771（已有）+ 两个网关实例 8097/8098 + 一个 Node stub 上游 8099。
stub 通过 Eureka REST 以 `NEXUS-API` 身份注册（`durationInSecs=600`），这样不依赖 Postgres——
本轮 Docker Desktop 未启动，`nexus-api` 因 `127.0.0.1:5433 refused` 在 JPA 初始化时退出，如实记录。
目标路径 `/api/projects?limit=1`（经 `StripPrefix` 到 stub）。

| 臂 | 配置 | 请求 | 状态 | rps | p50 | p95 | p99 | max |
|---|---|---|---:|---|---:|---:|---:|---:|
| A 限流开 | 50 workers · 10s · 100/s · burst 200 · memory | 32,354 | 200=1,190 / 429=31,164 | 3,235 | 11.3 ms | 34.2 ms | 88.0 ms | 448.8 ms |
| B 限流关 | 50 workers · 10s · 无桶 | 42,857 | 200=2,200 / 503=40,657 | 4,285 | 10.2 ms | 21.3 ms | 40.7 ms | 212.1 ms |
| C 限流关 | 20 workers · 10s · 无桶 | 28,790 | **200=28,775 / 503=15** | 2,878 | 6.15 ms | 13.15 ms | 20.59 ms | 41.5 ms |

读法（只写数据能证明的）：

- **A**：放行数 1,190 ≈ burst 200 + 100/s × 10s = 1,200。限流器的算术在真实流量里对上了；429 全部
  带 `Retry-After: 1`，没有被转发到上游（stub 只收到 ~1,190 次）。
- **B 的 503 不是网关崩溃**：50 个 worker 把单进程 Node stub 打饱和，连接失败/超时触发 Resilience4j
  熔断（窗口 10 次、阈值 50%），随后整个 open 窗口（10s）都快速返回 503。这正是 SC-7 要的
  fail-fast：后端病了，门不应该陪着一起慢。**单进程 stub 不能作为 50 worker 的容量基线**。
- **C**：同一套网关、同一 stub，降到 20 worker 后 28,775/28,790 为 200（99.95%），p99 20.6 ms。
  这是本机 localhost 条件下的边缘基线：每请求都经过路由、安全头、GET 重试判定、熔断器与
  `NettyRoutingFilter`，不是直连 stub 的数字。

诚实的边界：

- 客户端与服务端同机，数字含 localhost 网络与客户端事件循环，是**回归基线**，不是真实硬件容量承诺。
- stub 是单进程 Node；B 臂的 503 是它饱和后熔断器按设计动作，不是网关缺陷。
- A 臂所有请求共用一个限流 key（127.0.0.1），正是单桶争用的场景；多 key 分布未测。
- 真实 `nexus-api` + Postgres 的端到端压测仍未做（本轮 Docker 不可用）；这一格继续欠着，不冒充已测。

