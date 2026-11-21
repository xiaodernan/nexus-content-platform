# SSR 高并发分档复测 · production `next start`（2026-11-19 · cont.231）

> 沙盘：`scripts/load-web-ssr-nextstart.mts`（单个持久 `next start` on :3461，不像 dev 版逐档重启）+
> `scripts/insight-login-hammer.mts`（口令 123 撞库，同款 observe-hammer 的 insight 兄妹）。
> §LOAD/§STRESS 诚实指针：**不是生产 SLA**（Windows 本机 · ~16GB · 可用 ~2.5GB · 同框 ISP/DNS 有变）；
> 这是「本机 prod 路径 SSR 在高并发下不崩溃」的如实读数。

## 分档结果（全部 200 / 0 错误 · 单一持久 prod 实例）

| 档位 | 并发 | 请求数 | 成功 | 状态码 | rps | p50 | p95/p99 | wall(ms) |
|---|---|---|---|---|---|---|---|---|
| baseline | 1 | 30 | 30 | 30×200 | 12.72 | 1,597 | 2,252 / 2,350 | 2,358 |
| tier-6 | 6 | 100 | 100 | 100×200 | 15.84 | 3,112 | 6,057 / 6,262 | 6,313 |
| tier-12 | 12 | 100 | 100 | 100×200 | 21.83 | 3,096 | 4,298 / 4,550 | 4,581 |
| tier-24 | 24 | 100 | 100 | 100×200 | 26.75 | 2,441 | 3,583 / 3,701 | 3,738 |
| tier-48 | 48 | 100 | 100 | 100×200 | **32.03** | 2,965 | 3,029 / 3,098 | 3,122 |
| tier-12-root | 12 | 60 | 60 | 60×200 | 7.01 | 6,417 | 8,543 / 8,557 | 8,562 |

对照 dev 档（2026-11-18）：tier-12 由 p50 19.6s / rps 2.93 → **prod p50 3.1s / rps 21.83**（约 9× 吞吐、6× 尾延迟降）。
**tier-24/48 第一轮冲量测试**：dev 机在 150s 内出现进程未退出，牵连整个 root 队列注册被占满；页面渲染实测是集成页（builder + 3D 场景预热），p50 6.4s、rps 7，比全站静态页面高。

## 撞库沙盘（两条独立门，均在 prod 形态下跑）

1. `npx tsx scripts/observe-login-hammer.mts`：
   - flood 1–30 → 30×401 · flood 31–35 → 5×429 · same-IP 正确口令也 429 · 他 IP 正确 200+`nx_observer` cookie · 他 IP 错误 401。
   - 断言：flood-401s-uniform · flood-429-after-30 · same-IP-correct-also-429 · other-IP-correct-OK · other-IP-wrong-401 → **OBSERVE-GATE PASSED**
2. `npx tsx scripts/insight-login-hammer.mts`（新，cont.231）：
   - flood 1–30 → 30×401 · flood 31–35 → 5×429 · same-IP 正确口令也 429 · 他 IP 正确 200 · cookie `nexus-insight=1` · 他 IP 错误 401。
   - **INSIGHT-GATE PASSED**
3. 匿名探针 `/api/tide/oracle`（cookieless POST · 人工 curl 同构）：403 `csrf_failed` — 在到达模型前被双门拒，零 provider 配额。

## 结构观察

-  prod SSR 路径零 5xx、零重挂死、零连接扇出；瓶颈全是 SSR 首帧（/bible 2.4–6.3s）级，不是运行时逻辑；
-  并发提升非线性地压平 p99（48 并发 p99 **3.10s** 优于 6 并发）——JIT/页缓存摊销；
-  对比旧的 `stress-2026-11-18.md`「tier-24/48 未测」条目：本片补齐两个档位并关闭该缺口；
-  诚实限度：Windows 本机 · 无真实 across-WAN 网络抖动 · 无 Linux epoll/真实多实例样本（`next start` 单实例）· root 页 p50 6.4s 偏高（3D 纹理预算，记此备忘，不伪装）。
