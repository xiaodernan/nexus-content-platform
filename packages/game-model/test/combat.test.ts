import { describe, expect, it } from "vitest";
import {
  COMBAT_ADJUSTABLE,
  COMBAT_DESIGN_LIMITS,
  COMBAT_GOAL_ORDER,
  COMBAT_LEVERS,
  COMBAT_RULES,
  combatGoals,
  compileRpg,
  findEntity,
  playtestRpg,
  setStat,
  tuneCombat,
  validateGame,
  type CombatAdjustment,
  type CombatGoalReading,
  type CombatRound,
  type GameDocument,
  type GameEntity,
  type GameEntityKind,
  type PlaytestReport,
  type RpgPlaytestReport,
} from "../src/index";

/**
 * §52 第二格（Combat Design）的规则层测试。这一格唯一的撒谎方式是
 * **把"我改过了"说成"我改好了"**，所以断言全部围着三件事：
 *
 * 1. 保留下来的每一处改动都有重跑出来的读数支撑（那一轮的 metricAfter 必须严格变大）；
 * 2. 没用、或者把已达标的目标挤破了的那些必须当场撤回，撤回理由要点名，文档里不留痕；
 * 3. 够不着目标时停在 `no-lever-left` 并把"没达标的是哪几条"写进结论，
 *    而不是靠一轮无效的改动凑成达标。
 *
 * 取向还有两条：
 * - **没有伪造过一份报告对象**。五条目标每条的反方向用例都是真搭一关
 *   （要"站着不动也能赢"就做一个贴着玩家的触发器，而不是手写 `status:"won"`）——
 *   `combatGoals` 读的字段一旦改名，伪造的对象只会跟着我的笔误走，不会跟着生产代码走。
 * - 每一串预期数字（4.7→6.7→…→19.4 这一类）都是先把这份底稿跑一遍量出来的，
 *   改规则的人改坏了会在这一处红，而不是改阈值的人顺手改断言。
 * - "挤破了已达标的"那一半只有一种形状能证明：**读数确实变好了，同时把另一条挤破**。
 *   「免费通关」那一份就是这个唯一形状（0→20 却把 flee-survives 打死）。早先的底稿里被撤回的那几轮
 *   `metricAfter` 全都没超过 `metricBefore`，所以把 keep 规则里 `broke` 那半条删掉也不会红——
 *   这个洞是跑变异跑出来的，不是读代码读出来的。
 */

const AT = "2026-01-01T00:00:00.000Z";
const LATER = "2030-01-01T00:00:00.000Z";

interface Spec {
  id: string;
  kind: GameEntityKind;
  name: string;
  stats?: Record<string, number>;
  refs?: { to: string; role: string }[];
}

function build(name: string, specs: Spec[]): GameDocument {
  const document: GameDocument = {
    id: `game_${name}`,
    projectId: null,
    name,
    summary: "为这条断言搭的关卡",
    kind: "rpg-prototype",
    entities: specs.map((spec) => ({
      id: spec.id,
      kind: spec.kind,
      name: spec.name,
      notes: `说明：${spec.name}`,
      tags: ["combat-test"],
      stats: { ...spec.stats },
      refs: (spec.refs ?? []).map((ref, index) => ({ id: `${spec.id}-ref-${index}`, to: ref.to, role: ref.role })),
      updatedAt: AT,
    })),
    createdAt: AT,
    updatedAt: AT,
  };
  const issues = validateGame(document);
  if (issues.length) throw new Error(`测试底稿结构校验没过：${issues.map((issue) => issue.message).join("；")}`);
  return document;
}

/**
 * §52 第一格那份草稿的形状：玩家 5 血、短刃 2 伤、两个敌人 3/6 血、洞口贴着药包、任务要 2 级才交。
 * 四种走法里两种 4.7 秒清场——正是"打得太快"那一种。
 */
function battlefield(): GameDocument {
  return build("战场", [
    { id: "p1", kind: "player", name: "主角", stats: { health: 5, speed: 210 } },
    { id: "w1", kind: "weapon", name: "短刃", stats: { damage: 2, range: 40 }, refs: [{ to: "p1", role: "装备于" }] },
    { id: "e1", kind: "enemy", name: "巡逻兵", stats: { health: 3, damage: 1, speed: 150, detectionRange: 140, xpReward: 12 } },
    { id: "e2", kind: "enemy", name: "洞口守卫", stats: { health: 6, damage: 2, speed: 120, detectionRange: 160, xpReward: 10 } },
    { id: "i1", kind: "item", name: "药包", stats: { stackSize: 1, value: 5 } },
    { id: "t1", kind: "trigger", name: "洞口", stats: { radius: 70, delay: 1, cooldown: 2 }, refs: [{ to: "i1", role: "贴着" }] },
    {
      id: "q1",
      kind: "quest",
      name: "清场后打开洞口",
      stats: { xpReward: 12, requiredLevel: 2 },
      refs: [
        { to: "e1", role: "需要打倒" },
        { to: "e2", role: "需要打倒" },
        { to: "t1", role: "需要激活" },
      ],
    },
    { id: "n1", kind: "npc", name: "受伤的旅人", stats: { health: 1, interactRange: 90 } },
  ]);
}

