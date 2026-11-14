# ADR-0156：共享缓存命中记 `cached` 而非 `fresh`——账本不说谎

- 日期：2026-11-12
- 状态：Accepted
- 关联：SC-40（网关取数）、ADR-0110/0115（读数诚实 / null≠0）、gateway/types.ts:19-23（`ReadoutState` 四态契约）、§MQ 系列（账本不说谎的同款纪律）

## 背景 / 坐实缺口

`apps/web/src/server/gateway/types.ts:19-23` 的四态契约白纸黑字：`'cached'` = "命中进程内/**共享**缓存，带 measuredAt 的旧事实"；`'fresh'` = "这次真的问到了上游"。

但 `gateway/client.ts` 的 `load()`：
- `:220-221` `readShared()` 命中就直接 `return fromShared`，**根本没调 `fetchOnce`**；
- `:226-233` 却把 `cache.getOrLoad` 的返回**一律标 `state:'fresh'` + note "这次从上游读到的快照"**。

后果：另一实例几秒前写入共享缓存（Redis）的旧事实，被本进程记成"这次真的问到了上游"，note 还明确声称从上游读到——**账本说谎**。运维盯面板会以为在实时测量，实际读的是旧快照。这与 §MQ 系列刚守的"账本不说谎 / null≠0 / 错误语义说清"是同一条纪律在共享缓存上的漏网。

更棘手：**现有判据把谎言写成了规范**。`gateway-client.test.ts:191` 原名「共享缓存命中且形状对 → fresh」，`:201` 断言 `state==='fresh'`。这不是"实现跑偏、测试没抓"，而是**测试与实现共同固化了一个与契约冲突的错误语义**——必须连同测试与理由一起修正，否则改实现就被旧判据判红。

## 决策：来源随值穿过 singleflight，分类记账

不碰 `BoundedCache<V>` 通用接口（它有 §SC-49 clear/在途世代等不变量，动它风险大、Propagation 广）。改法局限在 `client.ts` 的 `load()`：

1. **来源随值传播**：内部类型 `Payload<T>` 扩成 `Loaded<T> = Payload<T> & { source: 'shared' | 'upstream' }`，`cache` 泛型改 `BoundedCache<Loaded<unknown>>`。`readShared` 命中 → `return { ...fromShared, source:'shared' }`；真问上游 → `return { ...freshPayload, source:'upstream' }`。
   - **为什么塞进 value 而非闭包变量 / 边带 Map**：同键并发时 follower 不执行 loader、只 await leader 的同一个 promise；source 放进 value，leader/follower 拿到同一份、同一来源标记，零边带状态、clear 时无需额外清理。
   - `writeShared` 仍只写 `Payload`（strip source）——source 是本进程对"这次怎么拿到"的描述，不是数据本身；下个实例读出来会据实标 shared，不把本实例的 upstream 记忆带过去。
2. **分类记账**：`entry.value.source === 'shared'` → `state:'cached'` + note 点明「命中别的实例早先写入共享缓存的快照（测量于 measuredAt，本进程持有 ageMs ms），并非本次向网关请求所得」；`'upstream'` → 维持 `state:'fresh'` + 原 note「这次从上游读到的快照」（零回归）。
3. **`measuredAt` 如实透传**：shared 命中时保留上游当初的测量时刻，不换成"现在"。
4. **`ageMs` 不改语义**：仍是"本进程持有这份缓存条目的时长"（`entry.ageMs`），配合 note 里的 measuredAt 与"并非本次"已足够诚实，不引入 `Date.parse(measuredAt)`（假数据里 measuredAt 是 `'shared-t'` 这类非 ISO 串，硬算会得到 NaN，且会牵连 now/clock 注入口径）。

**零视图改动**：`gateway-view.ts` 早已支持 `cached`（`STATE_LABEL.cached`、`isDatedSnapshot('cached')=true`）、`snapshot.ts:122` 已把 cached 当带日期快照处理——修法只是让 client **按契约如实标注**，视图层原封不动。这不仅零行为改动，还是"把已有但未兑现的契约兑现"。

## 验证

