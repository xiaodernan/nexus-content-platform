# ADR-0117：发布冷启动「惊群」先观测不设闸——三道天然舱壁已够，无实测尖峰不写通用并发闸门

- 状态：Accepted
- 日期：2026-11-11
- 相关：ADR-0113（按 viewer 分键缓存 / 单调水位线）、ADR-0114（跨实例 pub/sub 失效 / 最终一致）、ADR-0115（读数接 admin 面板 / `null≠0`）、ADR-0116（独立 `globalEpoch` 键段 / 单向兼容帧）、ADR-0109（Bulkhead 是声明的边界不是库默认）、§SC 第四十五片

## 背景（ADR-0116 诚实留下的那句，这一轮正面回答）

ADR-0116 为了让新作品发布/下架/rejected 后**即时**进发现页，给缓存键加了独立 `globalEpoch` 键段，每次全局失效 `+1` 让所有旧键（含匿名、含每个登录 viewer 的每个 sort）一次性拼不出来。当时明确记了一条**诚实边界**：

> 全局失效 ≈ 一次冷启动。singleflight 只合并**同键**并发、不跨键，故打库量随活跃 `(viewer, sort, limit)` 组合数上升。这是「发布即时可见」的直接代价，不是 bug；代价与收益都在面板 `globalEpoch` 读数里可见。

换句话说：一次 public 发布会同时作废全站发现页缓存，随后若有一波并发导航，每个**不同的** `(viewer, sort)` 组合都可能各自打一次库。自然的下一个冲动是：**写一个跨键的并发闸门（semaphore / bulkhead），把这一波钉在 `N` 个以内**。

本片先做调查而不是动手写闸门。结论是**反向的**：不写。改为**有界观测优先 + 按需减载预案**。

## 调查：真实规模上界与已有舱壁

### Q1 一次全局失效最多能打出多少个键？

按生产调用面逐个核对，而不是拍脑袋：

- `limit`：`/api/discover/route.ts` 与 `app/discover/page.tsx` 都**不传 limit**，恒走默认 24。故 `(viewer, sort, limit)` 实际退化成 `(viewer, sort)`。
- `sort`：RSC 一次导航只请求当前 tab 的**一个** sort（`new` / `popular` / `following`），不是四个一起打。
- **匿名**：`generation` 恒 0，键只随 sort 变 → 最多 **4 个**匿名键（`trending` 虽有 RSC tab 但 public API 白名单只有三个，取上界按 4 算）。
- **登录 viewer**：受 `maxEntries=2048` / `maxViewers=512` 与真实活跃人数双重限制；且同一 viewer 的多个 sort 是不同键，但**每个键的 singleflight 会合并它自己的并发**。故一次冷启动的键数上界 ≈ `活跃 viewer 数 × 该瞬间的 sort 数`，常态是个位数到几十。

结论：**常态下一次全局失效的打库上界是个位数键**，不是 unbounded。即使热榜有人在刷，也是被 `maxEntries` 与活跃人数物理封顶的。

### Q2 已经有几道天然舱壁？（关键：不是"什么都没做"）

| 舱壁 | 位置 | 挡什么 |
|---|---|---|
| singleflight | `BoundedCache.getOrLoad` 的 `inflight` Map | 同键并发只跑一次 loader；`loads` 只在真发起时 `+1` |
| DB 连接池 | `apps/web/src/server/db/client.ts`：`postgres(DATABASE_URL, { max: NEXUS_DB_POOL ?? 5 })` | **物理**并发上界：最多 5 条 SQL 同时在途，再多排队 |
| 网关舱壁 | Java 网关 `SemaphoreBulkhead`（ADR-0109/§SC-37） | 网关侧声明的并发边界 |

**DB 连接池 `max=5` 本身就是一道硬 bulkhead**。发现页冷启动的并发 SQL 无论如何不会超过连接池容量——超出的请求在池里排队，不是把数据库打穿。既然物理层已经封顶，再加一道应用层的跨键 semaphore 在「防止数据库被打穿」这件事上是**重复**的。

### Q3 为什么还是可能想加闸门？——以及它为什么是净损失

唯一站得住的动机是"怕排队本身拖慢请求"。但通用跨键闸门会引入**新的失败模式**，且每一条都比它要解决的问题更糟：