/** 一个又厚又狠的敌人 + 玩家生命已到上限：把刀变钝会拖长战斗，但再钝一档就把唯一通路打死 */
function razorThin(): GameDocument {
  return build("薄血", [
    { id: "p1", kind: "player", name: "主角", stats: { health: 120, speed: 210 } },
    { id: "w1", kind: "weapon", name: "钝刀", stats: { damage: 3, range: 40 }, refs: [{ to: "p1", role: "装备于" }] },
    { id: "e1", kind: "enemy", name: "厚鬼", stats: { health: 40, damage: 6, speed: 200, detectionRange: 600, xpReward: 0 } },
    { id: "q1", kind: "quest", name: "讨伐", stats: { xpReward: 0, requiredLevel: 0 }, refs: [{ to: "e1", role: "需要打倒" }] },
  ]);
}

/** 站着不动也能赢：触发器贴着玩家，任务只要激活它——这是布局问题，不是数值问题 */
function standingWins(): GameDocument {
  return build("站着能赢", [
    { id: "p1", kind: "player", name: "主角", stats: { health: 20, speed: 210 } },
    { id: "e1", kind: "enemy", name: "木头人", stats: { health: 5, damage: 0, speed: 0, detectionRange: 0, xpReward: 0 } },
    { id: "t1", kind: "trigger", name: "脚下", stats: { radius: 80 }, refs: [{ to: "p1", role: "贴着" }] },
    { id: "q1", kind: "quest", name: "踩一下", stats: { xpReward: 0, requiredLevel: 0 }, refs: [{ to: "t1", role: "需要激活" }] },
  ]);
}

/**
 * 敌人一点伤害都不下：两种走法免费通关（赢家没付代价），躲着走的人退到墙角也不会死。
 * 给敌人加伤害能把「赢家要付出代价」从 0 推到 20——读数确实变好了，
 * 但同一次加伤会把「一直躲不该几秒就死」挤破。这是 keep 规则里 `broke` 那一半唯一的真形状。
 */
function freeWin(): GameDocument {
  return build("免费通关", [
    { id: "p1", kind: "player", name: "主角", stats: { health: 30, speed: 210 } },
    { id: "w1", kind: "weapon", name: "细剑", stats: { damage: 1, range: 40 }, refs: [{ to: "p1", role: "装备于" }] },
    { id: "e1", kind: "enemy", name: "追兵", stats: { health: 40, damage: 0, speed: 300, detectionRange: 400, xpReward: 0 } },
    { id: "q1", kind: "quest", name: "讨伐", stats: { xpReward: 0, requiredLevel: 0 }, refs: [{ to: "e1", role: "需要打倒" }] },
  ]);
}

/** 躲着走也会倒下：敌人比玩家快得多，收窄察觉一档救不回来 */
function hunterDies(): GameDocument {
  return build("躲也会死", [
    { id: "p1", kind: "player", name: "主角", stats: { health: 2, speed: 100 } },
    { id: "w1", kind: "weapon", name: "短刃", stats: { damage: 1, range: 40 }, refs: [{ to: "p1", role: "装备于" }] },
    { id: "e1", kind: "enemy", name: "猎手", stats: { health: 50, damage: 9, speed: 300, detectionRange: 900, xpReward: 0 } },
    { id: "q1", kind: "quest", name: "讨伐", stats: { xpReward: 0, requiredLevel: 0 }, refs: [{ to: "e1", role: "需要打倒" }] },
  ]);
}

/** 两个敌人都没写生命与伤害：跑起来用的是投影兜底值，调过之后那些数进了文档 */
function bareStats(): GameDocument {
  return build("裸数值", [
    { id: "p1", kind: "player", name: "主角", stats: { health: 5, speed: 210 } },
    { id: "w1", kind: "weapon", name: "短刃", stats: { damage: 2, range: 40 }, refs: [{ to: "p1", role: "装备于" }] },
    { id: "e1", kind: "enemy", name: "巡逻兵", stats: { speed: 150, detectionRange: 140, xpReward: 12 } },
    { id: "e2", kind: "enemy", name: "洞口守卫", stats: { speed: 120, detectionRange: 160, xpReward: 10 } },
    { id: "i1", kind: "item", name: "药包", stats: { stackSize: 1 } },
    { id: "t1", kind: "trigger", name: "洞口", stats: { radius: 70 }, refs: [{ to: "i1", role: "贴着" }] },
    {
      id: "q1",
      kind: "quest",
      name: "清场",
      stats: { xpReward: 12, requiredLevel: 2 },
      refs: [
        { to: "e1", role: "需要打倒" },
        { to: "e2", role: "需要打倒" },
        { to: "t1", role: "需要激活" },
      ],
    },
  ]);
}

