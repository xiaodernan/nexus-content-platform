# ADR 0314 · running 是一笔带租约的账，不是一次全键空间扫描

日期：2026-11-23 · 状态：已采纳 · 关联：§STRESS-1 / §STRESS-5（`docs/ROADMAP.md`）、ADR-0274（降级启动明牌）、
ADR-0310（能力行只认探测结论）、`apps/ai-service/src/ai_service/jobs.py`、`scripts/stress-ai-service.py`

## 背景

`/healthz` 要在 350ms 预算内报出队列的 `pending/running`。旧实现：

```python
pending = await llen(prefix:jobs:pending)
running = 0
async for key in scan_iter(match=f"{prefix}:job:*", count=200):
    if json.loads(await get(key))["status"] == "running":
        running += 1
```

压测脚本在本机修好之后重量这一条读数，拿到（独立 db、判据数**命令条数**而不是墙钟——这台机器上有并行会话，
时间不是可比的量）：

| 键空间 | counts() 发出的命令 | 墙钟 |
|---|---|---|
| 100 个作业键 | 102 条 | 213 ms |
| 1000 个作业键 | 1007 条 | 2.28 s |
| 5000 个作业键 | 5026 条 | **21.3 s** |
| 20000 个**别的前缀**的键 + 1 个作业 | 102 条 | 221 ms |

两件事同时成立：GET 那一段随**存活作业数**线性涨，SCAN 那一段随**整个键空间**涨——`MATCH` 是先遍历再过滤，
不是按索引取。作业本体 TTL 是 3600s，所以存活作业数 ≈ 吞吐 × TTL，而不是并发数。结论是：这个读数在低吞吐
开发机上永远正常，在生产吞吐下**必然**越过 350ms 预算，从此永久报 `counts-unavailable` 并显示 0/0——
恰好在用户最多的时候，而且恰好在最需要看见"有多少人在跑"的时候。

同一轮里还有第二个坑：§STRESS-1 记的"60 并发下 health p95 1531ms（单 worker + 同步 access log 的代价）"
是**发压脚本自己**的墙。单进程 asyncio + 纯 Python h11 打一个只返回 404 的空路由只有 56.7 rps / p95 3527ms；
同样的总并发拆成 4 个进程就变成 243.9 rps / p95 1046ms。access log 开与关对 `/healthz` 无可测差异，
只影响那条 404 对照腿。

## 选项

1. **给读数加缓存**（healthz 结果缓存 1s）。治的是症状：第一次真正的 `counts()` 仍然要 21s，
   缓存只是把抖动搬到某个倒霉的请求上；而且它让 `/healthz` 报一个已经过期的队列长度，
   撞 ADR-0310 那条"宁可说不确定，不要说假的确切"。
2. **多 worker / 多进程抗住扫描**。代价随吞吐涨，加 worker 只是让更多请求同时卡在同一个 O(N) 上，
   并把 Redis 连接池推向耗尽。方向错误。
3. **把 running 变成一笔显式的账**（采纳）。谁开始跑就记一笔，谁跑完就销账；读数只是查这本账，
   外加"账上过期的一律先出账"。代价与键空间无关。
4. **用 Redis STREAM + consumer group**。语义更漂亮（XAUTOCLAIM 天然处理死掉的消费者），
   但这是对队列后端的整体重写，牵动 claim/cancel/dead-letter 三条已经钉了牙的路径；
   本片要的只是把一次 O(N) 读数变成 O(1)，不必为此换掉整个后端。

## 决定

`{prefix}:jobs:running` 一个 ZSET，member 是 job id，score 是租约到期时刻。

- `counts()` = `LLEN(pending)` + `ZREMRANGEBYSCORE(running, 0, now)` + `ZCARD(running)` —— 三条命令，常数。
- `save()` 是**唯一**的收口点：`status == "running"` 就 ZADD，否则 ZREM。`requeue()` 与
  `route_to_dead_letter()` 都改成走 `save()`，因为它们同样改变 running 的真值。
- 写侧顺序是"先本体后索引"：中间断线只会让索引**落后于**真值（少算一件在跑的），
  反过来会得到一件账上在跑、本体里根本没这回事的幽灵。前者下一次 save 就补上，
  后者要等一个租约周期才出账。
- `renew_lease()` 必须 `ZADD XX`：心跳与落终态是两条独立的路，迟到的普通 ZADD 会把刚摘掉的 id
  挂回去，`/healthz` 从此凭空多一件在跑的。
- 租约由 worker 心跳续，节拍 `lease/3`（留出"连续丢两拍才算真出事"的余量），只给 `self._inflight`
  里的 id 续——这个进程此刻真的在跑的那些。
- 构造期钉 `0 < lease_s < ttl_s`，违约抛异常而不是夹值：夹了之后"虚报多久"这个运维参数
  就不再是运维填的那个数。运维项 `AI_SERVICE_JOB_LEASE_S`，默认 `min(180, ttl/4)`。
- 内存后端 `lease_s = 0`、`renew_lease()` 空转，两个后端的 `counts()` 口径用同一串 API 动作逐拍对账。

发压端配套：每轮先跑一条**对照腿**（一个不存在的路由，只走 ASGI 栈）。
`对照 p95 ≥ health p95 × 0.67` ⇒ 这一轮的延迟主要由传输层与发压端决定，脚本打 WARN 并禁止写进 ROADMAP。
分进程数默认 `min(4, cpu_count)`。

## 后果

好处：读数代价与吞吐、键空间都解耦；虚报上界从"到 TTL 之前一直算在跑"（3600s）压到一个租约（默认 ≤180s）；
`/healthz` 的 350ms 预算重新有意义；索引键刻意不叫 `job:`，所以任何按本体前缀扫的逻辑不会把一个 ZSET 当 JSON 读。

代价与新的边界，都要写明白：

- **running 的语义从"此刻真在跑"变成"账本上还有 N 件没出账"**。worker 被 kill -9 之后，最多 `lease_s`
  秒内这个数偏高；长作业期间 Redis 不可用导致心跳失败，同样偏高。界是租约，不再是 TTL。
- 心跳是正确性的前提：忘了起心跳的失败模式最难看见——长跑作业到点自己掉账，`/healthz` 把"正在跑"报成 0，
  数字看着完全正常，只是少了。所以起心跳那条判断（`start()` 只在有租约的后端多起一个任务）单独立臂。
- 测试替身必须实现 faithfully 的 `zadd(xx=...)`，否则"迟到的心跳不能复活"这条臂会变成假绿。
- 读侧多了一次写（ZREMRANGEBYSCORE 顺带回收过期条目）：把清理成本从后台扫描搬到了读数路径上，
  换来的是不再有"谁负责扫"这个悬而未决的问题。

两条纪律，都是从这次的错里直接来的：

1. **一个延迟数字如果没有对照腿，就不许归因**。写 ROADMAP 之前先问"这个数字减去什么都不做的腿还剩多少"。
2. **仪器必须先于结论**。发压脚本自己的环境（`NO_PROXY`、`trust_env`、进程数）会决定它量到什么；
   判据不许依赖墙钟时间，要依赖可数的东西——命令条数、响应码分布、独立 oracle。
