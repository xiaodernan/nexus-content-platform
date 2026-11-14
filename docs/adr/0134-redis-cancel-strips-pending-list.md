# ADR-0134：取消的排队作业从 pending list 真摘掉——counts() 不再虚报一件 ghost

- 状态：已采纳（2026-11-11，§SC-57，承接 §ADR-0133 / ADR-0126 的 MQ 运用路线）
- 关联：`apps/ai-service/src/ai_service/jobs.py`（`RedisJobStore.request_cancel` / `counts()`）、
  `tests/test_redis_job_store.py`（本片新增）、ADR-0133（memory 后端裸判据：口径同一基准）、
  ADR-0025（queues backed by Redis，§94）
- 触发（user 本轮点名）：**消息队列的合理运用 + 算法/数据结构合理性**。

## 背景

`/healthz` 的 queue 节把 `counts()` 端出去报 pending/running——那是运维眼里"队列积压多深"的全部依据。
RedisJobStore 的实现里：**running** = SCAN `prefix:job:*`（无害但 O(n)）；**pending** = `LLEN prefix:jobs:pending`（O(1)）。

但 `request_cancel` 在"排队中取消"路径会把作业状态落成 `cancelled`——**却不动 pending list**。
于是那个已死作业永远占 list 一格：counts() 虚报一件 pending，口径也跟 memory 后端
（永远按 `status=="queued"` 计数）慢慢分叉——同一个逻辑请求，两后端两答案。

## 决定

1. **请求取消时，先把排队作业从 pending list 摘掉**：`LREM pending 0 <job_id>`。
   - 先标后写（与现有 fetch→save 顺序一致）；`claim` 抢先时 `LREM` 摘零条（无副作用）；
   - `LREM` 失败不抛——`claim` 侧的状态过滤是封底防线，摘失败不破坏业务正确性，
     仅让幽灵残留退回现状（和修之前一样不更差）。
2. **counts() 注释钉住"LLEN 何以够用"**——pending = list 长度（LREM 摘干净才成立）、running = SCAN 口径，
   两处口径与 memory 后端同一语义（`status==queued` / `status==running`）。
3. **裸判据打真 Redis**：`tests/test_redis_job_store.py`（`nexus:test:sc57:<uuid>` 前缀、
   `scan_iter` 收尾删自己的键、`asyncio.run(scenario())` 单 loop 包整个场景）。
   判决性一条：取消排队后 `counts()==(1,0)` 而不是 `(2,0)`。

## 后果与证据

- 新判据 **8/8 passed**（NEXUS_REDIS_URL=redis://127.0.0.1:6380/0）：FIFO claim、
  ttl 过期幽灵被 LPOP 跳过、**取消摘 pending 后 counts=(1,0)**、worker 整份写回 progress=0.9
  不抹独立 `jobcancel:` 标志、未知 id 拒绝、前缀隔离、完整生命周期归零(0,0)、note 自报真相。
- 全套 **96/96**（88 + 8）同一 env 全绿——HTTP/worker 既有判据零回归。
- memory 后端口径没动一行：本修把 Redis 后端向 memory 靠拢（"LLEN 只在 pending 无幽灵时等于 queued 数"）。
- `test_expired_job_key_is_skipped_not_claimed_as_ghost` 同时钉死"LPOP 幽灵 id"链路的健康。

## 诚实边界

1. **LREM 是 O(n)**，发生在取消排队（低频）路径；claim 高频路径原状（LPOP O(1)）。
2. 如果有人绕开 `request_cancel`（比如直接 DEL 作业键——例如 Redis 后台 TTL 淘汰），
   真会有一个从此不再被 claim 且 LLEN 仍挂着的 id；claim 会弹它并跳过（见 expired-key 判据），
   但 **counts() 的 LLEN 会多报**——这一格没有根治（LLEN 与列表内容的关系强），
   与修之前一致、属于结构性换取 O(1)，另立片（e.g. reaper）评估。
3. `/healthz` 的 pending 当前含义是"list 长度"，不是严格的"status==queued 数"。本片修掉了作业层面的幽灵，
   残余边界在 #2 项。
4. 没跑真正的多副本竞争（LREM 与 claim 的并发交错虽安全，但只测了单副本串行路径；
   真并发阅码在 Redis 命令原子性论证上）。

## 仍欠

- reaper：TTL 到期前/后扫 `job:*` 主动认领过期者并清 pending 幽灵（解决 #2）；
- 取消笔记与取消标志分离的**worker 检查点密度**（取消请求到 worker 停手的最长时间没测过）；
- `NEXUS_REDIS_URL` 缺时全文件 skip——CI 里空跑通过≠绿，文档已写清；
- `memory` 后端与 `redis` 后端在**大量作业**下 counts 的 O(n) SCAN 成本——要实测缩放，另立片。