/** 数值是测试的自变量：写不进去就直接炸，不能静默留原值让断言去猜 */
function stat(document: GameDocument, id: string, key: string, value: number): GameDocument {
  const written = setStat(document, id, key, value);
  if (written.reason) throw new Error(`测试底稿的 ${id}.${key}=${value} 写不进：${written.reason}`);
  return written.document;
}

/** 只在测试里搭"另一版设计"：改的是那一份，被调优的文档不受影响 */
function withStats(document: GameDocument, edits: [string, string, number][]): GameDocument {
  return edits.reduce((acc, [id, key, value]) => stat(acc, id, key, value), document);
}

function reportOf(document: GameDocument): RpgPlaytestReport {
  return playtestRpg(compileRpg(document));
}

function goalsOf(document: GameDocument): CombatGoalReading[] {
  return combatGoals(reportOf(document));
}

function goal(list: CombatGoalReading[], id: CombatGoalReading["id"]): CombatGoalReading {
  const found = list.find((item) => item.id === id);
  if (!found) throw new Error(`目标清单里没有 ${id}：判定与目标分叉了`);
  return found;
}

/**
 * 参数类型放宽成公共那一份（2026-10-22）：战斗目标读的是走法里的公共字段
 * ⇒ 俯视那条管线给得出同样的报告 ⇒ 这一格现在也能读非 RPG 的设计。
 * **断言一个字都没改**（只是这个辅助函数的类型放宽了）。
 */
function runOf(report: PlaytestReport, policy: string) {
  const found = report.runs.find((item) => item.policy === policy);
  if (!found) throw new Error(`四种走法里没有 ${policy}`);
  return found;
}

/**
 * 把保留的那些改动依次叠回原稿：得到的数值表必须与交回的那份文档逐键相同。
 * 后一轮会把同一个键再往前推（40→44→48），所以"每处改动都还在文档里"是假话；
 * 这条叠回去的核对才是真话，而撤回的那几轮自然不在里面。
 */
function replayKept(input: GameDocument, rounds: CombatRound[]): Record<string, number>[] {
  const stats = input.entities.map((entity) => ({ ...entity.stats }));
  for (const round of rounds) {
    if (!round.kept) continue;
    for (const item of round.attempted) {
      const index = input.entities.findIndex((entity) => entity.id === item.entityId);
      if (index < 0) throw new Error(`改动指向了底稿里没有的实体：${item.entityId}`);
      stats[index]![item.statKey] = item.to;
    }
  }
  return stats;
}

/** 某一处改动写下的那个值，此刻就在这份文档的对应实体上 */
function writtenTo(document: GameDocument, item: CombatAdjustment): boolean {
  const entity = document.entities.find((candidate) => candidate.id === item.entityId);
  return entity?.stats[item.statKey] === item.to;
}

/** 除了 stats 之外的一切都还是那一份：实体清单、引用、说明、标签、文档级字段 */
function unchangedExceptStats(before: GameDocument, after: GameDocument): string[] {
  const problems: string[] = [];
  const structure = (entity: GameEntity) =>
    JSON.stringify({ id: entity.id, kind: entity.kind, name: entity.name, notes: entity.notes, tags: entity.tags, refs: entity.refs });
  if (before.entities.length !== after.entities.length) problems.push(`实体数 ${before.entities.length} → ${after.entities.length}`);
  before.entities.forEach((entity, index) => {
    const twin = after.entities[index];
    if (twin && structure(entity) !== structure(twin)) problems.push(`${entity.name} 的说明或引用被改过`);
  });
  for (const key of ["id", "projectId", "name", "summary", "kind", "createdAt"] as const) {
    if (before[key] !== after[key]) problems.push(`文档级 ${key} 被改过`);
  }
  return problems;
}

function describeRound(round: CombatRound): string {
  return `${round.goalId}/${round.leverId}`;
}

function attemptedOf(round: CombatRound): string[] {
  return round.attempted.map((item) => `${item.entityName}.${item.statKey} ${item.from}→${item.to}`);
}

