# ADR-0131：sim.step 每帧重建 plan 只读索引——按不可变 plan 缓存，构造次数 O(帧数)→O(plan 数)

- 状态：已采纳（2026-11-11，§PERF-1）
- 关联：ADR-0124/SC-51（可注入计数缝逐支验电）、§SC-48（真库 EXPLAIN 后证伪伪优化、只保留有证据结论）、
  ADR-0077（变异臂各有牙）、`packages/game-model/src/sim.ts`、`test/sim-index-cache.test.ts`（本片新增）、
  `test/sim-parity.test.ts`（925 行逐帧对账护栏）
- 触发（user 长期点名）：**通过操作系统 / 数据结构与算法分析优化代码运行速度与合理性、适配硬件** + **缓存合理运用**。

## 背景

`game-model/sim.ts` 的 `step(plan, state, input, dt)` 是全仓唯一由 `requestAnimationFrame` /
three.js `useFrame` / playtest 定步长循环**每帧驱动**的模型层代码：

- `apps/web/src/game2d/GamePlay.tsx:414` 每帧 `step(...)`，effect 依赖 `[plan, view]`——整个 rAF 序列里 `plan` 是同一引用；
- `GameCanvas3D.tsx:216` 在 `useFrame` 里每帧调；
- `playtest.ts` 定步长 `tick=1/60`、`seconds=60` → **14400 帧**，四种策略都走它；调用方含 Studio 按钮与 `agent/runtime.ts` 编排链。

改前 `step` 每帧构造 4 个只读 Map + 1 次 filter：

```ts
const byId = new Map<string, PlayActor>(); for (const enemy of plan.enemies) byId.set(enemy.id, enemy); // :142-143
const itemById = new Map(plan.items.map((i) => [i.id, i]));        // :180
const triggerById = new Map(plan.triggers.map((t) => [t.id, t]));  // :192
const questById = new Map(plan.quests.map((q) => [q.id, q]));      // :209
const judgeable = plan.quests.filter((q) => q.judgeable);          // :223
```

这些索引**只依赖 `plan`**，而 `plan` 是 `compileGame` 的不可变编译产物，整场模拟 / 整个 rAF 序列不变。
后果：60fps ≈ 每秒 240 个短命 Map；单次 60s playtest ≈ 14400×4 ≈ **57600 个 Map**。V8 不会跨帧逃逸
消除这些复杂对象，是持续的 GC 压力——这是真分配浪费，不是靠猜的性能直觉。

### 探查先证伪了什么（不抓到第一个就收手）

逐个读调用方与已有 test/bench 后，**排除**这些看似可疑点：`gateway/snapshot.joinSnapshot`（service 规模个
位数、面板轮询级、且是"没测到画 null"语义核心）、`gateway/backoff`（attempt<10、注释已论证为何不用
`Math.pow`）、`creative-model/patch.ts` 跨页查重（编辑触发非每帧、SC-48 已证伪过同类）、
`creative-model/health.ts`（`PERFORMANCE.md` 已判无 O(n²)）、`studio/store.cloneDeltas`（已用 Map 聚合 O(n)）、
`world-engine/rag.query`（对话频率、验证需 agent-runtime 非纯内存）、Java `AuthFilter` 白名单（个位数、需起容器）。
游戏模拟侧无任何 bench/cost 脚本，不存在重复劳动。

## 决定

### 1. 按不可变 `plan` 缓存只读索引（WeakMap）

- 新增 `PlanIndices`（4 个 `ReadonlyMap` + `judgeable`）与纯函数 `buildPlanIndices(plan)`；
- `makePlanIndexCache()` 返回 `{ get(plan), readonly builds }`，内部 `WeakMap<GamePlan, PlanIndices>`：
  plan 被 GC 时索引随之可收，不泄漏；换 plan（升级）自然重建；
- `step(plan, state, input, dt, cache = defaultPlanIndexCache)` 加**第五个可选参数**，生产用模块级单例，
  把 4 处 Map 构造 + filter 换成 `const idx = cache.get(plan)`。
- **零行为变化**：Map 内容逐字相同，只是不再每帧分配；产物 `NexusSim.step(combatPlan, state, input, dt)`
  仍用 4 参调用（第 5 参有默认值），**不制造模型/产物签名分叉**，`sim-parity.test.ts` 逐帧对账通过。

### 2. 确定性判据：用 `builds` 计数，不用墙钟

`builds` 是可注入缝（对标 SC-51 的可注入钟）：跑 N 帧断言 `builds===1`，而非 `Date.now()` 量毫秒——
后者在多 agent 抢资源的机器上 flaky。这才是"操作系统/数据结构层面更适配硬件"的可验证说法：
**分配与构造次数从 O(帧数) 降到 O(plan 数)**，减少 GC 压力。

### 3. 诚实边界（SC-48 纪律：不夸大成墙钟战果）

