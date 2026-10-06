import type { GamePlan, PlayActor } from "./index";

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
    outcome: player ? null : "没有玩家实体，跑不起来。",
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
  // 只留最近 40 条：一次长跑模拟不该攒下无界的事件流
  if (events.length > 40) events.shift();
}

/**
 * 推进一小段模拟。**不修改传入的 state**（返回一份新的），所以 React 里可以直接 setState，
 * 也让"同一个初始状态 + 同一段输入 = 同一个结果"这种可复现断言成立。
 */
export function step(plan: GamePlan, state: SimState, input: SimInput, dt: number): SimState {
  if (state.status !== "playing") return state;
  const frame = Math.min(Math.max(dt, 0), 0.1); // 定步长上限：切标签页回来不该一次跳几秒
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
  const byId = new Map<string, PlayActor>();
  for (const enemy of plan.enemies) byId.set(enemy.id, enemy);
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
  const itemById = new Map(plan.items.map((i) => [i.id, i]));
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
  const triggerById = new Map(plan.triggers.map((t) => [t.id, t]));
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
  const questById = new Map(plan.quests.map((q) => [q.id, q]));
  for (const quest of plan.quests) {
    if (!quest.judgeable || next.questDone[quest.id] !== undefined) continue;
    const allMet = quest.goals.every((goal) => {
      if (goal.kind === "activate") return next.activated[goal.actorId] !== undefined;
      const sim = goal.kind === "defeat" ? next.enemies.find((e) => e.id === goal.actorId) : next.items.find((i) => i.id === goal.actorId);
      return sim ? !sim.active : false;
    });
    if (!allMet) continue;
    next.questDone[quest.id] = next.t;
    push(next.events, next.t, `完成任务「${questById.get(quest.id)!.name}」`);
  }

  // —— 结束条件 ——
  const judgeable = plan.quests.filter((quest) => quest.judgeable);
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
