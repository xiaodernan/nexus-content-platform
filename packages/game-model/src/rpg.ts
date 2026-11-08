import type { GameDocument } from "./index";
import { compileGame, type GamePlan, type StatSource } from "./play";
import { initialState, step, type SimInput, type SimState } from "./sim";

/**
 * §51 的最后一条管线：RPG 原型——把文档串成**成长/战斗循环**。
 *
 * 战斗与 2D 关卡是同一套算术（移动、追击、接触伤害、挥击全走 `sim.step`）；
 * 这一格加的是成长：打倒敌人与完成任务发经验，攒够升级，升级涨生命与伤害。
 * 三条语义全部是**管线的**，不是模型里有的字段，每一条都进 `RPG_RULE_NOTES`：
 * - 经验来自实体身上作者写的 `xpReward` 数值（数值是自由 Record，`xpReward` 只是建议键）；
 *   敌人没写就用投影兜底并标出来——任务没写就不发，不替设计补一个数。
 * - 升级曲线是投影常量：下一级要 `XP_BASE + (等级-1)×XP_STEP` 点；每级 +10 生命上限（并回复）
 *   +1 伤害。模型里没有成长曲线字段，这些数字来自管线，HUD 必须说得出这一点。
 * - 任务上的 `requiredLevel` 按等级门解释：等级不够时条件满足也不结算，升到了下一帧才补记
 *   ——底层 step 每帧重判任务，所以"门"只需要把没到级的完成扣下，不需要第二套判定。
 */

/** 敌人没写 xpReward 时每击发的经验（provenance 标 default，HUD 说得出这不是作者的数） */
export const XP_PER_KILL_FALLBACK = 10;
/** 升级曲线：升到 2 级要 XP_BASE 点，之后每级多 XP_STEP 点 */
export const XP_BASE = 20;
export const XP_STEP = 15;
/** 每升一级：生命上限 +10 并回复 10，伤害 +1。曲线属于管线，HUD 与 notes 都要能指回这里 */
export const LEVEL_BONUS = { maxHealth: 10, damage: 1 } as const;

export const RPG_RULE_NOTES = [
  `经验来自作者写的 xpReward 数值：敌人没写就用投影兜底 ${XP_PER_KILL_FALLBACK}（HUD 标"兜底"），任务没写就不发——管线不替设计补经验。`,
  `升级曲线是投影的：下一级要 ${XP_BASE} + (等级-1)×${XP_STEP} 点经验；每升一级生命上限 +${LEVEL_BONUS.maxHealth}（并回复）伤害 +${LEVEL_BONUS.damage}。模型里没有成长曲线字段。`,
  "任务上的 requiredLevel 按等级门解释：等级不够时条件满足也不结算，升到了才补记——不是丢弃，也不是提前完成。",
  "战斗规则与 2D 关卡逐字相同（同一个 step）：RPG 加的只有成长，没有背包、技能树或回合制。",
];

/** 一个敌人的经验设定：值与来源（design = 作者写的 xpReward，default = 投影兜底） */
export interface RpgEnemyXp {
  id: string;
  name: string;
  xp: number;
  from: StatSource;
}

/** 一条任务的成长设定：完成发多少经验、几级才能交 */
export interface RpgQuestMeta {
  id: string;
  name: string;
  /** 完成发的经验；作者没写 xpReward 就是 0（不发），与敌人的兜底不同——任务经验没有兜底 */
  xpReward: number;
  hasXpReward: boolean;
  /** 等级门：0 = 没写（不设门） */
  requiredLevel: number;
}

export interface RpgPlan {
  name: string;
  summary: string;
  /** 战斗跑在这份计划上：位置、数值、任务判定全部复用 topdown 的编译结果（§16：不编第二份） */
  base: GamePlan;
  enemyXp: RpgEnemyXp[];
  quests: RpgQuestMeta[];
  /** 曲线常量原样带上：HUD 显示"下一级要 X 点"时读这里的公式，不自己再算一份 */
  xpBase: number;
  xpStep: number;
  levelBonus: { maxHealth: number; damage: number };
  playable: boolean;
  blockers: string[];
  notes: string[];
}

