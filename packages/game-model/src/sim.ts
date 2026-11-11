import type { GamePlan, PlayActor, PlayTrigger, PlayQuest } from "./index";

/**
 * 一份 `plan` 的只读索引（§PERF）。`step` 每帧都要按 id 把 state 里的 sim actor 对回 plan 里的
 * design；这些索引**只依赖 plan**，而 `plan` 是 `compileGame` 的不可变产物，整场模拟 / 整个 rAF
 * 序列都是同一引用。改前每帧重建 4 个 Map + 1 次 filter（60fps≈每秒 240 个短命 Map，一次
 * 60s playtest≈57600 个），纯属 GC 压力；这里把它按 plan 缓存起来，分配从 O(帧数) 降到 O(plan 数)。
 *
 * `WeakMap` 做键不阻止 plan 被回收，plan 一旦被换掉（升级）旧索引随之可收，不泄漏。
 */
export interface PlanIndices {
  readonly enemyById: ReadonlyMap<string, PlayActor>;
  readonly itemById: ReadonlyMap<string, PlayActor>;
  readonly triggerById: ReadonlyMap<string, PlayTrigger>;
  readonly questById: ReadonlyMap<string, PlayQuest>;
  readonly judgeable: readonly PlayQuest[];
  /**
   * §PERF-2：敌人 id → 在 `plan.enemies`（从而 `state.enemies`）里的下标。
   * 只依赖不可变 plan，随其余索引一起缓存；把打在逐帧 state 上的 `enemies.find` 从 O(E) 降到 O(1)。
   * 模型层强制实体 id 唯一（`index.ts` 的 `duplicate-id` 校验），故下标一一对应。
   */
  readonly enemyIndexById: ReadonlyMap<string, number>;
}

/** 构造一份 plan 索引——纯函数，单独导出便于逐支验电。 */
export function buildPlanIndices(plan: GamePlan): PlanIndices {
  return {
    enemyById: new Map(plan.enemies.map((enemy) => [enemy.id, enemy])),
    itemById: new Map(plan.items.map((item) => [item.id, item])),
    triggerById: new Map(plan.triggers.map((trigger) => [trigger.id, trigger])),
    questById: new Map(plan.quests.map((quest) => [quest.id, quest])),
    judgeable: plan.quests.filter((quest) => quest.judgeable),
    enemyIndexById: new Map(plan.enemies.map((enemy, at) => [enemy.id, at])),
  };
}

/**
 * §PERF-2：按 id 从一份**与 plan.enemies 同序同长**的 state actor 数组里 O(1) 取回。
 *
 * <p>顺序不变量由 `initialState`/`step` 保证：`state.enemies` 从 `plan.enemies` 逐位置构造，
 * 整场只对元素就地改 active/坐标，从不重排或增删。id 唯一（模型层 `duplicate-id` 校验）。
 * 因此 `enemyIndexById.get(id)` 的下标必然指回同一个敌人。
 *
 * <p>**守护而非盲信**：若下标处的 `id` 与请求不符（未来有人重排/增删 state.enemies，不变量被破坏），
 * 就地回退线性 `find` 保证结果仍正确——宁可退回 O(E)，也绝不静默返回一个错的 actor（§159）。
 * 判据用 Proxy 拦截 `Array.find`：正常同序路径零 find 调用，乱序路径才触发回退。
 */
export function enemyByIdOf(
  actors: readonly SimActor[],
  idx: Pick<PlanIndices, "enemyIndexById">,
  id: string,
): SimActor | undefined {
  const at = idx.enemyIndexById.get(id);
  if (at === undefined) return undefined; // id 不在 plan 里 → 与 find 一样找不到
  const hit = actors[at];
  if (hit && hit.id === id) {
    if (lookupMeter) lookupMeter.hits += 1;
    return hit;
  }
  // 顺序不变量被破坏：回退线性 find，宁可退回 O(E) 也不返回错的 actor
  if (lookupMeter) lookupMeter.findFallbacks += 1;
  return actors.find((e) => e.id === id);
}

/**
 * §PERF-2 可注入计数缝（对标 PERF-1 `builds` / SC-51 可注入钟）：默认 `null`，生产路径零开销、
 * 零行为变化。仅判据通过 `measureEnemyLookups` 短暂启用，跑完即还原，不在模块里留状态。
 * 这样"N 帧走了多少次 O(1) 命中、是否触发过 find 回退"成了确定性判据，而非 flaky 墙钟。
 */
