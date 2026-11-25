# 温和对并发读数（dev server / 低内存环境，2026-11-25）

## 环境约束（先读再做）
- 空闲物理内存 **324–517 MB**（总 16GB，但被并行线服务占满），远低于 `npm run build` 所需。
- 按 `scripts/stress-web-burst.mts` 自己的纪律：本机内存锯齿时不能同时拉 dev + 业务库 + ai-service，
  否则压垮的是被测系统本身。**因此本轮不重跑生产构建压测**（上次误打 dev server 的无效尝试见
  `docs/evidence/stress-dev-server-invalid-2026-11-24.md`）。
- 目标：已在跑的 dev server `127.0.0.1:3101`（本仓最新代码；3100 是并行线 next start 旧构建，不碰）。
- 只读探针：`.scratch/stress-gentle.mjs`，N=20 / maxSockets=8 / 超时 20s，不覆盖任何证据文件。

## 读数（status=0 表示 20s 超时，非 5xx）
| 路由 | 结果 |
|---|---|
| `/` | 20/20 200，p50 18607ms，p95 19999ms |
| `/guide` | 20/20 200，p50 10541ms，p95 12761ms |
| `/bible` | **20/20 超时（0）** |
| `/about-nexus` | 16/20 超时，4/20 200，max 45073ms |

压测后应用仍 200（没被打崩），零 5xx。

## 结论（诚实）
- **这不是产品鲁棒性结论**：目标是 dev server + 极低内存，不是生产构建。慢/超时主要来自
  Turbopack 首编译 + SSR 在 324MB 空闲内存下的抖动，不是应用逻辑缺陷。
- 真正的并发/SLA 读数需要在内存充足时：停掉并行线服务释放内存 → `npm run build` → `next start`
  → 再跑 `scripts/stress-web-burst.mts`（它自带 5xx/掉socket 判定）。本机当前条件不满足。
- 有价值的事实：即使 20 并发打满，`/` 与 `/guide` 仍全部 200、无 5xx、服务未崩——在极端
  低内存下没有崩溃，但延迟不可接受（这是环境，不是代码）。
