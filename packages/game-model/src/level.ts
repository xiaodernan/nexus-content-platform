import { playtest, playtestRpg, type PlaytestReport } from "./playtest";
import { combatGoals, type CombatGoalReading } from "./combat";
import { ACTOR_RADIUS, ARENA, POSITION_STAT_KEYS, clampToArena, hasAuthoredPosition, type GamePlan, type PlayActor } from "./play";
import { compileForKind } from "./story";
import { findEntity, GAME_ENTITY_LABELS, setStat, type GameDocument, type GameEntity, type GameEntityKind } from "./index";

/**
 * §52 那条链的第三格：Game Design → Combat Design → **Level Design**。
 *
 * 前两格交出来的是「数值对了但位置还不在这份设计里」的一份文档：玩家站在正中，
 * 同类个体排在同心环上（见 `play.ts` 文件头那四条克制）。这一格做两件事：
 *
 * 1. **把布局写成设计值**：把投影临时排出来的位置逐个写进文档的 `x` / `y` 数值键，
 *    布局于是从「每次编译现算的兜底」变成「设计里可改、可在界面上编辑、可进版本历史的一个值」。
 *    来历要说清楚——那几个数的**来源是投影的同心环**，不是作者的手（notes 里点名，
 *    与上一格「兜底值变成作者值」是同一条纪律，见 ADR-0036）。
 * 2. **按三条几何目标检查这份布局**：别叠在一起、别把白拿的目标摆在出生点上、
 *    开局到最近敌人的距离要在能反应的带里。不达标就挪，挪完立刻重跑四种走法。
 *
 * 为什么这一格必须是独立的一格，而不是「数值格顺手做掉」：上一格七条杠杆全是数值，
 * 而「站着不动也能赢」有**纯布局**的那一半——目标物压在出生点上时，idle 那一种走法在第一帧
 * 就把条件满足了，把敌人察觉半径调到天上去也救不回来。`test/level.test.ts` 用一份这样的文档
 * 把这条界线钉住：同一份文档 `tuneCombat` 做不到、`designLevel` 做得到。
 *
 * 三条限度，每一条都进结论：
 *
 * - **目标带是这一格写死的**（`LEVEL_RULES`），不是需求里的验收标准，也不是模型判断出来的。
 * - **只挪位置**：战斗数值、冷却、升级曲线、实体增减与引用图一个都不动。
 * - **不许把上一格的成绩弄坏**：候选改动只要让「进入这一格时已达标的战斗目标」少了一条就撤回。
 *   位置会改变四种走法的读数，所以布局与数值会在同一份报告上打架，打架时布局让路。
 *
 * 场地就这么大：目标位置越界会被钳回场内，钳回来还是不达标就算这条杠杆用尽——
 * 模型里没有地形、没有第二个房间，「这块场地挤不下」在这一版是真结论而不是待办。
 *
 * 与上一格同样的纯函数要求：写值走模型入口 `setStat`，写完把改过的实体的 `updatedAt`
 * 按传入的 `at` 统一盖回去。不读时钟、不碰库。
 */

/** 几何目标的阈值与挪动规则。全部写死在这一处：界面上显示的就是这几个数 */
export const LEVEL_RULES = {
  /** 两个可显示个体靠得比这更近就叫「叠在一起」：半径 16 的个体直径正好 32，画布上读成一个东西 */
  minGapPixels: 2 * ACTOR_RADIUS,
  /** 出生点到最近敌人的距离下限：低于它就是「一照面就开打」，没有反应时间 */
  minApproachPixels: 120,
  /** 上限：高于它，四种走法有一半时间花在赶路 */
  maxApproachPixels: 520,
  /** 分开或让路时多留的余量：正好卡在阈值上，下一次读数就是一次抛硬币 */
  slackPixels: 8,
  /** 最多下这么多次挪动，到顶就停并说清是轮次用尽 */
  maxRounds: 12,
} as const;

/** 开局距离不达标时挪到哪儿：距离带的正中，既不贴脸也不远到看不见 */
export const LEVEL_APPROACH_TARGET = (LEVEL_RULES.minApproachPixels + LEVEL_RULES.maxApproachPixels) / 2;

export type LevelGoalId = "layout-authored" | "not-piled" | "spawn-clear" | "approach-band";

/** 判定与分配杠杆的顺序就是这条数组的顺序：先把布局写成设计值，再查三条几何目标 */
export const LEVEL_GOAL_ORDER: readonly LevelGoalId[] = ["layout-authored", "not-piled", "spawn-clear", "approach-band"];

export interface LevelGoalReading {
  id: LevelGoalId;
  label: string;
  /** 达标条件那句话本身：和 achieved 并排显示，别让人反推阈值 */
  criterion: string;
  achieved: boolean;
  reading: string;
  /** 判定用的那个数，一律取「越大越好」：杠杆用它判断这次改动有没有把这条目标推对方向 */
  metric: number;
}

