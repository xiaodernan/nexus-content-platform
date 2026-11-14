# ADR-0116：新作品即时进发现页用独立 `globalEpoch` 键段——绝不复用 `globalGen`，帧格式单向兼容

- 状态：Accepted
- 日期：2026-11-11
- 相关：ADR-0113（按 viewer 分键缓存 / 单调水位线 `globalGen`）、ADR-0114（跨实例 pub/sub 失效 / 最终一致）、ADR-0115（读数接 admin 面板 / `null≠0`）、§SC 第四十四片

## 背景（这一轮填的格子）

ADR-0113 落地时发现页热读按 viewer 分键缓存后，明确记了一条诚实边界：**`publishProject` 后新作品最多一个 TTL（默认 15s）才进他人的发现页**。原因是 privacy 失效钩子只认 `viewerIds`（block/follow 改的是某个人的私有关系），而"新作品发布"对所有 viewer 都是新内容——匿名共享缓存、每个登录 viewer 的每个 sort，全都要失效，现有钩子覆盖不了匿名（匿名 `null` 是 no-op，判据 `discover-cache.test.ts` 明确钉过）。

ADR-0114 的跨实例总线也只广播"哪些 viewer 变了"。本片正面接上这条欠账：让 public 发布 / 从 public 下架 / public 内容被判 rejected 后，**所有实例的发现页无需等 TTL 就反映最新收录状态**。落用户点名的 **Redis / 计网 / 缓存 / 数据库性能 / 前后端协同**。

## 决定

### 1. 新增独立 `globalEpoch` 键段，不复用 `globalGen`（本片最关键的一条）

最初的直觉是"bump `globalGen` 让所有键拼不出来"。**这个推断是错的**，探查时纠正：

```ts
function generationFor(s, viewerId) {
  if (viewerId === null) return 0;                    // 匿名恒 0，与 globalGen 无关
  const current = s.viewerGen.get(viewerId);
  if (current !== undefined) return current;          // 已缓存 viewer 直接读缓存值，也不碰 globalGen
  const fresh = (s.globalGen += 1);                   // 只在首次/LRU 淘汰后才 ++
  ...
}
key = `discover:v1|${generation}|${JSON([viewerId, sort, limit])}`
```

`globalGen` 的真实语义是**"未来给新 viewer 分配 generation 时的单调水位线"**（防 LRU 淘汰后 generation 回退到 0、复活旧隐私缓存），它**不是拼进每个键的全局版本号**。单纯 `++globalGen` 后：匿名键仍 `|0|…` 不变，已缓存 viewer 的键仍返回旧 `current`——**一个现有键都失效不了**。清 `viewerGen` 表也一样：匿名根本不在表里。

故新增**独立正交的键段**：

```
key = `discover:v1|<globalEpoch>|<generation>|<JSON([viewerId, sort, limit])>`
        ↑ §SC-44 内容新鲜度         ↑ §SC-41 隐私新鲜度
```

- `globalEpoch`（全缓存世代）：public 发布/下架/rejected 时 `+1` → **所有**旧键（含匿名、含已缓存 viewer 的每个 sort）一次性拼不出来。
- `generation`（per-viewer）：block/mute/follow 时淘汰该 viewer 条目 → 只失效这一个人。
- **两者正交**：内容变更不动 privacy 分键，privacy 变更不动全局世代。判据 `discover-cache.test.ts` 的"正交性"一条把两个方向都钉死。
- `globalEpoch` 与 `globalGen` 一样**跨 `resetDiscoverCacheForTest` / 热重载保留**——否则 epoch 回退到 0 会重新拼出上一代全局失效之前的键（与 ADR-0113 的 `globalGen` 陷阱同构，判据比照加了".mjs 不归零"一条）。

### 2. 帧格式 `v:1` 不动，加可选 `global?:true` + 空 `viewerIds`——单向兼容

跨实例广播不能升频道版本，也不能把全站 viewerId 塞进一帧（`MAX_VIEWERS_PER_FRAME=128` 本就是防恶意大帧）。最小扩展：

```ts
interface InvalidationFrame {
  readonly v: 1;              // 频道 nexus:discover-invalidate:v1 都不动
  readonly origin: string;
  readonly viewerIds: string[];
  readonly global?: true;     // 新增，可选：全局帧带它 + 空 viewerIds
}
```

`parseInvalidationFrame` 严格校验两种帧**互斥**：全局帧必须 `ids.length === 0`，定向帧必须非空且 id 护栏照旧。`global` 必须是字面 `true`（线路字节不可信）。

