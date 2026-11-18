# ADR 0274 — 启机期 Redis 降级档（opt-in，默认 fail-fast）

日期：2026-11-17
状态：已接受

## 背景

2026-11-17 连续三次本机重启（Docker Desktop 反复熄火）期间确认：`NEXUS_REDIS_URL` 配置了但 Redis 不可达时，
ai-service 在 lifespan 直接抛异常——整个服务起不来（`/healthz`、`/v1/capabilities`、`/v1/ai/*` 全部不可达）。
这是**刻意的**（`build_store` 注释：不悄悄退回内存后端骗人——崩溃要响亮），
与 ADR-0271（healthz 运行时绝不 5xx）是同一纪律的启机期版本。

但本机重启场景里，人是唯一报警器：service 死掉对用户来说就是"网页打不开"。
需要一个**明牌**（而非静默）的启机降级路径——人知道、探针知道、对账知道。

## 选项

A. 维持现状（fail-fast 不可改）——缺点：本机反复熄火时整个 AI 路径不可用，诊断靠人。
B. 静默退回内存后端——与 ai-service 纪律冲突（"绝不悄悄退回内存后端骗人"），否决。
C. **opt-in 环境变量 `AI_SERVICE_ALLOW_DEGRADED_STORE=1`**——默认行为不变；显式 opt-in 时：
   服务照常启动，store 为 MemoryJobStore，**note 明牌 `【DEGRADED-BOOT】`**
   （healthz 的 queue note 字段直接带出）；进程日志打印同名警告；
   绝不适用于生产；测试覆盖默认/opt-in/无 URL 三档。

## 决定（采纳选项 C）

- 默认：`NEXUS_REDIS_URL` 设置且连不上 → raise（AI_SERVICE_ALLOW_DEGRADED_STORE 未设置或 ≠"1"）——不变。
- opt-in：`=1` 时连接失败 → 返回 `MemoryJobStore`，其 `note` 被改写为明牌
  `【DEGRADED-BOOT】Redis 连不上（{exc}），已退回内存后端——任务重启即失；绝不在生产启用。（ADR 0274）`。
- `healthz` 无需改动：`queue_report` 已完整携带 `state.store.note`，降级状态随 note 出厂。
- 测试：`tests/test_degraded_boot.py`（3 例：默认抛出 / opt-in 返回内存且 note 明牌 / 无 URL 仍是普通 memory 且无 DEGRADED-BOOT 标记）；
  既有 store 三套（jobs/memory/redis）回归通过：39 passed（含活 Redis 56379）。
- **默认值是安全的**：未设该变量 = 与 cont. 197 之前完全一致；生产必须显式开启才会降级。

## 后果

- 本机/单机演练场景下，Docker 再熄火，用 opt-in 可以「页面照开、AI 走内存、探针看得见降级》；
- 绝不隐藏给对账使用者：所有 DEGRADED-BOOT 的 note 都带出厂面；
- DLQ（ADR 0121）有界归档不受影响（内存后端同样支持），但**重启丢作业**的代价明牌在 note 里；
- 生产路径不变：web 层即使 healthz 显示 DEGRADED-BOOT，DEMO MODE 纪律、/api 层 4xx 直说如实；
- 若未来需要"降级但 chat 可用、jobs 不接受"的半降级状态，是另一个 ADR（更细颗粒），不在本次。

## 相关

- ADR 0271（healthz 绝不 5xx，运行时降级）· ADR-0121（DLQ 死信有界）· ADR 0272（车道 canary）· ADR-0273（私域 AI 计数-only）
- 代码：`apps/ai-service/src/ai_service/jobs.py`（`build_store`）· `apps/ai-service/tests/test_degraded_boot.py`