export interface LevelPoint {
  x: number;
  y: number;
}

export interface LevelMove {
  leverId: string;
  leverLabel: string;
  goalId: LevelGoalId;
  entityId: string;
  entityName: string;
  /**
   * 这个个体是 11 类里的哪一类。界面上「挪了个物品」与「挪了个机关」是两件事：
   * 机关的位置原本可以由它引用的那个东西锚出来（见 `play.ts` 的 trigger 那段），
   * 给它写上坐标就等于把它从那个东西身上摘下来——必须点名，不能混在「挪了个东西」里。
   */
  entityKind: GameEntityKind;
  /**
   * `author` = 把投影已经排好的这个位置**原样**写进文档（一个像素都没挪）；
   * `shift` = 真的把个体从 from 挪到 to。两者的差别只在「这个位置的来历」，界面上必须分开显示。
   */
  kind: "author" | "shift";
  from: LevelPoint;
  to: LevelPoint;
  /** 文档里本来写了这对完整的坐标吗：false = 这个位置原本是投影排的 */
  authoredBefore: boolean;
  /** 只写了 x 或只写了 y：投影按「没摆过」处理，这一格把它补齐成一对 */
  halfAuthored: boolean;
}

export interface LevelRound {
  round: number;
  leverId: string;
  leverLabel: string;
  goalId: LevelGoalId;
  kept: boolean;
  metricBefore: number;
  metricAfter: number;
  /** 没保留的原因：这条目标的读数没变好，还是破了哪几条已达标的（含上一格的战斗目标） */
  revertedBecause: string | null;
  attempted: LevelMove[];
}

export type LevelStopReason = "achieved" | "round-cap" | "no-lever-left" | "not-runnable";

export interface LevelDesign {
  document: GameDocument;
  /**
   * 调之前的报告 / 调之后的报告。
   *
   * **类型是公共那一份**（`PlaytestReport`）：布局目标与战斗目标读的都是走法里的公共字段
   * ⇒ 俯视那条管线给得出同样的字段（`RpgPlaytestReport` 是它的子类型）
   * ⇒ ⇒ 一份 2D 的设计能被同一套目标读，而读数来自**它自己那条管线**（§159）。
   */
  before: PlaytestReport;
  after: PlaytestReport;
  /**
   * 这些读数来自**哪条管线**（`rpg` / `topdown`）。
   *
   * 为什么要有这一格：调用方（链上那一格）要把"读数来自哪条管线"写在界面上，
   * 而它自己**不该再判一次型**（§16：类型 → 管线的唯一分派点是 `compileForKind`）。
   */
  pipeline: "rpg" | "topdown";
  beforeGoals: LevelGoalReading[];
  goals: LevelGoalReading[];
  /** 上一格那几条战斗目标：进入这一格时达标几条、结束时达标几条。不相等就必须解释 */
  combatMetBefore: number;
  combatMetAfter: number;
  combatGoalsTotal: number;
  moves: LevelMove[];
  rounds: LevelRound[];
  achieved: boolean;
  stopReason: LevelStopReason;
  notes: string[];
}

interface LeverInput {
  document: GameDocument;
  plan: GamePlan;
  lever: LevelLever;
}

export interface LevelLever {
  id: string;
  goalId: LevelGoalId;
  label: string;
  /** 这一套挪动为什么是这样安排的（不成套会怎样），界面原样显示 */
  rationale: string;
  moves: (input: LeverInput) => LevelMove[];
}