**单向兼容的精确含义**（判据 `invalidation-bus.test.ts` 逐支钉住）：
- **新实例能收旧帧**：旧定向帧（`viewerIds` 非空、无 `global`）走原路径。
- **旧实例 fail-safe 丢弃新帧**：旧 `parseInvalidationFrame` 在 `ids.length === 0` 处 `return null` → 坏帧记账，绝不把空集误当"要 bump 的 viewer"。这正是"线路字节不可信、校验不过就是 null"的设计意图。代价：混部时旧实例对全局帧无感，靠 TTL（15s）收敛——不比现状更差，且升级后自动生效。

**为什么不升 `v2`/换频道**：旧实例只订 `v1`，升频道会同时切断新旧互收（双向断裂）；加可选字段是"旧丢新、新收旧"的单向兼容，代价最小。订阅回调签名从 `(ids)=>void` 加第二参 `global?:boolean`，现有 `(ids)=>...` 订阅者忽略多余实参，向后兼容。

### 3. 写路径精度：只在"发现页收录状态真的改变"时清全缓存

全局失效 ≈ 一次冷启动（见 §4 惊群），不能因为任何发布就无脑清。发现页收录条件（`social.ts` 唯一真值源）是 `visibility='public' AND moderation<>'rejected' AND deletedAt IS NULL`。三处写路径各自精确判断：

| 写路径 | 触发条件 | 为什么 |
|---|---|---|
| `publishProject` 成功尾部 | `input.visibility==='public'` **或** `existing?.visibility==='public'` | 前者=新作品/换版本/private→public 该进发现页；后者=public→private/unlisted 该从发现页消失。private/unlisted 发布本来不进，不清（避免无意义惊群） |
| `unpublishProject` 成功 | 撤下前 `visibility==='public'` | unlisted 本就不进发现页，撤它不改收录。失败/重复下架（`stopped` 空）不走到这 |
| `resolveCase` 判 `rejected` | `hidden && updated.visibility==='public'` | pending 本就在发现页，rejected 才移除；approved 不改收录；private/unlisted 被 reject 不影响发现页 |

三条都是**本机 `globalEpoch += 1` 先做、再 fire-and-forget 广播**，与 ADR-0114 同纪律：不 `await` 网络、不抛、不阻塞写库请求。publish 的失败分支（名额/门禁/机检被挡）早已提前 `return`，"只有真成功才失效"天然成立。

### 4. 诚实边界：惊群、丢帧放大面、下架的窄竞态

- **惊群（全局失效的直接代价）**：`BoundedCache.getOrLoad` 的 singleflight 按**完整键**合并，只合并**同键**并发、**不跨键**。全局清缓存后，活跃的每个 `(viewer,sort,limit)` 组合各自首次 miss 都打一次库 ≈ 一次冷启动。这是"新作品即时可见"用性能换新鲜度的真实代价，不是 bug。常态发布频率下可接受（有索引 `published_visibility_published_idx` 兜底）；**代价在 ADR-0115 建的 admin 面板 `globalEpoch` 读数里可见**，运维能看到"发布清了几次缓存"。根治（跨键加载闸门 / stale-while-revalidate）属更大改动，本片不做、不假报。
- **跨实例丢帧放大面**：viewer 帧丢只影响一个人；**全局帧丢影响整台别的实例**。但最坏也就是退回现状（那台实例多用一个 TTL 15s），不会更差；本机永远即时（fail-open 最后一道）。判据覆盖"广播失败本机仍即时"。
- **下架的窄竞态（首跑真信号）**：`unpublishProject` 最初用 `UPDATE ... RETURNING visibility` 判断旧值，真库判据当场红（epoch 没 +1）——因为 **Postgres `UPDATE ... RETURNING` 返回的是更新后的行**，撤 public 时读到的已是被写进去的 `private`，判断永远为 false。改为"先 select 旧 `visibility` 再 update"。由此带来一个诚实记下的窄窗口：select 与 update 之间若有"unlisted→public→此刻下架"的并发发布，可能漏清一次缓存，后果仅是该作品在发现页最多残留一个 TTL 后自愈、URL 已即时 404、不丢数据。要绝对原子需 CTE 取 OLD 行，不值得为这条低频操作引入复杂度，TTL 就是兜底。
- **resolveCase 无此问题**：它 `set({moderation})` 不改 `visibility`，`returning({visibility})` 拿到的就是原值，一次查询精确判断、不多打库。

## 判据分层（门打真库、内核判据零依赖）

