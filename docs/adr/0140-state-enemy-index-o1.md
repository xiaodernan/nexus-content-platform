# ADR-0140：逐帧 state 的敌人 find 按 plan 下标 O(1) 化——PERF-1 的"候选 B"收口

- 状态：已采纳（2026-11-11，§PERF-2，承接 §PERF-1 / ADR-0131）
- 关联：ADR-0131（PERF-1 plan 侧只读索引缓存）、ADR-0124/SC-51（可注入计数缝）、ADR-0077（变异臂各有牙）、
  ADR-0016/索引纪律（`duplicate-id` 校验）、`packages/game-model/src/{sim,rpg,playtest}.ts`、
  `test/state-enemy-index.test.ts`（本片新增）、`test/sim-parity.test.ts`（925 行逐帧对账护栏）
- 触发（user 长期点名）：**通过操作系统 / 数据结构与算法分析优化代码运行速度与合理性、适配硬件** + **缓存合理运用**。

## 背景

PERF-1（ADR-0131）把 `sim.step` 每帧重建的 **plan 侧** design 索引按不可变 `plan` 缓存，构造次数
O(帧数)→O(plan 数)，并在"仍欠"里明确记下**候选 B（同根因、不同落点）**：

> `rpg.ts:194`、`playtest.ts:102` 的 `state.enemies.find` O(E²)——依赖"数组同序同长"顺序不变量、
> 且作用在逐帧变的 state，改动面更大、更脆，留后续独立片。

本片正面收口这条欠账。三处每帧的线性查找：

1. `rpg.ts:195/196`（经验结算）——对每个 `plan.enemyXp` 在 `state.base.enemies` / `next.base.enemies`
   各做一次 `find`，O(|enemyXp|×E)；
2. `playtest.ts:104`（`nearest`）——`plan.enemies.map(e => state.enemies.find(...))`，O(E²)，
   且 `nearest` 在每个 policy step 都调（`runPolicy`/`runPolicyRpg` 60s=3600 帧 × 4 策略）；
3. `sim.ts:281`（任务完成判定）——每个 `defeat` goal 对 `next.enemies.find` 一次。

与 PERF-1 的本质区别：PERF-1 缓存的是**不可变 plan**，可用 `WeakMap<GamePlan,…>` 一次命中整场；
这三处 find 打的是**每帧克隆的新 state 数组**（`sim.ts:193` `state.enemies.map(e=>({...e}))`），
WeakMap 按 state 分键永远不会命中。直接套 PERF-1 手法无效，这就是它"更脆、另立片"的原因。

## 决定

### 1. 顺序不变量（O(1) 成立的前提，先论证再动手）

读码确证 `state.enemies[i]` **恒对应** `plan.enemies[i]`：

- `initialState`（`sim.ts:145`）：`enemies: plan.enemies.map(actor)` 逐位置构造；
- `step`（`sim.ts:193`）：`enemies: state.enemies.map(e=>({...e}))` 逐位置克隆；
- 全仓敌人写操作只就地把 `active`/坐标/`readyAt`/`health` 改写，**从不 push/splice/sort/filter 重排**；
- 实体 id 唯一由模型层 `duplicate-id` 校验（`index.ts:502-505`）强制。

`rpg.ts` 的 `planAtLevel` 派生计划只改 `player.damage`、不动 `enemies`，
故 `state.base.enemies` 与 `plan.base.enemies` 同样同序同长。

### 2. 按不可变 plan 缓存 `enemyIndexById`（零新缓存机制）

给 PERF-1 的 `PlanIndices` 加一个字段 `enemyIndexById: ReadonlyMap<string, number>`
（id → 数组下标），由 `buildPlanIndices` 一并构造——**复用 PERF-1 现成的 `WeakMap<GamePlan,…>` 单例**，
不引入第二套缓存。导出 `getPlanIndices(plan)` 走默认单例，供 `rpg.ts`/`playtest.ts` 取用。

三处 find 改为 `enemyByIdOf(actors, idx, id)`：`idx.enemyIndexById.get(id)` 拿下标 →
`actors[at]` O(1) 返回；`rpg.ts` 用 `getPlanIndices(plan.base)`，`playtest.ts` 用 `getPlanIndices(plan)`，
`sim.ts:281` 用 `step` 内已有的 `idx`。复杂度：每帧每敌 O(E)→O(1)，三处整体 O(E²)/O(Q×E)→O(E)/O(Q)。

### 3. 守护而非盲信（关键设计）

`enemyByIdOf` **不裸取下标**：先校验 `hit.id === id`，一致才返回 O(1) 命中；
若不一致（未来有人重排/增删 state.enemies，不变量被破坏）**就地回退线性 `find`**，
宁可退回 O(E) 也绝不静默返回一个错的 actor（§159 诚实纪律）。
副作用：`state.enemies` 的顺序不变量从"隐含假设"升级为"判据每帧守护的可证前提"。

### 4. 可注入计数缝（确定性、非墙钟）

`measureEnemyLookups(fn)` 短暂启用模块级 `lookupMeter`（默认 `null`，生产路径零开销、零行为变化，
`finally` 还原、嵌套安全），暴露 `{ hits, findFallbacks }`。判据跑真实 `rpgStep`/`runPolicy`
断言 `hits>0 且 findFallbacks===0`——"O(1) 路径在真实循环里始终生效、顺序不变量整场不破坏"
成了确定性计数，而非抢资源机上必 flaky 的墙钟毫秒（对标 PERF-1 `builds` / SC-51 可注入钟）。

## 判据（`state-enemy-index.test.ts`，纯内存、零真库/零网络/零墙钟，12 条）

