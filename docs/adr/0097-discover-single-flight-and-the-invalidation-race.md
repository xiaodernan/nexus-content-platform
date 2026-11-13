# ADR-0097：发现页最热只读路径要 single-flight 抗惊群，失效与飞行的竞态要用 generation 关掉

- 状态：已接受（2026-11-12）
- 相关：`docs/adr/0095-...`（anon 发现页缓存的语义契约门）、`docs/adr/0096-...`（同一路由的 HTTP 应答头契约）、
  `apps/web/src/server/cache/discoverRouteCache.ts`、`discoverRedis.ts`、`apps/web/test/discover-singleflight.test.ts`

## 背景：两个真缺口，都能被确定性测出来

`cachedDiscoverAnonymous()`（v663 钉了语义、v664 补了 HTTP 头）在 15 秒窗口里挡住了重复读，但**窗口边界本身没人守**：

1. **惊群 / cache stampede。** 15s 窗口过期的那一瞬，N 个并发 anon 请求会同时 `cache.get` miss，随后各自
   跑一遍 `discover()`。而 discover 是全站最热只读路径，每行要算三条 `count(*)` 子查询。窗口边界 × 并发
   必然打出数据库尖峰——缓存最需要挡的恰恰是它自己失效的那一刻，而它那一刻什么都没挡。
2. **失效与 in-flight 的竞态（更隐蔽）。** `invalidateDiscoverRoute()` 由 publish / moderation 两条**写**路径
   调用，语义是"新内容 15s 内可见"。但若某笔"失效前开算、失效后才落地"的旧计算照常 `set`，它就会把刚清掉
   的窗口**填回旧内容**——下一位读者命中那份陈旧快照，承诺被绕过、且最坏再拖一个 15s。这不是理论：写路径
   撞上窗口刷新是常态。

两件事都不是"加个锁"能一并解决的：前者要**合并并发**，后者要**区分飞行属于哪一代窗口**。

## 决定

在 `discoverRouteCache.ts`（与它守护的窗口同模块）给 `cachedDiscoverAnonymous` 加两个机制，均在**进程内**（不碰 `DiscoverCache` 驱动接口，故内存 / Redis 两驱同等受益，驱动契约一字不改）：

1. **single-flight 飞行表** `Map<DiscoverSort, Promise<DiscoverResult>>`：`cache.get` miss 后先看同 sort 有没有
   在途飞行，有就 join、绝不再开一次 compute。三条实现命门，缺一即错：
   - **登记必须同步**、在任何后续 `await` 之前——否则两个并发各自 `get` miss 后又各自开算（红门 A1 实测的正是这条）；
   - **失败要摘表**——否则下一位 join 一个已 rejected 的旧 promise，本该能重算的请求被历史失败绑死；
   - **摘表要验身份**（`inFlight.get(sort) === flight` 才 delete）——失效后同一 sort 可能已登记新飞行，无条件
     delete 会误删新人，令本该 join 的请求再开一程（红门 A3）。
2. **generation 窗口代号**：`invalidateDiscoverRoute()` 先 `generation += 1` 并 `inFlight.clear()`，再 `await clear()`。
   每笔飞行记住自己的 `startedAt`；落地时若 `generation !== startedAt`，**不写回**（那份请求仍拿到自己的结果，
   不凭空失败），从而关掉迟到写回竞态。clear 让失效之后的新请求另起一程，而不是搭旧快照的车。
   先 bump 再 await：`clear` 是异步的，"窗口已失效"这个事实必须对在途飞行**立刻**可见。
3. `await` 写回而非 fire-and-forget：调用方拿到结果时缓存已落地，"窗口命中不再算"这条才确定性成立；
   缓存驱动侧本就吞错，写回失败不让已算好的请求失败。

**边界（不声称）**：single-flight 只合并**本进程**这一瞬的并发；多实例之间的重复读仍由 Redis 共享窗口挡。
两层各管一段、不重叠——这与 ADR 0095 的"跨实例一致性由 Redis TTL 兜底"是同一句分工。

## 实测读数（measured, not assumed）

- **红门先立、缺口先证**：改造前 `discover-singleflight.test.ts` **3 FAIL / 6**——① 并发只算一次（期望 1 实测 2+）、
  ② 失败合并（期望 1 实测 2+）、③ 迟到写回（失效后期望 `fresh` 实测 `stale`）。三条分别把两个缺口钉在真实现上。
- **绿门**：改造后 `discover-singleflight.test.ts` **6/6**（并发合并为 1 · 错误共享同一 rejection 且失败不被记住 ·
  两 sort 各飞各的 · 命中不重算 · 迟到写回不填旧内容 · 失效期新请求另起一程）；
  v663 的 `discover-route-cache.test.ts` **9/9** 无回归（15 条合计）。
- `npx tsc -p apps/web/tsconfig.json --noEmit` **exit 0**；`npx eslint <两文件>` **exit 0**（首次串 tsc 跑被宿主
  内存峰 SIGTERM，单独重跑干净 — 资源峰，不是红）。
- **变异臂 + 反向对照 7/7**：用与生产同构的纯状态机模型 + 真实并发 deferred 驱动（只读内存、不碰共享树），
  3 个变异臂各观测到对应退化（去 single-flight → 3 次惊群；去 generation → stale 回填且失效后零重算；
  去 release 身份校验 → 误删新飞行、第三请求重算）；4 个反向对照 / 正确路径保持门绿（并发合并 1 ·
  两 sort 分离 · 失效后拿 fresh · 旧飞行落地不误删新飞行）。证明门 discriminating 的正是这三个机制本身，
  且不会惩罚正当实现。
- 测试形状：可控 `pending()` 而非真实计时器制造并发窗口——compute 何时 settle 由测试说了算，"是否真的合并"
  是确定性可观察的，不靠 sleep、不连库、不起 Redis、不改源码，0.3–0.6 GB 空闲的共享宿主跑得动。

## 仍欠（如实记，不冒充已验）

1. **没有真并发 HTTP 腿。** 门用的是 deferred 驱动的内存状态机 + 真 `cachedDiscoverAnonymous`，没有起 `next start`
   并用真 N 路并发打 `/api/discover`、从 wire 测数据库查询次数。single-flight 在真实 Next Route Handler 生命周期
   （每请求是否共享同一模块实例、worker 之间是否隔离）下的合并效果**未实测**；本片证明的是这一层函数的契约，
   不是端到端并发压测。真要做，应在有资源 / 真库的宿主上补一条 N 路并发 + 查询计数的行为腿。
2. **Redis 驱动下 generation 关的是"写回判断"，不是原子的 set-if-uncancelled。** 当前实现是"落地时读 generation，
   相等才 await set"；`await set` 与 invalidate 的 `await clear` 之间理论上仍有一个交错窗口（飞行判完相等、正写回时
   失效发生）。内存驱动下 set 同步、无此窗口；Redis 驱动下要彻底关掉需 Lua / WATCH 式的条件写，那是给一个
   "最坏多陈现 15s 的头部"付分布式事务的代价，本片**判断不值**、如实记为界而非事故。
3. **`inFlight` 是模块级单例**，测试通过 `__resetDiscoverCacheDriverForTests` 之外的路径不重置它；跨测试若需要
   清零状态应经专门的 seam。当前 6 条门各自 await 所有飞行落地、互不残留，故无需新增 seam；若将来出现会遗留
   在途飞行的测试，应加 `__resetDiscoverInflightForTests()` 并在 beforeEach 调用，而不是让状态泄漏。