describe("combatGoals：五条目标各有反方向的真设计", () => {
  it("有路可通：能打完的报得出几种走法通了，等级门焊死的那一版报 0 种", () => {
    const open = goalsOf(battlefield());
    expect(goal(open, "winnable").achieved).toBe(true);
    expect(goal(open, "winnable").reading).toBe("4 种走法里有 2 种通关");
    // 反向：条件凑得齐、门一直扣着——同一条目标必须翻过来
    const blocked = goalsOf(stat(battlefield(), "q1", "requiredLevel", 99));
    expect(goal(blocked, "winnable").achieved).toBe(false);
    expect(goal(blocked, "winnable").metric).toBe(0);
    expect(goal(blocked, "winnable").reading).toContain("0 种通关");
  });

  it("不是一照面就结束：四秒多清场不算，打到 18 秒以上才算", () => {
    const fast = goal(goalsOf(battlefield()), "fight-length");
    expect(fast.achieved).toBe(false);
    expect(fast.metric).toBe(4.7);
    expect(fast.reading).toBe("最快 4.7 秒通关");
    expect(fast.criterion).toContain(String(COMBAT_RULES.minWinSeconds));
    // 反向：玩家血厚、武器钝、敌人加厚——最快那种走法打到 16.8 秒（仍差一点，但已有读数可比）
    const slow = goalsOf(withStats(battlefield(), [["p1", "health", 120], ["w1", "damage", 1], ["e1", "health", 22]]));
    expect(goal(slow, "fight-length").metric).toBe(16.8);
    expect(goal(slow, "fight-length").achieved).toBe(false);
    // 一种都没通时不写"未评估"，明说没有读数可比
    expect(goal(goalsOf(stat(battlefield(), "q1", "requiredLevel", 99)), "fight-length").reading).toContain("没有一种走法通关");
  });

  it("赢家要付出代价：一点血没掉的赢等于没打过", () => {
    const free = goalsOf(withStats(battlefield(), [["e1", "damage", 0], ["e2", "damage", 0]]));
    expect(goal(free, "winner-pays").achieved).toBe(false);
    expect(goal(free, "winner-pays").reading).toBe("付代价最少的赢家挨了 0 点");
    const paid = goalsOf(battlefield());
    expect(goal(paid, "winner-pays").achieved).toBe(true);
    expect(goal(paid, "winner-pays").metric).toBeGreaterThanOrEqual(COMBAT_RULES.minWinnerDamageTaken);
    expect(goal(goalsOf(stat(battlefield(), "q1", "requiredLevel", 99)), "winner-pays").reading).toContain("没有赢家");
  });

  it("站着不动不能赢：真做一个站着就赢的关卡，它才说不达标", () => {
    const standing = standingWins();
    // 前提要看得见：idle 这一种走法真的通关了，不是我读错了报告
    expect(runOf(reportOf(standing), "idle").status).toBe("won");
    expect(goal(goalsOf(standing), "idle-not-win").achieved).toBe(false);
    expect(goal(goalsOf(standing), "idle-not-win").reading).toContain("没有威胁");
    // 反向：正常关卡里站着不动过不去
    expect(runOf(reportOf(battlefield()), "idle").status).toBe("playing");
    expect(goal(goalsOf(battlefield()), "idle-not-win").achieved).toBe(true);
  });

  it("一直躲不该几秒就死：躲到边界也倒下的那种，说的是追击或伤害高到回避没意义", () => {
    const hunter = hunterDies();
    expect(runOf(reportOf(hunter), "flee").status).toBe("lost");
    expect(goal(goalsOf(hunter), "flee-survives").achieved).toBe(false);
    expect(goal(goalsOf(hunter), "flee-survives").reading).toBe("躲着走也会倒下：追击或伤害高到回避没有意义");
    expect(goal(goalsOf(battlefield()), "flee-survives").achieved).toBe(true);
  });

  it("目标的顺序就是分配杠杆的优先级；不达标的那条也给得出带数字的读数", () => {
    const read = goalsOf(battlefield());
    expect(read.map((item) => item.id)).toEqual([...COMBAT_GOAL_ORDER]);
    expect([...COMBAT_GOAL_ORDER]).toEqual(["winnable", "fight-length", "winner-pays", "idle-not-win", "flee-survives"]);
    expect(read.every((item) => item.label && item.criterion)).toBe(true);
    const unmet = read.filter((item) => !item.achieved);
    expect(unmet.map((item) => item.id)).toEqual(["fight-length"]);
    expect(unmet[0]!.reading).toMatch(/\d/);
  });
});