- fixture 强制 **≥6 个敌人**——E=1 时 find≡O(1)、判据会假绿（§FE-5 变异臂 A 的教训）；
- `enemyIndexById` 内容正确：每个 id 映射到 `state.enemies` 里的同一位置；
- **Proxy 拦截 `Array.find/findIndex`**：同序 O(1) 命中零 find；未知 id 零 find 返回 undefined；
- **守护有牙**：把 `state.enemies` 逆序后 `enemyByIdOf` 回退 find、仍返回正确 actor；
- **注入计数**：真实 `rpgStep` 600 帧、`runPolicy(beeline)` 均 `hits>0 && findFallbacks===0`；
- **整场 14400 帧** `state.enemies` 恒同序同长、索引每帧读回正确 actor；
- `getPlanIndices` 默认单例同一 plan 同引用、不同 plan 不串味；
- **源码静态判据**（对标 FE-4/5/6）：`rpg.ts` 两处、`playtest.ts`、`sim.ts` enemies 分支都走
  `enemyByIdOf`，旧 `state/next.enemies.find` 形态不再出现；items 分支**诚实保留**线性 find（范围最小）。

**三变异臂各有牙、逐条还原**（脚本 `trap EXIT` 保证 SIGTERM 也字节级还原）：
- 臂 A 把 `rpg.ts` 一处 `enemyByIdOf` 改回 `.find` → 静态判据精确红；
- 臂 B 去掉 `enemyByIdOf` 的 `hit.id === id` 守护 → "乱序回退"判据红在 `hit?.id === target.id`；
- 臂 C 把 `enemyIndexById` 全映射到 0 → "索引内容正确"判据红在 `get(enemy.id) === at`。

臂 B 首跑曾因并行会话抢 CPU 被 SIGTERM 打断、把"去掉守护"的变异残留在 `sim.ts`；
复核 grep 发现（守护行只剩 `if (hit)`），立即从替换前备份字节级恢复，再用 `trap EXIT` 重跑拿到干净红证据。
**教训**：变异脚本的恢复必须放在 `trap`/`finally`，不能依赖顺序执行——SIGTERM 会跳过恢复步。

## 验证（诚实分层）

- **新判据** `state-enemy-index` **12/12**；
- **零行为变化分批全绿**（本机多 agent 抢 CPU，全包一次跑两次 SIGTERM，故分 5 批单 worker 跑完
  game-model 全包 16 文件）：核心 `sim`+`sim-parity`(925 行逐帧对账)+`sim-index-cache`+新判据 **69/69**；
  调用链 `rpg`+`playtest`+`playtest-by-kind`+`story`+`story-parity` **81/81**；
  `combat`+`level`+`play` **85/85**；`codegen`+`exploration`+`puzzle` **56/56**；`game`+`iso`+`kind-dispatch` **52/52**。
  **合计 343/343 全绿**（含新判据 12）；分批是资源取舍，不是掩盖失败——每批独立 EXIT=0；
- **工程门**：`eslint`（3 源 + 新测试）**EXIT=0**（首跑揪出一条未用 `RpgPlan` import，已删）；
  `tsc --noEmit -p packages/game-model` **EXIT=0**（首跑 3 处 `possibly undefined` 已用非空断言修，fixture 保证规模）。
- 全仓 vitest / 真库套件本机无干净窗口，未硬跑、不编绿灯。未 push。

## 诚实边界（SC-48 / PERF-1 纪律：不夸墙钟）

- **不承诺任何墙钟毫秒数字**：2D 关卡实体个位数到几十，单帧省下的是微秒级 + 若干次线性比较；
  抢资源机给不出稳定毫秒收益。价值判据是确定性的"每帧每敌查找 O(E)→O(1)、N 帧零 find 回退"。
- **items 分支保留线性 find**：只给 enemies 建 id→index，items 未建（范围最小、避免为低频路径增索引）；
  静态判据明写这一点，不假装全场景 O(1)。
- **守护回退是 O(E)**：顺序不变量若被未来破坏，功能仍正确、性能退回改前，不会算错——这是刻意的失败安全。
- `duplicate-id` 校验保证 id 唯一，但索引合法性仍系于"state 与 plan 同序同长"；该前提由 14400 帧判据
  每帧守护，而非当作永不变量盲信。

## 协作边界

开工探明 `services/java-domain-service/` 有并行会话的 SC-60 半成品（Feign breaker）正在实时编辑
（`AiHealthBreakerOpenTest.java` mtime 分钟级跳动 + 两个本仓 Maven 进程），按协作纪律**未碰**任何
feign 文件、也未 kill 进程；转做与之完全隔离的 `game-model`（纯 TS、零 Java/DB）。并行会话随后
**自行完成并提交了 SC-60**（ADR-0139 / HEAD `2d9210e2`），且其 CURRENT-STATE 明示"另一会话改的是
game-model，全仓持锁格没碰到"——两条线互相避让、零冲突，正是集大成的协作形态。本片只提交
`sim.ts`/`rpg.ts`/`playtest.ts` + 新测试 + 本 ADR + ROADMAP/CURRENT-STATE/memory 登记，
不卷入并行会话的 `scripts/realtime-java-to-web.mts`、`RealtimeController.java`、`test-results-mine*`。

## 仍欠

- `playtest.ts` 的 `items.find`、`sim.ts` 任务判定的 `next.items.find` 若也要 O(1)，需给 `PlanIndices`
  加 `itemIndexById` 并把守护判据扩到 items（本片刻意不做，避免范围膨胀）；
- 墙钟收益实测（需更大实体规模 + 无抢资源干净窗口；本片只承诺确定性查找次数下降）；
- `questById` 已知冗余（PERF-1 仍欠，本片未触及——需先证 plan 内 quest id 唯一）。详见 ADR-0131/0140。
