# ADR-0118：上游失败 stale 兜底必须先重算键——SC-41「不删缓存条目」的隐私债，在降级路径上兑现

- 状态：Accepted
- 日期：2026-11-11
- 相关：ADR-0016 附近的 `BoundedCache`（`peek` 的 stale 声明）、ADR-0112（网关 `Readout` 的 `stale/unavailable` 降级范式）、ADR-0113（按 viewer 分键 / 单调水位线）、ADR-0116（独立 `globalEpoch`）、ADR-0117（观测优先）、§SC 第四十六片

## 背景（一笔声明了很久、却一直没在这条链兑现的能力）

`BoundedCache.peek(key)` 从写下起就带一句明确意图：**"即便过期也端出旧值——供上游失败时 stale 兜底"**。`gateway/client.ts` 早把这套范式用成了生产事实：上游没答上 → 端旧值标 `state:'stale'` → 连旧值都没有就 `unavailable`，**绝不画 0**（ADR-0112）。

但发现页这条同样打 Postgres 的热读链（`discoverCached → loadDiscoverCached → discover`）一直没接：`GET /api/discover/route.ts` 与 `/discover/page.tsx` 都没有 try/catch，`discover()` 一抖就冒泡成 500 / 错误页。而 `BoundedCache.getOrLoad` 遇到 TTL 过期的条目**会重新加载**、失败后旧条目**仍留在表里**——也就是说 stale 兜底所需的旧值一直都在，只是没人去 `peek`。一次数据库抖动本可以用一份最多几个 TTL 前的发现页平滑过去，却变成了整页报错。

本片接上这条欠账，落用户点名的 **缓存合理运用 / 数据库性能 / 前后端协同 / 诚实降级**。真正难的不是"端旧值"这一句，而是**在发现页这个 viewer-scoped、带隐私过滤的缓存上，端旧值会不会把刚被拉黑的人 / 刚下架的作品又漏回用户眼前**。

## 决定

### 1. 三条同时成立才端旧值，否则原样重抛上游异常

`loadFromStore` 的 `catch` 调 `serveStaleOrThrow(s, input, keyRequested, cause)`，判据内核只有三条同时成立才 `return old.value`：

1. **键仍有效**（见 §2，最关键）；
2. **有旧条目**：`peek(key)` 非 null（首次冷启动就失败 / 条目被 LRU 淘汰 → 重抛，不画空）；
3. **旧值够新**：`old.ageMs <= staleMaxMs`（超界 → 重抛）。

任何一条不满足、或降级路径自身抛错，都落到一个 `throw cause`——**上游原始异常一字不改地冒泡**，既不吞错，也不凭空造一份空 `DiscoverResult` 冒充。这延续了 ADR-0117「观测/降级绝不许破坏主业语义」的纪律。

### 2. 隐私债：SC-41「只删 generation 表、不删 cache 表」让 `peek(旧键)` 变成隐私陷阱（本片最隐蔽的一条）

先看 SC-41 写下的失效纪律：`invalidateDiscoverFor(viewerId)` 只淘汰 `viewerGen` 表里该 viewer 的 generation 条目，**不删缓存条目**。理由当时是充分的——旧键带旧 generation，单调水位线保证它永不被 `keyFor` 拼出，缓存旧值交 TTL/LRU 回收即可（O(viewer 数)、无前缀扫描）。在正常读路径上这完全成立。

**但降级路径打破了这个前提**。`keyRequested` 是 loader 开始前锁定的字符串；如果 loader **执行期间**发生了写：

- 用户 block 了某作者 → `invalidateDiscoverFor` 删掉该 viewer 的 generation 条目；
- 某 public 作品发布/下架 → `invalidateDiscoverGlobally` 让 `globalEpoch += 1`。

此时 `cache` 表里那个 `keyRequested` 下的旧条目**还在**（没人删它），`peek(keyRequested)` 会成功拿到它——**而它可能是刚被拉黑前的视图、或刚下架内容还在的那份**。若直接端出，就是一次不折不扣的隐私/收录回退：`拉黑没生效`、`下架的作品又出现了`。这是正常读路径不会遇到、只在 stale 降级才暴露的**隐私债**。

