# ADR-0113：发现页热读按 viewer 分键缓存——隐私即时失效，和一个"淘汰就会复活旧隐私"的陷阱

- 状态：Accepted
- 日期：2026-11-11
- 相关：ADR-0112（网关读数门面 / `BoundedCache` 原语 / 缓存纪律）、§SC 第四十一片、`blocks.integration.test.ts:246` 的既有隐私边界、`docs/TESTING.md`（真库集成、禁 mock DB）

## 背景（这一轮填的格子）

`discover()`（`social.ts:414`）是发现页热读，四个入口（RSC `/discover`、route `/api/discover`）在 `force-dynamic` 下**每次导航都重跑**：一次匿名 `new` = 1 条主查询，登录 `new/popular` = 2 条（先 `hiddenAuthorIds`），登录 `following` = 3 条，`trending` = 主查询 + 5 条按天聚合。此前**外面没有任何缓存**，也没有 React 请求级去重。SC-40 探针把它记为"下一条独立片：按 viewer 分键缓存（数据隔离敏感，另立片 + 真库集成测串味）"，本片接上。

难点不在"加个 Map"，而在 `discover` 的结果**随 viewer 私有关系而变**：

1. `hiddenAuthorIds(viewer)` → `user_blocks WHERE blockerId=viewer`，进 `WHERE ownerId NOT IN hidden`，并决定返回的 `hiddenAuthors`；
2. `sort==='following'` → `follows WHERE followerId=viewer`，进 `WHERE ownerId IN followedIds`；
3. 匿名（`viewerId=null`）没有这两者，视图完全公有。

卡片本身**不含** `likedByMe` / 已读 / `followingOwner` 等 per-viewer 字段（那些在 `PublicationState`），所以私有面收敛到"哪些作者被剔除 + following 集合 + hiddenAuthors 计数"三处，缓存键只要覆盖 `(viewerId, sort, limit)` 即可——但**写后必须即时失效**，否则一次拉黑在 TTL 窗口内不生效，那是隐私事故，不是性能问题。

## 决定

### 1. 薄包装，单一真值源不复制

新增 `discoverCached(input)` = `loadDiscoverCached(input, () => discover(input))`，只一句。`discover` 仍是屏蔽/关注/可见性/排序/算法的**唯一真值源**；缓存层只读"这一份 `(viewer,sort,limit)` 此刻能否复用"，不复制任何判定，避免又一份会漂移的影子逻辑。两个入口从 `discover` 换成 `discoverCached`，`discover` 原样保留（既有真库套件直接调它，零回归）。

依赖方向**单向无环**：`discover-cache.ts` 只 `import type` social 的 `DiscoverResult/DiscoverSort`（编译期擦除），从不引用 social 运行时值；真正的 loader 由 `social.discoverCached` 以闭包注入。反向是 social / blocks Import `invalidateDiscoverFor`。typecheck 证明无环。

### 2. 键 = 单调 generation + JSON 编码的 `(viewerId, sort, limit)`

```
discover:v1|<generation>|<JSON.stringify([viewerId ?? null, sort, limit ?? 24])>
```

- 含 `viewerId`（匿名用 `null` 占位共享一份）、`sort`、`limit`（`limit` 直接截断结果，trending 还会 `splice(limit)`）。**不加** locale / cursor / filter / tab（=sort）/ unavailable / method（后两者由前三键决定）。
- JSON 数组编码而非字符串拼接：viewerId 含 `|`/`:` 也不会碰撞（判据专测）。
- singleflight 按**完整键**合并：不同 viewer 永不合并（否则就是串味），同 viewer 并发只打一次库（降载）。

### 3. 隐私即时失效：三条真写路径 bump generation

| 写路径 | 失效对象 | 为什么 |
|---|---|---|
| `blocks.setBlock(actor, target, 'mute')` | `actor` | 屏蔽名单变了，`actor` 的全部发现视图即时作废 |
| `blocks.setBlock(actor, target, 'block')` | `actor` + `target` | 除屏蔽外还**删了双向关注边**，`target` 的 `following` 列表也变了 |
| `blocks.clearBlock(actor, target)` | `actor`（仅 removed 时） | 解除后作品该立刻回来 |
| `social.toggleFollow(actor, target)` | `actor` | `following` 视图随关注动作重算 |

失效是 **O(受影响 viewer 数)** 而非 O(键数)：只淘汰该 viewer 的 generation 条目、不删缓存条目。旧键带旧 generation，下面第 4 条保证它永不被再次拼出，缓存里的旧值交给 TTL/LRU 回收。**没有前缀扫描、没有遍历 Map 删键**。

### 4. 关键陷阱：generation 若用"每 viewer 从 0 起的小计数器 + LRU 淘汰"，旧隐私缓存会复活

这是本片最容易被漏掉、也最危险的一条，值得完整推导：

```
天真实现：epoch[viewer] 从 0 起；setBlock → epoch[A]++；epoch 表加 LRU 淘汰容量上限。
  t1: A 首次访问，epoch[A]=0，缓存 key K0 = 拉黑【前】的视图 C_before
  t2: setBlock(A, X) → epoch[A]=1
  t3: A 再访 → K1 → 查库得 C_after（已过滤），缓存 K1
  t4: 其他 viewer 涌入，epoch 表 LRU 把 A 的条目淘汰（epoch[A] 消失）
  t5: A 再来 → epoch[A] 缺失 → 重新初始化为 0 → K0 → 【命中 C_before！拉黑前的人又出现了】
```