- **先红（缺口坐实、非编译假红）**：新建 `gateway-shared-hit-honesty.test.ts`（纯内存假 SharedCache + 假 fetch + 零时钟），shared 命中门与 singleflight follower 门红（当前返 `fresh`），3 条零回归门（共享未命中/fail-open/坏形状→真问上游=fresh）绿。
- **转绿 5/5**；**横向 67/67**（gateway-client / gateway-pure / gateway-redis-shared / gateway-view / 新判据全绿）。
- **修正错误判据**：`gateway-client.test.ts:191` 改名「→ cached（不谎称这次问了上游）」，断言 `state==='cached'` + note 正向诚实；把"不得肯定声称本次问了上游"的精确反向门放在专门新判据里（含否定前缀排除），避免两处重复正则。
- **变异臂 3 条全红**（备份 + md5 断言 + 恢复核验）：A shared 分支 state 改回 `fresh` → 账本门 + follower 门红；B loader 一律标 `upstream`（source 分类失效）→ 2 门红；C state 仍 `cached` 但 note 改回谎言 → note 反向门精确红。恢复 md5 全对齐 `2931f8a5…`。
- **工程门**：eslint 3 文件单进程 RC=0（顺手清了 3 处既有未使用变量：`CachedEntry` import、一处冗余 `n` 计数、一处未用 `key` 参数，零行为）；`tsc -p apps/web --noEmit` RC=0（首次启动被 SIGTERM，加长窗口后拿真码 0）。SIGTERM 不算绿也不算红，未 skip hook。
- **未 push**。

## 判据自身修实（延续 ADR-0154「锚语义不锚词」）

写判据过程中三次踩同一个坑并当场修实，值得记下：
1. 门 2 初版断言 `measuredAt==='t0'`（误把 body 内部字段当 Readout.measuredAt，真值应是 `clock()` 注入的 `'T'`）——判据断言错，改为 `'T'`。
2. 夹具 `sharedHit()` 初版对所有 key 返回固定 ROUTES 形状，导致 services/health 列过不了各自 normalize 而回退真问网关，`f.calls===0` 误红——是"读不出不等于有"的正确产品行为，夹具改为**按 key 返回对应列形状**后三列全命中。这条坑同时暴露在 `gateway-client.test.ts` 那条修正判据里（已注明"命中即不打该列网关"由专门判据的按 key 夹具覆盖）。
3. note 反向门两次把**正确的否定句**（"并非本次向网关请求所得"）误伤为"声称本次问了上游"——正则 `(?:^|[^并不非是])(?:这次|本次)…` 加否定前缀排除，note 措辞也避开歧义串。教训同 ADR-0154：**语义门要锚"肯定/否定"而非"含某词"**。

## 诚实边界 / 仍欠

1. 本片是**账本诚实修正 + value 内带来源**：读数值、退避重试、singleflight、TTL、fail-open、共享 read/write 逻辑**全部不变**，只改"来源分类 + note 文案"。
2. `ageMs` 保持"本进程持有此值的时长"语义，**不试图表达"这条事实从 measuredAt 起有多旧"**（那需要可靠的 measuredAt 时钟口径，当前注入口径不统一、假数据非 ISO）。运维若要"事实新鲜度"看 `measuredAt` + `state`，不看 ageMs——note 已点明。这是**有意收窄**的边界，不是遗漏。
3. 真 Redis 共享的跨实例时序（一实例写、另一实例读、measuredAt 属谁）仍待干净窗口用真 Redis 取证；本片是纯内存假件下的确定性判据。
4. 未 push；真读屏器 / hover 逐帧 / 真库真 Redis 全套与墙钟实测仍待干净窗口。

## 协作注记

开工到提交 HEAD 稳定 `fed8b60d`（我的 §PERF-4），并行会话本轮未在 web 侧抢 index（上一片 §A11Y-3 / `AdminNav.tsx` 已由并行会话自行提交于 `6c6a7b87`）。本片纯 `apps/web/src/server/gateway/client.ts` + 2 测试文件 + ADR + 三处文档，与并行 `services/**` 正交。精确 stage 只列本片文件，避开 `services/**` / `pom.xml` / gitignored 归档；共享文档只追加不 rewrite。详见 ROADMAP / CURRENT-STATE。
