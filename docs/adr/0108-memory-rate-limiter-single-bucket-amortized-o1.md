# ADR-0108：把限流单桶从"每笔扫满 O(limit)"降到摊还 O(1)——以及一道差点假绿的门

- 状态：accepted
- 日期：2026-11-12
- 版本片：v675
- 关联：ADR 0104（v671，桶数维度摊还复杂度门）、ADR 0105（v672，同进程 A/B 裁决纪律）、
  ADR 0106（v673，**本片兑现其仍欠③**：O(limit)→O(1) ring 等 parity 腿本机可跑）、
  ADR 0076/0077（限流驱动退回与桶上界）、ADR 0094 X4（门不许惩罚正当改动）、
  ADR 0095（注释/门声称的语义必须有门去读它声称的那件事）、`rate-limit.redis.integration.test.ts`
  （两驱动逐格 parity）、cont.37/38（真 Redis `nexus-redis:56379` 与真 DB 本机可用）

## 背景：v673 量出洪水期最贵的那一笔，却只门不改

`MemoryRateLimiter.hit` 的滑动窗口是 `(previous?.hits ?? []).filter(t => t > cutoff)`：单桶命中每笔
扫一遍 `hits`，成本 O(桶内时间戳数) ≤ O(limit)。v673 / ADR 0106 把它从页眉注释变成确定性门，量出
**撞上限（`allowed=false`）时不 push 却照扫满 limit 条**——这道闸在最该省成本的洪水期，单请求最贵，
正对着 §137 guest 自动签发那种免成本写入口（`一个新访客 = 一只新桶`）。

v673 当时**刻意不改生产**：O(limit) 是设计内的有界成本，换算法会碰与 Redis 逐条对齐的三条语义，
而"parity 腿本机跑不全（无真 Redis）"。所以留了明确欠账（仍欠③）：

> 把 O(limit) 真正降到 O(1) 环形缓冲 / 双指针裁剪是明确的后续候选，但要等 parity 腿本机可跑。

**本片的前提变了**：cont.37/38 已在本机起 `nexus-redis`（56379），`rate-limit.redis.integration.test.ts`
的 parity 组（改前基线实测 2/2 green、`fallbackCount - settled = 0` 证明测量期真走 Redis）逐格比对
两驱动的 `allowed/count` 与 `retryAfterMs` 方向。**这个 locally-runnable parity leg 现在成立**，欠账可以还。

## 一个比算法更先要解决的陷阱：门会假绿

v673 的两道门数的是 **`Array.prototype.filter` 回调次数**（封顶：零方差 + ≤limit+32；正交：8 桶 vs
4096 桶相等）。一旦把 `filter` 换成双指针，那个计数**恒为 0**：

- 封顶门：`new Set([0,0,...]).size === 1` ✓、`0 ≤ limit+32` ✓；
- 正交门：`0 === 0` ✓。

三句全绿，而门声称守的"单桶成本"它已经**根本没在读**了。这是 ADR 0095 的反面：门钉了一个实现一换
就恒 0 的代理量，退化发生时它不会响。变异臂 **M9** 把这件事实算出来：一个"每笔改回扫全桶并如实报
visits"的实现，在 v673 旧门下逐笔恒 64、零方差、64≤96 ⇒ **判绿**，而它其实是 O(limit) 退化。

**决定**：生产如实报出 `windowVisits`（这一笔 head 游标检查了几个时间戳），门改读这个**真实算法步数**，
判据从"有界 O(limit)"升到"摊还 O(1) 恒 1"。这不是把门改松，是把断言钉到更本质的形状上。

## 决定：head 游标 + 惰性压实（摊还 O(1)）

滑动窗口的 `hits` 天生升序（每笔 `push(now)`，`now` 单调不减），所以过期的一定是**一段前缀**。
给 Bucket 加 `head`：`hits[head..]` 是活窗口，`hits[..head)` 是已越过、待压实的过期段。

1. `hit`：while 越过所有 `t <= cutoff`（与旧 filter 同一个 `>` 判定），head 只前进；
   `count = hits.length - head`；`allowed = count < limit`；放行才 `push(now)`。