function gap(a: LevelPoint, b: LevelPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 取负但不留负零：`-0` 在 JSON 里是 0、在 `Object.is` 与逐元素深比里不是 0，
 * 而读数恰好为 0（没有叠在一起的对、距离正好在带内）是最常出现的一档。
 */
function negate(value: number): number {
  return value === 0 ? 0 : -value;
}

function roundPx(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 这一格只认这五类有位置的东西：对话、动画、粒子、相机没有「摆在场地哪里」这回事 */
function bodies(plan: GamePlan): PlayActor[] {
  return [plan.player, ...plan.enemies, ...plan.items, ...plan.npcs].filter((actor): actor is PlayActor => Boolean(actor));
}

/**
 * 场上任何一个「有位置的对象」在文档里算不算作者摆过。
 * 判据来自投影自己（`hasAuthoredPosition`），这里不重写一遍——两处各写一遍
 * 就会出现「投影说没摆过、布局格说摆过」两种读数。
 */
function authored(entity: GameEntity | undefined): { full: boolean; half: boolean } {
  const written = [POSITION_STAT_KEYS.x, POSITION_STAT_KEYS.y].filter((key) => {
    const value = entity?.stats?.[key];
    return typeof value === "number" && Number.isFinite(value);
  }).length;
  return { full: hasAuthoredPosition(entity), half: written === 1 };
}

interface PlacedThing {
  id: string;
  name: string;
  kind: GameEntityKind;
  x: number;
  y: number;
}

/** 出生点周围「踩一步就完成」的东西：压在脚下的物品、范围罩住出生点的机关 */
function coveringSpawn(plan: GamePlan): { thing: PlacedThing; escapeRadius: number }[] {
  if (!plan.player) return [];
  const spawn = { x: plan.player.x, y: plan.player.y };
  const out: { thing: PlacedThing; escapeRadius: number }[] = [];
  for (const item of plan.items) {
    if (gap(spawn, item) < LEVEL_RULES.minGapPixels) out.push({ thing: item, escapeRadius: LEVEL_RULES.minGapPixels });
  }
  // 机关不是 PlayActor：它没有生命与伤害，只有「范围罩住谁」。kind 写死 trigger 是诚实的——
  // plan.triggers 正是 compileGame 从 ofKind(document, "trigger") 那一类建出来的。
  for (const trigger of plan.triggers) {
    const at = { x: trigger.x, y: trigger.y };
    if (gap(spawn, at) <= trigger.radius) {
      out.push({ thing: { id: trigger.id, name: trigger.name, kind: "trigger", x: at.x, y: at.y }, escapeRadius: trigger.radius });
    }
  }
  return out;
}

function nearestEnemyGap(plan: GamePlan): number | null {
  if (!plan.player || !plan.enemies.length) return null;
  const spawn = { x: plan.player.x, y: plan.player.y };
  return Math.min(...plan.enemies.map((enemy) => gap(spawn, enemy)));
}

/** 叠在一起的那些对：按显示顺序生成，所以两次跑挑到的是同一对 */
function piledPairs(plan: GamePlan): { a: PlayActor; b: PlayActor; distance: number }[] {
  const list = bodies(plan);
  const pairs: { a: PlayActor; b: PlayActor; distance: number }[] = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const distance = gap(list[i]!, list[j]!);
      if (distance < LEVEL_RULES.minGapPixels) pairs.push({ a: list[i]!, b: list[j]!, distance });
    }
  }
  return pairs;
}

function minGapOfBodies(plan: GamePlan): number | null {
  const list = bodies(plan);
  let min: number | null = null;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const distance = gap(list[i]!, list[j]!);
      if (min === null || distance < min) min = distance;
    }
  }
  return min;
}

/**
 * 四条布局目标的读数。写成函数而不是常量：同一套规则要在改之前、改之后，
 * 以及别人那份完全不同的设计上都算得一遍。
 * 没有敌人时 `approach-band` 判为达标——场上没有东西等你反应，这一条根本没有对象，
 * `reading` 里就是这么写的，不是「默认通过」。
 */