| 层 | 文件 | 证什么 |
|---|---|---|
| 内核单测 | `discover-cache.test.ts`（+3） | 匿名+多 viewer+4 sort 预热 → 一次全局失效 → 每键重载（匿名 `calls 9→18`）；与 generation 正交；epoch 跨 reset 不归零 |
| 帧解析 / 驱动 | `invalidation-bus.test.ts`（+4） | 全局帧解析、互斥护栏、旧实例空数组 fail-safe、两种 bus 收发全局帧、applied 记 1 次 |
| 多实例语义 | `discover-cache.multi-instance.test.ts`（+4） | A 全局失效 → B epoch bump → B 匿名与登录键都变、都重查；定向帧不误伤 epoch；fail-open；退订 |
| **真库端到端** | `discover-cache.integration.test.ts`（+3） | public 发布→所有 viewer 立刻看到且屏蔽名单不串味；下架→立刻消失；rejected→立刻消失；每条都验 epoch +1 + loads 增长 |
| 展示判据 / 路由门 | `discover-view.test.ts` / `admin-discover-cache.integration.test.ts` | 面板纳入 `globalEpoch` 读数与形状门校验、`epochNote` 把收益与冷启动代价摆到运维眼前 |
| 回归 | publish/moderation/unpublish/social 集成测（46） | 三处写路径改造零回归；横向门 34/34 |

**真库端到端为什么关键**：纯单测全绿会骗过"缓存层接真 `discover` 后是否把隐私边界弄坏"。判据特意在"新作品发布→全局失效→重查"后验 author 仍看不到自己屏蔽的人（全局清缓存不碰库里的屏蔽关系），把 SC-41 的隐私红线在新机制下重新钉一遍。

## 验证（不粉饰）

- 内核 35（既有）+ 新增 3；帧 10（既有）+ 新增 4；多实例 9（既有）+ 新增 4；真库 6（既有）+ 新增 3；展示判据 18（既有）+ 新增 2（globalEpoch 形状门 / epochNote）；路由层 7（既有）= **SC-41/42/43/44 缓存与面板 6 文件 81 passed**（2026-11-11 实跑 6 文件合计）。
- publish/moderation/unpublish/social 回归 **46/46**；横向门（style-tokens/jsx-text/control-names/route-security-gate）**34/34**。
- `npx tsc -p apps/web/tsconfig.json --noEmit` **EXIT=0**。
- 全仓 vitest：**404 files / 5792 tests passed + 1 skipped（405 files / 5793 tests total），EXIT=0**（对比 SC-43 基线 404/5777+1 skipped，净增 15 tests = 6 文件 66→81，文件数不变因本片只在既有文件加用例；542.59s）。
- **首跑两条真信号都没放过**：①正交性判据红在"`invalidate` 不立即 bump `globalGen`、generation 是懒分配"——修正断言时机，反而把真实实现钉得更准；②下架 `RETURNING` 旧值陷阱，真库当场抓到生产 bug 并修（见 §4）。

## 诚实边界汇总

- 面板只是**本实例**的 epoch 与缓存账，多实例各算各的；跨实例全局帧是最终一致、会丢帧（ADR-0114 边界原样成立）。
- `private` 发布与 `unlisted` 发布/下架不改变发现页收录，刻意不清缓存（性能取舍，判据钉住定向失效不动 epoch）。
- 全局失效的冷启动尖峰是预期行为、不是事故（`epochNote` 明说），运维可从 `globalEpoch` 读数观察频率。
- 下架的 select→update 窄竞态已诚实记档，最坏 TTL 后自愈、不丢数据。
- 未改 `discover` 函数体 / DB 查询 / 索引 / 依赖 / 两个入口。

## 仍欠

共享权威 generation/epoch 存储（要跨实例强一致时）；实例粒度 breaker / bulkhead 聚合；Redis/Lettuce connect 阶段黑洞独立看门狗（SC-36）；CI `topology` job 经真实 push 验证（需明确授权 push）；3 条既存 `docs/evidence/**/*.mjs` TS8016。

## 相关文件

- `apps/web/src/server/domain/{discover-cache.ts,invalidation-bus.ts,publish.ts,moderation.ts}`
- `apps/web/src/app/admin/discover-cache/{DiscoverPanel.tsx,discover-view.ts}`
- `apps/web/test/{discover-cache.test.ts,invalidation-bus.test.ts,discover-cache.multi-instance.test.ts,discover-cache.integration.test.ts,discover-view.test.ts}`