2. **惰性压实**：`head >= 32 且 head×2 ≥ hits.length` 时把活段 `splice(0, head)` 到头、head 归 0。
   不当场删是避免每笔付 O(数组长) 的搬移；攒到过半一次搬，搬移次数摊还到那批元素上仍是 O(1)。
   门槛同时给数组封顶：`head×2 ≥ length` 才压 ⇒ 没压时活段至少占一半 ⇒ `hits.length ≤ 2×limit + O(1)`，
   内存仍与 limit 成正比，不是无界（页眉"限度"段已同步修正）。
3. **三条与 Redis 对齐的语义一字未改**：被挡不计入（不 push）、严格 `t > cutoff` 留下、
   `retryAfterMs` 从最早活条目 `hits[head]` 算（= 旧版 `window[0]`）。压实只砍头不动尾，
   所以 `sweepExpired` / `evictToCap` 读 `hits[length-1]` 判整桶过期仍正确。

为什么信它不改变判定：**24300 格新旧对拍**（`docs/evidence/ds/single-bucket-ab.mjs`）——4300 格固定
`limit/windowMs` + 20000 格 `limit`/`windowMs` **逐笔剧变**（专压 head 单调性：窗口变大时被越过的元素
该不该复活；答案是原版写回式丢弃、新版越过式丢弃，两者都不复活），逐字段严格相等
（`allowed/count/retryAfterMs/newest`）。语义推断必须用抖动时钟实测，不靠想。

## 后果：一道更好的门 + 一批证据

`ds-complexity-contract.test.ts` 的 v673 describe **迁移**为 v675 的摊还 O(1) 契约（从 6 条到 9 条，
原 TtlLru 4 条 + 桶数维度 2 条不动 + 新 3 条），全部只读 `windowVisits`、不读墙钟：

1. **O(1) 封顶门**：满桶洪水（冻结时钟、窗口整段不过期）逐笔 `windowVisits` 增量**恒为 1**。
   改回每笔扫全桶 ⇒ 变成 limit（8/64/4096）而红。
2. **正交门（升轴）**：v673 只钉"与桶数正交"；v675 升到"与 **limit** 也正交"——8/64/4096 单笔恒 1。
   真 O(1) 必须对两个会长维度都平（呼应 ADR 0106 纪律沉淀"问对哪几个维度成立"）。
3. **摊还累计门**：N 笔滚动命中总 visits ≤ 2N+O(1)。压实若失效（废弃段拖累），累计超线性而红——
   一条门同时钉住"摊还 O(1)"与"内存有上界"，不必读内部数组、不破坏封装。

**变异臂 10/10（7 RED + 3 GREEN）**，纯 Node ESM 内联同款判据（`complexity-arms.mjs`）：
- M9（RED，核心）：改回扫全桶、如实报 visits=8/64/4096 ⇒ v675 门红；**同臂实算 v673 旧门会假绿**；
- M10（RED）：head 不持久 + 不压实（每笔从头越过期前缀）⇒ 累计 17879 > 2N=4000，摊还门红
  （这是一个**可达**的真实写错：把 head 存成局部变量忘了写回桶）；
- M11（GREEN，正面臂）：一条与生产**不同**的正当 O(1) 路径——固定容量环形缓冲，三道门全绿，
  证明门不绑定"head 双指针"这一种实现（ADR 0094 X4）。

## 实测：墙钟从线性变平，收益裁决仍只信同进程 A/B

`scripts/ds-benchmark.mts` 第 4 组（真实 `MemoryRateLimiter`，同一次进程内，只归档不裁决）：

| limit | v673 改前 p50 us（filter, O(limit)）| v675 改后 p50 us（head, O(1)）|
|---|---|---|
| 8 | 13.15 | 4.88（另一轮 3.37）|
| 64 | 17.92 | 4.75（另一轮 4.08）|
| 512 | 56.93 | 4.71（另一轮 4.02）|

改前随 limit 线性涨 **4.3×**（13→57us）；改后三档在 ±3% 内**持平**——墙钟侧清晰印证 O(1)。
`ns/op` 收益随 limit 增大（limit=512：64003→5555），正是洪水期最贵的那档省钱最多。
JSON 存档 `docs/evidence/ds/bench-single-bucket-o1-v675.json`。