describe("tuneCombat 达标那一侧：每处保留的改动都有重跑的读数撑着", () => {
  it("草稿形状那一份：只动没达标的那条，七轮把 4.7 秒推到 18 秒以上", () => {
    const tuning = tuneCombat(battlefield(), { at: AT });
    expect(tuning.beforeGoals.filter((item) => !item.achieved).map((item) => item.id)).toEqual(["fight-length"]);
    expect(tuning.rounds.map(describeRound)).toEqual(new Array(7).fill("fight-length/thicken-enemies-with-player"));
    expect(tuning.rounds.map((round) => `${round.metricBefore}→${round.metricAfter}`)).toEqual([
      "4.7→6.7",
      "6.7→8.8",
      "8.8→10.8",
      "10.8→12.8",
      "12.8→15.3",
      "15.3→17.3",
      "17.3→19.4",
    ]);
    expect(tuning.achieved).toBe(true);
    expect(tuning.stopReason).toBe("achieved");
    expect(goal(tuning.goals, "fight-length").metric).toBeGreaterThanOrEqual(COMBAT_RULES.minWinSeconds);
    expect(tuning.adjustments.length).toBe(21);
    // 保留的那 21 处叠回原稿 = 交回的那份文档的数值表；每一处都曾在那一轮写进去过
    expect(tuning.document.entities.map((entity) => entity.stats)).toEqual(replayKept(battlefield(), tuning.rounds));
    const lastPerKey = new Map(tuning.adjustments.map((item) => [`${item.entityId}.${item.statKey}`, item]));
    expect([...lastPerKey.keys()].sort()).toEqual(["e1.health", "e2.health", "p1.health"]);
    for (const item of lastPerKey.values()) expect(writtenTo(tuning.document, item)).toBe(true);
    expect(unchangedExceptStats(battlefield(), tuning.document)).toEqual([]);
  });

  it("保留的每一轮：读数严格变大、没有撤回理由；界面那句计数与数组一致", () => {
    const tuning = tuneCombat(battlefield(), { at: AT });
    expect(tuning.rounds.length).toBeGreaterThan(1);
    for (const round of tuning.rounds) {
      expect(round.metricAfter).toBeGreaterThan(round.metricBefore);
      expect(round.revertedBecause).toBe(null);
      expect(round.attempted.length).toBeGreaterThan(0);
    }
    const kept = tuning.rounds.filter((item) => item.kept).flatMap((item) => item.attempted);
    expect(JSON.stringify(kept)).toBe(JSON.stringify(tuning.adjustments));
    expect(tuning.notes.join("\n")).toContain(`一共下了 ${tuning.rounds.length} 轮、保留 ${tuning.adjustments.length} 处数值改动`);
  });

  it("加厚敌人与抬玩家血是一套动作：单独加厚会让四种走法全倒下", () => {
    // 那条杠杆的理由就来自这两个读数：同一形状只加敌人血、不动玩家 → 0 种通关、2 种中途倒下
    const solo = reportOf(withStats(battlefield(), [["e1", "health", 7], ["e2", "health", 10]]));
    expect(solo.winnableBy).toBe(0);
    expect(solo.diedFrom).toBe(2);
    // 成套的那一份：每一轮同时动两个敌人与玩家，三个键都是 health
    const tuning = tuneCombat(battlefield(), { at: AT });
    for (const round of tuning.rounds) {
      // 顺序就是计划里的顺序：两个敌人按文档顺序，玩家最后
      expect(round.attempted.map((item) => item.entityName)).toEqual(["巡逻兵", "洞口守卫", "主角"]);
      expect(round.attempted.map((item) => item.statKey)).toEqual(["health", "health", "health"]);
    }
  });

  it("三条目标没达标时按优先级来：先修「有路可通」，通了之后才拖长时间", () => {
    const thin = withStats(battlefield(), [["e1", "health", 7], ["e2", "health", 10]]);
    const tuning = tuneCombat(thin, { at: AT });
    expect(tuning.beforeGoals.filter((item) => !item.achieved).map((item) => item.id)).toEqual(["winnable", "fight-length", "winner-pays"]);
    expect(describeRound(tuning.rounds[0]!)).toBe("winnable/soft-enemy-hits");
    expect(tuning.rounds[0]!.metricAfter).toBe(2);
    expect(tuning.rounds.slice(1).map((round) => round.goalId)).toEqual(new Array(6).fill("fight-length"));
    expect(tuning.achieved).toBe(true);
  });

  it("敌人一点伤害都不下时，代价那条靠加每下的伤害补上，并且不把通路打死", () => {
    const free = withStats(battlefield(), [["e1", "damage", 0], ["e2", "damage", 0]]);
    const tuning = tuneCombat(free, { at: AT });
    expect(tuning.beforeGoals.filter((item) => !item.achieved).map((item) => item.id)).toEqual(["fight-length", "winner-pays"]);
    const last = tuning.rounds[tuning.rounds.length - 1]!;
    expect(describeRound(last)).toBe("winner-pays/sharper-enemy-hits");
    expect([last.metricBefore, last.metricAfter]).toEqual([0, 17]);
    expect(last.attempted.map((item) => `${item.entityName} ${item.from}→${item.to}`)).toEqual(["巡逻兵 0→1", "洞口守卫 0→1"]);
    expect(tuning.achieved).toBe(true);
    for (const item of last.attempted) expect(item.to).toBeLessThanOrEqual(COMBAT_RULES.enemyDamageCap);
  });

  it("没写生命的那一版：兜底值被写成作者值，并且点名翻了几个槽位", () => {
    const tuning = tuneCombat(bareStats(), { at: AT });
    const unauthored = tuning.adjustments.filter((item) => !item.authored);
    expect(unauthored.map((item) => `${item.entityName} ${item.statKey} ${item.from}`)).toEqual(["巡逻兵 health 3", "洞口守卫 health 3"]);
    const note = tuning.notes.find((line) => line.includes("作者写的数"));
    expect(note).toBeDefined();
    expect(note).toContain("2 处数值从「投影兜底」变成「作者写的数」");
    expect(note).toContain("原来没写，兜底 3");
    // 对照：每一个数都写了的那一版不该冒出这条
    expect(tuneCombat(battlefield(), { at: AT }).notes.some((line) => line.includes("作者写的数"))).toBe(false);
  });
});

