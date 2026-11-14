# ADR-0145：逐帧 state 的 items find 按 plan 下标 O(1) 化——PERF 序列收口

- 状态：已采纳（2026-11-11，§PERF-3，承接 §PERF-1 / ADR-0131、§PERF-2 / ADR-0140）
- 关联：ADR-0140（PERF-2：enemies 下标 O(1)、诚实保留 items.find）、ADR-0131（PERF-1：plan 索引按不可变 plan 缓存）、
  ADR-0077（变异臂各有牙）、`packages/game-model/src/sim.ts`、
  `packages/game-model/test/state-item-index.test.ts`（本片新增）、`packages/game-model/test/state-enemy-index.test.ts`（本片同步）
- 触发（user 长期点名）：**数据结构与算法 / 操作系统优化运行速度 + 缓存合理运用**。

## 背景

PERF-2（ADR-0140）把三处每帧 `state.enemies.find` O(E)/O(E²) 降为 O(1) 后，**诚实保留**了一处：
`sim.ts` 任务完成判定里，quest 的 `collect` goal 每帧对 `next.items.find(i => i.id === goal.actorId)`
一次线性查找（O(I)，I=物品数）。ADR-0140 第 104 行写明理由"只给 enemies 建 id→index，items 未建
（范围最小、避免为低频路径增索引）"，第 122-123 行进一步点名收口条件：**"items.find 若也要 O(1)，
需给 `PlanIndices` 加 `itemIndexById` 并把守护判据扩到 items（本片刻意不做，避免范围膨胀）"**。

本片正是执行这个被正式点名、被刻意推迟的收口：PERF-1（plan 只读索引）、PERF-2（enemies 逐帧下标）、
PERF-3（items 逐帧下标）三片至此完整，逐帧 state 的按 id 查找不再有线性 find 残留。

## 顺序不变量（与 enemies 同构，逐条读码坐实，不靠假设）

1. `initialState`：`items: plan.items.map(actor)`，逐位置构造，`actor(source)` 保留 `source.id`；
2. `step`：`items: state.items.map(e => ({...e}))`，逐位置克隆；拾取循环只就地 `sim.active = false`，
   **从不重排、增删**；
3. id 唯一：`validateGame` 对 `document.entities` 全局 `seen` 查 `duplicate-id`（`index.ts:485/502`），
   items 由 entities 投影而来、id 全局唯一；
4. 消费侧自证：拾取循环 `itemById.get(sim.id)`（`sim.ts:311`）本就假定逐位置 id 对应，与守护式 O(1) 同前提。

由此 `state.items[i]` 恒对应 `plan.items[i]`，`itemIndexById.get(id)` 的下标必然指回同一物品。

## 决定

**零新缓存机制、零行为变化**（复用 PERF-2 已建好的同构基础设施）：

1. `PlanIndices` 加 `itemIndexById: ReadonlyMap<string, number>`，`buildPlanIndices` 里
   `new Map(plan.items.map((item, at) => [item.id, at]))`——随现成 WeakMap 单例一起建，分配次数 O(plan 数)、
   不随帧数增长；
2. 新增守护式 `itemByIdOf(actors, idx, id)`：`itemIndexById.get(id)` 拿下标 → 校验 `hit.id === id` 才 O(1) 返回，
   **不一致就回退线性 `find`**，宁可退回 O(I) 也绝不静默返回错 actor（§159）。即使某 plan 绕过
   `validateGame`、id 重复，守护也保证结果正确——**安全性不依赖"校验一定跑过"**；
3. `sim.ts` 任务判定 collect 分支 `next.items.find(...)` 改走 `itemByIdOf(next.items, idx, goal.actorId)`；
4. **独立可注入计数缝** `measureItemLookups` / `itemLookupMeter`：与 PERF-2 的 `measureEnemyLookups`
   **完全独立**（各自一个模块级 meter、默认 null、生产零开销、`finally` 还原、嵌套安全），刻意不并表——
   PERF-2 的 API 与判据**零回归**，两条查找路径计数互不串味。判据跑真实 `step` 长跑断言
   `hits>0 && findFallbacks===0`，"O(1) 路径在真实循环里始终生效、不变量整场不破坏"是确定性判据，非 flaky 墙钟。

**同步反转 PERF-2 判据**：`state-enemy-index.test.ts` 里那条"items 分支保留线性 find（范围最小）"的
诚实快照断言（`expect(sim).toMatch(/items\.find\s*\(/)`）改为断言 items 也走 `itemByIdOf` 且
`next.items.find` 不再出现——否则两份判据互相矛盾。PERF-3 判据另有一条静态门专门守这个同步
（"PERF-2 判据里'items 保留 find'的诚实快照已反转"），防止未来有人回退时出现判据打架。

## 判据（确定性、纯内存、零墙钟/零真库/零浏览器）

`state-item-index.test.ts` **11 条**（镜像 PERF-2 的 12 条结构、fixture 适配 items）：

