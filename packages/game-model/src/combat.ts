import { playtest, playtestRpg, type PlaytestReport } from "./playtest";
import type { GamePlan, PlayActor } from "./play";
import { compileForKind } from "./story";
import { findEntity, setStat, type GameDocument, type GameEntity } from "./index";

/**
 * §52 那条链的第二格：Game Design → **Combat Design**。
 *
 * 上一格给的是一份确定性配方的草稿；这一格回答"Combat Design"该回答的那句话——
 * **这套数值打起来是什么味道，要不要改**。做的事全部可核对，一共三步：
 *
 * 1. 把这份文档跑一遍四种走法（`compileRpg` + `playtestRpg`，与试玩页同一对函数）；
 * 2. 拿读数对照**写死在这里的五条难度目标**（`combatGoals`）；
 * 3. 没达标就按**写死的杠杆表**（`COMBAT_LEVERS`）下一次改动，改完立刻重跑；
 *    只有"这条目标的读数被往对的方向推了，而且没把已达标的目标挤破"才保留，否则撤回。
 *
 * 三条限度，每一条都会出现在结论里，不只写在注释里：
 *
 * - **目标是我定的，不是模型判断的，也不是作者要的**。五条阈值写死在下面，换一套目标就是
 *   换一套"好"的定义。
 * - **改的只有数值**：health / damage / detectionRange / attackPower 这些 `stats` 键。
 *   冷却、升级曲线、等级门与同心环布局都是投影的常量，这一格不动它们；
 *   模型里没有坐标、攻击前摇与霸体，所以"手感"那一半根本不在可改的东西里。
 * - **兜底值会被写成作者值**。玩家或敌人本来没写某个键时投影用的是兜底数，调过之后那个数进了文档
 *   （provenance 从 default 变 design）。这件事必须点名，因为"这个数是谁给的"是 §50 以来追的那条线。
 *
 * 为什么它能是个纯函数：写数值走模型自己的入口 `setStat`（值不合法会被拒），但它盖的是时钟的时间戳；
 * 这一格要求"同一份文档 + 同一个 at = 逐字节相同的输出"（草稿要能复看、要比对），
 * 所以写完再把改过的实体的 `updatedAt` 按传进来的 `at` 统一盖回去。不读时钟、不碰库。
 */

/** 难度目标带与杠杆的步长、上下界。全部写死在这一处：界面上显示的就是这几个数 */
export const COMBAT_RULES = {
  /** 至少要有一种走法真通关（0 种通不等于不可能，但这份草稿里 0 种就是没有通路） */
  minWinners: 1,
  /** 最快那一种通关要打到这么多秒以上：一照面就清场等于没有战斗设计 */
  minWinSeconds: 18,
  /** 通关那几种里最少也要挨这么多点伤害：一点代价都不付的赢说明敌人不构成压力 */
  minWinnerDamageTaken: 2,
  /** 最多下这么多次改动，到顶就停并说清是轮次用尽 */
  maxRounds: 16,
  /** 加厚敌人：每个敌人每轮 +4 生命，到 48 封顶 */
  enemyHealthStep: 4,
  enemyHealthCap: 48,
  /** 同一轮里玩家 +8 生命，到 120 封顶（不成套会把"打得太快"改成"打不通"，见那条杠杆的理由） */
  playerHealthStep: 8,
  playerHealthCap: 120,
  /** 把战斗拖长的另一条办法：玩家伤害 -1，地板设在 1（0 伤害是"打不动"，那是另一条毛病） */
  weaponDamageFloor: 1,
  /** 敌人伤害：每轮 ±1，界在 0 与 6 */
  enemyDamageStep: 1,
  enemyDamageFloor: 0,
  enemyDamageCap: 6,
  /** 察觉半径：每轮 ±40 像素，界在 20 与 600 */
  detectionStep: 40,
  detectionFloor: 20,
  detectionCap: 600,
} as const;