describe("tuneCombat 撤回那一侧：改不动就原样交回，并把没达标写进结论", () => {
  it("等级门焊死的那一版：五轮全撤、零处改动，结论说得出停在哪", () => {
    const blocked = stat(battlefield(), "q1", "requiredLevel", 99);
    const tuning = tuneCombat(blocked, { at: AT });
    expect(tuning.rounds.map(describeRound)).toEqual([
      "winnable/soft-enemy-hits",
      "winnable/tougher-player",
      "fight-length/thicken-enemies-with-player",
      "fight-length/dull-player-weapon",
      "winner-pays/sharper-enemy-hits",
    ]);
    expect(tuning.rounds.every((round) => !round.kept)).toBe(true);
    expect(tuning.rounds.map((round) => `${round.metricBefore}→${round.metricAfter}`)).toEqual(new Array(5).fill("0→0"));
    expect(tuning.rounds.every((round) => round.revertedBecause?.includes("读数没有变好"))).toBe(true);
    expect(tuning.adjustments).toEqual([]);
    expect(tuning.achieved).toBe(false);
    expect(tuning.stopReason).toBe("no-lever-left");
    // 门是规则不是数值，所以文档必须原样交回
    expect(tuning.document).toEqual(blocked);
    const joined = tuning.notes.join("\n");
    expect(joined).toContain("没有保留任何改动");
    expect(joined).toContain("撤回了 5 轮");
    expect(joined).toContain("这几条目标的杠杆已经全部用尽或到界");
    expect(joined).toContain("不是「没必要改」，也不是「改不出来」");
  });

  it("把唯一通路打死的那一轮：理由点名破了哪两条，撤回的那一档没进文档", () => {
    const tuning = tuneCombat(razorThin(), { at: AT });
    const broke = tuning.rounds.find((round) => round.revertedBecause?.startsWith("破了"));
    expect(broke).toBeDefined();
    expect(describeRound(broke!)).toBe("fight-length/dull-player-weapon");
    expect(broke!.metricBefore).toBe(12.8);
    expect(broke!.metricAfter).toBe(0);
    expect(broke!.revertedBecause).toBe("破了已达标的 winnable、winner-pays");
    expect(attemptedOf(broke!)).toEqual(["钝刀.damage 2→1"]);
    expect(tuning.adjustments.map((item) => `${item.entityName}.${item.statKey} ${item.from}→${item.to}`)).toEqual([
      "厚鬼.health 40→44",
      "厚鬼.health 44→48",
      "钝刀.damage 3→2",
    ]);
    expect(findEntity(tuning.document, "w1")?.stats.damage).toBe(2);
    expect(tuning.document.entities.map((entity) => entity.stats)).toEqual(replayKept(razorThin(), tuning.rounds));
    expect(tuning.achieved).toBe(false);
    expect(tuning.stopReason).toBe("no-lever-left");
    expect(tuning.notes.join("\n")).toContain("没达标的是：不是一照面就结束（最快 12.8 秒通关）");
  });

  it("读数变好了但把已达标的挤破：照样撤回——keep 规则里 broke 那一半只有这种形状能证", () => {
    const free = freeWin();
    const tuning = tuneCombat(free, { at: AT });
    // 底稿的读数先钉住：两种走法通关、最快 20.4 秒、赢家一点血没掉、站着不动没赢、躲着走没倒下
    expect(tuning.beforeGoals.map((item) => `${item.id}:${item.metric}${item.achieved ? "+" : "-"}`).join(" ")).toBe(
      "winnable:2+ fight-length:20.4+ winner-pays:0- idle-not-win:1+ flee-survives:1+",
    );
    expect(runOf(tuning.before, "beeline").damageTaken).toBe(0);
    expect(runOf(tuning.before, "flee").status).toBe("playing");

    // 只有一轮，而且这一轮把目标读数从 0 推到 20——"没变好"不是它被撤回的理由
    expect(tuning.rounds.map(describeRound)).toEqual(["winner-pays/sharper-enemy-hits"]);
    const round = tuning.rounds[0]!;
    expect(round.metricBefore).toBe(0);
    expect(round.metricAfter).toBe(20);
    expect(round.kept).toBe(false);
    expect(round.revertedBecause).toBe("破了已达标的 flee-survives");
    expect(attemptedOf(round)).toEqual(["追兵.damage 0→1"]);

    // 撤回就得真撤回：文档原样、零处保留、交回的读数还是撤回那一份（不是试过那一份）
    expect(tuning.adjustments).toEqual([]);
    expect(tuning.document).toEqual(free);
    expect(goal(tuning.goals, "winner-pays").achieved).toBe(false);
    expect(goal(tuning.goals, "flee-survives").achieved).toBe(true);
    expect(runOf(tuning.after, "beeline").damageTaken).toBe(0);
    expect(runOf(tuning.after, "flee").status).toBe("playing");
    expect(tuning.achieved).toBe(false);
    expect(tuning.stopReason).toBe("no-lever-left");
    const joined = tuning.notes.join("\n");
    expect(joined).toContain("没有保留任何改动");
    expect(joined).toContain("第 1 轮「每个敌人伤害 +1（到 6 封顶）」破了已达标的 flee-survives");
  });

  it("站着也能赢是布局问题：这一格只动数值，动不了它就原样交回", () => {
    const standing = standingWins();
    const tuning = tuneCombat(standing, { at: AT });
    // 把察觉拉开也没用：触发器贴着玩家，站着就赢，读数一动不动
    expect(tuning.rounds.map(describeRound)).toEqual([
      "fight-length/thicken-enemies-with-player",
      "winner-pays/sharper-enemy-hits",
      "idle-not-win/wider-enemy-sight",
    ]);
    expect(tuning.rounds.every((round) => !round.kept)).toBe(true);
    expect(tuning.adjustments).toEqual([]);
    expect(goal(tuning.goals, "idle-not-win").achieved).toBe(false);
    expect(tuning.document).toEqual(standing);
    expect(tuning.notes.join("\n")).toContain("站着不动不能赢（站着不动也通关了：这些走法里没有威胁）");
  });

  it("没有玩家的设计：不猜、不改，跑不起来写在第一句", () => {
    const noPlayer = build("没有玩家", [
      { id: "n1", kind: "npc", name: "路过的旅人", stats: { health: 1 } },
      { id: "e1", kind: "enemy", name: "巡逻兵", stats: { health: 3, damage: 1 } },
      { id: "q1", kind: "quest", name: "讨伐", stats: { xpReward: 0, requiredLevel: 0 }, refs: [{ to: "e1", role: "需要打倒" }] },
    ]);
    const tuning = tuneCombat(noPlayer, { at: AT });
    expect(tuning.stopReason).toBe("not-runnable");
    expect(tuning.rounds).toEqual([]);
    expect(tuning.adjustments).toEqual([]);
    expect(tuning.document).toEqual(noPlayer);
    expect(tuning.notes).toHaveLength(1);
    expect(tuning.notes[0]).toContain("这份文档里没有玩家实体");
    expect(tuning.notes[0]).toContain("文档原样交回");
    expect(tuning.before).toEqual(tuning.after);
  });
});