根治：端旧值前**重算当前键**并比对：

```ts
if (keyFor(s, input) === keyRequested) {
  const old = s.cache.peek(keyRequested);
  if (old && old.ageMs <= s.config.staleMaxMs) {
    s.staleServed += 1;
    return old.value;
  }
}
throw cause; // 键变了 / 无旧值 / 超界 / 降级出错 → 一律原样重抛
```

`keyFor` 综合了 `globalEpoch`（读当前值）与 `generation`（读表，条目被删就 `++globalGen` 分配更大的新值）。故：

- 期间 block 了**本 viewer** → generation 重分配 → 当前键 ≠ `keyRequested` → **不端**；
- 期间 public 发布 → epoch +1 → 当前键 ≠ `keyRequested` → **不端**（SC-44 的即时可见不被 stale 破坏）；
- 期间 block 的是**别的** viewer → 本 viewer 的键不变 → 可端（不误伤可用性）；
- 期间无任何失效 → 键相同 → 可端（这才是 stale 该罩的场景）。

代价：重算 `keyFor` 对"期间被定向失效"的 viewer 会懒分配一次新 generation——那正是失效本就该付的代价（下次读必是新键、重新查库），不是额外开销。

> 这条是整个 ADR 的价值所在：**"缓存里有旧值" 与 "旧值可以端给这个人" 是两件事**，尤其在带隐私过滤的缓存上。任何 stale-while-error 实现若只做 `peek` 不校验键是否仍属于当前隐私/收录世代，都会踩中这个坑。判据用"loader 内部先 `invalidateDiscoverFor` / `invalidateDiscoverGlobally` 再抛错"精确模拟"打库那一刻正好有人拉黑/发布"，钉死这两条红线。

### 3. 有界：`staleMaxMs` 给 `peek` 的 ageMs 装闸

`peek` 返回的 expired 条目 `ageMs` **没有上界**——如果一个键长期没人读，它会在表里过期滞留，直到被 LRU 挤出去。若无这道闸，某次抖动可能端出几小时前的发现页还冒充"能看"。故 `DiscoverCacheConfig` 新增 `staleMaxMs`：

- 默认 `ttlMs * 2`（正常缓存命中本就可能是 `ttlMs` 内的旧值，降级再多给一个 TTL 的宽容）；
- `NEXUS_DISCOVER_STALE_MAX_MS` 可覆盖，判据用 override 收窄以验"超界宁可报错"，不 sleep；
- `ageMs > staleMaxMs` → 重抛，不端。

### 4. 降级对内容消费者透明、对运维完全可观测

**不污染领域类型**：返回仍是纯 `DiscoverResult`，不新增 `stale` 状态字段、不改 `route/page`、不改共享 `BoundedCache`。发现页本无"此刻"承诺（正常缓存命中本就是 TTL 内的旧值），让读用户照常看到卡片、察觉不到这次降级，是可接受且与现状一致的。判据专门钉"降级结果的字段形状与正常结果完全一致"。

**但必须能被运维看见**，否则 DB 抖动被悄悄吞掉：`DiscoverCacheStats.staleServed`（进程内累计、只增不减、不跨 reset）如实记端了几次旧页。经既有 `describeDiscoverCache → admin route → /admin/discover-cache` 链路原样端出，面板加"上游故障降级"一节显示 `staleServed` 与 `staleMaxMs`，配 `staleNote` 旁注讲清四条边界：① `0` 只表示"还没抖过"，**不是**"降级没开"（开关是 `staleMaxMs`，与 `null≠0` / `hitRate(0,0)` 不说 0% 同一家族的诚实）；② 旧值最多 `staleMaxMs`，超了宁可报错；③ block/发布让键一变就绝不端；④ 连旧值都没有就报错、不画空页。`isKnownReadout` 形状门纳入 `staleServed` 与 `config.staleMaxMs`，坏回执不画 `undefined`/`NaN s`。零新增颜色 token。