export interface EnemyLookupMeter {
  readonly hits: number;
  readonly findFallbacks: number;
}
let lookupMeter: { hits: number; findFallbacks: number } | null = null;
export function measureEnemyLookups<T>(run: () => T): { result: T; meter: EnemyLookupMeter } {
  const prev = lookupMeter;
  const meter = { hits: 0, findFallbacks: 0 };
  lookupMeter = meter;
  try {
    return { result: run(), meter: { hits: meter.hits, findFallbacks: meter.findFallbacks } };
  } finally {
    lookupMeter = prev; // 嵌套安全：判据并行/嵌套时不互相污染
  }
}

/** 取 plan 的只读索引（走 PERF-1 的默认单例）——供 rpg.ts / playtest.ts 复用同一份缓存。 */
export function getPlanIndices(plan: GamePlan): PlanIndices {
  return defaultPlanIndexCache.get(plan);
}

/**
 * 索引缓存。`builds` 是**注入计数的确定性判据**（对标 SC-51 的可注入钟）：判据跑 N 帧后断言
 * `builds===1` 而非拿 `Date.now()` 量墙钟——后者在多 agent 抢资源的机器上会 flaky。
 * 生产默认走模块级 WeakMap 单例；判据可注入自己的 cache 观察命中/未命中。
 */
export interface PlanIndexCache {
  get(plan: GamePlan): PlanIndices;
  readonly builds: number;
}

export function makePlanIndexCache(): PlanIndexCache {
  const memo = new WeakMap<GamePlan, PlanIndices>();
  let builds = 0;
  return {
    get(plan) {
      let found = memo.get(plan);
      if (!found) {
        found = buildPlanIndices(plan);
        memo.set(plan, found);
        builds += 1;
      }
      return found;
    },
    get builds() {
      return builds;
    },
  };
}

/** 生产单例：同一 plan 在整场模拟里只建一次索引。 */
const defaultPlanIndexCache = makePlanIndexCache();

/**
 * §50 的可玩规则：一份纯函数模拟器（状态 + 输入 + 时长 → 新状态）。
 *
 * 为什么和渲染层分开：这一层是"能不能玩通、难度是不是离谱"唯一能被断言的地方，
 * §53 的 Playtest Agent 将来跑的就是它（无头、定步长），而不是靠人拿键盘试。
 * 放在组件里就只能靠肉眼看，而肉眼看不了"1000 次随机走位里有多少次能赢"。
 *
 * 模型里没有的语义，这里也不假装有（每一条都进 `SIM_RULE_NOTES`，界面要显示）：
 * - 地形与碰撞体：只有开阔场地，没有墙；
 * - 攻击频率：接触伤害与玩家挥击各按固定冷却结算；
 * - 触发器"触发之后发生什么"：模型只说它引用了谁，没有效果语义，所以只记账不做效果；
 * - 战斗之外的东西（对话、动画、粒子）：不参与判定。
 */

/** 接触伤害冷却（秒）：模型里没有攻击频率字段 */
export const CONTACT_COOLDOWN = 1;
/** 玩家挥击冷却（秒） */
export const PLAYER_ATTACK_COOLDOWN = 0.5;
/**
 * 一帧最多推进多少秒：切走标签页再回来，不该一次跳几秒把敌人一次性放到玩家面前。
 * 导出而不是留在 `step` 的字面量里：§52 最后一格（Code）转写这份引擎时要**插**这个数，
 * 在它自己的模板里重打一遍就等于给了两处会分叉的真值（§16）。
 */
export const MAX_FRAME_SECONDS = 0.1;
/** 事件流保留上限（条）：一次长跑模拟不该攒下无界的事件 */
export const EVENT_CAP = 40;
/** 没有玩家时 `initialState` 说的那句话。同上：产物要念的是这一句，不是抄出来的一句 */
export const SIM_NO_PLAYER_OUTCOME = "没有玩家实体，跑不起来。";

export const SIM_RULE_NOTES = [
  `没有地形与墙：开阔场地，走到边界就停（模型里没有关卡布局）。`,
  `接触伤害每 ${CONTACT_COOLDOWN} 秒结算一次、玩家挥击每 ${PLAYER_ATTACK_COOLDOWN} 秒一次：模型里没有攻击频率字段。`,
  "触发器只记录\"被踩到\"这件事：§54 的模型说了它引用谁，没有\"触发之后发生什么\"的语义，所以不做效果。",
  "对话、动画、粒子不参与判定：它们在这一版里是设计说明，不是可执行的东西。",
];

export interface SimActor {
  id: string;
  x: number;
  y: number;
  health: number;
  /** 敌人：还活着；物品：还没被拾取；触发器：本轮还没结算 */
  active: boolean;
  /** 下一次允许结算的模拟时刻（冷却） */
  readyAt: number;
}