export function levelGoals(plan: GamePlan, document: GameDocument): LevelGoalReading[] {
  const list = bodies(plan);
  const unauthored = list.filter((actor) => !authored(document.entities.find((entity) => entity.id === actor.id)).full);
  const piles = piledPairs(plan);
  const covering = coveringSpawn(plan);
  const approach = nearestEnemyGap(plan);
  const tight = approach === null ? true : approach >= LEVEL_RULES.minApproachPixels;
  const loose = approach === null ? true : approach <= LEVEL_RULES.maxApproachPixels;
  const nearestGap = minGapOfBodies(plan);
  /** 偏离距离带多少个像素：带内是 0，带外是负数，所以「越大越好」这个方向全场成立 */
  const approachMetric = approach === null ? 0 : negate(Math.max(0, LEVEL_RULES.minApproachPixels - approach, approach - LEVEL_RULES.maxApproachPixels));
  const byId: Record<LevelGoalId, LevelGoalReading> = {
    "layout-authored": {
      id: "layout-authored",
      label: "布局是设计里的一个值",
      criterion:
        `场上每个可显示个体（玩家/敌人/物品/NPC）都写了 ${POSITION_STAT_KEYS.x} / ${POSITION_STAT_KEYS.y}，不是投影临时排的。` +
        `机关不在这条范围内：它的位置允许由它引用的那个东西锚出来（见 play.ts 的 trigger 那段），不写坐标不是缺漏`,
      achieved: list.length > 0 && unauthored.length === 0,
      reading:
        (list.length
          ? unauthored.length
            ? `${list.length} 个可显示个体里有 ${unauthored.length} 个没写全坐标，它们的位置正由投影按类别排在同心环上`
            : `${list.length} 个可显示个体的位置都写在文档里，没有一个由投影临时排`
          : "场上没有任何可显示个体，这一条没有对象") +
        (plan.triggers.length ? `；另有 ${plan.triggers.length} 个机关不在这条范围内（它们可以锚在引用的东西上）` : ""),
      metric: list.length - unauthored.length,
    },
    "not-piled": {
      id: "not-piled",
      label: "不叠在一起",
      criterion:
        `任意两个可显示个体（玩家/敌人/物品/NPC）的距离不小于 ${LEVEL_RULES.minGapPixels} 像素。` +
        "机关不算：它的位置允许压在别的东西上，那正是「锚到它引用的那个东西」的语义",
      achieved: piles.length === 0,
      reading: piles.length
        ? `${piles.length} 对个体叠在一处（叠得最近的一对是「${piles[0]!.a.name}」与「${piles[0]!.b.name}」，相距 ${roundPx(piles[0]!.distance)} 像素）`
        : nearestGap === null
          ? "场上只有一个或零个个体，这一条没有对象"
          : `最近的两个个体相距 ${roundPx(nearestGap)} 像素`,
      metric: -piles.length,
    },
    "spawn-clear": {
      id: "spawn-clear",
      label: "出生点上不摆白拿的目标",
      criterion: `没有物品压在出生点 ${LEVEL_RULES.minGapPixels} 像素内，也没有机关的范围罩住出生点`,
      achieved: covering.length === 0,
      reading: covering.length
        ? `${covering.length} 个「踩一步就完成」的目标在出生点上（${covering.map((entry) => `「${entry.thing.name}」`).join("、")}）`
        : "出生点周围没有可直接完成的目标",
      metric: -covering.length,
    },
    "approach-band": {
      id: "approach-band",
      label: "开局距离能反应",
      criterion: `出生点到最近敌人的距离在 ${LEVEL_RULES.minApproachPixels} 到 ${LEVEL_RULES.maxApproachPixels} 像素之间`,
      achieved: tight && loose,
      reading:
        approach === null
          ? "场上没有敌人，这一条没有对象可读"
          : tight && loose
            ? `最近的敌人离出生点 ${roundPx(approach)} 像素`
            : approach > LEVEL_RULES.maxApproachPixels
              ? `最近的敌人离出生点 ${roundPx(approach)} 像素：离得太远，走法里一半时间在赶路`
              : `最近的敌人离出生点 ${roundPx(approach)} 像素：贴脸，没有反应时间`,
      metric: approachMetric,
    },
  };
  return LEVEL_GOAL_ORDER.map((id) => byId[id]);
}

interface Evaluation {
  document: GameDocument;
  plan: GamePlan;
  report: PlaytestReport;
  goals: LevelGoalReading[];
  combat: CombatGoalReading[];
  /** 这些读数来自哪条管线（跟着走，调用方不用自己再判一次型） */
  pipeline: "rpg" | "topdown";
}

/**
 * 按**这份设计标的那一型**派管线来读数。
 *
 * 2026-10-22 之前这里无条件 `compileRpg` + `playtestRpg` ⇒ 链上一份 2D 的设计
 * 被拿 **RPG 的判据**去读 ⇒ 布局目标与战斗目标的读数不是这份设计那条管线的读数（§159）。
 *
 * **RPG 那一条逐字不变**：`compileRpg` 的 `base` 就是 `compileGame(document)`（`rpg.ts`）
 * ⇒ 这里取 `projection.plan.base` 与直接 `compileRpg(document).base` 完全相同
 * ⇒ 布局目标读到的场地与实体一模一样（既有那把尺子：game-model 的 level 用例一条都没改）。
 *
 * **那个 `rpg` 字段去掉了**：全仓只有这一处在搬运它、没有任何地方读它
 * ⇒ 留着它只会让人以为这一格依赖 RPG 那一层（§16：两份真值）。
 *
 * 对话那两种**没有位置可摆** ⇒ 明说，不做一份说得过去的假读数。
 */
function evaluate(document: GameDocument): Evaluation {
  const projection = compileForKind(document);
  if (projection.pipeline === "rpg") {
    const plan = projection.plan.base;
    const report = playtestRpg(projection.plan);
    return { document, plan, report, goals: levelGoals(plan, document), combat: combatGoals(report), pipeline: "rpg" };
  }
  if (projection.pipeline === "topdown") {
    const plan = projection.plan;
    const report = playtest(projection.plan);
    return { document, plan, report, goals: levelGoals(plan, document), combat: combatGoals(report), pipeline: "topdown" };
  }
  throw new Error(
    `对话那一型（${document.kind}）没有位置可摆：布局这一格只对俯视与 RPG 那两条管线有意义。`,
  );
}

function goalOf(goals: LevelGoalReading[], id: LevelGoalId): LevelGoalReading {
  const found = goals.find((goal) => goal.id === id);
  if (!found) throw new Error(`布局目标清单里没有 ${id}：判定与目标分叉了`);
  return found;
}

