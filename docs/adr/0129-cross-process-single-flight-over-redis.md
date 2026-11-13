# ADR 0129 — 跨进程 single-flight：用 Redis 租约合并多副本并发 miss

- 状态：已落地（v697），**默认关闭、显式 opt-in**
- 日期：2026-11-14
- 关联：ADR 0128（进程内 single-flight，仍欠 ①）、ADR 0119（跨实例 Redis completion
  cache / fail-open / 不写 Lua）、ADR 0113（缓存命中不是新调用）、ADR 0102/0107
  （多进程真 Redis 字节往返仍欠）、ADR 0114（显式拒绝无效策略）、ADR 0112（代理量正向锚）、
  ADR 0110（真线路 opt-in 三纪律）、ADR 0095（声称必须有门读）
- 镜像对象：分布式锁 / leader 选举（Redis `SET NX EX` 租约），Spring Integration 的
  `LockRegistry` + 聚合器思路；不引入 Redlock、不引入 Lua。

## 1. 背景

v696 的 `SingleFlight` 是**进程内**的。多副本部署时，A/B 两个实例各自收到同一份
prompt、各自 miss 共享的 `RedisLlmCompletionCache`（ADR 0119），仍然**各打一次真 LLM**。
缓存省的是"先后到来的重复"，进程内合并省的是"同一进程同时到来的重复"，
"不同进程同时到来"这一层一直空着（ADR 0128 仍欠 ①）。

## 2. 决定

新组件 `apps/ai-service/src/ai_service/distributed_flight.py`：

```
SET <lock> <token> NX EX <lease>      -> 抢到的实例是 leader，直接 work()
其余实例读 <lock> 拿到 owner token，轮询 <lock>:done:<owner_token>
marker 出现 -> peek 共享缓存拿结果；等不到/peek 不到/锁过期/Redis 抖动 -> 自己补打
```

**为什么用"轮询本轮 done 标记 + peek 共享缓存"而不是 pub/sub 广播序列化结果**：
结果本来就要写进 Redis completion cache，再广播一份等于造第二个真值源，还要定义跨进程
序列化、版本、丢弃策略。让 follower 读**同一个缓存**是唯一真值，天然复用 TTL、
毒条目自愈与降级纪律。

`lock_key(namespace, key)` = `sha256(各键段 NUL 拼接)`，与 `_digest`（ADR 0119）同形，
保证不同进程对同一 `CacheKey` 算出同一个锁名；`done_key(lock, token)` 把标记按
**本轮 leader token** 分桶。

六条诚实边界（全部有门）：

1. **leader 失败不写 done**：抛异常时不留"成功"标记，follower 超时后自己补打；
   不返回半条结果、不静默重试。
2. **不删别人的锁**：锁靠 `SET NX EX` 租约 + TTL 自然过期，leader 完工**不 DEL**。
   删锁必须先比对 token，无 Lua 纪律（ADR 0119）下会误删继任者的锁。
3. **标记绑定本轮 token**：否则上一轮留下的旧 done 会让新一轮 miss 直接 peek 到
   过期/串台的结果。门用"把 `done_key` 退化成常量"的真组件变异臂证明这条是负载-bearing 的。
4. **peek 不到就自己打**：done 到了但共享缓存读不到（过期/淘汰/降级）→ `peek_misses`
   如实计数并补打真调用，不返回 `None`、不伪造命中。
5. **Redis 故障 fail-open**：`SET`/`GET` 抛异常一律按"没有协调"处理，自己打真调用；
   缓存/锁故障绝不打挂 provider 主路径（ADR 0119 同款）。
6. **合并 ≠ 命中**：`coalesced` 单独记账；follower 的 `peek` 若真的命中缓存，
   由缓存自己的 `stats().hits` 记一次——那是**真实**的跨进程缓存命中。

复杂度（ADR 0112）：每 key 一个定点 `SET NX` + 定点 `GET`，无 `KEYS`/`SCAN`；
轮询次数 ~ `wait_timeout_s / poll_interval_s`，与缓存条目数无关。

## 3. 接线与零回归

`CompositeFlight`（新）把进程内 `SingleFlight` 套在分布式层外面：
**先在本进程合并**，只有本进程的 leader 才去抢跨进程锁，避免同机 N 个线程同时打 Redis。
`CachedLlm` 只依赖新加的 `FlightLike` Protocol 的 `run(key, work)` 面，一行逻辑未改。

- `NEXUS_LLM_DISTRIBUTED_SINGLE_FLIGHT=0`（**默认关闭**）→ 仍是 v696 的纯进程内
  `SingleFlight`，字节级零回归。`=1` 且 completion cache 已启用时才叠上跨进程层。
- 旋钮：`..._WAIT_S` / `..._POLL_S` / `..._LEASE_S`；`Settings.__repr__` 如实暴露且
  继续脱敏 key。
- `Registry._build_llm` 拆成两段：**连接失败** fail-open 退回裸 provider，
  **配置错误**必须显式抛 `ValueError`，不许被同一个 `except` 吞成"悄悄没启用"。
- **默认对齐 provider 超时**：`request_timeout_s=180s` → `WAIT_S=180`、`LEASE_S=240`、
  `POLL_S=0.25`。租约必须覆盖最坏真调用时长；否则 leader 还在打模型、锁已过期，
  follower 提前自补，合并退化成双花。`_build_flight` 显式拒绝
  `lease_s < request_timeout_s`，并有门钉"默认值满足该不变量"（ADR 0095/0114）。

