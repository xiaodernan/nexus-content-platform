# ADR 0119 — 跨实例共享 LLM completion 缓存（v686）

- 状态：ACCEPTED（2026-11-13）
- 上游：ADR 0113（进程内 completion 缓存组件）/ ADR 0116（跨实例共享断路器的 Redis 手法）/ ADR 0117（抖动）/ ADR 0118（抖动接线）
- 范围：`apps/ai-service`（纯新增组件 + 门，零生产接线、零契约改动）

## 背景

v680 的 `LlmCompletionCache`（ADR 0113）把 `(model, system, user) → Completion` 的映射缓存进
进程内 OrderedDict（TTL + LRU）。多副本部署下它**只省了单实例内的热点**：A 实例打完真调用后，
B/C 实例再拿到同一份请求仍各打一次。

需要回答一个更具体的问题：在未改契约 / 未改账务口径（ADR 0113 定的接线仍欠）的前提下，
能否先把"全集群共享一份 completion 缓存"做成**可复用的 Redis 后端组件**并**真实跑通**？
判定：可以，而且代价很小。

## 决策

1. **新组件 `redis_completion_cache.RedisLlmCompletionCache`**，与 v680 组件同构的
   `cached = LlmCompletionCache.key(model, system, user)` 单一真值（不重造键形状，不串台）。
2. **键**：entry `nexus:llmc:e:{sha256(model \0 system \0 user)}`（64 hex，不泄漏提示词字节；
   洪管模型内串台由哈希本身保证）；LRU 索引 `nexus:llmc:lru`（zset，member = 摘要，
   score = epoch **毫秒**）。
3. **TTL 由 Redis 自身权威实现**（`SET ... EX`，ceil(ttl_s)），进程不参与倒计时，
   重启 / 副本漂移均不影响过期语义；zset 只作 LRU 索引与过期成员修剪。
4. **LRU**：命中的 entry 触碰 = `ZADD lru digest now`（score 刷新）；store 顺手摊销修剪
   （`zrangebyscore` 摘 `t < now - ttl` 的成员 + 其 entry key 一并删，计 `expirations`）
   再按 `zcard > max_entries` 做 `zrange 0 drop-1` 删最久未用者（计 `evictions`）。
   get/store 都是 O(1) 定点 Redis 命令（修剪成本=过期成员数 k，与缓存总条数无关）；
   不 `KEYS`/`SCAN`。
5. **不写 Lua**（ADR 0116 同款纪律）：全部顺序写只有单一 Python 真值。多步之间的竞态是
   "多删 / 少删一条最旧 entry"的**缓存级良性竞态**（只影响容量纪律，不影响正确性），
   如实记账，不为它造门。
6. **一切 Redis 故障 fail-open**：`get` 一律回 `None`（按 miss 记账）、`store` 吞掉异常
   （`stores_failed` 记账）——**缓存是加速器不是门**，provider 调用不因缓存层不可用而失败。
   `stats()` 如实标注 `shared=False, degraded=True`；恢复后调用成功即翻回 `True/False`
   （与降级对照，门钉住）。
7. **毒条目自愈**：JSON 解析失败 / `v` 版本号不符 / `tokens_*` 为 bool（不算 int）/ 类型不符
   → 按 miss 处理 + `corruptions` 计数 + 顺手 `DEL` 该 entry 与 zset 成员；下次即恢复。
8. **`__len__`** 先摊销修剪再报 `ZCARD`（报数的必须是修剪后的数字）。
9. **零生产接线**（v680/v683 同款纪律）：同步 `complete()` 何时把 `CachedLlm` 换成 Redis
   后端，是契约级语义决策（命中是否进 `usage` 账、是否改 `TaskUsageSchema` / 契约 / skill
   消费方）——语义未定（ADR 0113 仍欠），**本片不定、不接**。

## 后果

- 两独立 client 连同一 Redis（56379/DB7，真腿，`nexus:llmc:live:*`）实证：A 实例 `store`、
  B 实例 `get` 命中且字节等价（text / tokens / latency）；TTL 到点（1s）后 B 再 `get` 回 `None`。
- 20 条源码/假-Redis 门 + 4 判据臂（eviction / degrade-honest / isolation / arms×3）全绿；
  全套 **232 passed / 12 skipped（全部 env-gated live opt-in 腿）**；含真 provider
  （`NEXUS_LIVE_LLM=1`，wkapi.pro / gpt-6-sol）与真 Redis（DB7）的 **15 条 live 腿全绿**。
- `record-encoding` exit 0（2264 graded files / 0 chargeable）；`evidence-census` 135 模块零漂移。
- 集群级省钱：真正的"一次真调用全集群复用"要等接线；组件与门已经就位、成本已量（O(1) 腿钉住）。

## 仍欠（诚实记录，不为没做的造门）

1. **接生产**：何时把 `CachedLlm` 换 Redis 后端涉及跨契约语义（命中是否进 `usage` / 改契约 /
   web 侧账本 / skill 消费方）——ADR 0113 定下的同一道门，**语义未定不接线**。
2. **跨进程 single-flight**：并发同 key 的重复真调用在三实例下仍会重复花钱（ADR 0113
   同欠项）；要消除它需要 `SET NX PX` 抢占单飞锁 / 分布式锁或本地 REFRESH 通知，成本与
   语义另定，本片不定。
3. **zset 与 entry 的强一致**：store 路径的修剪不是事务，极端并发下可能少淘汰一条本该
   在的条目；只是缓存容量纪律，不影响正确性，实测不出错就不为它造门。
4. **Completion 版本演进**：payload 带 `v=1` 判别式；字段新增必须走版本号 + 解码兼容，
   本片只钉 v=1 严格形状。
5. **Studio proofs battery 无新行**：组件本体只进 ai-service 的 pytest 门（CI `gates`
   覆盖）；刻意不新增 `verify:*` 脚本，避免 hosted battery 引入 Redis 依赖面。