/**
 * 从 `from` 沿「远离 pivot」的方向放到距 pivot 为 `distance` 的地方，然后钳进场内。
 * 两点重合时方向是 0/0：固定往正右方兜一个方向——不兜就会写出 NaN 坐标，那比不达标更糟。
 */
function placeAlong(pivot: LevelPoint, from: LevelPoint, distance: number): LevelPoint {
  const dx = from.x - pivot.x;
  const dy = from.y - pivot.y;
  const current = Math.hypot(dx, dy);
  const ux = current < 1e-9 ? 1 : dx / current;
  const uy = current < 1e-9 ? 0 : dy / current;
  return {
    x: clampToArena(pivot.x + ux * distance, ARENA.width, ACTOR_RADIUS),
    y: clampToArena(pivot.y + uy * distance, ARENA.height, ACTOR_RADIUS),
  };
}

/** 造一条真挪动。目标位置就是现在的位置（钳回原地）就不算挪动，调用方跳过这一个个体 */
function shift(document: GameDocument, lever: LevelLever, thing: PlacedThing, to: LevelPoint): LevelMove | null {
  if (Math.abs(to.x - thing.x) < 1e-9 && Math.abs(to.y - thing.y) < 1e-9) return null;
  const entity = findEntity(document, thing.id);
  if (!entity) return null;
  const state = authored(entity);
  return {
    leverId: lever.id,
    leverLabel: lever.label,
    goalId: lever.goalId,
    entityId: thing.id,
    entityName: thing.name,
    entityKind: thing.kind,
    kind: "shift",
    from: { x: thing.x, y: thing.y },
    to,
    authoredBefore: state.full,
    halfAuthored: state.half,
  };
}

/* 下面这张表就是「Level Design 会做的全部事情」：四条目标、四条杠杆，数组顺序即尝试顺序。 */

export const LEVEL_LEVERS: readonly LevelLever[] = [
  {
    id: "author-the-layout",
    goalId: "layout-authored",
    label: `把投影排好的位置逐个原样写成文档里的 ${POSITION_STAT_KEYS.x} / ${POSITION_STAT_KEYS.y}`,
    rationale:
      "布局要能被下一格改、能在界面上编辑、能进版本历史，前提它是设计里的一个值而不是每次编译现算的兜底。" +
      "这条杠杆一个个体都不挪：四种走法的读数因此完全不变，变的只有「这个位置是谁给的」。",
    moves: ({ document, plan, lever }) => {
      const out: LevelMove[] = [];
      for (const actor of bodies(plan)) {
        const entity = findEntity(document, actor.id);
        const state = authored(entity);
        if (state.full || !entity) continue;
        out.push({
          leverId: lever.id,
          leverLabel: lever.label,
          goalId: lever.goalId,
          entityId: actor.id,
          entityName: actor.name,
          entityKind: actor.kind,
          kind: "author",
          from: { x: actor.x, y: actor.y },
          to: { x: actor.x, y: actor.y },
          authoredBefore: false,
          halfAuthored: state.half,
        });
      }
      return out;
    },
  },
  {
    id: "separate-pairs",
    goalId: "not-piled",
    label: `把叠得最近那对里的第二个沿连线方向挪开，距第一个 ${LEVEL_RULES.minGapPixels + LEVEL_RULES.slackPixels} 像素`,
    rationale:
      "叠在一起的两个个体在画布上读成一个东西，作者看不出场上真有两个。每次只处理叠得最紧的那一对：" +
      "挪开一对可能让另一对进入范围，一轮改一处、改完重跑才知道真实读数。被挪的总是那对里较后的一个，" +
      `而玩家排在最前（见 bodies 的顺序），所以玩家的出生点不会被这条杠杆动。`,
    moves: ({ document, plan, lever }) => {
      const piles = piledPairs(plan);
      if (!piles.length) return [];
      const tightest = piles.reduce((worst, pair) => (pair.distance < worst.distance ? pair : worst), piles[0]!);
      const item = shift(document, lever, tightest.b, placeAlong(tightest.a, tightest.b, LEVEL_RULES.minGapPixels + LEVEL_RULES.slackPixels));
      return item ? [item] : [];
    },
  },
  {
    id: "clear-the-spawn",
    goalId: "spawn-clear",
    label: "把出生点上的目标整体挪到它的可完成范围之外",
    rationale:
      "这一条是「站着不动也能赢」里唯一能由布局解决的那一半：目标物在脚下时 idle 走法第一帧就过了条件，" +
      "数值格把敌人察觉半径调到天上去也没有用。挪的是那些目标而不是玩家——" +
      "玩家站在哪是上一格的数值赖以成立的前提，动它等于把上一格的读数重算一遍。",
    moves: ({ document, plan, lever }) => {
      if (!plan.player) return [];
      const spawn = { x: plan.player.x, y: plan.player.y };
      const out: LevelMove[] = [];
      for (const entry of coveringSpawn(plan)) {
        const item = shift(
          document,
          lever,
          entry.thing,
          placeAlong(spawn, entry.thing, entry.escapeRadius + LEVEL_RULES.minGapPixels + LEVEL_RULES.slackPixels),
        );
        if (item) out.push(item);
      }
      return out;
    },
  },
  {
    id: "set-the-approach",
    goalId: "approach-band",
    label: `把最近的敌人放到离出生点 ${LEVEL_APPROACH_TARGET} 像素处（沿现有方向，越界才钳回场内）`,
    rationale:
      "开局距离是布局的事：贴脸就没有反应时间，太远则四种走法一半时间在赶路。" +
      "这条只挪那一个敌人，不动它的生命与伤害——那些是上一格按目标带调好的，这一格没有资格改。",
    moves: ({ document, plan, lever }) => {
      if (!plan.player || !plan.enemies.length) return [];
      const spawn = { x: plan.player.x, y: plan.player.y };
      const nearest = plan.enemies.reduce((best, enemy) => (gap(spawn, enemy) < gap(spawn, best) ? enemy : best), plan.enemies[0]!);
      const item = shift(document, lever, nearest, placeAlong(spawn, nearest, LEVEL_APPROACH_TARGET));
      return item ? [item] : [];
    },
  },
];