- fixture 强制 **≥6 个物品**（I=1 时 find≡O(1) 会假绿，§FE-5 教训）**且含一个 `quest` 引用某 `item`**，
  确保 `compileGame` 投影出 `collect` goal、items 分支每帧真执行（否则计数缝是空的、判据假绿）；
- `itemIndexById` 内容正确：每个 id 映射到 `state.items` 同一位置；
- **Proxy 拦截 `Array.find/findIndex`**：同序 O(1) 命中零 find；未知 id 零 find 返回 undefined（与 find 语义一致）；
- **守护有牙**：把 `state.items` 逆序后 `itemByIdOf` 回退 find、仍返回正确 actor；
- **注入计数**：真实 `step` 600 帧（quest collect 每帧判定）`hits>0 && findFallbacks===0`；
- **整场 14400 帧** `state.items` 恒与 `plan.items` 同序同长、每帧用索引读回正确 actor；
- 默认单例：items 索引与 enemies 索引同一份 `PlanIndices`、不重复构造；
- 源码静态判据三条：sim.ts items 分支走 `itemByIdOf` 且 `next.items.find` 消失；enemies 分支
  `enemyByIdOf` 与两份索引都在（PERF-2 零回归）；PERF-2 判据的 items.find 快照已同步反转。

**三变异臂各有牙、逐条当场备份 + md5 断言变异真发生 + 顺序执行恢复**（吸取 PERF-2 臂 B 与 FE-8 的
SIGTERM 残留教训）：臂 A 把 `itemByIdOf` 调用改回 `next.items.find` → 静态判据精确红；
臂 B 去掉 `hit.id === id` 守护 → 乱序回退判据红（`expected 'i4' to be 'i3'`，证明会返回错 actor）；
臂 C 把 `itemIndexById` 全映 0 → 内容判据红（`0 ≠ 1`）。三臂各自验证后 `cp` 还原、GOOD 复核 23/23。

## 验证（诚实分层）

- 新判据 `state-item-index` **11/11**、PERF-2 `state-enemy-index` **12/12**（同步反转后零回归）——合并 **23/23**；
- **game-model 全包 18 文件分 4 批单 worker 全绿合计 354/354**（每批独立 EXIT=0）：
  批 1 核心 sim+parity+三份索引判据 **80/80**（含 925 行 parity 逐帧对账，零行为变化最重证据）·
  批 2 rpg/playtest/play/story **98/98** · 批 3 combat/level/codegen **109/109** ·
  批 4 exploration/puzzle/game/iso/kind-dispatch **67/67**。全包一次跑会 SIGTERM（多 agent 抢资源），
  分批是资源取舍、非掩盖失败；fixture kind 合法化（`"topdown"`→`"2d"`，vitest transpile-only 不查类型、
  tsc 抓出）后核心批复跑 **61/61** 绿；
- 工程门：`eslint` **EXIT=0**、`tsc -p packages/game-model` **EXIT=0**。

## 诚实边界

- **不承诺墙钟毫秒**：I=物品数，通常个位数，单帧省一次线性扫描；价值是确定性"每次 collect 判定
  O(I)→O(1)、N 帧零 find 回退"，抢资源机给不出稳定毫秒收益（PERF-1/PERF-2 同口径）；
- **`codegen.ts` 产物转写里的 `next.items.filter(...)[0]` 刻意不改**：那是 §52 投影出的自包含 HTML+JS
  产物侧代码（非平台每帧热路径），产物自包含、没有 WeakMap 计划索引的概念；且改它会破坏
  "产物是 `sim.ts` 转写、数字由同一处供给"的语义对应（codegen.ts 文件头纪律）。PERF-2 当时同样
  未动 codegen 的 `enemies.filter[0]`，本片延续，诚实记录；
- 守护回退 O(I) 是失败安全，不是性能优化；items 索引随 WeakMap 单例建，plan 换引用旧索引自动可收、不泄漏；
- 全仓真库/真 Redis 套件本机无干净窗口，未硬跑、不编绿灯；未 push。

## 协作边界

开工时 HEAD 已含并行会话 SC-61/62/63/64（operator-token probe / Feign breakerState 上 admin /
verify:topology / actuator 暴露）与我的 FE-7、FE-8；本片只改 `packages/game-model/src/sim.ts` +
`state-enemy-index.test.ts`（同步反转）+ 新 `state-item-index.test.ts` + 本 ADR +
ROADMAP/CURRENT-STATE/memory 增量登记。纯 game-model TS，与并行会话的 java/realtime/web realtime 文件完全正交，
精确 stage 不卷入 `test-results-mine*`、`.next-dev-archives/`、`.git/perf3-good.ts`。ADR 编号查重 0144 已被 FE-8
占用，本片用 **0145**。文档基准取自最新 HEAD，只追加不 rewrite。

## 仍欠

- 逐帧 `state.triggers` 的消费侧同样走 `triggerById.get(sim.id)`（已是 O(1)，无 find 残留），无需索引；
- 墙钟收益待干净窗口实测（不承诺）；
- PERF 序列（PERF-1/2/3）至此逐帧按 id 查找全 O(1)，后续若有新的逐帧 find 热路径按本范式收口。