export interface SimState {
  /** 已推进的模拟时间（秒） */
  t: number;
  px: number;
  py: number;
  health: number;
  /** 玩家下一次允许挥击的模拟时刻 */
  readyAtPlayer: number;
  enemies: SimActor[];
  items: SimActor[];
  triggers: SimActor[];
  /** 每条可判定任务的完成时刻；没有就是还没完成 */
  questDone: Record<string, number>;
  /** 每个机关**首次**被踩到的模拟时刻：解谜画法里「激活 X」的目标判定读它；没踩过就没有键 */
  activated: Record<string, number>;
  status: "playing" | "won" | "lost";
  /** 为什么结束：赢/输都指得回具体规则，不留"不知道为什么就结束了" */
  outcome: string | null;
  /** 最近发生的事情（HUD 与 Playtest 报告都读它），有上限，不无限增长 */
  events: { t: number; text: string }[];
  /** 累计统计：Playtest 分析难度要用，而不是靠回放事件数 */
  counters: { damageTaken: number; damageDealt: number; pickups: number; triggersFired: number; attacks: number };
}

function actor(source: PlayActor): SimActor {
  return { id: source.id, x: source.x, y: source.y, health: source.health, active: true, readyAt: 0 };
}

export function initialState(plan: GamePlan): SimState {
  const player = plan.player;
  return {
    t: 0,
    px: player?.x ?? plan.arena.width / 2,
    py: player?.y ?? plan.arena.height / 2,
    health: player?.health ?? 0,
    readyAtPlayer: 0,
    enemies: plan.enemies.map(actor),
    items: plan.items.map(actor),
    triggers: plan.triggers.map((t) => ({ id: t.id, x: t.x, y: t.y, health: 1, active: true, readyAt: 0 })),
    questDone: {},
    activated: {},
    status: player ? "playing" : "lost",
    outcome: player ? null : SIM_NO_PLAYER_OUTCOME,
    events: [],
    counters: { damageTaken: 0, damageDealt: 0, pickups: 0, triggersFired: 0, attacks: 0 },
  };
}

