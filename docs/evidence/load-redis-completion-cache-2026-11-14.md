# v734 · nexus-redis completion-cache 形状负载测试（裸 RESP 探针）

**日期**：2026-11-14 · **机器**：本机的 Windows 11 / 16GB（空闲约 1.7GB；careeros-* / football_os_* 容器为旁项目，未触碰）
**对象**：本项目 `nexus-redis`（127.0.0.1:56379，本项目专属容器）· **库**：DB15（生产语义命名空间 `nexus:llmc:*` 在 DB8，本次全程未触碰；DB15 亦未触碰其他项目的任何东西）
**工具**：`scripts/load-redis-completion-cache.py`（零依赖：Python 3 标准库 + 裸 RESP2；不需要 redis-py）

## 测的是什么

按 `apps/ai-service/src/ai_service/redis_completion_cache.py`（v690 / ADR-0123）的生产操作形状，用合成 key 复刻其调用序列，检验本机这台单实例 Redis 在该负载下的行为：

- **命中路径**：`GET entry:{digest}` → `ZADD lru {now_ms} {digest}`
- **未命中路径**：miss → `SET entry:{digest} {1.5KB payload} EX 3600` + `ZADD lru` + `ZREMRANGEBYRANK lru 0 -257`（对应 store() 的 LRU 裁员，max_entries=256）
- key 名 = `sha256(model \0 system \0 user \0 json_mode)`，与 `_digest` 同构；命名空间硬隔离为 `nexus:loadtest:llmc:*`，全程非 flush、非 KEYS 全表扫。
- 80/20 混合分布：80% 命中的热集（16 个热 key，TTL 3600ms 预填）+ 20% 冷 key（余键，必然 miss→store），模拟真实流量的幂律头部（目标命中率 ≈ 0.80）。
- 4 个档位：16 / 64 / 128 / 256 并发 TCP 连接，每档 6000 次虚拟 LLM 请求，每连接一次只在途一个命令（贴近 redis-py 默认单命令阻塞调用），无 pipeline。

## 结果（本次实测，非 SLA）

| conns | ops 完成 | 命中 | 未命中 | 错误 | 吞吐 ops/s | 命中率 | p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|---|---|---|---|
| 16  | 6000 | 4771 | 1229 | 0 | 3752.9 | 0.7952 | 1.62ms | 2.99ms | 3.95ms | 5.90ms |
| 64  | 6000 | 4851 | 1149 | 0 | 3166.9 | 0.8085 | 7.96ms | 12.91ms | 14.69ms | 18.03ms |
| 128 | 6000 | 4823 | 1177 | 0 | 2572.8 | 0.8038 | 20.28ms | 25.71ms | 32.38ms | 50.35ms |
| 256 | 6000 | 4817 | 1183 | 0 | 2599.4 | 0.8028 | 40.01ms | 52.35ms | 59.94ms | 75.43ms |

收尾清理：`entries_deleted=4755`，`SCAN MATCH nexus:loadtest:llmc:*` **残留 0**（exit 0；残留非 0 亦会非零退出）。
完整机器可读输出：`docs/evidence/load-redis-completion-cache-2026-11-14.json`。

## 怎么读这些数

1. **零错误、零超时**跨越 16→256 连接——单实例 Redis 在这种每连接单命令在途的模型下，瓶颈不是崩溃而是**排队**：128/256 档 p99 翻约 2.3 倍，吞吐从 3753 降到约 2570–2600 后平台化（≈2.6–3.8k ops/s）。
2. **时延随并发线性恶化**（p50 1.6 → 40ms）不是 Redis 服务端退化——单线程 Redis 对 1.5KB SET 的典型服务时间就是亚毫秒——而是每个连接自己的往返排队。这条机器上 commit-有界的是**在途命令数**，不是 Redis 本身。
3. **命中率 0.795–0.809** 完全符合 80/20 合成分布的设计值（热集按预期被持续命中），未出现异常 miss（如 key 丢失、TTL 提前失效），说明 entry/LRU/EX 3600 链路行为正常。
4. **ZREMRANGEBYRANK 裁员每 store 都跑**——按生产同形来压，未见错误。

## 校准说明（本轮最重要的一条）

**这批数的第一次出炉是废的，这里说清楚。** 初版脚本的清理路径把 `call()` 的 `(type, value)` 元组按 `r, _ = ...` 解包（`r` 绑到了 `"int"` 字符串上），导致：

- `DEL` 返回没被计数（显示 `entries_deleted=0`）；
- `SCAN` 验证循环里 `if r[0] != "arr"` 永远成立（`"a" != "arr"`...实际是 `"arr"[0] != "arr"` 恒真），**残留=0 从未被真正测量过**。

当时判断到：实测 SCAN 两次（DB0/DB15）发现命名空间确实已存在、且 ping/set/get 均正常——「0 残留」只是没测。修法：解包全部改为显式双变量、`SELECT`/`SET` 失败立即 `assert`/计数、`SCAN` 测量失败时记 **-1 而非 0**（绝不冒充干净）、收尾若 residue≠0 则整体非零退出。修复后完整重跑，得到上表 + 真实 `entries_deleted=4755` + 真实 `residue=0`。DB15 复测 `DBSIZE=0`。

## 诚实边界（不喊 SLA）

- 合成 key/payload；loopback 直连；无 TLS/认证；单实例、无副本、共享 16GB 机器（与邻居容器竞争资源）；无 pipeline；热集 80% 命中是设计出来的，**不是**线上真实命中率。
- 数值只用于本机当日容量感知与回归对照（再测应对照 JSON，不对卡名），**不构成任何生产容量承诺**。
- 生产侧若想把吞吐再上去，杠杆依次是：pipeline/批量 ZADD、分片（多实例）接入层、以及让调用方别每条都同步 DB 等待——其中**第一条最不改业务语义**（redis-py 自带 pipeline，CompletionCache 的三段写是同 digest 天然可批）。本轮不做该改动（属于 ai-service 行为变更，单独立片）。
- 与 §CACHE-4-AB 的关系：两者互补。&CACHE-4-AB 测 provider 端 KV 命中（字节前缀稳定），本篇测**本项目应用层**的 Redis 命中通路容量，不混淆。
