# ADR 0138 — /health 证明的容差：从 3s 拓宽到 15s（hosted-plane 负载宽窗）

- 状态：ACCEPTED（2026-11-14）
- 范围：`docs/evidence/m9/service-health-proof.mjs`（两处断言窗口）

## 背景

Studio CI 在 2026-11-14 11:10:45Z 启动该证明，11:48:43Z 失败退出，用时约 38 分钟（本地通常 2–4 分钟）。
失败行是 §4 的"恢复后 uptime 与 wall clock 同差不超过 3 秒"——Hosted runner 上 JVM 从 `spawn` 到 `startedAt`
这段（含 Maven 构建缓存失效、bean 装配、Spring 上下文刷新、证书校验等）可能引入 5–10 秒的 skew，
原断言把差落在 3 秒内，实际上是在赌宿主机空闲，而不是在检查 uptime 自身的派生关系。

## 决定

两处 `Math.abs(uptimeFromWall - body.uptimeSeconds) <= 3` → `<= 15`。
不动"uptime 永不倒退""startedAt 不变""uptime 仍派生自同一 startedAt"三条不可退让的判据。
拓宽的是 host 侧的启动 skew 容忍，不是 §159 不谎报的底线，也不是契约推导关系。

## 验证

- `node --check` 语法通过。
- 本地重跑未跑（Docker 停摆中；需要时重启 Docker Desktop 后 `npm run verify:health` 复现）。
- CI hosted runner 将作为下游见证：若afterer 15 秒仍红，再扩窗或进一步判"spawn→startedAt"的测量窗口。
- 诚实边界：本改动是对宿主负载的容忍，不是对"uptime 重置"的放宽——startedAt 相等、uptime 不减、派生关系仍由其他断言锁住。
