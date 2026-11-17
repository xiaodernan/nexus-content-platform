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
