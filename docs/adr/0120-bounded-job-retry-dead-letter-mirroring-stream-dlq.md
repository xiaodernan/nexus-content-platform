# ADR 0120 — 作业队列的有界重试 + 死信路由（Spring Cloud Stream DLQ / Spring Retry 镜像）

- 状态：ACCEPTED（2026-11-13）
- 上游：ADR 0116（跨实例共享断路器，同一套 Redis 手法与"毒消息不再打挂上游"哲学）
- 范围：`apps/ai-service`（jobs 平面：MemoryJobStore / RedisJobStore / Worker）

## 背景

作业队列在 ai-service 里早已存在（内存后端 + Redis 后端，`nexus:ai:*`，TTL 驱动）。
一件作业反复失败时，旧行为是：worker 一次消费即落 `failed` 终态，既不重试（慢一拍的抖动
直接判死刑）也没有死信位（毒消息从表上消失，运维事后无从查起）。这是 MQ 的经典毒消息问题：
无界重试拖死 worker，有界+无死信则静默丢失。本 ADR 记录本片的落地形状与边界。

**编号漂移说明**：本片在作业平面落地为 `v686`（与当日另一并轨同号）；另一并轨的跨实例
completion 缓存占了 ADR 0119。编号不是作用域语义，本 ADR 仅澄清，不重号。

## 决策

1. **默认字节级零回归**：`max_attempts = 1`（`AI_SERVICE_JOB_MAX_ATTEMPTS` 默认）时，
   重试/死信分支整体不触发，失败即落 `failed` 终态，与旧行为一致，形状不变。
2. **有界重试（opt-in ≥2）**：worker 判定 4xx/5xx/网络失败后 `job.attempts += 1`；
   未耗尽（`attempts < max_attempts`）→ 写回 store → `requeue`（内存：pending 尾插；
   Redis：RPUSH，先进先出排到队尾，不参与取消标志与作业淘汰）。
3. **毒消息死信**：耗尽后（或 HTTP 失败且已达上限）→ `route_to_dead_letter`：
   本体留 `failed` 终态（`jobId` 可查），死信归档 `dead_letters()`（内存：进程内列表；
   Redis：`nexus:ai:dead` LPUSH + 与 TTL 同步保留），带 `job.public()`（剥私有 payload）、
   `attempts` 与 `reason`。既不无限重试拖垮 worker，也不静默丢弃——运维可事后查看。
4. **活腿验证**：`NEXUS_REDIS_URL` opt-in 腿在真 Redis（56379/DB7）上 20/20 绿；
   全套 232 passed；死信两条判据（毒消息死信 + 上限零回归）全绿。
5. **attempts 单独计数**：与 HTTP status 正交，语义是"worker 真正跑过的次数"，
   供重试与死信判定共用一个真值，不从 status 推断。
6. **不引入 Lua / 不加新 keyspace 族**：死信 key 刻意用 `dead` 前缀，区别于 `job:*`
   （counts 扫描）与 `jobcancel:*`（取消标志），不被淘汰逻辑误删。

## 后果

- 队列平面与断路器平面同构：v682/v683/v684 解决"上游挂了快速止血"，本片解决
  "这件消息一直失败"——两类失败至此都有承载位。
- 死信内容带原始 `jobId` 便于溯源；payload 不出报（`public()` 契约）。
- 零默认行为变化：任何未设 `AI_SERVICE_JOB_MAX_ATTEMPTS` 的部署与旧字节一致。

## 仍欠（诚实记录）

1. **死信无界增长**：`dead` 列表只随 TTL 失效，没有容量上限与导出工具；量大时要看
   LPUSH 长度与 JetStream 同类的 quotas 语义，本片不做（先隔离、后评估）。
2. **重试不区分失败种类**：4xx（请求错）与 5xx（上游抖动）同走有界重试；确定性错
   （参数错/凭据错）应 WARN 快速死信不重试，本片未细分（需 web 侧错误分级表）。
3. **无重试退避**：立即重排队（与 Spring Retry 的无 backoff 配置一致但简陋）；
   加退避需要 sleep 语义，放在下一片评估（ai-service 事件循环里长睡阻塞问题）。
4. **Studio proofs battery 无新行**：本片只进 pytest 门（CI `gates` 覆盖），
   刻意不新增 `verify:*` 脚本，避免 hosted battery 引入额外面。
5. **编号碰撞**：jobs 平面本片自称 `v686`，与 completion-cache 的 v686 同号；
   本 ADR 澄清，不重号、不追溯改注释（不改他人字节）。