export interface SimInput {
  /** -1..1，已归一：左右 / 上下 */
  dx: number;
  dy: number;
  attack: boolean;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function push(events: { t: number; text: string }[], t: number, text: string): void {
  events.push({ t: Math.round(t * 10) / 10, text });
  // 只留最近 EVENT_CAP 条：一次长跑模拟不该攒下无界的事件流
  if (events.length > EVENT_CAP) events.shift();
}

/**
 * 推进一小段模拟。**不修改传入的 state**（返回一份新的），所以 React 里可以直接 setState，
 * 也让"同一个初始状态 + 同一段输入 = 同一个结果"这种可复现断言成立。
 */
export function step(
  plan: GamePlan,
  state: SimState,
  input: SimInput,
  dt: number,
  cache: PlanIndexCache = defaultPlanIndexCache,
): SimState {
  if (state.status !== "playing") return state;
  // 只读索引按 plan 缓存：整场模拟里 plan 不变，4 个 Map + judgeable 只建一次（§PERF）。
  // 正常路径零行为变化（Map 内容逐字相同），只是不再每帧重新分配。
  const idx = cache.get(plan);
  const frame = Math.min(Math.max(dt, 0), MAX_FRAME_SECONDS); // 定步长上限：切标签页回来不该一次跳几秒
  const next: SimState = {
    ...state,
    t: state.t + frame,
    enemies: state.enemies.map((e) => ({ ...e })),
    items: state.items.map((e) => ({ ...e })),
    triggers: state.triggers.map((e) => ({ ...e })),
    questDone: { ...state.questDone },
    activated: { ...state.activated },
    events: state.events.slice(),
    counters: { ...state.counters },
  };
  const player = plan.player;
  if (!player) return next;

  // —— 玩家移动 ——
  const norm = Math.hypot(input.dx, input.dy) || 1;
  next.px = Math.min(Math.max(next.px + (input.dx / norm) * player.speed * frame, player.radius), plan.arena.width - player.radius);
  next.py = Math.min(Math.max(next.py + (input.dy / norm) * player.speed * frame, player.radius), plan.arena.height - player.radius);

  // —— 敌人：察觉则追击，接触则结算伤害 ——
  const byId = idx.enemyById;
  for (const sim of next.enemies) {
    if (!sim.active) continue;
    const design = byId.get(sim.id)!;
    const gap = dist(next.px, next.py, sim.x, sim.y);
    if (gap <= design.senseRadius) {
      const toward = gap || 1;
      sim.x += ((next.px - sim.x) / toward) * design.speed * frame;
      sim.y += ((next.py - sim.y) / toward) * design.speed * frame;
    }
    if (gap <= design.radius + player.radius && next.t >= sim.readyAt) {
      sim.readyAt = next.t + CONTACT_COOLDOWN;
      next.health -= design.damage;
      next.counters.damageTaken += design.damage;
      push(next.events, next.t, `${design.name} 打中你 -${design.damage}`);
    }
  }

  // —— 玩家挥击：够得着的敌人都吃一下 ——
  if (input.attack && next.t >= next.readyAtPlayer) {
    next.readyAtPlayer = next.t + PLAYER_ATTACK_COOLDOWN;
    next.counters.attacks += 1;
    const reach = player.radius + player.reach;
    for (const sim of next.enemies) {
      if (!sim.active) continue;
      const design = byId.get(sim.id)!;
      if (dist(next.px, next.py, sim.x, sim.y) > reach + design.radius) continue;
      sim.health -= player.damage;
      next.counters.damageDealt += player.damage;
      if (sim.health <= 0) {
        sim.active = false;
        push(next.events, next.t, `打倒了 ${design.name}`);
      }
    }
  }

  // —— 拾取 ——
  const itemById = idx.itemById;
  for (const sim of next.items) {
    if (!sim.active) continue;
    const design = itemById.get(sim.id)!;
    if (dist(next.px, next.py, sim.x, sim.y) <= design.radius + player.radius) {
      sim.active = false;
      next.counters.pickups += 1;
      push(next.events, next.t, `拾取 ${design.name}`);
    }
  }

  // —— 触发器：只记账（见文件头那条限度）。首次踩到记为「激活」，解谜任务判定读它 ——
  const triggerById = idx.triggerById;
  for (const sim of next.triggers) {
    const design = triggerById.get(sim.id)!;
    if (dist(next.px, next.py, sim.x, sim.y) > design.radius) continue;
    if (next.t < sim.readyAt) continue;
    sim.readyAt = next.t + Math.max(design.cooldown, design.delay, 1);
    next.counters.triggersFired += 1;
    const first = next.activated[design.id] === undefined;
    if (first) next.activated[design.id] = next.t;
    push(
      next.events,
      next.t,
      `${first ? "激活" : "再次踩到"}触发器 ${design.name}${design.affects ? `（它引用的是 ${design.affects.name}；模型里没有"之后发生什么"）` : ""}`,
    );
  }

  // —— 任务完成判定 ——
  const questById = idx.questById;
  for (const quest of plan.quests) {
    if (!quest.judgeable || next.questDone[quest.id] !== undefined) continue;
    const allMet = quest.goals.every((goal) => {
      if (goal.kind === "activate") return next.activated[goal.actorId] !== undefined;
      // §PERF-2：enemies 走按 plan 缓存的下标 O(1)；items 未建 id→index，仍线性 find（范围最小，见 ADR）
      const sim =
        goal.kind === "defeat"
          ? enemyByIdOf(next.enemies, idx, goal.actorId)
          : next.items.find((i) => i.id === goal.actorId);
      return sim ? !sim.active : false;
    });
    if (!allMet) continue;
    next.questDone[quest.id] = next.t;
    push(next.events, next.t, `完成任务「${questById.get(quest.id)!.name}」`);
  }

  // —— 结束条件 ——
  const judgeable = idx.judgeable;
  if (next.health <= 0) {
    next.status = "lost";
    next.outcome = `生命值归零（${Math.round(next.t * 10) / 10} 秒，承受 ${next.counters.damageTaken} 点伤害）。`;
  } else if (judgeable.length && judgeable.every((quest) => next.questDone[quest.id] !== undefined)) {
    next.status = "won";
    next.outcome = `${judgeable.length} 条可判定的任务全部完成（${Math.round(next.t * 10) / 10} 秒）。`;
  } else {
    const expired = judgeable.find((quest) => quest.timeLimit !== null && next.t > quest.timeLimit && next.questDone[quest.id] === undefined);
    if (expired) {
      next.status = "lost";
      next.outcome = `任务「${expired.name}」超时（timeLimit=${expired.timeLimit}，按秒解释）。`;
    }
  }
  return next;
}

/** 给 Playtest / HUD 的一句话摘要：不含任何"看起来像分数"的编造指标 */
export function simSummary(state: SimState): string {
  return [
    `跑了 ${Math.round(state.t * 10) / 10} 秒`,
    `生命 ${Math.max(0, state.health)}`,
    `敌人剩 ${state.enemies.filter((e) => e.active).length}/${state.enemies.length}`,
    `物品拾取 ${state.counters.pickups}/${state.items.length}`,
    `任务完成 ${Object.keys(state.questDone).length}`,
    `机关激活 ${Object.keys(state.activated).length}/${state.triggers.length}`,
    state.status === "playing" ? "进行中" : state.status === "won" ? "通关" : "失败",
  ].join(" · ");
}
