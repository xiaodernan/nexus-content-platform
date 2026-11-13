# ADR 0116 — 跨实例共享断路器：Redis 共享真相 + 无 Lua 单一判据（v683）

- 状态：Accepted
- 日期：2026-11-12
- 相关：ADR 0115（v682 进程内 `CircuitBreaker`，本片的单机前身与仍欠①）、
  ADR 0113 / v680（"语义未定先做组件不接线"的先例）、ADR 0110（真线路 opt-in 门）、
  ADR 0112（复杂度门的正向锚 + 静态前提耦合）、ADR 0095（判据单一真值，本片据此**不用 Lua**）、
  ADR 0090/0094 X4（判据钉形状不钉字面 / 语义未定不定门）、ADR 0107（真 Redis opt-in 纪律）、§159

## 背景

v682 的 `CircuitBreaker` 解决了单实例熔断，但 ADR 0115 HONEST GAP **头号一条**是
"进程内、非持久、非跨实例：重启即失、多副本各自为政"。微服务多副本部署时，上游真挂了
也要等**每个实例各自**攒够样本才熔断——第一个实例已经拒门了，其余实例还在持续打挂掉的上游。
需要一个**跨进程共享的"上游不健康"事实**：一个实例攒够失败，全体立即拒门。

本机 venv 已有 `redis==5.2.1`（§162 作业队列用），真 Redis `redis://127.0.0.1:56379`
实测 OPEN（v675 翻转的旧纪律），`redis-py` **同步**客户端 `PING` 返回 `True`——这消除了
"同步 `complete()` 调异步 Redis"的语义顾虑，让跨实例共享在技术上可行。

## 决策：纯新增可复用组件 + 门 + 真 Redis 两进程实证，零生产接线

新增 `apps/ai-service/src/ai_service/shared_breaker.py`：
`should_open(...)` 纯函数 + `SharedCircuitBreaker`（Redis 共享 count-based 窗口 + 三态）。
**复用 v682 的 `BreakerConfig` / `CircuitOpen`**（同配置、同异常、门可共享部分判据）。

按 v680 / ADR 0113 纪律 **不替换 v682 的生产 breaker**："同步 `complete()` 何时切到共享
后端"涉及**跨契约语义**——断连 fail-open / fail-closed / 退本地、窗口边界突发（fixed-window
双峰）、每次请求是否同步等 Redis 的延迟与可用性耦合——**尚未定**。按 ADR 0090/0094 X4
**语义未定就不定门、不接线、记仍欠**；降级**策略由构造参数显式注入**
（`degraded="local"|"open"|"closed"`），门只钉"如实标注 `degraded`、不谎称共享"，
**不钉该选哪个策略**（不惩罚将来统一语义的正当修复）。

### 无 Lua：判据单一真值 + Redis 原子命令保证一致性

设计上刻意**不写 Lua 脚本**：

- **熔断判定抽成纯函数** `should_open(failures, total, *, minimum, threshold)`：
  生产 `record` 与门 / 变异臂**共用这一个真值**。若写 Lua，就会出现"Lua 一份判定 /
  Python 一份判定"，改一处忘一处正是 ADR 0095 要杜绝的假绿。Redis 只负责**原子读写状态**，
  判定逻辑不进 Redis。
- **原子性由 Redis 命令语义保证**：`INCR` 天然原子，`pipeline` 事务拿 `total`/`fail` 一致快照，
  判定越阈值后 `SET phase = open EX wait` 是**幂等**的——多进程同时 `INCR` 不会漏开，
  重复判定只会把同一 `phase` 设成 open，无害。不需要 Lua 的 compare-and-set。

### 三个 Java 教训的跨实例延续

| v682 单机镜像的 Java 坑 | v683 跨实例如何保持 |
|---|---|
| ① 名与配置同源（配了没人用） | 本组件虽未接线，但 `namespace` 隔离 + 固定 key 后缀让"哪个 breaker 用哪份状态"可查；`stats()` 报 `namespace`/`shared`/`degraded` 真相 |
| ② 404 is an answer | `record_ignored()` **不 INCR 任何计数字段**，健康服务不被自己（或别的实例）的 404 熔断；门 `test_ignored_404_does_not_trip_the_other_instance` + 变异臂 |
| ③ OPEN 必须自动回 HALF_OPEN | **Redis TTL 天然实现**：`SET phase open EX wait`，到点 key 自动消失，任一实例的下一 `before_call` 即放行探测——无需后台线程、跨进程可见。门用共享 TTL 的 fake 与真 Redis 两态验证 |

### 数据结构：O(1) 固定命令数（热路径）

`record` 每次发**固定条数**原子命令（pipeline 2 条 INCR + 常数条 GET/EXPIRE/SET），
与窗口大小、失败数无关，`record_ops` 如实计逻辑更新步数供复杂度门读（ADR 0112）；
**不用 `KEYS`/`SCAN` 全量遍历**——`_delete_all` 只定点 delete 本命名空间的 5 个固定 key
（既不 O(n)，也不误删别的 breaker）。三件门：正向锚（`record_ops == m > 0` 且线性）、
窗口 3 vs 300 成本相等、静态前提耦合（源码仍调 `should_open`、仍走 `INCR`+`pipeline`、
无 `keys(`/`scan_iter(`/`smembers(`）；变异臂证 list/`keys` 重写会红。

## 门设计（先红后绿）

`apps/ai-service/tests/test_shared_breaker.py`，沿用 ADR 0110/0114/0115 三段式：