根因：**淘汰让 generation 回退到历史用过的值**，而缓存条目仍在（两道有界结构各自回收）。一个隐私过滤被当作缓存失效实现，淘汰反而把过滤撤销了。

根治——**进程级单调递增水位线 `globalGen`**（只增不减，跨 LRU 淘汰、跨 `globalThis` store 重建都不归零）：

```
viewerGen.get(viewer) 命中 → 返回该 generation（并刷新 LRU 顺序）
viewerGen.get(viewer) 未命中（首次 or 被淘汰）→ 返回 ++globalGen
```

由于任何 viewer 重新分配到的 generation **严格大于它历史上用过的所有值**（水位线只涨不落），K0/K1 这类旧键永久拼不出来，最坏只是多查一次库。`resetDiscoverCacheForTest` 也保留 `globalGen`，从而 Next 开发态热重载不会把水位线复位到 0 而串味。判据 `discover-cache.test.ts` 用 `maxViewers=2` 强制淘汰 A，钉死"绝不复活 C_before"这一条。

### 5. 另两层复用 `BoundedCache`（与 ADR-0112 同一原语）

- **有界 TTL + LRU**：键由 viewer × sort 撑，注册用户/爬虫不能决定本进程留多少内存（`maxEntries` 默认 2048）；`maxViewers` 默认 512 给 generation 表也封顶。TTL 默认 15s，三个 env 可调（`NEXUS_DISCOVER_CACHE_{TTL_MS,MAX_ENTRIES,MAX_VIEWERS}`）。
- **singleflight**：同 viewer 并发热读只打一次库。
- 分层取舍：**隐私新鲜度靠主动失效，不靠 TTL**；TTL 只负责"公有内容（新发布/计数/榜单）别太陈旧"。所以 trending 的按天聚合、新作品的可见性延迟，都受 15s TTL 约束——这是诚实的热读快照，不是实时流。

### 6. 多实例边界（诚实划界，不假报跨实例一致）

此缓存是**进程内**的，多实例部署下各实例缓存不共享：A 实例上 `setBlock` 失效了 A 的缓存，B 实例仍可能持有该 viewer 最多 15s 的旧视图。要跨实例即时一致需接共享后端（Redis pub/sub 广播失效，或共享 generation  Storage），属更大改动，**本片不做、不假报已做到**。单机 / 单实例部署下隐私即时成立（真库判据已证）。这与 ADR-0112 网关共享缓存是 opt-in 是同类边界。

## 判据与读数（不粉饰）

- **纯单测** `discover-cache.test.ts` **16/16**：键三维 / 分隔符不碰撞 / 匿名共享 / singleflight 同键合并且跨 viewer 不合并 / 写后即时失效不靠 TTL / invalidate 不误伤他人 / **淘汰串味陷阱** / 水位线只增不减 / TTL 受控时钟 / 双有界封顶。
- **真库集成测** `discover-cache.integration.test.ts` **6/6**（打真 Postgres、禁 mock）：两 viewer 经 `discoverCached` 仍互不串味、缓存命中后再读仍过滤；`setBlock`/`clearBlock`/`toggleFollow` 三条真写路径即时失效；`stats.loads` 增量证明命中确实不再打库、invalidate 确实重新打库。
- **回归**：既有 `blocks.integration.test.ts` + 网关三判据 **55/55**；`npm run typecheck`（turbo 14 包）**14/14**；**全仓 vitest 一次全绿 `400 文件 / 5733 测试 passed, EXIT=0`**（含 route-security / doc-evidence / style-tokens 等横向门——新增两个入口改动与文件不触发任何横向门）。
- **首跑真信号**：真库集成测首版在"降载"用例**超时 90s**——夹具错在 `discoverCached` 外又套一层 `loadDiscoverCached`，同键嵌套 singleflight 自等待死锁。这是**测试夹具 bug 不是生产路径**（生产 `discoverCached` 是唯一入口、loader 是原 `discover`，不重入）。改为直接走 `discoverCached` + `stats.loads` 增量证明命中，6/6、8s。判据里留注释防接手者重踩。

## 一个被查证纠正的流程细节（供接手者）

CI 的 "ADR index integrity" 门（`.github/workflows/ci.yml:50-57`）只遍历 `docs/decisions/[0-9]*.md`，把编号 `grep` 进 `docs/decisions/README.md`；它**不扫 `docs/adr/` 目录**。这解释了为何 `docs/adr/` 里 0101–0112 从没登记 README 却 CI 一直绿（离线复现该门：55 个 `docs/decisions/*` 全部已索引、`GATE_EXIT=0`）。本 ADR 放 `docs/adr/0113`，按既有 12 片惯例**不改动 `docs/decisions/README.md`**——若盲目"同步索引"反而是打破惯例、制造无意义的 diff。任何声称"新增 ADR 必须同步 README"的说法，先按上面这段查证 glob 范围再动手。

## 影响与仍欠

- 生产改动：新增 `discover-cache.ts`；`social.ts` 加 `discoverCached` + `toggleFollow` 失效；`blocks.ts` 两条写路径失效；`page.tsx`/`route.ts` 切到 `discoverCached`。**未改 `discover` 函数体、未改 DB 查询、未加索引、未加依赖。**
- 仍欠：跨实例共享失效（本片边界第 6 条）；`publishProject` 后新作品最多 15s 才进他人发现页（未接 publish 失效钩子，若产品要"发布即见"另立片）；把发现页缓存命中率接进 admin 可观测面板（可复用 SC-40 前端读数骨架）。