describe("上下界：到界的实体不再被推，杠杆因此算用尽", () => {
  it("敌人生命已在上限之上：加厚那一轮只动没到界的那一个", () => {
    const thick = stat(battlefield(), "e2", "health", 100);
    const tuning = tuneCombat(thick, { at: AT });
    const paired = tuning.rounds.find((round) => round.leverId === "thicken-enemies-with-player");
    expect(paired).toBeDefined();
    // 洞口守卫 100 已在上限之上：这次只能动巡逻兵（和玩家）
    expect(paired!.attempted.map((item) => `${item.entityName}.${item.statKey} ${item.from}→${item.to}`)).toEqual([
      "巡逻兵.health 3→7",
      "主角.health 5→13",
    ]);
    expect(paired!.kept).toBe(false);
    expect(tuning.adjustments).toEqual([]);
  });

  it("两个敌人都到界时，加厚这条根本进不了轮次", () => {
    const both = withStats(battlefield(), [["e1", "health", 60], ["e2", "health", 90]]);
    const tuning = tuneCombat(both, { at: AT });
    expect(tuning.rounds.map((round) => round.leverId)).toEqual([
      "soft-enemy-hits",
      "tougher-player",
      "dull-player-weapon",
      "sharper-enemy-hits",
    ]);
    expect(tuning.adjustments).toEqual([]);
    expect(tuning.stopReason).toBe("no-lever-left");
  });

  it("玩家生命已在上限：那一轮只加厚敌人，成套的那一半自己缺位", () => {
    const slow = withStats(battlefield(), [["p1", "health", 120], ["w1", "damage", 1], ["e1", "health", 22]]);
    const tuning = tuneCombat(slow, { at: AT });
    expect(tuning.rounds.map((round) => round.leverId)).toEqual(["thicken-enemies-with-player"]);
    expect(tuning.rounds[0]!.attempted.map((item) => `${item.entityName} ${item.from}→${item.to}`)).toEqual([
      "巡逻兵 22→26",
      "洞口守卫 6→10",
    ]);
    expect(tuning.achieved).toBe(true);
    expect(goal(tuning.goals, "fight-length").metric).toBe(20.9);
  });

  it("玩家生命推到上限为止：任何一处改动都不越过写死的界", () => {
    const tuning = tuneCombat(battlefield(), { at: AT });
    expect(tuning.adjustments.length).toBeGreaterThan(0);
    for (const item of tuning.adjustments) {
      expect(item.to).not.toBe(item.from);
      if (item.statKey === "health") {
        const cap = findEntity(tuning.document, item.entityId)?.kind === "player" ? COMBAT_RULES.playerHealthCap : COMBAT_RULES.enemyHealthCap;
        expect(item.to).toBeLessThanOrEqual(cap);
      }
      if (item.statKey === "damage" && findEntity(tuning.document, item.entityId)?.kind === "enemy") {
        expect(item.to).toBeGreaterThanOrEqual(COMBAT_RULES.enemyDamageFloor);
        expect(item.to).toBeLessThanOrEqual(COMBAT_RULES.enemyDamageCap);
      }
      if (item.statKey === "detectionRange") {
        expect(item.to).toBeGreaterThanOrEqual(COMBAT_RULES.detectionFloor);
        expect(item.to).toBeLessThanOrEqual(COMBAT_RULES.detectionCap);
      }
    }
    // 收窄察觉那条动了界内的数：900 往下一档是 860，不是把敌人改成瞎子
    const sight = tuneCombat(hunterDies(), { at: AT }).rounds.find((round) => round.leverId === "narrower-enemy-sight");
    expect(sight).toBeDefined();
    expect(attemptedOf(sight!)).toEqual(["猎手.detectionRange 900→860"]);
    expect(sight!.kept).toBe(false);
  });
});