1. **先红**：组件未落时 9 条真值门红（`ModuleNotFoundError`），**7 条恒跑变异臂绿**、
   1 条真 Redis 腿 skip——缺口坐实、离线臂有牙、CI 无 URL 不发假绿。
2. **转绿后 16 条**（离线恒跑，Fake Redis 共享 store / ttl = 同一服务器）：跨实例
   （A 失败被 B 看到、B 被同一 OPEN 拒门）、404 豁免跨实例、Redis TTL 自动半开、
   降级诚实、健康时共享标注、O(1) 三件门、纯判据门、非法降级策略拒绝；**7 条恒跑臂**
   逐条逼红 + 正向对照（换 minimum/threshold/wait/name 仍绿，ADR 0094 X4）。
   判据纯函数、真值门与臂共用（ADR 0095）。
3. **真 Redis opt-in 腿**（`NEXUS_CB_REDIS_LIVE=1` + `NEXUS_CB_REDIS_URL`，函数级 skipif）：
   **两个独立 `redis-py` client**（模拟两进程）经真 `56379` 共享 OPEN 事实、跨进程拒门、
   `time.sleep` 等真 TTL 过期后自动放行——真·两进程字节往返，不靠 fake。设了 URL 却连不上
   **报错**而非 skip（ADR 0107 纪律）。

**本片三次"红"都是门 / 测试装置的 bug，不是生产 bug**（按"红一条先判三件事"归为**我假设错**）：
① `stats()` 键名门读 `redis_ops` 而实现报 `record_ops` → 统一门读 `record_ops`（与 v682 命名一致）；
② `FakeRedis` 两实例只共享 `s` 不共享 `ttl` → 跨实例 TTL 假红（真 Redis 两 client 本就共享服务器
状态）→ 装置改成 store + ttl 都共享；③ 等待期内的 `before_call()` 未 catch `CircuitOpen` 致测试崩
→ 补 catch 并加严断言。**全程只改门 / 装置，生产逻辑自始正确。**

另有一次**环境假红**：全套测试报 `Settings has no attribute llm_circuit_breaker_enabled`，
现查 `git show HEAD:config.py` 与磁盘 `git diff` 证明 v682 字段都在、工作树干净 → 判为
`__pycache__` 陈旧字节码（多次 Write/Edit 同一文件后 mtime/size 校验偶发不敏感），清
`__pycache__` 后 `hasattr(Settings(), ...)` 为真、全套转绿。**不是代码错、不是共享树回滚。**

## 验证

- 先红：9 真值门红 / 7 臂绿 / 1 真腿 skip（组件未落）。
- 转绿：门文件 **16 passed / 1 skipped**（CI 模式）。
- 真 Redis 单腿：**17 passed**（16 离线 + 1 真腿，真 56379 两 client 往返）。
- 全套 ai-service：CI **182 passed / 8 skipped**（v682 166/7 → +16，零回归）；
  opt-in 真网关 + 真 Redis 双腿 **189 passed / 1 skipped**（v682 opt-in 172/1 → +17，
  所有真腿全打真 `gpt-6-sol` 与真 Redis `56379`）。
- `verify:record-encoding` exit 0，0 chargeable / 2257 files（新 CJK 注释干净）。
- census population 零漂移：只加 `tests/*` + `src/*` + ADR + ROADMAP，不动 `docs/evidence/*`、
  不建 `verify:*`。2 个新文件 staged 无真 key（key/URL 只在 gitignore 的 `.env` 与临时环境变量）。

## 仍欠（如实记）

1. **零生产接线**：`complete()` 仍用 v682 进程内 breaker；何时切共享后端是跨契约语义
   （断连策略 / 同步 Redis 延迟 / 窗口突发），需与 web/owner 协同定，别单方开大改。
2. **跨进程 HALF_OPEN 探测协调**：当前"phase 到期即放行、一次成功探测即闭合"是最小镜像；
   Resilience4j 的"累计 N 次探测才闭合 / 并发探测上限"跨实例协调仍欠。
3. **fixed-window 边界突发**：count-based 用固定窗口 + TTL 兜底，窗口切换瞬间理论上有双峰
   流量；滑动日志（每实例带时间戳）或多级窗口是另一片（也更高 Redis 成本）。
4. **Redis 可用性耦合**：一旦接线，每次请求多一次 Redis 往返；降级三策略的取舍未定，
   门只钉诚实标注不钉选择。
5. **TTL 时钟漂移**：依赖 Redis 服务器时钟；多机房部署需考虑，当前单机 Redis 无碍。
6. hosted Studio CI 默认无 Redis URL → 真腿 skip，只跑配置门 + 离线臂（不假绿）。

## 结论

把 v682 的进程内熔断柱升级成**跨进程共享的分布式事实**，且带着 Java 三教训一起延续
（共享状态名可查 / 404 豁免 / Redis TTL 天然自动半开）。关键反漂移决策是**不用 Lua、把判据
抽成生产与门共用的纯函数 `should_open`**（ADR 0095），原子性交给 Redis `INCR`+`pipeline`+
幂等 `SET`。按 v680/ADR 0113 纪律**语义未定就先做组件 + 门 + 真 Redis 两进程实证、零生产
接线**，把接线清单写进仍欠。这是「Redis 分布式共享状态 + 微服务容错 + 数据结构 O(1) 热路径」
的又一块集大成，也是用户要求的 Redis 真实运用在熔断域的落地。