## 4. 真机验证（2026-11-14）

`wkapi.pro /v1`、`gpt-6-sol`、本机真 Redis `127.0.0.1:56379`；三条函数级
`skipif` 腿，无凭据各自 skip、不假绿。

| 腿 | 结论 |
| --- | --- |
| 真 Redis 双实例（各自 client + `RedisLlmCompletionCache`） | `work_calls=1`、`coalesced=1`；A 写入的 `Completion` 由 B 经**真 Redis 反序列化**读回，`cache_b.stats().hits >= 1` |
| 真网关双实例（各自 provider + transport + cache + flight），`distributed=on` | 2 实例并发同 prompt → **真网关 1 次**，`leaders=1`、`coalesced=1`，两实例拿到同一份回复 |
| 反事实臂 `distributed=off`（只装进程内 flight） | 同样 2 实例 → **真网关 2 次** |

反事实臂是归因必需：没有它，"1 次"可能来自网关去重或共享缓存而非跨进程协调。
这条腿同时把 ADR 0102/0107 的"多进程真 OS 字节往返"从**仍欠**变成有实证
（不是内存里传对象，是 A 进程写、B 进程经 Redis 读回）。

## 5. 门（`apps/ai-service/tests/test_distributed_flight.py`）

- 判据纯函数 `_judge_*` 单一真值，真组件场景 / 正向对照臂 / 变异臂共用。
- 钉性质不钉字面：`work_calls == 1`（与实例数无关）、`coalesced == n-1`、
  `distinct_lock_names == key_count`（正向锚，防代理量恒 0 假绿）。
- 确定性并发：两实例 Barrier 同时起步，leader 的 work 被 Event 门住，主线程等
  `joined >= 1` 才放行；超时分支用注入假时钟 + 假 sleep，不真等。
- 覆盖：双实例合并、leader 失败不写标记且 follower 自补、Redis 故障 fail-open、
  旧 token 标记不可复用、本轮 owner 标记立即合并、peek miss 自补、锁名稳定/隔离、
  无效配置显式拒绝（含租约短于超时）、CompositeFlight 先本地合并、旋钮经
  `Registry` 真生效、3 条真机腿。
- 恒跑变异臂 9 个（含两个**真组件退化**臂：`DistributedSingleFlight.run` 直通、
  `done_key` 去掉 token）+ 2 个正向对照，每个都断言判据必须红。
- 结果：离线 `21 passed / 3 skipped`；ai-service 离线全套 `310 passed / 20 skipped`；
  `NEXUS_LIVE_LLM=1` + 全 Redis opt-in 全套 **`330 passed / 0 skipped`**（149 s，
  所有真腿都真跑了）；重复 3 次无 flaky。

## 6. 后果与仍欠

- 收益：多副本热点并发的真 LLM 调用从 O(副本数) 降到 O(1)，且**默认不动**现有行为。
- **仍欠 ①**：leader **进程被杀**（不是抛异常）时没有失败标记，follower 必须等满
  `WAIT_S` 才自补。可让 leader 在 `except` 里写一个 `FAILED` 标记让 follower 立刻
  peek-miss 自补；进程被 kill 仍只能靠租约。这是"快速失败"与"多一个标记真值源"的取舍，
  未定之前不擅自加。
- **仍欠 ②**：`coalesced / timeouts / peek_misses / lock_failures` 未进 `/healthz`
  或 Prometheus，运维看不到跨进程省了多少调用（与 ADR 0128 仍欠 ② 同一片可做）。
- **仍欠 ③**：`SET NX` 单实例 Redis 语义，非 Redlock；Redis 主从切换/脑裂下可能
  出现双 leader。按 ADR 0119 同款口径：缓存/锁是加速器，不承载正确性边界。
- **仍欠 ④**：轮询间隔 0.25s 是 RTT 与延迟的固定折中，未做指数退避 + 抖动
  （ADR 0117 组件已有，需先定"轮询算不算 attempt"）。
- **仍欠 ⑤**：默认关闭。要在生产多副本真正打开，需要一次带真实流量梯度的上线验证
  （锁 QPS、Redis 连接数、leader 长尾延迟），本片只提供组件、开关与真机证据。
- 已知边界：`leaders` 计入 `real_calls`，即使 leader 真调用失败——那是**真打了**
  一次，账本不抹掉失败（门钉住）。

## 7. 复用价值（方法论）

- **跨进程协调不要造第二个结果真值源**：既然结果已经在共享缓存里，就轮询"完成标记"
  再去读同一份缓存；pub/sub 广播结果会引入序列化/版本/丢弃三份新语义。
- **done 标记必须带本轮 token**，否则旧标记跨轮串台；这种坑要用"把 `done_key`
  退化成常量"的**真组件变异臂**证明门有牙，光写正向断言会全绿而实现是坏的。
- **租约时长不是随手填的常数**：它必须 ≥ 最坏真调用时长（provider 超时）。
  把"默认值满足该不变量"写成门（ADR 0095），比在注释里写一句"注意"可靠。
- 连接失败（fail-open 降级）与配置错误（必须报错）要**拆成两个 try 段**，
  否则一个宽 `except` 会把配置错误吞成"悄悄没启用"。