function leversFor(goalId: LevelGoalId): LevelLever[] {
  return LEVEL_LEVERS.filter((lever) => lever.goalId === goalId);
}

/** 走模型的写入口（值不合法会被拒），再把改过的实体的时间戳按传入的 at 统一盖回去 */
function writePositions(document: GameDocument, moves: readonly LevelMove[], at: string): GameDocument {
  let out = document;
  for (const item of moves) {
    for (const [key, value] of [
      [POSITION_STAT_KEYS.x, item.to.x],
      [POSITION_STAT_KEYS.y, item.to.y],
    ] as const) {
      const written = setStat(out, item.entityId, key, value);
      if (written.reason) throw new Error(`布局写不进去（${item.entityName}.${key}=${value}）：${written.reason}`);
      out = written.document;
    }
  }
  const touched = new Set(moves.map((item) => item.entityId));
  return {
    ...out,
    updatedAt: at,
    entities: out.entities.map((entity) => (touched.has(entity.id) ? { ...entity, updatedAt: at } : entity)),
  };
}

export interface DesignLevelOptions {
  /** 写入的时间戳：不读时钟，所以同一份文档 + 同一个 at 给出逐字节相同的输出 */
  at?: string;
}

/**
 * 把一份游戏文档的布局写成设计值，并按四条目标检查它。纯函数，不改传入的文档。
 *
 * 每轮只下一组挪动，下完立刻重跑四种走法。保留条件有三条：这条布局目标的读数严格变大、
 * 已达标的布局目标没被挤破、上一格调好的战斗目标也没被挤破。不满足就撤回，
 * 并把这条杠杆标为用尽（不许同一杠杆反复试）。
 */
