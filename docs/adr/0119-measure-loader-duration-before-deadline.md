# ADR-0119：加 deadline 前先量 loader 墙钟——发现页"慢"要证据，"永不返回"要诚实

- 状态：Accepted
- 日期：2026-11-11
- 相关：ADR-0112（`BoundedCache` 有界 TTL/LRU/singleflight）、ADR-0113（按 viewer 分键 / 单调水位线）、ADR-0116（`globalEpoch`）、ADR-0117（观测优先、无实测尖峰不加闸门）、ADR-0118（上游失败 stale 兜底）、§SC 第四十七片

## 背景（SC-46 留下的真实盲区）

SC-46 给发现页接上了 stale-while-error：上游打库 `reject` 时，若键仍有效、有旧值、够新，就端出旧页，让一次数据库抖动对读用户透明。但它**只在 `reject` 时触发**。若上游**永不回答**——慢查询、连接池排队、锁等待、TCP 黑洞——`discover()` 既不 resolve 也不 reject，SC-46 的 `catch` 永远不进；stale 旧值明明在表里，却端不出来，首屏就此焊死。这正是 SC-36 在网关侧测过的"连接黑洞"，但发现页这条本地 Postgres 热读链从没量过。

读码确证的事实：`server/db/client.ts` 只设 `postgres(URL, { max: NEXUS_DB_POOL ?? 5 })`，**没有 `connect_timeout` / `idle_timeout` / `statement_timeout` / query deadline**；全仓唯一的超时原语 `AbortSignal.timeout` 只用在 `fetch` HTTP 出站，DB 查询链零 deadline。`discover()` 主查询含 3 个 `SELECT count(*)` 子查询 + 三表 join，慢库上确有长尾风险。`max=5` 是 ADR-0117 依赖的物理 bulkhead，但它只让超出的 SQL **在池里排队**，不设等待上界。

于是直觉是"给发现页加个软超时"。但这恰恰是最危险的一步——

## 决定：先量再治，本片只做墙钟观测，不设任何 deadline

### 1. 为什么不直接用 `Promise.race` 软超时（关键失败模式）

`BoundedCache.getOrLoad` 的 singleflight 把 hung 的 loader promise 存进 `inflight`，只在 `fromLoad` 的 `finally` 清除。若只在 `loadFromStore` 外层 `Promise.race([getOrLoad(key, loader), timeout])`：

1. race 超时返回 stale 后，**底层 hung promise 仍挂在 `inflight`**；后续同键请求命中这个 inflight、`await` 它、**一起 hang**——超时对它们形同虚设。
2. 每个超时请求各起一个 race，底层 hung 查询不断堆积，占满 5 个连接，把**单键慢放大成全站发现页雪崩**。

`Promise.race` **不取消底层 promise**。在 race 层加超时不是"加一道保护"，而是"在共享索引 / 连接池仍被占用的前提下，多叠一层假装已经超时的返回"。这与 ADR-0117 拒绝"无实测尖峰就加并发闸门"是同一条纪律：**没有证据就动共享数据库层 / 共享 inflight 索引，净损失大于收益**。

故本片的决定是：**先拿真实数字回答"发现页加载到底有没有秒级长尾"，再决定要不要 deadline**。若最慢远低于阈值，`deadline` 就是伪需求、永不必做；若确有长尾，正确方向是给 `BoundedCache` 加可放弃 inflight 的 `abandon(key)` 原语，或用 Postgres `statement_timeout`（波及全站、高危、须单独评估）——**都不能在 `Promise.race` 层做**。

### 2. 观测手段：包装 loader，而不是在加载外层掐表

墙钟观测走**另一条独立路线**，不复用 ADR-0117 失效波那两处读侧采样点。`loadFromStore` 把注入的 loader 包一层 `withLoadTiming` 再交给 `getOrLoad`：

```ts
const pending = s.cache.getOrLoad(key, withLoadTiming(s, s.globalEpoch, loader));

function withLoadTiming(s, epoch, loader) {
  return async () => {
    const startedAt = s.now();       // 起表
    let ok = false;
    try {
      const value = await loader();
      ok = true;
      return value;
    } finally {
      try { observeLoad(s, epoch, startedAt, ok, s.now()); } catch { /* 观测绝不拖垮主业 */ }
    }
  };
}
```

**为什么必须包 loader、而不是在 `loadFromStore` 外层拿 `s.now()` 掐表**——这是本片最容易被做错、也最容易制造假读数的一处：

