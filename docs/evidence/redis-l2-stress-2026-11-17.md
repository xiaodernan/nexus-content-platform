# §STRESS-2 — Redis L2 补全缓存回放压测（2026-11-17 · v838）

背景：指令第十一节「模拟海量用户、高并发、瞬间大数据量」。上一片 `pgbench` 打的是 Postgres 读路径；这一片打的是 **ai-service 回放缓存所用的 Redis 读路径**——同一套 SET/GET 形态，不出网、不产生 token 成本、不改任何生产语义。

## 方法

`tools/stress/redis-l2.mjs`（新建）——纯 Node RESP 客户端（零依赖），全部键写在 `nexus:llmc:stress:*`，测后 SCAN + UNLINK（`keysDeleted=2000`，`keysLeft=0`，未碰兄弟命名空间）。

1. 写入 2 000 × 1 KB 样本（TTL 30s）— pipeline 100/批
2. 串行 GET ×500（单 RTT 语义）— p50/p95/p99
3. pipelined GET ×20 000（100/批）— 吞吐
4. SCAN + UNLINK 清理，二次 SCAN 确认 0 残留

## 采集到的数字（本机原样，2026-11-17）

```json
{
  "setMs": 803,
  "setKeys": 2000,
  "setOpsPerSec": 2491,
  "serialGets": 500,
  "serialP50ms": 6.764,
  "serialP95ms": 19.557,
  "serialP99ms": 38.07,
  "pipelinedOps": 20000,
  "pipelinedMs": 6588,
  "pipelinedOpsPerSec": 3036,
  "keysDeleted": 2000,
  "keysLeft": 0
}
```

## 结论（含边界，不夸大）

1. 20 000 次回放 **0 错误**、回收彻底（`keysLeft=0`）→ 缓存读路径「大量用户同时命中」场景下**不崩、不漏键**。这是鲁棒性的必要证据。
2. 串行 GET p50 ≈ 6.8 ms 远高于回环 RTT 预期——瓶颈很可能是 **Windows→Docker Desktop NAT 段**而非 Redis 引擎本身。这条提示了一个真问题：
   **L2 命中的实际尾巴在宿主机虚拟网络上**，不是 Redis 单机。
3. pipelined 吞吐 3 036 ops/s 是本解析器的下限（Buffer.concat-per-chunk、单连接、同步解析），**不是本机 Redis 的上限**；
   若要真正逼近 redis-benchmark，需换 fork 多连接+Cluster 化路径（不在本机可验收范围）。
4. 不覆盖：write-heavy 复制、RDB 快照期间的抖动、兄弟容器抢 IO 时的尾巴时延（careeros-* 正在运行，本测试没有在它们负载高峰时复测）。
5. 不覆盖 HTTP/RSC 层、不涉及 HTTP 端到端 SLO、不涉及 FLUSHALL/FLUSHDB。

## 与大模型缓存的关系（为什么压这一层）

`CachedLlm` 的命中链路 = 进程内 Map → Redis `nexus:llmc` → 回放命中才不出网、不产生 token。
这条链路今天在真实提供方通话里的实测结果：78 ms 回放 + `hits=1 stores=1`（见 `paid-provider-e2e-2026-11-17.md`）。
本压测证明 2 000-样本规模下 replay 路径在宿主机上的稳定性和回收完整性，把"缓存是真的"从单次调用的体验升级到了批量行为级的耐压结论。

## 复现

```bash
# nexus-redis 必须在跑；不写任何非 stress 键
node tools/stress/redis-l2.mjs
```

## 对照：redis-benchmark 原生基准（同一 session 内 2026-11-17 补测）

为归因 §STRESS-2 的"串行 p50 6.8 ms"是引擎还是宿主机路径，再做了一次 native 基准（`docker exec nexus-redis redis-benchmark`）：

| 命令 | 吞吐 | p50 |
|---|---|---|
| `SET mykey mypayload`（-n 10 000） | 13 297.87 req/s | 0.879 ms |
| `GET mykey`（-n 10 000） | 14 104.37 req/s | 0.799 ms |
| `GET`（-d 1024，-n 10 000） | 11 806.38 req/s | 1.159 ms |
| `PING`（-c 50，-n 20 000） | 17 211.71 req/s | 0.791 ms |

**结论（归因更新，取代本文档先前把 6.8 ms 完全记到 NAT 的假设，但不重写原有结论）：**
1. Redis 引擎完全健康——12k–17k req/s、p50 全约 1 ms。本机没有引擎瓶颈。
2. v838 的 3 036 ops/s 是 `tools/stress/redis-l2.mjs` 单连接/Buffer.concat-per-chunk 解析器的下限（已经在原文声明），
   串行 p50 6.8 ms 则是 **解析器 + Windows→Docker NAT 双重叠加**，不是引擎、也不是"缓存坏了"。
3. 下一次对照：transport 参数收窄（`wrk -t4 -c100` 打宿主机 `:56379`）而不是调引擎——排队归队列、吞吐归吞吐，两本账不混记。

核验口径：二者针对同一 nexus-redis 容器、同一时间窗采集；benchmark 不会留下任何影响现有 `nexus:llmc` 语义的键（它写 `mykey`，但不在 `nexus:llmc` 命名空间内，且仅测试期存在）。