export function designLevel(document: GameDocument, options: DesignLevelOptions = {}): LevelDesign {
  const at = options.at ?? document.updatedAt;
  const start = evaluate(document);
  const rounds: LevelRound[] = [];
  const moves: LevelMove[] = [];
  const spent = new Set<string>();
  let current = start;
  let stopReason: LevelStopReason = "no-lever-left";

  const protectedCombat = start.combat.filter((goal) => goal.achieved).map((goal) => goal.id);

  if (!start.plan.player) {
    // 没有玩家就没有出生点，「离敌人多远」「脚下压着什么」这些问题全部失去意义；
    // 这时写坐标只是把一份跑不起来的设计伪装修饰过
    return {
      document,
      pipeline: start.pipeline,
      before: start.report,
      after: start.report,
      beforeGoals: start.goals,
      goals: start.goals,
      combatMetBefore: start.combat.filter((goal) => goal.achieved).length,
      combatMetAfter: start.combat.filter((goal) => goal.achieved).length,
      combatGoalsTotal: start.combat.length,
      moves,
      rounds,
      achieved: false,
      stopReason: "not-runnable",
      notes: [
        `这份文档里没有玩家实体，没有出生点就没有「离敌人多远」「脚下压着什么」这些问题：布局一个坐标都没写，文档原样交回。${
          start.report.findings[0] ?? ""
        }`,
      ],
    };
  }

  for (let round = 1; round <= LEVEL_RULES.maxRounds; round += 1) {
    if (current.goals.every((goal) => goal.achieved)) {
      stopReason = "achieved";
      break;
    }
    let picked: { lever: LevelLever; target: LevelGoalReading; changes: LevelMove[] } | null = null;
    for (const target of current.goals) {
      if (target.achieved) continue;
      for (const lever of leversFor(target.id)) {
        if (spent.has(lever.id)) continue;
        const changes = lever.moves({ document: current.document, plan: current.plan, lever });
        if (!changes.length) {
          spent.add(lever.id);
          continue;
        }
        picked = { lever, target, changes };
        break;
      }
      if (picked) break;
    }
    if (!picked) {
      stopReason = "no-lever-left";
      break;
    }

    const { lever, target, changes } = picked;
    const candidate = evaluate(writePositions(current.document, changes, at));
    const after = goalOf(candidate.goals, target.id);
    const brokeLayout = current.goals
      .filter((goal) => goal.achieved)
      .filter((goal) => !goalOf(candidate.goals, goal.id).achieved)
      .map((goal) => `布局目标「${goal.label}」`);
    const brokeCombat = protectedCombat
      .filter((id) => !candidate.combat.find((goal) => goal.id === id)?.achieved)
      .map((id) => `战斗目标「${candidate.combat.find((goal) => goal.id === id)?.label ?? id}」`);
    const broke = [...brokeLayout, ...brokeCombat];
    const improved = after.metric > target.metric;
    const kept = improved && broke.length === 0;

    rounds.push({
      round,
      leverId: lever.id,
      leverLabel: lever.label,
      goalId: target.id,
      kept,
      metricBefore: target.metric,
      metricAfter: after.metric,
      revertedBecause: broke.length
        ? `破了已达标的 ${broke.join("、")}`
        : !improved
          ? `这条目标的读数没有变好（${target.metric} → ${after.metric}）`
          : null,
      attempted: changes,
    });

    if (kept) {
      current = candidate;
      moves.push(...changes);
    } else {
      spent.add(lever.id);
    }
    if (round === LEVEL_RULES.maxRounds) stopReason = current.goals.every((goal) => goal.achieved) ? "achieved" : "round-cap";
  }

  const achieved = current.goals.every((goal) => goal.achieved);
  if (achieved) stopReason = "achieved";
  return {
    document: current.document,
    pipeline: start.pipeline,
    before: start.report,
    after: current.report,
    beforeGoals: start.goals,
    goals: current.goals,
    combatMetBefore: start.combat.filter((goal) => goal.achieved).length,
    combatMetAfter: current.combat.filter((goal) => goal.achieved).length,
    combatGoalsTotal: start.combat.length,
    moves,
    rounds,
    achieved,
    stopReason,
    notes: designNotes(start, current, rounds, moves, achieved, stopReason, protectedCombat),
  };
}