export interface RpgState {
  base: SimState;
  level: number;
  xp: number;
  /** 升过几次级：战斗伤害的加成从这里推导（plan 是常量，不能改） */
  levelUps: number;
}

/** 升到下一级所需的总经验：20 + (等级-1)×15 */
export function xpToNext(plan: Pick<RpgPlan, "xpBase" | "xpStep">, level: number): number {
  return plan.xpBase + (Math.max(1, level) - 1) * plan.xpStep;
}

/**
 * 编译 RPG 计划。纯函数：底层是 `compileGame`（确定性有测试钉住），
 * 成长层只读数值，所以同一份文档两次编译逐字段相同。
 */
export function compileRpg(document: GameDocument): RpgPlan {
  const base = compileGame(document);
  const notes = base.notes.slice();

  const byId = new Map(document.entities.map((entity) => [entity.id, entity]));

  const enemyXp: RpgEnemyXp[] = base.enemies.map((enemy) => {
    const authored = byId.get(enemy.id)?.stats?.xpReward;
    const from: StatSource = typeof authored === "number" && Number.isFinite(authored) ? "design" : "default";
    return { id: enemy.id, name: enemy.name, xp: from === "design" ? Math.max(0, authored!) : XP_PER_KILL_FALLBACK, from };
  });

  const quests: RpgQuestMeta[] = base.quests.map((quest) => {
    const entity = byId.get(quest.id);
    const authoredXp = entity?.stats?.xpReward;
    const authoredLevel = entity?.stats?.requiredLevel;
    return {
      id: quest.id,
      name: quest.name,
      xpReward: typeof authoredXp === "number" && Number.isFinite(authoredXp) ? Math.max(0, authoredXp) : 0,
      hasXpReward: typeof authoredXp === "number" && Number.isFinite(authoredXp),
      requiredLevel:
        typeof authoredLevel === "number" && Number.isFinite(authoredLevel) ? Math.max(0, Math.floor(authoredLevel)) : 0,
    };
  });

  const defaulted = enemyXp.filter((enemy) => enemy.from === "default");
  if (defaulted.length) {
    notes.push(`${defaulted.length} 个敌人的经验用的投影兜底 ${XP_PER_KILL_FALLBACK}（没写 xpReward）：HUD 会逐个标出来。`);
  }
  const gated = quests.filter((quest) => quest.requiredLevel > 1);
  if (gated.length) {
    notes.push(`${gated.length} 条任务带 requiredLevel：等级不够时条件满足也不结算（详见等级门那条规则）。`);
  }
  const withXp = quests.filter((quest) => quest.hasXpReward);
  if (quests.length && !withXp.length) {
    notes.push("没有一条任务写了 xpReward：完成任务不发经验，成长只来自打倒敌人。");
  }
  notes.push(...RPG_RULE_NOTES);

  return {
    name: base.name,
    summary: base.summary,
    base,
    enemyXp,
    quests,
    xpBase: XP_BASE,
    xpStep: XP_STEP,
    levelBonus: { ...LEVEL_BONUS },
    playable: base.playable,
    blockers: base.blockers.slice(),
    notes,
  };
}

export function initialRpgState(plan: RpgPlan): RpgState {
  return { base: initialState(plan.base), level: 1, xp: 0, levelUps: 0 };
}

/** 升级后的战斗数值：底层 plan 是常量，加成通过派生一份"当级计划"喂给 step */
function planAtLevel(plan: RpgPlan, levelUps: number): GamePlan {
  if (!levelUps || !plan.base.player) return plan.base;
  return {
    ...plan.base,
    player: {
      ...plan.base.player,
      damage: plan.base.player.damage + plan.levelBonus.damage * levelUps,
    },
  };
}

function pushEvent(events: { t: number; text: string }[], t: number, text: string): void {
  events.push({ t: Math.round(t * 10) / 10, text });
  if (events.length > 40) events.shift();
}