describe("纯函数与确定性", () => {
  it("同一份文档 + 同一个 at：整份结果逐字节相同", () => {
    const first = tuneCombat(battlefield(), { at: AT });
    const second = tuneCombat(battlefield(), { at: AT });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.rounds.length).toBe(7);
  });

  it("换一个 at：数值与轮次一样，只有时间戳跟着变", () => {
    const one = tuneCombat(battlefield(), { at: AT });
    const other = tuneCombat(battlefield(), { at: LATER });
    expect(JSON.stringify(other.adjustments)).toBe(JSON.stringify(one.adjustments));
    expect(JSON.stringify(other.rounds)).toBe(JSON.stringify(one.rounds));
    expect(other.document.entities.map((item) => item.stats)).toEqual(one.document.entities.map((item) => item.stats));
    expect(other.document.updatedAt).toBe(LATER);
    // 缺省不读时钟：拿文档自己的 updatedAt，否则同一份草稿两次跑对不上
    expect(tuneCombat(battlefield()).document.updatedAt).toBe(AT);
  });

  it("不改传入的那份文档，也不动 stats 与时间戳之外的任何东西", () => {
    const input = battlefield();
    const snapshot = JSON.stringify(input);
    const tuning = tuneCombat(input, { at: LATER });
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(unchangedExceptStats(battlefield(), tuning.document)).toEqual([]);
    // 时间戳只盖被改动的那些实体与文档本身；没动过的旅人保持原值
    expect(findEntity(tuning.document, "e1")?.updatedAt).toBe(LATER);
    expect(findEntity(tuning.document, "n1")?.updatedAt).toBe(AT);
  });
});

describe("这一格承认的限度", () => {
  it("每条目标都有杠杆，每根杠杆都挂在一条目标上；可调的键只有三个", () => {
    expect(COMBAT_LEVERS.every((lever) => COMBAT_GOAL_ORDER.includes(lever.goalId))).toBe(true);
    for (const id of COMBAT_GOAL_ORDER) {
      expect(COMBAT_LEVERS.filter((lever) => lever.goalId === id).length).toBeGreaterThan(0);
    }
    expect(COMBAT_LEVERS.map((lever) => lever.id)).toEqual([
      "soft-enemy-hits",
      "tougher-player",
      "thicken-enemies-with-player",
      "dull-player-weapon",
      "sharper-enemy-hits",
      "wider-enemy-sight",
      "narrower-enemy-sight",
    ]);
    expect(COMBAT_ADJUSTABLE.map((row) => row.statKey)).toEqual(["health", "damage", "detectionRange"]);
    // 文档里叫 detectionRange，计划里那个字段叫 senseRadius：这张映射表是唯一的一处
    expect(COMBAT_ADJUSTABLE.map((row) => `${row.statKey}/${row.field}/${row.provenanceSlot}`)).toEqual([
      "health/health/health",
      "damage/damage/damage",
      "detectionRange/senseRadius/senseRadius",
    ]);
  });

  it("结论里带着这三句话：目标是自己定的、只动数值、四种走法不是穷举", () => {
    // 三句话里的条数都从清单数出来：加一条目标或杠杆，这里跟着动，不会出现"写着四条实际五条"
    expect(COMBAT_DESIGN_LIMITS.join(" ")).toContain(`${COMBAT_GOAL_ORDER.length} 条目标和 ${COMBAT_LEVERS.length} 条杠杆`);
    expect(COMBAT_DESIGN_LIMITS.join(" ")).toContain("不动布局");
    expect(COMBAT_DESIGN_LIMITS.join(" ")).toContain("不是需求里写好的验收标准");
    expect(COMBAT_DESIGN_LIMITS.join(" ")).toContain("0 种通关不等于不可能");
    const joined = tuneCombat(battlefield(), { at: AT }).notes.join("\n");
    expect(joined).toContain(`目标带是这一格写死的 ${COMBAT_GOAL_ORDER.length} 条：`);
    expect(joined).toContain("不是模型判断，也不是从这份设计推出来的");
    expect(joined).toContain("改的只有数值");
    expect(joined).toContain(`${COMBAT_GOAL_ORDER.length} 条目标全部达标：这只说明这些走法落进了那 ${COMBAT_GOAL_ORDER.length} 个阈值，不代表这游戏好玩`);
    // 没达标的那一版必须把"没达标"三个字说出来
    expect(tuneCombat(stat(battlefield(), "q1", "requiredLevel", 99), { at: AT }).notes.join("\n")).toContain("没达标的是");
  });
});