function designNotes(
  start: Evaluation,
  current: Evaluation,
  rounds: readonly LevelRound[],
  moves: readonly LevelMove[],
  achieved: boolean,
  stopReason: LevelStopReason,
  protectedCombat: readonly string[],
): string[] {
  const out: string[] = [
    `布局目标是这一格写死的 ${current.goals.length} 条：${current.goals.map((goal) => `${goal.label}（${goal.criterion}）`).join("；")}。` +
      "阈值来自本文件的常量，不是模型判断，也不是从这份设计推出来的。",
    `一共下了 ${rounds.length} 轮、保留 ${moves.length} 处坐标改动；每轮改完立刻重跑四种走法（定种子 7，跑的是 rpgStep）。`,
  ];
  const authoredMoves = moves.filter((item) => item.kind === "author");
  if (authoredMoves.length) {
    out.push(
      `${authoredMoves.length} 个位置是**原样把投影排的同心环写进文档**的（${authoredMoves.map((item) => `「${item.entityName}」`).join("、")}）：` +
        "个体一个像素都没挪，但这些位置从此是设计里的值。它们的来历是投影的兜底布局，不是作者摆过的关卡——" +
        "HUD 上的位置标记会跟着从「投影兜底」变成「作者写的数」，这句话必须由这一格自己说。",
    );
  }
  const shifted = moves.filter((item) => item.kind === "shift");
  if (shifted.length) {
    out.push(
      `真正挪动位置的有 ${shifted.length} 处：${shifted.map((item) => `${GAME_ENTITY_LABELS[item.entityKind]}「${item.entityName}」(${roundPx(item.from.x)}, ${roundPx(item.from.y)})→(${roundPx(item.to.x)}, ${roundPx(item.to.y)})`).join("、")}。`,
    );
  }
  /**
   * 机关被写上坐标的那一刻起就不再跟着它引用的那个东西走了（`play.ts` 里 authored 优先于 anchor）。
   * 这个后果必须点名：作者看到的是「机关没动过引用关系」，读到的却是「它不再贴着那扇门了」。
   */
  const detachedTriggers = moves
    .filter((item) => item.entityKind === "trigger")
    .map((item) => {
      const before = start.plan.triggers.find((trigger) => trigger.id === item.entityId);
      return before && before.affects && !before.positionIsDesign ? { name: item.entityName, anchor: before.affects.name } : null;
    })
    .filter((entry): entry is { name: string; anchor: string } => Boolean(entry));
  if (detachedTriggers.length) {
    out.push(
      `为了让压在出生点上的机关让路，这一格给它写上了自己的坐标：${detachedTriggers.map((entry) => `「${entry.name}」`).join("、")}。` +
        `从此它不再跟着它引用的那个东西（${detachedTriggers.map((entry) => `「${entry.anchor}」`).join("、")}）走——引用关系一个都没改，改的是「这个位置由谁给」。` +
        "那个东西以后再挪，机关不会跟着挪。",
    );
  }
  const half = moves.filter((item) => item.halfAuthored);
  if (half.length) {
    out.push(
      `${half.length} 个个体原来只写了 ${POSITION_STAT_KEYS.x} 或只写了 ${POSITION_STAT_KEYS.y}（投影按「没摆过」处理，整体退回同心环）：这一格把它们补齐成一对坐标。` +
        "半套坐标不构成一个作者摆过的位置，所以写进去的是投影算出来的那一份，而不是保留那半个数。",
    );
  }
  const reverted = rounds.filter((round) => !round.kept);
  if (reverted.length) {
    out.push(
      `撤回了 ${reverted.length} 轮：${reverted.map((round) => `第 ${round.round} 轮「${round.leverLabel}」${round.revertedBecause ?? ""}`).join("；")}。`,
    );
  }
  const metBefore = protectedCombat.length;
  const metAfter = current.combat.filter((goal) => goal.achieved).length;
  const extraFixed = current.combat.filter((goal) => goal.achieved && !protectedCombat.includes(goal.id));
  out.push(
    metBefore === metAfter
      ? `上一格那 ${current.combat.length} 条战斗目标：进来时达标 ${metBefore} 条，这一格结束时还是 ${metAfter} 条。挪位置会改变四种走法的读数，这条对照就是「布局没有把数值格的成绩弄坏」的证据。`
      : metAfter > metBefore
        ? `上一格那 ${current.combat.length} 条战斗目标：进来时达标 ${metBefore} 条，现在是 ${metAfter} 条——多达标的是「${extraFixed.map((goal) => goal.label).join("、")}」。` +
          "那是这一格把布局挪对之后四种走法的读数跟着变的结果，不是战斗数值被这一格调对了：阈值与判定都还是上一格那套，所以这一格把它记成布局改动的连带读数，不记成数值上的功劳。"
        : `上一格那 ${current.combat.length} 条战斗目标：进来时达标 ${metBefore} 条，现在只剩 ${metAfter} 条。保留条件里明明有「不许挤破已达标的战斗目标」，出现这一句就是矛盾，得查判定而不是接受它。`,
  );
  if (achieved) {
    out.push(
      `${current.goals.length} 条布局目标全部达标：这只说明这份摆法落进了那 ${current.goals.length} 个阈值，不代表这一关好玩、有引导或有节奏——那些要人玩。`,
    );
  } else {
    const unmet = current.goals.filter((goal) => !goal.achieved);
    out.push(
      `没达标的是：${unmet.map((goal) => `${goal.label}（${goal.reading}）`).join("；")}。` +
        `停在${stopReason === "round-cap" ? `轮次上限 ${LEVEL_RULES.maxRounds}` : stopReason === "not-runnable" ? "这份设计跑不起来" : "这几条目标的杠杆已经全部用尽或在这块场地上挤不开"}` +
        "——不是「没必要改」，也不是「改不出来」。",
    );
  }
  out.push(
    "改的只有坐标：战斗数值、接触冷却、升级曲线、实体增减与引用图一个都没动。" +
      `模型里没有地形、房间与高度，所以「同一块 ${ARENA.width}×${ARENA.height} 的场子里挤不开」在这一版是真结论，不是待办。`,
  );
  return out;
}

/** 界面上那句「这一格在做什么、限度在哪」，与 `COMBAT_DESIGN_LIMITS` 同一位置的道理 */
export const LEVEL_DESIGN_LIMITS = [
  `Level Design 这一格只做两件事：把投影排好的位置写成文档里的坐标，再按写死的 ${LEVEL_GOAL_ORDER.length} 条几何目标检查这份布局。`,
  `它不改数值、不加实体、不动引用图；${LEVEL_GOAL_ORDER.length} 条目标是这一格自己的定义，不是需求里写好的验收标准。`,
  `场地固定 ${ARENA.width}×${ARENA.height} 像素、个体一律 ${ACTOR_RADIUS} 半径：挤不下就是挤不下，这一格不会为了让读数好看而发明第二个房间。`,
];