/**
 * 推进一帧 RPG：底层战斗交给 `sim.step`，成长在这一层结算——
 * 击杀与任务完成发经验、攒够升级、没到级的任务完成扣住不发。
 * 不修改传入的 state（底层 step 也不修改），同一状态同一输入跑出同一结果。
 */
export function rpgStep(plan: RpgPlan, state: RpgState, input: SimInput, dt: number): RpgState {
  if (state.base.status !== "playing") return state;
  const base = step(planAtLevel(plan, state.levelUps), state.base, input, dt);
  const next: RpgState = { base, level: state.level, xp: state.xp, levelUps: state.levelUps };

  // —— 等级门先扣：没到级的任务完成不算完成（不发经验），升到级后底层 step 会自己补记 ——
  // 底层 step 在同一帧里「标记完成 → 判胜」，门扣下的那一帧它可能已经宣布通关：
  // 把宣布撤回（条件与门同时成立才算赢），升到级的下一帧底层会重判——goals 每帧重评，不需要第二套判定。
  let gatedThisFrame = false;
  for (const quest of plan.quests) {
    if (quest.requiredLevel <= next.level) continue;
    if (next.base.questDone[quest.id] === undefined) continue;
    delete next.base.questDone[quest.id];
    gatedThisFrame = true;
    pushEvent(
      next.base.events,
      next.base.t,
      `任务「${quest.name}」条件满足了，但要 ${quest.requiredLevel} 级才能交（现在 ${next.level} 级）——完成先扣住`,
    );
  }
  if (gatedThisFrame && next.base.status === "won") {
    next.base.status = "playing";
    next.base.outcome = null;
  }

  // —— 经验：这一帧打倒的敌人 ——
  let gained = 0;
  for (const enemy of plan.enemyXp) {
    const before = state.base.enemies.find((e) => e.id === enemy.id);
    const after = next.base.enemies.find((e) => e.id === enemy.id);
    if (before?.active && after && !after.active) {
      gained += enemy.xp;
      pushEvent(
        next.base.events,
        next.base.t,
        `打倒 ${enemy.name} +${enemy.xp} 经验${enemy.from === "default" ? "（兜底值）" : ""}`,
      );
    }
  }

  // —— 经验：这一帧完成的任务（扣过等级门之后再看，没到级的完成不算） ——
  for (const quest of plan.quests) {
    const wasDone = state.base.questDone[quest.id] !== undefined;
    const isDone = next.base.questDone[quest.id] !== undefined;
    if (!wasDone && isDone && quest.hasXpReward && quest.xpReward > 0) {
      gained += quest.xpReward;
      pushEvent(next.base.events, next.base.t, `完成任务「${quest.name}」 +${quest.xpReward} 经验`);
    }
  }

  // —— 升级：曲线在 xpToNext；升级立刻回复并把上限写进下一帧的派生计划 ——
  next.xp += gained;
  while (next.xp >= xpToNext(plan, next.level)) {
    next.xp -= xpToNext(plan, next.level);
    next.level += 1;
    next.levelUps += 1;
    next.base.health += plan.levelBonus.maxHealth;
    pushEvent(
      next.base.events,
      next.base.t,
      `升到 ${next.level} 级：生命上限 +${plan.levelBonus.maxHealth}，伤害 +${plan.levelBonus.damage}（曲线来自投影，不是设计）`,
    );
  }

  return next;
}

/** HUD 的一行摘要：等级、经验进度与战斗读数，不含编造的"战力分" */
export function rpgSummary(plan: RpgPlan, state: RpgState): string {
  return [
    `等级 ${state.level}`,
    `经验 ${state.xp}/${xpToNext(plan, state.level)}`,
    `生命 ${Math.max(0, state.base.health)}`,
    `伤害 ${plan.base.player ? plan.base.player.damage + plan.levelBonus.damage * state.levelUps : 0}`,
    `敌人剩 ${state.base.enemies.filter((e) => e.active).length}/${state.base.enemies.length}`,
    `任务完成 ${Object.keys(state.base.questDone).length}`,
    state.base.status === "playing" ? "进行中" : state.base.status === "won" ? "通关" : "失败",
  ].join(" · ");
}