2D 关卡典型 E/I/T/Q 是个位数到几十，单帧省下的是微秒级 + 4 次分配。**本片不承诺任何墙钟毫秒数字**——
本机多 agent 抢资源、游戏实体规模又小，给不出抢资源机上仍稳定的毫秒收益。价值判据是确定性的
"构造次数 4N→1"，最能在 14400 帧的 playtest 循环里体现。若门槛是"肉眼可见的墙钟收益"，本片如实说给不出。

## 判据（`sim-index-cache.test.ts` 7 条，纯内存、零真库/零网络/零时钟）

同一 plan 跑 600 帧 `builds===1`；长跑 14400 帧仍 `===1`；换一个 plan 对象 → 再建一次（WeakMap 按
对象分键，内容相同也不串味）；注入共享缓存跑 120 帧与"每帧新建索引"结果**逐帧逐字段相同**；
`buildPlanIndices` 四个 Map + judgeable 内容正确；两个独立 cache 各自 `builds===1`；带攻击输入的
30 帧行为等价。

**两变异臂各有牙、逐条还原**（脚本跑完自动恢复 `sim.ts`）：
- 臂 A 把 `cache.get(plan)` 改回每帧 `buildPlanIndices(plan)` → 精确红 5 条；
- 臂 B 删 `memo.set`（缓存永不命中）→ 精确红 6 条。

## 验证（诚实分层）

- **起点**：`sim.test.ts` + `sim-parity.test.ts` **50/50** 绿。
- **护栏零行为变化**：改动后 parity + sim **50/50**（925 行逐帧对账 + 30+ 规则分支全过）；
  game-model **全包 16 文件 331/331**（含 playtest / rpg / combat / level）。
- **新判据**：`sim-index-cache` 7 条 → 三文件合并 **57/57**。
- **工程门**：`eslint`（sim.ts + 新测试）**EXIT=0**；**game-model 包 `tsc --noEmit -p
  packages/game-model/tsconfig.json` EXIT=0**（我改动归属的类型检查全绿）。
- **未把会话的红算进本片**：根 `web tsc` 曾报 6 条 `TS2531`，全在 `apps/web/test/realtime-frame-guard.test.ts`
  ——该文件 mtime 18:51、未跟踪 `??`，是并行会话**当时正在写**的新文件，与 sim.ts 零因果；
  按纪律不碰、不替它修、不算我的失败，如实记录。
- **落账前复验（HEAD 已前移到 `971cd28b`，会话落了 SC-53/SC-54）**：在当前 HEAD 重跑——三文件合并
  **57/57**、game-model 全包 **16 文件 331/331**、`eslint` **EXIT=0**、包级 `tsc` **EXIT=0**，全部复绿；
  根 `web tsc --noEmit -p apps/web/tsconfig.json` **EXIT=0**——`realtime-frame-guard.test.ts` 的 6 条类型红
  **已随会话推进自愈**（会话已把该文件补完，本片未碰它一行）。最终在本片代码提交前的 HEAD `938f99e7`
  再跑三文件合并仍 **57/57**。全仓 vitest / 真库套件本机多 agent 抢同一 Postgres 无干净窗口，未硬跑、不编绿灯。未 push。
- **落账形态说明（多 agent 共用一棵工作树的真实痕迹）**：本片三处文档登记（ROADMAP §PERF 第一片 /
  CURRENT-STATE 置顶 / 本 ADR 之外）因与本片代码在同一工作树并行推进，**ROADMAP 与 CURRENT-STATE 两段
  由并发的会话 docs 提交 `938f99e7` 顺带带入历史**（内容为本片原文、已核完整：9 条 bullet + 2312 字
  blockquote 均在 HEAD）；本片代码提交只含 `sim.ts` + 新测试 + 本 ADR。读者按 ADR-0131 即可串起两处。

## 后果与仍欠

**已交付**：把每帧 4 Map + filter 的分配按不可变 plan 缓存，构造次数 O(帧数)→O(plan 数)；
第五参注入缝让"性能"首次能用确定性计数验电（而非 flaky 墙钟）；925 行 parity 护栏证明零行为变化；
两变异臂硬证据。

**仍欠**：
- `questById` 是纯冗余（`for (const quest of plan.quests)` 里 `questById.get(quest.id)!.name` 取回的就是
  `quest` 自己）——本片**刻意不消除**，因为那需要"plan 内 quest id 唯一"这一前置假设（`index.ts` 有
  `duplicate-id` 校验但 `step` 收到的编译产物是否强制通过取决于调用链）；下片确认唯一性后可直接换
  `quest.name`，连索引都不建。宁可留一处已知冗余，也不引入未证实的语义假设（§159）。
- 候选 B（同根因）：`rpg.ts:194`、`playtest.ts:102` 的 `state.enemies.find` O(E²)——依赖"数组同序同长"
  顺序不变量、且作用在逐帧变的 state，改动面更大、更脆，留后续独立片；
- 墙钟收益实测（需实体规模更大、无抢资源的干净窗口；本片只承诺确定性构造次数 4N→1，不夸墙钟毫秒）。