export type CombatGoalId = "winnable" | "fight-length" | "winner-pays" | "idle-not-win" | "flee-survives";

/** 判定与分配杠杆的顺序就是这条数组的顺序：优先级高的目标先动 */
export const COMBAT_GOAL_ORDER: readonly CombatGoalId[] = [
  "winnable",
  "fight-length",
  "winner-pays",
  "idle-not-win",
  "flee-survives",
];

export interface CombatGoalReading {
  id: CombatGoalId;
  label: string;
  /** 达标条件那句话本身：和 achieved 并排显示，别让人反推阈值 */
  criterion: string;
  achieved: boolean;
  /** 这次跑出来的读数——每条都指得回报告里的具体字段 */
  reading: string;
  /** 判定用的那个数，一律取"越大越好"：杠杆用它判断这次改动有没有把这条目标推对方向 */
  metric: number;
}

/**
 * 可调的数值键与计划里字段的唯一一处映射。
 * 文档里写 `detectionRange`，计划里那个字段叫 `senseRadius`（§50 起就是这样），
 * 这张表同时给校验、写值和 provenance 比对用——加一个新键只改这里。
 */
export const COMBAT_ADJUSTABLE = [
  { statKey: "health", field: "health", provenanceSlot: "health" },
  { statKey: "damage", field: "damage", provenanceSlot: "damage" },
  { statKey: "detectionRange", field: "senseRadius", provenanceSlot: "senseRadius" },
] as const;

export type CombatAdjustableStatKey = (typeof COMBAT_ADJUSTABLE)[number]["statKey"];

export interface CombatAdjustment {
  leverId: string;
  leverLabel: string;
  goalId: CombatGoalId;
  entityId: string;
  entityName: string;
  /** 任意 stat 键都收（§54 的数值是开放的）：具体键名只是文档，不收紧成联合类型 */
  statKey: string;
  /** 跑起来真正生效的那个数：文档没写这个键时就是投影兜底值 */
  from: number;
  to: number;
  /** 文档里本来写了这个键吗：false = 这个数原本是兜底，调完成了作者值 */
  authored: boolean;
}

export interface CombatRound {
  round: number;
  leverId: string;
  leverLabel: string;
  goalId: CombatGoalId;
  kept: boolean;
  metricBefore: number;
  metricAfter: number;
  /** 没保留的原因：读数没往对的方向走，还是破了哪几条已达标的 */
  revertedBecause: string | null;
  /** 这一轮试下去的那组改动（没保留时也留着，撤回这件事要能被核对） */
  attempted: CombatAdjustment[];
}

export type CombatStopReason = "achieved" | "round-cap" | "no-lever-left" | "not-runnable";

export interface CombatTuning {
  /** 调过之后的那份文档（一处都没保留就是原样返回） */
  document: GameDocument;
  /**
   * 调之前的报告 / 调之后的报告。
   *
   * **类型是公共那一份**（`PlaytestReport`）：战斗目标读的是走法里的
   * `status / seconds / damageTaken / policy` ⇒ 俯视那条管线给得出同样的字段
   * （`RpgPlaytestReport` 是它的子类型）⇒ ⇒ 一份 2D 的设计也能被同一套目标读，
   * 而读数来自**它自己那条管线**的试玩报告，不是拿 RPG 的判据去读（§159）。
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
  beforeGoals: CombatGoalReading[];
  goals: CombatGoalReading[];
  /** 保留下来的改动，按发生顺序 */
  adjustments: CombatAdjustment[];
  rounds: CombatRound[];
  achieved: boolean;
  stopReason: CombatStopReason;
  notes: string[];
}

interface LeverInput {
  document: GameDocument;
  /**
   * 关卡计划（公共那一份）。
   *
   * 为什么不是 RPG 计划：杠杆只读 `enemies` 与 `player` ⇒ 而 `compileRpg` 的 `base`
   * **就是** `compileGame(document)`（`rpg.ts`）⇒ ⇒ 两条管线喂的是同一种形状。
   */
  plan: GamePlan;
  lever: CombatLever;
}