- `getOrLoad` 的 singleflight **只对 leader 真正调用 loader**（`Promise.resolve().then(loader)` 只在没有 running 时执行一次），跟随者 `await` 同一个 inflight promise、**根本不会进被包装的函数**；缓存命中更是不调 loader。故"包 loader"天然只计时**真实打库那一次**。
- 若改在 `loadFromStore` 外层掐表：N 个同键并发会把一次打库记成 N 次，且每个跟随者记下的是"等 leader 的墙钟"而非查询耗时——等于**用观测亲手制造一份"并发越高越慢"的假长尾**，正是 ADR-0117 那类"读数失真"诚信事故的另一副面孔。
- 判据 `§SC-47 singleflight 跟随者不重复计时：N 个同键并发只记 1 次、且不含"等 leader"的墙钟` 专钉此点（若把包装挪到外层，这条立刻红）。

波（ADR-0117）与耗时（本片）刻意分开：波要的是"失效后多久、几键并发"的**读侧**瞬时快照；耗时要的是"单次打库跑了多久"的**loader 侧**墙钟，且必须避开 singleflight 跟随者的等待时间。两者时序需求不同，共用同一个注入时钟 `s.now()`，但采样点互不干扰。

### 3. 记什么、不记什么（诚实边界，本片最要紧的一条）

`DiscoverCacheStats` 新增四个字段，全部**进程内账、只增不减、不跨 reset**（与波 / staleServed 同列，都是观测快照，不是要保住的 `globalEpoch`/`globalGen` 水位线）：

- `maxLoadMs`：进程内已 settle 加载里最慢一次的墙钟（毫秒）；**`0` 是"还没量到"，不是"都是 0ms 光速查询"**；
- `slowLoads`：墙钟超过 `config.slowLoadMs`（默认 1000ms，`NEXUS_DISCOVER_SLOW_LOAD_MS` 可覆盖）的加载次数；**`0` 是"还没观测到超阈值的加载"，不是"没有慢查询"**；
- `loadsTimed`：已 settle 并被计时的真实打库次数；
- `recentLoads`：`LoadDuration { epoch, durationMs, ok, atMs }` 有界环形缓冲（默认 12 条，`NEXUS_DISCOVER_LOAD_SAMPLE_CAPACITY` 可覆盖），新的在前，分布形状与归属世代一眼可见。

**最关键、也最容易被拿去说谎的一条：`maxLoadMs` / `slowLoads` / `recentLoads` 只覆盖"已 settle"的加载。** 永不 resolve/reject 的 hung loader 永远到不了 `finally`，**不进样本**。因此：

> "最慢 12ms、slowLoads=0" **只能证明"没有慢到超阈值的已完成加载"，不能证明"没有连接黑洞"。**

hung 的旁证是另一条链：`CacheStats.loads − loadsTimed` 长期为正、且 `inFlight` 不归零（SC-45 波已把它接进面板）。面板 `loadNote` 与 KPI 里的"发起 − 已计时"一行把这件事**明摆给运维**，绝不拿"最慢低于阈值"当"没有 hang"的免死金牌。判据 `hang 诚实边界：永不 settle 的 loader 不进样本；maxLoadMs=0 但 loads−loadsTimed=1 暴露卡住` 精确钉住——用 settles 之外的信号暴露 hang，而不是伪造一条"完成耗时"。

`epoch` 在加载发起那一同步段锁定（与 key 同源），期间即便发生 public 发布也不会冒充结束后的新世代归属；判据用"loader 跑的途中 invalidateDiscoverGlobally"钉死。

### 4. 只记不拦：零生产行为变化

- `slowLoadMs` 是**观测分类旋钮、不是超时**：超过它只 `++slowLoads`，**不超时、不 abort、不中断底层查询、不改返回值、不改异常传播**。
- 观测的每一步（读时钟、`observeLoad` 的算术与有界缓冲）都包在 `try/catch` 里；时钟源 / 样本缓冲出任何意外都不影响 loader 的返回值与异常。观测代码零新 DB 查询、不碰共享 `BoundedCache`、不碰 `db/client.ts`、不改 `discover` 函数体与两个入口、不改 `DiscoverResult` 领域类型。
- 失败 loader 同样记一条 `ok:false` 样本（慢失败也是长尾证据），且 SC-46 的降级/重抛发生在 `getOrLoad` 之后，不改变这条的成败归属；判据钉"与 SC-46 降级共存：慢失败端出旧页，耗时记 ok:false、staleServed 照旧"。

## 面板与诚实读数

`describeDiscoverCache → route → 面板` 既有链路原样端出四个新字段（route 本就"读进程内账、不打库、不加工"），`DiscoverPanel` 加"加载耗时观测 · 只记不设闸"节，`discover-view.ts` 三条纯判据：