### 5. 不引入嵌套 singleflight

降级路径只做**同步 `peek`**，不重入 `getOrLoad`。否则就是 SC-41 真库判据曾踩过的坑——外层又套一层 `loadDiscoverCached`，同键 nested singleflight 自等待死锁（90s 超时）。判据用"N 个同键并发上游失败，共享一次 loader，各自 `peek` 到旧值、`staleServed` 精确 = N 且不死锁"钉死。

## 后果

### 正面

- 一次 Postgres 抖动不再等于整页 500；有合法旧值时平滑端出，无旧值时诚实报错。
- **隐私/收录红线在降级路径上依然成立**：键重算比对让"缓存里有旧值"与"能端给这个 viewer"严格分开，SC-41/44 的即时失效语义一字未退。
- 兑现了 `peek` 声明了很久的 stale 能力，且复用 gateway 已验证的降级范式（而非另起炉灶）。
- 降级完全可观测（`staleServed` + 面板 + 旁注），不会被悄悄吞掉。

### 代价 / 诚实边界

- `staleServed` 是**每台实例各算各的**进程内账（与 `waves`/`bus` 一致，多实例各算各的，不跨实例聚合）。
- 端出的旧值最多 `staleMaxMs` 陈旧；这段时间内的**非失效型**内容变化（如纯浏览数增长）不会反映——这是可用性与新鲜度的显式取舍，且对读用户透明。
- stale 只覆盖"这一键有历史成功条目"的情形；冷启动期全站失败仍会报错（无旧值可兜，判据钉死"不画空"）。
- 重算键在"期间被定向失效"时会懒分配一次新 generation；无正确性代价，只是把失效的账在降级路径上也结了。

## 验证

- 内核 `discover-cache.test.ts` +11：正向降级（`staleServed=1`、`loads` 确实 +1）、无旧值不画空（抛错、size=0）、超 `staleMaxMs` 宁可报错、**隐私红线**（loader 内 block 本 viewer→不端、抛错、globalGen 增大、恢复后不复活拉黑前视图）、**收录红线**（loader 内 public 发布→不端、新 epoch 重填生成 gen-2 非 gen-1）、**隔离**（loader 内 block 别人→本 viewer 仍可端）、并发失败不死锁且计数精确（N=4）、健康路径零影响且异常不吞、降级对内容消费者透明（字段形状不变）、降级账不跨 reset。
- 展示判据 `discover-view.test.ts` +5：形状门 `staleServed` / `config.staleMaxMs` 正反、旁注 0 次不说"降级没开"、有次数讲清四边界、上界秒数跟入参走。
- 路由层 `admin-discover-cache.integration.test.ts` +1：真实降级后 `staleServed` / `config.staleMaxMs` 端到端可见、形状门认得、读数动作 `stats.loads` 不变（不打库）。
- 横向门 `style-tokens.test.ts` 24/24（零新增颜色 token）；`npx tsc -p apps/web/tsconfig.json --noEmit` EXIT=0；SC-45 既有判据零回归；**全仓 vitest 404 files passed | 1 skipped（405 total）/ 5828 tests passed | 1 skipped（5829 total）、EXIT=0**（对比 SC-45 基线 404/5812+1 skipped，净增 16 tests；540.60s）。

## 首跑真信号

展示判据首版红在一条**断言与文案字面不一致**：判据写 `toContain('只读用户看到的是正常卡片')`，而 `staleNote` 文案写的是"读用户看到的是正常卡片"（"读用户"措辞也别扭）。这是判据自造的假想措辞，不是实现 bug。借机把文案改自然（"普通访客照常看到卡片、察觉不到这次降级，这笔账只记在运维面板里"），判据跟着对齐——**判据断言必须来自真实文案，不能凭记忆编一句"应该会说的话"**，否则要么误红、要么在文案真出疏漏时反而不红。
