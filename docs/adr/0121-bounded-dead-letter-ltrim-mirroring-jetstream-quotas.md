# ADR 0121 — 有界死信（DLQ 容量纪律镜像 JetStream quotas / Redis LTRIM）

- 状态：ACCEPTED（2026-11-13）
- 上游：ADR 0120（有界重试 + 死信路由）
- 范围：`apps/ai-service`（新增 `dead_letter.py` + jobs.py 两处接线，判定路径一行不改）

## 背景

ADR 0120 落下了"毒消息有界重试、耗尽落死信"，但自己记下一个仍欠：`dead_letters()` 的列表
**只随 TTL 失效，没有容量上限**。长期失败的上游会把死信列表撑成第二存储，运维巡检、
导出、任务引擎演练都要多看一遍历史；JetStream / Kafka 对 DLQ 有配额语义，我们的没有。

## 决策

1. **新组件 `dead_letter.py`**（纯函数 + thin async 封装，无 provider 依赖）：
   `trim_list`（内存原地裁左侧最老，返回裁掉条数）、`trim_command`（LTRIM 的 async 薄封装，
   `inspect.isawaitable` 区分 sync/真 client，`max_len<=0` 不发网络、无 ltrim 能力静默 False）、
   `parse_max_dead_letters`（`AI_SERVICE_DEAD_LETTER_MAX`：非数字/负数 → 默认 500；`0` → 不限）。
2. **两处接线（最小侵入）**：
   - `MemoryJobStore.route_to_dead_letter`：append 后 `trim_list`（锁内，与 append 同批）。
   - `RedisJobStore.route_to_dead_letter`：`LPUSH` + `EXPIRE` 后 `await trim_command(...)`，
     LTRIM `0 N-1` 恰好留最新的 N 条（LPUSH 往头部放），`=n.index_leftmost` 由 Redis 自己裁，
     竞态最坏多裁 1 条——容量纪律误差，不是正确性边界（同 v683/v686 竞态纪律）。
   - 接线在 `try/except: pass` 下——**容量裁剪不可以拖垮死信归档**（guardrail，不是门）。
3. **默认 ON，可 opt-out**：`max_dead_letters=500`；`0` 回到 ADR 0120 的旧行为
   （不限，严格零回归）。与 ADR 0120 默认 `max_attempts=1` 不矛盾——两层 opt-in，各自可退。
4. **判定 / attempts / 4xx-vs-5xx 分支一行不改**：本片只在归档尾巴裁一刀。
5. **编号**：死信 capping 起于本片记为 v688，ADR 0121。

## 后果

- 毒消息归档有了硬上限（默认 500），内存与 Redis 两个后端一致；死信仍然在 `nexus:ai:dead`
  / 进程内列表，不引入新 keyspace。
- 真腿验证（DB7）：`NEXUS_DL_REDIS_LIVE=1 NEXUS_DL_REDIS_URL=redis://localhost:56379/7`
  4 件毒消息 → LTRIM 后只留最新 2 条（#3/#2），#0/#1 已裁掉；全套 254 passed。

## 仍欠（诚实记录）

1. **死信无导出工具**：仍是 `dead_letters()` in-process 读取；长期留存/审计要有独立进程或
   入库（本片不做：避免把 retention 语义塞进请求路径）。
2. **cap 不等于配额语义**：JetStream quotas 会向生产者反压（阻塞/拒绝）；本片只对消费侧
   生命周期设上限，不向上游传播压力（发消息的 web 侧不知道 dead 满了）。
3. **并发裁剪窗**：LPUSH+LTRIM 不是事务；极端并发下最坏多裁 1 条，不阻塞、不丢正确性。
4. **内存后端重启即失**（ADR 0120 本来就有的限制，此处不重造）。