**收益裁决不靠这里的跨进程墙钟**（v672 被 +695% 假 8× 教过：同代码连跑 ±40%）。裁决走
`single-bucket-ab.mjs` 的**同进程交替 A/B**（9 轮、反转先后抵消 JIT 热身、取 p50 中位数）：满桶洪水
（limit=64、40k ops）old/new 中位 **115–127×**（连跑 3 次 116.8/122.1/122.7；每轮离散 32–158×）。
**这个绝对值不可当 SLA**：纯数组 microbenchmark 里旧版每笔 filter 分配新数组 + 扫 64 条，新版 while
探 1 格，宿主 GC 把比值放大；生产 `hit()` 还有 `increment`、Map delete/set、Promise 分配等**与 limit
无关的固定开销**会显著稀释端到端收益。**可信结论只有方向**：洪水期单桶成本从随 limit 线性变成与
limit 无关，big-limit 档收益最大；绝对值只归档。

## 零回归与门

- **语义零回归**：内存语义门 `rateLimit.test.ts` + `rate-limit-readout.test.ts` **35/35**；
  **真 Redis parity 组 2/2**（`NEXUS_REDIS_URL=redis://127.0.0.1:56379`，`fallbackCount - settled = 0`）——
  改后与改前同一逐格比对，两驱动 `allowed/count` 仍逐格相同、`retryAfterMs` 方向/量级仍一致。
- 全套 8 文件 **98/98**（契约门 9 + TtlLru + 限流语义/读数/规则 + discover 全套，零外溢）；
  契约门 **9/9**；变异臂 **10/10**；web 测试域 + tools 域窄 tsc 各 exit 0；eslint 5 文件足堆分两批
  exit 0（5 文件一次跑 SIGTERM 是宿主资源峰、非 lint 红；拆分后 TS 批 0、mjs 批 0，mjs 批首版抓到
  一个真 `prefer-const`，修掉）；`verify:record-encoding` exit 0（**0 chargeable lines over 2238 graded
  files**，新中文注释未引入未 pin ISLAND 行——共享树隐藏雷，v673 踩过，实测才敢提交）。
- 两个窄 tsconfig 跑完即删、从不暂存。

## 仍欠（如实记）

1. A/B 是**单宿主 9 轮**，无固定 CI 机型上的多会话均值；中位 115–127× 是纯数组段的量级，
   端到端 `hit()` 被固定开销稀释后的实际倍数**没有单独测**（墙钟在共享宿主上不够稳）。
2. 对拍 24300 格覆盖固定与抖动 `limit/windowMs`，但**并发同毫秒**下 head 游标的写回顺序没有专门并发门
   （`hit` 函数体同步跑完、无 await，单进程内串行，故安全；多实例共享窗口本就该设 `NEXUS_REDIS_URL`，
   不靠这一版）。
3. 只改了**进程内**驱动；Redis 驱动本就是服务端 `ZREMRANGEBYSCORE` 滑动窗口，无此 O(limit) 问题。
   退回路径（`RedisRateLimiter` 断线时用这一版）同样受益，但没单独量退回期收益。
4. `windowVisits` 是新暴露的只读诊断 getter，暂无运维消费者（与 v670 stats 字段同类，先立存在）。
5. **hosted Studio CI** 对本推送的 proofs-battery verdict 未回；主线 main-line 是快信号。

## 纪律沉淀（本片最重要的产物，比算法本身更可复用）

- **门读的代理量会随实现换掉而失效**：v673 数 filter 回调，v675 一换实现它就恒 0 假绿。给一个成本
  做门时，要么门读**实现如实报出的真实步数**（本片 `windowVisits`），要么门随实现一起迁移判据；
  绝不能让门留在一个"今天恰好等于成本、明天恒 0"的代理量上（ADR 0095 的执行版）。
- **判据升级要有牙的见证**：从"有界 O(limit)"升到"恒 1 O(1)"不是放松，是收紧。M9 同时证明新门会红、
  旧门在同一退化上会绿——把"为什么必须改判据"实算出来，而不是声称。
- **stated bound 兑现成 gated bound 的时机**：ADR 0106 说"等 parity 腿本机可跑再动核心算法"，
  这条纪律本身就是对的——本片正是因为真 Redis 可用、parity 2/2 才敢碰限流热路径，不是等不及。
- **同进程 A/B 裁决、墙钟只归档、对拍先于改动**：24300 格对拍（含抖动）→ 改生产 → 真 Redis parity
  零回归 → 同进程 A/B 裁方向。这个顺序让"改限流核心算法"这种高风险动作变成可证伪的增量。