1. **permit 泄漏**：`acquire` 后若 loader 抛错/调用方中断/热重载，忘记 `release` 就永久少一个 permit，缓存越用越慢。
2. **排队饿死**：需要先验决定 permit 数（给 5？给 10？），定小了常态流量就在排队，定大了等于没设；且无法区分"冷启动该等"与"常态请求不该等"。
3. **读数失真**：`inFlight` 语义被污染——它现在精确表示"正在跑的 loader 数"（singleflight 的键数），加了闸门后变成"拿到 permit 在等的 + 在跑的"，`discoverCacheStats().inFlight` 这个 SC-43 已经接进面板的诚实读数就不再是它写的那个意思。
4. **延迟稀释 SC-44 的即时承诺**：闸门一旦排队，"发布后下一屏立刻看到新作品"就变成"发布后等到 permit 空出来才看到"——把 ADR-0116 花力气兑现的 `null≠TTL` 即时性，用一道队列悄悄退化了。
5. **不减少总 SQL**：闸门只摊平**并发**，不减少**总量**；`N` 个键迟早还是要查 `N` 次库，只是从"一起打"变成"排队打"。对连接池这个真正的瓶颈，收益≈0。

**没有实测尖峰证据**支持"默认参数下会打穿"。为不存在的问题引入 5 类新失败模式，是负收益。

## 决定

### 1. 不写通用并发闸门；先把尖峰变成可观测数字（观测优先）

在 `discover-cache.ts` 加**有界失效波采集**：每次 `globalEpoch` 跳变记一个「波」，采样该波窗口内（默认一个 TTL，`NEXUS_DISCOVER_WAVE_WINDOW_MS`）的：

- `loadsDelta`：`cache.stats().loads` 的差值 —— **精确**锚定"这一波真打了几库"（`loads` 只在真发起 loader 时 `+1`）；
- `peakInFlight`：每次读之后的**瞬时** inFlight 采样最大值 —— 诚实标注是采样、**非锁存精确峰值**；
- `firstFillMs`：从失效到第一次真打库的毫秒数；窗口内无人读为 `null`（**不是 0**——0 会谎称"瞬间就有人读"，与 `hitRate(0,0)` 不说 0% 同一条纪律）；
- `settled`：是否仍在采样窗口内（false = 读数还会变）。

读数进 `DiscoverCacheStats.waves` / `.waveConfig`，经 `describeDiscoverCache()` → admin route → 面板「发布冷启动波」节原样端出。**只记不拦、零新 DB 查询、零生产行为变化**。

### 2. 采样点必须在 `getOrLoad` 同步登记 inFlight 之后（一个真实陷阱）

`BoundedCache.getOrLoad` 是 async，但调用它的**同步段**就完成了 `inflight.set` 与 `loads += 1`，`fromLoad` 在 `await load` 处才暂停。因此：

- 若在 `await` 返回后才采 `inFlight`，`fromLoad` 的 `finally` 已经清掉 inflight → `peakInFlight` **恒 0**，把惊群谎报成"没有"；
- 正确做法：`loadFromStore` 里 `getOrLoad(...)` 调用**后立刻**采一次（抓到"我 + 其它并发重填"的瞬时在途峰值），`await` 收尾（含失败）再采一次定稿 `loadsDelta` / `firstFillMs`。

判据 `discover-cache.test.ts` 专设一条「两个键并发卡在 gate 上 → `peakInFlight ≥ 2`」钉死这个采样点：若有人把它挪到 `await` 之后，这条会红。这正是"读数会不会说谎"必须被测试守住的例子。

### 3. 观测与主业严格隔离（SC-44 的承诺一字不改）

全局失效内核 `bumpEpochAndOpenWave` 的顺序是契约的一部分：

1. 先 `globalEpoch += 1`（主业，本机即时生效、fail-open 最后一道）；
2. 再开波（观测），用 `try/catch` 兜住。

本机写路径与**远端全局帧订阅回调**共用这一内核——多实例下，收到发布帧的那台也要开自己的波，否则面板上只有"发布那台"的尖峰可见、其余实例一片空白，又是一个 `null≠0` 式的谎。`loadFromStore` 的两次采样同样 `try/catch`：**观测代码抛错绝不允许反过来破坏缓存失效或吞掉 loader 的异常**（判据专设"loader 失败不崩、异常不吞"）。

### 4. 有界：环形缓冲 + 不跨 reset

