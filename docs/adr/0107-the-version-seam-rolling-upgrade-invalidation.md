# ADR-0107：滚动升级期的版本缝——三层分流 + 稳定实例身份（默认一字不改）

- 状态：accepted
- 日期：2026-11-12
- 版本片：v674
- 关联：ADR 0102（v670，跨实例 discover anon 缓存失效、回环过滤、15s TTL 兜底）、ADR 0094 X4（门不许惩罚正当改动；加了旋钮，默认行为不许变）、ADR 0061（ discover anon 缓存的有界失效契约）

## 背景：v670 把"v2 的合法意图"记成了"坏帧"

`parseInvalidationFrame` 只有一档判定：帧 `v` 不是 1 就返回 null，调用方一律当"畸形字节"记账丢弃。
滚动升级窗口里，v2 实例广播 `{"v":2,"origin":"v2-peer"}`，v1 实例收到——这不是恶意字节，而是
"隔壁告诉我窗口失效了，只是我读不懂它的新字段"。两件语义不同的事被混进一笔错误账：

- `errorCount` 虚高——运维看到的"线路被攻击/坏帧"比例埋掉了真坏帧，也埋掉了真正的升级节奏；
- 每条 v2 帧一条红字日志——滚动升级期对端每秒可能广播几百条，fan-out 会把每台 v1 实例的
  日志和 CPU 打爆，正是"总线不能比它服务的业务更脆弱"那条纪律在版本缝里再次被违反。

同时还有一条诊断痛点：origin 是 `pid:ts36:seq`，线路帧与进程对不上，多实例里查一条失效
只能靠猜。

## 决定：三层分类 + opt-in 保守策略 + 稳定可读前缀

1. **`classifyInvalidationFrame`（纯函数）**：`current`（合法 v1，走 v670 原路径一字不改）/
   `future`（`v` 是**大于** 1 的整数、`origin` 非空字符串——公共头部契约，未来版本唯一必须
   守的东西；at/nonce 等诊断字段不校验）/ `rejected`（JSON 不可解析、非对象、`v` 非整数或
   ≤1、缺/空 origin——一律记 error，绝不触达本地失效逻辑）。
2. **future 帧不计 error**：`futureFrames` 独立计数、`seenFutureVersions` 升序去重上报；
   策略按 `futurePolicy` 分派——
   - `degrade-to-ttl`（**默认，= v670 行为**）：不触发本地失效，窗口靠 15s TTL 收敛；
   - `fail-safe-invalidate`（opt-in）：bump generation + 清 inFlight，用一次多余重算换
     "升级窗口里新发布立即可见"。
   两策略都不把 future 帧当 error，日志**按版本去重**（每个版本号一条 warn；喂 3000 条
   同版本 v2 帧恒 1 条）。
3. **`NEXUS_DISCOVER_INSTANCE_ID`**：只作 origin 的**可读前缀**（`id:pid:ts36:seq`）；唯一性
   永远由 pid/ts/seq 兜底。两台实例误配同一个 id 也**不会**互相把对方的帧当回环丢掉——
   旋钮只买可诊断性，绝不削弱正确性（那会造成静默的正确性事故：对端永远收不到失效）。
4. v674 实例收到"自己的" future 帧按 origin 回环丢弃（同进程多 bus 的场景），不重复失效。
5. `parseInvalidationFrame` 一字未改——v670 的九类畸形帧门零回归，`current` 走原路径。

## 后果

- `DiscoverInvalidationStats` 增长但添加式：`currentFrames` / `futureFrames` / `rejectedFrames` /
  `seenFutureVersions` / `futurePolicy`。模块仅内部使用（无 stats JSON 消费者），读取方零分支。
- 默认生产路径零行为变化；旋钮全部 opt-in，这是 ADR 0094 X4 最字面的一次应用。
- v670 之前的 TtlLru TTL 语义不动：`degrade-to-ttl` 下升级窗口仍收敛到 15 秒。

## 验证（本机 2026-11-12）

- `npx vitest run apps/web/test/discover-cross-instance.test.ts`：**36/36 green**
  （v670 的 15 + 本片新增 21：`classifyInvalidationFrame` 纯函数门 4 条、`composeInvalidationOrigin`
  纯函数门 5 条、RedisInvalidationBus × future 策略 4 条、日志/帧数正交的 O(1) 门 2 条、
  同源变异臂 4 条、静态接线门 2 条）。
- 窄 tsc（extends apps/web tsconfig，取本片两文件）：exit 0。
- verify:record-encoding：exit 0。
- **真 Redis 端到端路径 UNPROVEN**：本机 56379 无前置 Redis（v674 全部针对 fake 连接测试缝）；
  真机双进程 `fail-safe-invalidate` 通路等待宿主环境，本 ADR 不宣称已验证。
- 主机栈上的 hosted Studio proofs-battery 对本次推送 PENDING；主线 main-line 是快信号。

## 仍欠

- fail-safe-invalidate 的进程级端到端验证（双进程 + 真 ioredis + 抢发）。
- 观察指标：不接 Prometheus 抓取（本仓暂无统一指标面），stats 字段供 `/api/admin/realtime` 之类
  的管理面按需读出——目前无任何消费者，字段先立存在。