export interface CombatLever {
  id: string;
  goalId: CombatGoalId;
  label: string;
  /** 这套改动为什么是一起的（不成套会怎样），界面原样显示 */
  rationale: string;
  changes: (input: LeverInput) => CombatAdjustment[];
}

function statOf(entity: GameEntity | undefined, key: string): number | null {
  const value = entity?.stats?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function fieldOf(actor: PlayActor, statKey: CombatAdjustableStatKey): number {
  const row = COMBAT_ADJUSTABLE.find((item) => item.statKey === statKey);
  if (!row) throw new Error(`战斗调整不认识这个数值键：${statKey}`);
  return actor[row.field] as number;
}

/** 造一条改动；`to` 和现在一样就不算改动（返回 null，调用方跳过这一个实体） */
function change(
  actor: PlayActor,
  document: GameDocument,
  lever: CombatLever,
  statKey: CombatAdjustableStatKey,
  to: number,
): CombatAdjustment | null {
  const from = fieldOf(actor, statKey);
  if (to === from) return null;
  const entity = findEntity(document, actor.id);
  if (!entity) return null;
  return {
    leverId: lever.id,
    leverLabel: lever.label,
    goalId: lever.goalId,
    entityId: actor.id,
    entityName: actor.name,
    statKey,
    from,
    to,
    authored: statOf(entity, statKey) !== null,
  };
}

function perEnemy(
  { document, plan, lever }: LeverInput,
  statKey: CombatAdjustableStatKey,
  move: (current: number) => number | null,
): CombatAdjustment[] {
  const out: CombatAdjustment[] = [];
  for (const enemy of plan.enemies) {
    const to = move(fieldOf(enemy, statKey));
    if (to === null) continue;
    const item = change(enemy, document, lever, statKey, to);
    if (item) out.push(item);
  }
  return out;
}

function forPlayer(
  { document, plan, lever }: LeverInput,
  move: (current: number) => number | null,
): CombatAdjustment[] {
  const player = plan.player;
  if (!player) return [];
  const to = move(player.health);
  if (to === null) return [];
  const item = change(player, document, lever, "health", to);
  return item ? [item] : [];
}

/** 玩家的伤害来源是谁给的：文档里的 player.attackPower，还是引用到玩家的那把武器的 damage */
function offenseSource(document: GameDocument, player: PlayActor): { entity: GameEntity; key: string } | null {
  const playerEntity = findEntity(document, player.id);
  if (!playerEntity) return null;
  if (statOf(playerEntity, "attackPower") !== null) return { entity: playerEntity, key: "attackPower" };
  const weapon = document.entities.find(
    (entity) => entity.kind === "weapon" && entity.refs.some((ref) => ref.to === player.id),
  );
  if (weapon && statOf(weapon, "damage") !== null) return { entity: weapon, key: "damage" };
  return null;
}

/* 下面这张表就是"Combat Design 会做的全部事情"：五条目标、七条杠杆，数组顺序即尝试顺序。 */

export const COMBAT_LEVERS: readonly CombatLever[] = [
  {
    id: "soft-enemy-hits",
    goalId: "winnable",
    label: `每个敌人伤害 -${COMBAT_RULES.enemyDamageStep}（不低于 ${COMBAT_RULES.enemyDamageFloor}）`,
    rationale:
      "通不过的第一种原因是「活着走不完」：先把敌人下的重手收一收，让至少一种走法能把这关打完。" +
      "收的是每下的伤害，不是敌人数量——模型里没有「少刷几个」这个旋钮。",
    changes: (input) =>
      perEnemy(input, "damage", (current) =>
        current <= COMBAT_RULES.enemyDamageFloor
          ? null
          : Math.max(COMBAT_RULES.enemyDamageFloor, current - COMBAT_RULES.enemyDamageStep),
      ),
  },
  {
    id: "tougher-player",
    goalId: "winnable",
    label: `玩家生命 +${COMBAT_RULES.playerHealthStep}（到 ${COMBAT_RULES.playerHealthCap} 封顶）`,
    rationale: "通不过的第二种原因是血不够：不改任何人的输出，只把玩家能挨的下数抬起来。",
    changes: (input) =>
      forPlayer(input, (current) =>
        current >= COMBAT_RULES.playerHealthCap
          ? null
          : Math.min(COMBAT_RULES.playerHealthCap, current + COMBAT_RULES.playerHealthStep),
      ),
  },
  {
    id: "thicken-enemies-with-player",
    goalId: "fight-length",
    label: `每个敌人 +${COMBAT_RULES.enemyHealthStep} 生命，同一轮里玩家 +${COMBAT_RULES.playerHealthStep} 生命`,
    rationale:
      "这两处是一套动作：只把敌人加厚，四种走法会全体倒下（实测：草稿那两个敌人的生命各加 4 就 0 种通关、两种中途倒下），" +
      "那就从「打得太快」变成「打不通」。所以同一轮里玩家的生命也要抬起来。",
    changes: (input) => {
      const enemies = perEnemy(input, "health", (current) =>
        current >= COMBAT_RULES.enemyHealthCap
          ? null
          : Math.min(COMBAT_RULES.enemyHealthCap, current + COMBAT_RULES.enemyHealthStep),
      );
      if (!enemies.length) return [];
      const player = forPlayer(input, (current) =>
        current >= COMBAT_RULES.playerHealthCap
          ? null
          : Math.min(COMBAT_RULES.playerHealthCap, current + COMBAT_RULES.playerHealthStep),
      );
      return [...enemies, ...player];
    },
  },
  {
    id: "dull-player-weapon",
    goalId: "fight-length",
    label: "玩家伤害来源 -1（不低于 1）",
    rationale:
      "把战斗拖长的另一条办法：不动敌人生命，把玩家的重击变钝。地板设在 1 而不是 0，" +
      "因为 0 伤害等于「打不动」，那是另一条毛病，不该由这条杠杆制造出来。",
    changes: ({ document, plan, lever }) => {
      const player = plan.player;
      if (!player) return [];
      const source = offenseSource(document, player);
      if (!source) return [];
      const current = statOf(source.entity, source.key)!;
      if (current <= COMBAT_RULES.weaponDamageFloor) return [];
      return [
        {
          leverId: lever.id,
          leverLabel: lever.label,
          goalId: lever.goalId,
          entityId: source.entity.id,
          entityName: source.entity.name,
          statKey: source.key,
          from: current,
          to: current - 1,
          // 这条杠杆只在文档里确实写了这个键时才动（offenseSource 就是按这个筛的）
          authored: true,
        },
      ];
    },
  },
  {
    id: "sharper-enemy-hits",
    goalId: "winner-pays",
    label: `每个敌人伤害 +${COMBAT_RULES.enemyDamageStep}（到 ${COMBAT_RULES.enemyDamageCap} 封顶）`,
    rationale:
      "赢家一点血没掉，说明敌人不构成压力：加一点每下的伤害。这条杠杆常常会和「有路可通」打架——" +
      "加重的敌人可能把唯一的赢家打死，那时改动会被撤回，目标带还是没够到。",
    changes: (input) =>
      perEnemy(input, "damage", (current) =>
        current >= COMBAT_RULES.enemyDamageCap
          ? null
          : Math.min(COMBAT_RULES.enemyDamageCap, current + COMBAT_RULES.enemyDamageStep),
      ),
  },
  {
    id: "wider-enemy-sight",
    goalId: "idle-not-win",
    label: `每个敌人察觉半径 +${COMBAT_RULES.detectionStep} 像素（到 ${COMBAT_RULES.detectionCap} 封顶）`,
    rationale:
      "站着不动也能赢，通常是敌人根本没看见玩家：把察觉半径拉开，让「不操作」本身有代价。" +
      "这一条经常和「一直躲不该几秒就死」冲突，冲突时改动撤回。",
    changes: (input) =>
      perEnemy(input, "detectionRange", (current) =>
        current >= COMBAT_RULES.detectionCap
          ? null
          : Math.min(COMBAT_RULES.detectionCap, current + COMBAT_RULES.detectionStep),
      ),
  },
  {
    id: "narrower-enemy-sight",
    goalId: "flee-survives",
    label: `每个敌人察觉半径 -${COMBAT_RULES.detectionStep} 像素（不低于 ${COMBAT_RULES.detectionFloor}）`,
    rationale: "躲着走也会死，多半是敌人一进场就盯上了：先把察觉收回去一点，给回避留一条真能走的路。",
    changes: (input) =>
      perEnemy(input, "detectionRange", (current) =>
        current <= COMBAT_RULES.detectionFloor
          ? null
          : Math.max(COMBAT_RULES.detectionFloor, current - COMBAT_RULES.detectionStep),
      ),
  },
];

function leversFor(goalId: CombatGoalId): CombatLever[] {
  return COMBAT_LEVERS.filter((lever) => lever.goalId === goalId);
}

function readRuns(report: PlaytestReport) {
  const winners = report.runs.filter((run) => run.status === "won");
  const idle = report.runs.find((run) => run.policy === "idle");
  const flee = report.runs.find((run) => run.policy === "flee");
  return {
    winners: winners.length,
    /** 最快通关的秒数；一种都没通是 0（有没有赢家由 winners 那条区分，不靠这个 0） */
    fastestSeconds: winners.length ? Math.min(...winners.map((run) => run.seconds)) : 0,
    winnerDamageTaken: winners.length ? Math.min(...winners.map((run) => run.damageTaken)) : 0,
    idleWon: idle?.status === "won",
    fleeDied: flee?.status === "lost",
  };
}

/**
 * 五条目标的读数。写成函数而不是常量：同一份规则要能在调之前、调之后，
 * 以及别人那份完全不同的设计上都算一遍。
 * 没有赢家时 `fight-length` / `winner-pays` 判为不达标（不是"未评估"）：
 * 它们读的就是"通关那几种"，一种都没有就是无从满足，而 `reading` 里明说没有读数。
 */
export function combatGoals(report: PlaytestReport): CombatGoalReading[] {
  const r = readRuns(report);
  const hasWinner = r.winners >= COMBAT_RULES.minWinners;
  const byId: Record<CombatGoalId, CombatGoalReading> = {
    winnable: {
      id: "winnable",
      label: "有路可通",
      criterion: `四种走法里至少 ${COMBAT_RULES.minWinners} 种真通关`,
      achieved: hasWinner,
      reading: `${report.runs.length} 种走法里有 ${r.winners} 种通关`,
      metric: r.winners,
    },
    "fight-length": {
      id: "fight-length",
      label: "不是一照面就结束",
      criterion: `最快通关也要打满 ${COMBAT_RULES.minWinSeconds} 秒`,
      achieved: hasWinner && r.fastestSeconds >= COMBAT_RULES.minWinSeconds,
      reading: hasWinner ? `最快 ${r.fastestSeconds} 秒通关` : "没有一种走法通关，这一条没有读数可比",
      metric: r.fastestSeconds,
    },
    "winner-pays": {
      id: "winner-pays",
      label: "赢家要付出代价",
      criterion: `通关那几种里最少也挨了 ${COMBAT_RULES.minWinnerDamageTaken} 点伤害`,
      achieved: hasWinner && r.winnerDamageTaken >= COMBAT_RULES.minWinnerDamageTaken,
      reading: hasWinner ? `付代价最少的赢家挨了 ${r.winnerDamageTaken} 点` : "没有赢家，也就没有代价可数",
      metric: r.winnerDamageTaken,
    },
    "idle-not-win": {
      id: "idle-not-win",
      label: "站着不动不能赢",
      criterion: "站着不动那一种走法不能通关",
      achieved: !r.idleWon,
      reading: r.idleWon ? "站着不动也通关了：这些走法里没有威胁" : "站着不动没通关",
      metric: r.idleWon ? 0 : 1,
    },
    "flee-survives": {
      id: "flee-survives",
      label: "一直躲不该几秒就死",
      criterion: "一直躲开最近敌人那一种走法不能中途倒下",
      achieved: !r.fleeDied,
      reading: r.fleeDied ? "躲着走也会倒下：追击或伤害高到回避没有意义" : "躲着走没有倒下",
      metric: r.fleeDied ? 0 : 1,
    },
  };
  return COMBAT_GOAL_ORDER.map((id) => byId[id]);
}

interface Evaluation {
  document: GameDocument;
  plan: GamePlan;
  report: PlaytestReport;
  goals: CombatGoalReading[];
  /** 这些读数来自哪条管线（跟着走，调用方不用自己再判一次型） */
  pipeline: "rpg" | "topdown";
}

/**
 * 按**这份设计标的那一型**派管线来读数。
 *
 * 2026-10-22 之前这里无条件 `compileRpg` + `playtestRpg` ⇒ 链上一份 2D 的设计
 * 被拿 **RPG 的判据**去读 ⇒ 报出来的"战斗目标达成没有"不是这份设计那条管线的读数（§159）。
 *
 * **RPG 那一条逐字不变**：`compileRpg` 的 `base` 就是 `compileGame(document)`（`rpg.ts`）
 * ⇒ 这里取 `projection.plan.base` 与直接 `compileRpg(document).base` 完全相同 ⇒
 * 杠杆读到的 `enemies` / `player` 一模一样（既有那把尺子：game-model 的 combat 用例一条都没改）。
 *
 * 对话那两种**没有战斗可调** ⇒ 明说，不做一份说得过去的假读数。
 */
function evaluate(document: GameDocument): Evaluation {
  const projection = compileForKind(document);
  if (projection.pipeline === "rpg") {
    const plan = projection.plan.base;
    const report = playtestRpg(projection.plan);
    return { document, plan, report, goals: combatGoals(report), pipeline: "rpg" };
  }
  if (projection.pipeline === "topdown") {
    const plan = projection.plan;
    const report = playtest(projection.plan);
    return { document, plan, report, goals: combatGoals(report), pipeline: "topdown" };
  }
  throw new Error(
    `对话那一型（${document.kind}）没有战斗可调：战斗数值这一格只对俯视与 RPG 那两条管线有意义。`,
  );
}

function goalOf(goals: CombatGoalReading[], id: CombatGoalId): CombatGoalReading {
  const found = goals.find((goal) => goal.id === id);
  if (!found) throw new Error(`战斗目标清单里没有 ${id}：判定与目标分叉了`);
  return found;
}

/** 走模型的写入口（值不合法会被拒），再把改过的实体的时间戳按传入的 at 统一盖回去 */
function writeStats(document: GameDocument, changes: readonly CombatAdjustment[], at: string): GameDocument {
  let out = document;
  for (const item of changes) {
    const written = setStat(out, item.entityId, item.statKey, item.to);
    if (written.reason) {
      throw new Error(`战斗调整写不进去（${item.entityName}.${item.statKey}=${item.to}）：${written.reason}`);
    }
    out = written.document;
  }
  const touched = new Set(changes.map((item) => item.entityId));
  return {
    ...out,
    updatedAt: at,
    entities: out.entities.map((entity) => (touched.has(entity.id) ? { ...entity, updatedAt: at } : entity)),
  };
}

/** 哪些位置的数从"投影兜底"变成了"作者写的数"（provenance 翻了槽位的那些） */
function flippedToDesign(before: GamePlan, after: GamePlan): string[] {
  const out: string[] = [];
  for (const actor of [after.player, ...after.enemies]) {
    if (!actor) continue;
    const was = before.player?.id === actor.id ? before.player : before.enemies.find((e) => e.id === actor.id);
    if (!was) continue;
    for (const row of COMBAT_ADJUSTABLE) {
      const slot = row.provenanceSlot as "health" | "damage" | "senseRadius";
      if (was.provenance[slot] === "default" && actor.provenance[slot] === "design") {
        out.push(`${actor.name} 的 ${row.statKey}（原来没写，兜底 ${was[row.field] as number}，现在 ${actor[row.field] as number} 是文档里的数）`);
      }
    }
  }
  return out;
}

export interface TuneCombatOptions {
  /** 改动写入的时间戳：不读时钟，所以同一份文档 + 同一个 at 给出逐字节相同的输出 */
  at?: string;
}

/**
 * 把一份游戏文档的战斗数值调进目标带。纯函数，不改传入的文档。
 *
 * 每轮只下一组改动，下完立刻重跑四种走法；保留的条件有两个：这条目标的度量值严格变大，
 * **且**没有任何已达标的目标被挤破。达不到就撤回，并把这条杠杆标为用尽——
 * "改了但没用"的改动留在文档里，就是一份没人核对过的噪音。
 */
export function tuneCombat(document: GameDocument, options: TuneCombatOptions = {}): CombatTuning {
  const at = options.at ?? document.updatedAt;
  const start = evaluate(document);
  const rounds: CombatRound[] = [];
  const adjustments: CombatAdjustment[] = [];
  const spent = new Set<string>();
  let current = start;
  let stopReason: CombatStopReason = "no-lever-left";

  if (!start.plan.player) {
    // 没有玩家就没有可动的对象，四种走法跑起来只是立刻失败；这时任何数值调整都是凭空改文档
    return {
      document,
      pipeline: start.pipeline,
      before: start.report,
      after: start.report,
      beforeGoals: start.goals,
      goals: start.goals,
      adjustments,
      rounds,
      achieved: false,
      stopReason: "not-runnable",
      notes: [
        `这份文档里没有玩家实体，四种走法跑不起来：战斗数值没有可调整的对象，文档原样交回。${
          start.report.findings[0] ?? ""
        }`,
      ],
    };
  }

  for (let round = 1; round <= COMBAT_RULES.maxRounds; round += 1) {
    if (current.goals.every((goal) => goal.achieved)) {
      stopReason = "achieved";
      break;
    }
    // 按目标优先级找第一条未达标、且还有未用尽杠杆的目标；杠杆给不出改动（到界/没这个旋钮）就算用尽
    let picked: { lever: CombatLever; target: CombatGoalReading; changes: CombatAdjustment[] } | null = null;
    for (const target of current.goals) {
      if (target.achieved) continue;
      for (const lever of leversFor(target.id)) {
        if (spent.has(lever.id)) continue;
        const changes = lever.changes({ document: current.document, plan: current.plan, lever });
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
    const candidate = evaluate(writeStats(current.document, changes, at));
    const after = goalOf(candidate.goals, target.id);
    const broke = current.goals
      .filter((goal) => goal.achieved)
      .filter((goal) => !goalOf(candidate.goals, goal.id).achieved)
      .map((goal) => goal.id);
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
      adjustments.push(...changes);
    } else {
      spent.add(lever.id);
    }
    // 这里只写"跑到头了"；达标的判定交给循环后那一处，两处各判一次就会出现两份"这一格为什么停"
    if (round === COMBAT_RULES.maxRounds) stopReason = "round-cap";
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
    adjustments,
    rounds,
    achieved,
    stopReason,
    notes: tuningNotes(start, current, rounds, adjustments, achieved, stopReason),
  };
}

function tuningNotes(
  start: Evaluation,
  current: Evaluation,
  rounds: readonly CombatRound[],
  adjustments: readonly CombatAdjustment[],
  achieved: boolean,
  stopReason: CombatStopReason,
): string[] {
  const out: string[] = [
    `目标带是这一格写死的 ${current.goals.length} 条：${current.goals.map((goal) => `${goal.label}（${goal.criterion}）`).join("；")}。` +
      "阈值来自本文件的常量，不是模型判断，也不是从这份设计推出来的。",
    `一共下了 ${rounds.length} 轮、保留 ${adjustments.length} 处数值改动；每轮改完立刻重跑四种走法（定种子 7，跑的是 rpgStep）。`,
  ];
  if (adjustments.length) {
    out.push(
      `保留的改动：${adjustments
        .map((item) => `${item.entityName} 的 ${item.statKey} ${item.from}${item.authored ? "" : "（原为投影兜底）"}→${item.to}`)
        .join("、")}。`,
    );
  } else {
    out.push("没有保留任何改动：能试的杠杆要么把已达标的目标挤破了，要么没有把目标读数往对的方向推。");
  }
  // 保留的那几轮 revertedBecause 恒为 null、撤回的那几轮恒有理由（keep = 读数变好且没挤破，两者互为反面），
  // 所以"撤回了哪几轮"按理由筛，而不是按 kept 筛完再补一个空字符串
  const reverted = rounds.filter(
    (round): round is CombatRound & { revertedBecause: string } => round.revertedBecause !== null,
  );
  if (reverted.length) {
    out.push(
      `撤回了 ${reverted.length} 轮：${reverted.map((round) => `第 ${round.round} 轮「${round.leverLabel}」${round.revertedBecause}`).join("；")}。`,
    );
  }
  const flipped = flippedToDesign(start.plan, current.plan);
  if (flipped.length) {
    out.push(
      `${flipped.length} 处数值从「投影兜底」变成「作者写的数」：${flipped.join("；")}。` +
        "读数因此更贴近这份文档本身，但「这个数是谁给的」变了，HUD 上的 provenance 标记会跟着变。",
    );
  }
  if (achieved) {
    // 条数从目标清单数出来：手写的"四条"曾经与五条目标对不上，界面上那句披露就是假话
    out.push(
      `${current.goals.length} 条目标全部达标：这只说明这些走法落进了那 ${current.goals.length} 个阈值，不代表这游戏好玩、平衡或好上手。`,
    );
  } else {
    const unmet = current.goals.filter((goal) => !goal.achieved);
    out.push(
      `没达标的是：${unmet.map((goal) => `${goal.label}（${goal.reading}）`).join("；")}。` +
        // 没有玩家那一份在进循环之前就带着自己的说明返回了，这里的 stopReason 只剩两种
        `停在${stopReason === "round-cap" ? `轮次上限 ${COMBAT_RULES.maxRounds}` : "这几条目标的杠杆已经全部用尽或到界"}` +
        "——不是「没必要改」，也不是「改不出来」。",
    );
  }
  out.push(
    "改的只有数值：接触冷却 1 秒、挥击冷却 0.5 秒、升级曲线、等级门与同心环布局都是投影的常量，这一格不动；" +
      "模型里没有坐标、攻击前摇与霸体，所以手感那一半不在可改的东西里。",
  );
  return out;
}

/** 界面上那句"这一格在做什么、限度在哪"，与 `PLAYTEST_BASE_LIMITS` 同一位置的道理 */
export const COMBAT_DESIGN_LIMITS = [
  `Combat Design 这一格只做两件事：把这份设计跑一遍，再按写死的 ${COMBAT_GOAL_ORDER.length} 条目标和 ${COMBAT_LEVERS.length} 条杠杆调数值。`,
  `它不改规则、不加实体、不动布局；${COMBAT_GOAL_ORDER.length} 条目标是这一格自己的定义，不是需求里写好的验收标准。`,
  `调完仍然只有四种走法在读：0 种通关不等于不可能，${COMBAT_GOAL_ORDER.length} 条全达标也不等于好玩。`,
];