- `loadTimingHeadline(0,…)` 说"还没量到一次已 settle 的打库——是尚未观测，不是'没有慢查询、都很快'"（同 `null≠0` / `hitRate(0,0)` / 空波榜家族）；`maxLoadMs=0` 画"—（未测）"，绝不画"0ms"。
- `loadNote` 摆五件事：①只计真实打库、跟随者/命中不进包装函数；②只记已 settle、hang 不进样本、"最慢低于阈值"**不能**证明没有连接黑洞、要看 `loads − loadsTimed` 与在途；③超阈值只 ++、不拦不 abort；④环形缓冲有界；⑤真有长尾也不在 `Promise.race` 层设闸（堆积雪崩），而是 `abandon(key)` 或 `statement_timeout`（后者波及全站须单独评估），最慢远低于阈值则 deadline 是伪需求——先量再治。
- `isKnownReadout` 纳入 `loadsTimed`/`maxLoadMs`/`slowLoads`、`config.slowLoadMs`/`config.loadSampleCapacity`、`recentLoads`（逐条四字段、`ok` 必须布尔），坏回执在形状门挡掉，不把 `NaN ms` / `undefined` 画到运维眼前。

慢查询阈值 `slowLoadMs` **照画毫秒、不画秒**：它是毫秒粒度旋钮（判据用 50ms/100ms 收窄验边界），`/1000` 会把 50ms 谎报成 `0s`。零新增颜色 token，复用 `.gw-`/`.dc-`。

## 后果与仍欠

**已兑现**：发现页"加载到底有多慢"第一次从猜测变成可设阈值、可观测、有界的数字；SC-46 的 hang 盲区第一次有了明确的诚实边界与旁证（而非被"最慢很低"掩盖）；为"要不要 deadline"建立了证据门槛。

**仍欠（都是拿到证据后才动，属克制非欠账）**：

- 若实测确有秒级长尾、确需 deadline：给 `BoundedCache` 加 `abandon(key)`（超时摘掉 inflight、让底层跑完自清、后续请求重新发起），或评估 Postgres `statement_timeout`（波及全站、高危）。**绝不在 `Promise.race` 层做**。
- `server/db/client.ts` 的连接层黑洞独立看门狗（消除对 Lettuce / postgres.js 自身超时的依赖，SC-36 同类）；
- SC-45 按需减载预案（待实测 `peakInFlight` 逼近 `NEXUS_DB_POOL`）；
- 共享权威 generation/epoch 存储、实例粒度 breaker/bulkhead 聚合、CI `topology` job 经真实 push、3 条既存 `.mjs` TS8016。

## 验证（不粉饰）

判据净增 **+23**：内核 `discover-cache.test.ts` **+12**（config 回读 / 受控时钟钉单次墙钟 / 超阈值才 ++slowLoads 且取峰值 / 慢失败 ok:false 不吞异常 / **singleflight N 并发只记 1 次不含等待** / 缓存命中不计 / **hang 不进样本靠 loads−loadsTimed 旁证** / 有界缓冲 + 聚合不丢 / 不跨 reset / loader 途中发布仍记发起世代 / JSON 安全往返 / 与 SC-46 降级共存）+ 展示判据 `discover-view.test.ts` **+9**（形状门正反 + 三条纯判据各边界，含"50ms 不画 0s"）+ 多实例 `discover-cache.multi-instance.test.ts` **+1**（两台各算各的墙钟）+ 路由层 `admin-discover-cache.integration.test.ts` **+1**（真实慢 loader 端到端可见、形状门认得、`stats.loads` 不变即不打库）。SC-47 相关 4 文件合计 **118 passed**；横向门 `style-tokens` **24/24**（零新增颜色 token）；`npx tsc -p apps/web/tsconfig.json --noEmit` **EXIT=0**；SC-45/SC-46 既有判据零回归。**全仓 vitest 405 files passed（404 + 1 skipped）/ 5851 tests passed | 1 skipped（5852 total）、EXIT=0**（对比 SC-46 基线 404/5828+1 skipped，净增 23 tests = 4 文件 97→118，文件数不变因只在既有文件加用例；523s）。

**首跑真信号（判据自检，没放过）**：首轮定向 118 里红 4 条，逐条定性后修——

1. **一条面板真 bug**：`slowLoadMs` 被 `/1000` 画成秒， env/判据收窄到 50ms 时会谎报 `0s`；改为照画毫秒，并加判据 `loadNote(50,8).toContain('50ms')` 钉死。
2. **一条夹具设计错误（不是实现 bug）**：初稿用"让共享 `now()` 抛错"模拟"观测失败不拖垮 loader"，但 `now` 是 `BoundedCache.set` 与观测的**共用依赖**，时钟一抛连缓存写入一起挂，测的根本不是观测隔离。删掉这条不自洽的判据，换成更有信息量的"loader 途中发布 → 样本仍归属发起世代"。
3. **三条判据凭记忆编文案 / 单位**（SC-46 已踩过同一个坑，本片重演）：断言"已 settle"（真实文案是"只记已跑完"）、断言 `1s/2s`（实现是毫秒）、断言 `loads−loadsTimed`（真实文案带中文"真查库 loads − 已计时 loadsTimed"）。全部改为**逐字取自实现文案**的断言。**经验再次坐实：判据断言必须来自真实文案，不能凭记忆编一句"应该会说的话"**——否则要么误红、要么文案真出疏漏时反而不红。