- `waves` 存进容量 `NEXUS_DISCOVER_WAVE_CAPACITY`（默认 12）的有界环形缓冲，超了丢最旧——读数不随发布次数无界增长（数据结构有界纪律，与 `maxEntries`/`maxBuckets` 同源）；
- 波**不跨** reset / 热重载保留（旧进程的波带旧 epoch，会与新 store 撞值误导运维），与 `globalEpoch` **必须**跨 reset 保留恰好相反——判据把这两条钉在同一条里；
- 惰性定格靠 `stats()` 读取与下一次加载驱动，**无定时器**（无后台资源、无热重载残留）。

### 5. 触发阈值与按需减载预案（未实现，留证据门槛）

**只有当实测 `peakInFlight` 持续逼近 `NEXUS_DB_POOL`（默认 5）时**，才启动减载，且优先做**不引入跨键闸门**的方案：

- **O(1) 匿名 `new` 写侧预热**：public 发布成功后，顺手在本机同步重填一次匿名 `new` 那份共享缓存。匿名只有 ≤4 个键、且无 viewer 隐私差异，写侧预热用一次确定的 DB 查询换掉"那一波里最确定会发生的匿名冷启动"，不排队、不稀释登录 viewer 的即时性；
- **满即减载**：对登录 viewer 的键，若 `inFlight` 已达池上界，新到的**同键**请求仍并入 singleflight（本来就是），**不同键**请求不排队、直接穿透查库——查库会自然在连接池排队，把背压交给最懂它的那一层，而不是在应用层再造一道会泄漏 permit 的队列。

**绝不**为了"看起来平稳"而让请求在应用层排队稀释 SC-44 的即时可见。总 SQL 不变，只是把并发交给连接池这个已有 bulkhead 管理。

### 6. 面板诚实：空波榜 ≠ 没有惊群

`wavesHeadline([])` 说"这台实例还没经历过全局失效波（还没发布过 public 作品）——是尚未触发采样，不是'测过没有惊群'"。`waveNote` 把三道舱壁、上界个位数、未加闸门的理由、触发阈值都摆到运维眼前；`firstFillMs=null` 画"窗口内无人读"，不画 0ms。零新增颜色 token、状态色只染圆点、reduced-motion 归零。

## 后果

### 正面

- ADR-0116 留下的"预期冷启动尖峰"从**猜测**变成**可观测、可设阈值的数字**——运维第一次能回答"一次发布到底打了几库、峰值在途多少、多久才有人读"。
- 拒绝了 5 类新失败模式（permit 泄漏 / 排队饿死 / 读数失真 / 延迟稀释即时性 / 不减总量），SC-44 的即时承诺与 SC-43 的 `inFlight` 诚实读数都不被破坏。
- 判据把"读数会不会说谎"钉成可执行测试：采样点挪位、空榜误读、`null` 变 0、观测抛错、波无界、跨 reset —— 每条都有反证。

### 代价 / 诚实边界

- `peakInFlight` 是**瞬时采样**、非锁存精确峰值：极短促的尖峰可能被两次采样之间漏掉。ADR 与面板都如实标注，不冒充 profiler。
- `waves` 是**每台实例各算各的**快照，跨实例要看全部得逐台读面板（与 ADR-0115 的单机快照边界一致）。
- 减载预案（写侧预热 / 满即减载）**未实现**——没有实测证明需要它，先不做。这是刻意的克制，不是欠账。

## 验证

- 单测 `discover-cache.test.ts` +10：波配置回读、定向不开波/全局开波、受控时钟钉首击延迟与打库增量、`firstFillMs=null` 不说 0、惰性定格不重复、环形缓冲有界且最新在前、`peakInFlight≥2` 专钉采样点、loader 失败不崩不吞异常、不跨 reset（epoch 保留波清零）、JSON 安全往返。
- 多实例 `discover-cache.multi-instance.test.ts` +1：远端全局帧在对端也开自己的波。
- 路由层 `admin-discover-cache.integration.test.ts` +1：全局失效后 waves/waveConfig 端到端可见、形状门认得、读数动作不打库。
- 展示判据 `discover-view.test.ts` +10：形状门含 waves/waveConfig 正反、空榜诚实、峰值取最大、首击 `null` 不说 0ms、定格状态、方法论旁注四要素。
- 横向门 `style-tokens.test.ts` 24/24（零新增颜色 token）；`npx tsc -p apps/web/tsconfig.json --noEmit` EXIT=0；**全仓 vitest 404 files passed | 1 skipped（405 total）/ 5812 tests passed | 1 skipped（5813 total）、EXIT=0**（对比 SC-44 基线 404/5792+1 skipped，净增 20 tests = 6 文件 81→101，文件数不变因只在既有文件加用例；539.94s）。
