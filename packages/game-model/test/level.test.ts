import { describe, expect, it } from "vitest";
import {
  ACTOR_RADIUS,
  ARENA,
  LEVEL_APPROACH_TARGET,
  LEVEL_DESIGN_LIMITS,
  LEVEL_GOAL_ORDER,
  LEVEL_LEVERS,
  LEVEL_RULES,
  POSITION_STAT_KEYS,
  combatGoals,
  compileGame,
  compileRpg,
  designLevel,
  findEntity,
  levelGoals,
  playtestRpg,
  setStat,
  tuneCombat,
  validateGame,
  type GameDocument,
  type GameEntity,
  type GameEntityKind,
  type GamePlan,
  type LevelMove,
  type LevelRound,
} from "../src/index";

/**
 * §52 链第三格（Level Design）的规则层测试。这一格能撒的谎只有三种，
 * 断言就全部围着这三种：
 *
 * 1. **「把布局写成设计值」是不是真写进了文档**——每一处保留下来的挪动都要能在交回的那份
 *    文档里读到那两个数（`replayKept` 把改动叠回原稿，与输出的 stats 逐键比），
 *    撤回的那些轮必须一个坐标都不留；
 * 2. **「一个像素都没挪」是不是真话**——`author-the-layout` 写的是投影此刻排出来的那一对数，
 *    所以四种走法的报告必须**逐字节相同**，位置表也必须逐字节相同（这是这一格最容易自我夸大的地方）；
 * 3. **没达标的时候有没有说实话**——停在 `no-lever-left` / `round-cap` / `not-runnable` 都要有
 *    真形状把它跑出来，而不是我在测试里造一个报告对象。
 *
 * 与上一格的界线是这里最要紧的一条：`keyOnSpawn()` 那份文档里 `tuneCombat` 用尽七条杠杆
 * 也修不好「站着不动不能赢」（idle 那一种走法跑完仍然 won），`designLevel` 一轮就修好了
 * （idle 变成 playing）。这条对照必须用**同一份文档**跑两遍，换文档就等于没证。
 *
 * 反向的形状同样有：`farFight()` 那份四种战斗目标全达标、只是开局敌人离得太远，
 * `set-the-approach` 把距离读数从 -510.9 推到 0（严格变好）却因为挤破「不是一照面就结束」被撤回——
 * 这是 keep 规则里 `broke` 那半条唯一的见证。少了它，把 `broke.length === 0` 删掉测试也不会红。
 *
 * 每一串预期数字（5 处改动、(720, 380)、(672, 380)、219 对、12 轮）都是先把这份底稿跑一遍量出来的。
 *
 * 变异探针跑过 13 臂（逐臂红的用例名记在 `docs/TESTING.md` 2026-10-13 那一格）：
 * 保留条件的两半各删一次、只保护布局、只保护战斗、半套坐标当成摆过、机关的覆盖不算、
 * 已摆过的位置当成没摆过、距离读数不取负、留下负零、两点重合不兜方向、author 偷偷挪一个像素、
 * 分开距离少留一档、让路距离少留一档、以及接线层那 6+1 臂。有两臂最初是绿的，根因值得留在这里：
 *
 * - **「让路距离少留一档」**：「压在出生点上」与「叠在一起」用的是同一个判据（间距小于 minGapPixels），
 *   而 not-piled 排在 spawn-clear 前面，正常情况下 separate-pairs 先把那件物品挪开、
 *   clear-the-spawn 的物品分支根本轮不到执行。补的底稿是 `stackedFour()`，它专门把那条分支走出来。
 * - **「已摆过的位置当成没摆过」**：见下面「上游已经摆过的位置」那条用例的注释——
 *   覆盖一遍与跳过在文档字节上分不开，能区分的只剩改动清单本身。
 */

const AT = "2026-01-01T00:00:00.000Z";
const LATER = "2030-06-06T06:06:06.000Z";

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
      tags: ["level-test"],
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

/** §52 第一格草稿的形状：位置一个都没写，全靠投影排环 */
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

/** 最小的一份：玩家与一个敌人都在环上，距离 300（带内） */
function bareRing(): GameDocument {
  return build("两个环上的个体", [
    { id: "p1", kind: "player", name: "主角", stats: { health: 8, speed: 200 } },
    { id: "w1", kind: "weapon", name: "短刃", stats: { damage: 2, range: 40 }, refs: [{ to: "p1", role: "装备于" }] },
    { id: "e1", kind: "enemy", name: "巡逻兵", stats: { health: 4, damage: 1, speed: 150, detectionRange: 150 } },
    { id: "q1", kind: "quest", name: "讨伐", stats: {}, refs: [{ to: "e1", role: "需要打倒" }] },
  ]);
}

/** 机关锚在玩家身上、半径 80 罩住出生点：任务只要激活它，站着不动第一帧就通关 */
function standingWins(): GameDocument {
  return build("站着能赢", [
    { id: "p1", kind: "player", name: "主角", stats: { health: 20, speed: 210 } },
    { id: "e1", kind: "enemy", name: "木头人", stats: { health: 5, damage: 0, speed: 0, detectionRange: 0, xpReward: 0 } },
    { id: "t1", kind: "trigger", name: "脚下", stats: { radius: 80 }, refs: [{ to: "p1", role: "贴着" }] },
    { id: "q1", kind: "quest", name: "踩一下", stats: {}, refs: [{ to: "t1", role: "需要激活" }] },
  ]);
}

/** 与上一份同一件事的另一半：压在出生点上的**物品**。这一份是那条界线的见证 */
function keyOnSpawn(): GameDocument {
  return build("脚下有钥匙", [
    { id: "p1", kind: "player", name: "主角", stats: { health: 20, speed: 200 } },
    { id: "w1", kind: "weapon", name: "短刃", stats: { damage: 2, range: 40 }, refs: [{ to: "p1", role: "装备于" }] },
    { id: "e1", kind: "enemy", name: "远处的敌人", stats: { health: 30, damage: 1, speed: 0, detectionRange: 0 } },
    { id: "i1", kind: "item", name: "钥匙", stats: { stackSize: 1, x: 600, y: 380 } },
    { id: "q1", kind: "quest", name: "拿钥匙", stats: {}, refs: [{ to: "i1", role: "需要拾取" }] },
  ]);
}

/** 四种战斗目标全达标、只是敌人离得太远：把敌人拉近会让「不是一照面就结束」破掉 */
function farFight(): GameDocument {
  return build("远处那一战", [
    { id: "p1", kind: "player", name: "主角", stats: { health: 40, speed: 210, x: 100, y: 380 } },
    { id: "w1", kind: "weapon", name: "短刃", stats: { damage: 2, range: 40 }, refs: [{ to: "p1", role: "装备于" }] },
    { id: "e1", kind: "enemy", name: "远处的敌人", stats: { health: 60, damage: 2, speed: 150, detectionRange: 300, xpReward: 0, x: 1080, y: 700 } },
    { id: "q1", kind: "quest", name: "讨伐", stats: {}, refs: [{ to: "e1", role: "需要打倒" }] },
  ]);
}

/** 四个个体全挤在同一点：分开到最后一个时怎么挪都会撞回去，separate-pairs 用尽后只能由让路杠杆接手 */
function stackedFour(): GameDocument {
  return build("四个叠一点", [
    { id: "p1", kind: "player", name: "主角", stats: { health: 20, speed: 200, x: 600, y: 380 } },
    { id: "w1", kind: "weapon", name: "短刃", stats: { damage: 2, range: 40 }, refs: [{ to: "p1", role: "装备于" }] },
    { id: "e1", kind: "enemy", name: "甲", stats: { health: 6, damage: 1, speed: 150, detectionRange: 200, x: 600, y: 380 } },
    { id: "e2", kind: "enemy", name: "乙", stats: { health: 6, damage: 1, speed: 150, detectionRange: 200, x: 600, y: 380 } },
    { id: "i1", kind: "item", name: "钥匙", stats: { stackSize: 1, x: 600, y: 380 } },
    {
      id: "q1",
      kind: "quest",
      name: "拿钥匙讨伐",
      stats: {},
      refs: [
        { to: "i1", role: "需要拾取" },
        { to: "e1", role: "需要打倒" },
      ],
    },
  ]);
}

/** 出生点在角落里，两个敌人一件钥匙全挤在其旁边：分开一对会把另一对推到同一点上 */
function crowded(): GameDocument {
  return build("挤不开", [
    { id: "p1", kind: "player", name: "主角", stats: { health: 8, speed: 200, x: 40, y: 40 } },
    { id: "w1", kind: "weapon", name: "短刃", stats: { damage: 2, range: 40 }, refs: [{ to: "p1", role: "装备于" }] },
    { id: "e1", kind: "enemy", name: "贴脸甲", stats: { health: 4, damage: 2, speed: 200, detectionRange: 200, x: 44, y: 44 } },
    { id: "e2", kind: "enemy", name: "贴脸乙", stats: { health: 4, damage: 2, speed: 200, detectionRange: 200, x: 41, y: 41 } },
    { id: "i1", kind: "item", name: "钥匙", stats: { stackSize: 1, x: 42, y: 42 } },
    {
      id: "q1",
      kind: "quest",
      name: "拿钥匙清场",
      stats: {},
      refs: [
        { to: "i1", role: "需要拾取" },
        { to: "e1", role: "需要打倒" },
      ],
    },
  ]);
}

/** 三十件物品全挤在同一点：每轮只能分开一对，12 轮用尽还没分开 */
function manyStones(count: number): GameDocument {
  const specs: Spec[] = [
    { id: "p1", kind: "player", name: "主角", stats: { health: 20, speed: 200, x: 100, y: 100 } },
    { id: "e1", kind: "enemy", name: "远处的敌人", stats: { health: 6, damage: 1, speed: 150, detectionRange: 200, x: 400, y: 300 } },
    { id: "q1", kind: "quest", name: "讨伐", stats: {}, refs: [{ to: "e1", role: "需要打倒" }] },
  ];
  for (let i = 1; i <= count; i += 1) specs.push({ id: `i${i}`, kind: "item", name: `石头${i}`, stats: { stackSize: 1, x: 600, y: 700 } });
  return build(`挤成一片${count}`, specs);
}

function noPlayer(): GameDocument {
  return build("没有玩家", [
    { id: "e1", kind: "enemy", name: "木头人", stats: { health: 5 } },
    { id: "i1", kind: "item", name: "药包", stats: { stackSize: 1 } },
  ]);
}

function write(document: GameDocument, entityId: string, key: string, value: number): GameDocument {
  const result = setStat(document, entityId, key, value);
  if (result.reason) throw new Error(`前置数值写入失败（${entityId}.${key}=${value}）：${result.reason}`);
  return result.document;
}

function run(document: GameDocument, at = AT) {
  return designLevel(document, { at });
}

/**
 * 按 id 取一条目标读数，布局与战斗两套共用。找不到就抛——
 * 「目标清单里没有这一条」和「这条没达标」是两种不同的谎，不能让 find 静默返回 undefined 再让断言去比。
 */
function goal<T extends { id: string }>(list: readonly T[], id: string): T {
  const found = list.find((item) => item.id === id);
  if (!found) throw new Error(`目标清单里没有 ${id}：判定与目标分叉了`);
  return found;
}

function runOf(report: { runs: { policy: string; status: string }[] }, policy: string) {
  const found = report.runs.find((item) => item.policy === policy);
  if (!found) throw new Error(`四种走法里没有 ${policy}`);
  return found;
}

/**
 * 场上位置表。只比 notes 以外的东西（写了坐标之后那条诚实的来历说明必然会变）。
 * `withProvenance = false` 时只给坐标，用来验「author 那一轮一个像素都没挪」——
 * 带着来历比就永远不同，那句话就退化成「来历字段变了」。
 */
function places(plan: GamePlan, withProvenance = true): unknown {
  const row = (id: string, x: number, y: number, origin: unknown) => (withProvenance ? [id, x, y, origin] : [id, x, y]);
  return [
    plan.player && row(plan.player.id, plan.player.x, plan.player.y, plan.player.provenance.position),
    plan.enemies.map((e) => row(e.id, e.x, e.y, e.provenance.position)),
    plan.items.map((e) => row(e.id, e.x, e.y, e.provenance.position)),
    plan.npcs.map((e) => row(e.id, e.x, e.y, e.provenance.position)),
    plan.triggers.map((t) => row(t.id, t.x, t.y, t.positionIsDesign)),
  ];
}

/**
 * 把保留下来的那些挪动叠回原稿，得到的坐标表必须与交回的那份文档逐键相同。
 * 后一轮会在前一轮的位置上再挪（(600,380)→(640,380)→…），所以"每处改动都在文档里"
 * 单条比是假话；叠回去比才是真话。撤回的那几轮不参与，正好钉住"没保留就不留痕"。
 */
function replayKept(input: GameDocument, rounds: LevelRound[]): Record<string, number>[] {
  const stats = input.entities.map((entity) => ({ ...entity.stats }));
  for (const round of rounds) {
    if (!round.kept) continue;
    for (const item of round.attempted) {
      const index = input.entities.findIndex((entity) => entity.id === item.entityId);
      if (index < 0) throw new Error(`改动指向了底稿里没有的实体：${item.entityId}`);
      stats[index]![POSITION_STAT_KEYS.x] = item.to.x;
      stats[index]![POSITION_STAT_KEYS.y] = item.to.y;
    }
  }
  return stats.map((entry) => ({ ...entry, x: entry.x ?? -1, y: entry.y ?? -1 }));
}

/** 交回的文档里每个实体的全部数值键（坐标缺省记成 -1，好让"没写"在读数上是个真值而不是 undefined） */
function positionsOf(document: GameDocument): Record<string, number>[] {
  return document.entities.map((entity) => ({ ...entity.stats, x: entity.stats[POSITION_STAT_KEYS.x] ?? -1, y: entity.stats[POSITION_STAT_KEYS.y] ?? -1 }));
}

/** 除 stats 与时间戳外一切都还是那一份：实体清单、顺序、说明、标签、引用、文档级字段 */
function unchangedExceptStatsAndStamps(before: GameDocument, after: GameDocument): string[] {
  const problems: string[] = [];
  const shape = (entity: GameEntity) => JSON.stringify({ id: entity.id, kind: entity.kind, name: entity.name, notes: entity.notes, tags: entity.tags, refs: entity.refs });
  if (before.entities.length !== after.entities.length) problems.push(`实体数 ${before.entities.length} → ${after.entities.length}`);
  before.entities.forEach((entity, index) => {
    const twin = after.entities[index];
    if (twin && shape(entity) !== shape(twin)) problems.push(`${entity.name} 的说明、标签或引用被改过`);
  });
  for (const key of ["id", "projectId", "name", "summary", "kind", "createdAt"] as const) {
    if (before[key] !== after[key]) problems.push(`文档级 ${key} 被改过`);
  }
  return problems;
}

/** 数值键（除坐标外的一切）逐键相同：这一格只许改位置 */
function numbersExceptPositions(document: GameDocument): Record<string, Record<string, number>> {
  return Object.fromEntries(
    document.entities.map((entity) => [
      entity.id,
      Object.fromEntries(Object.entries(entity.stats).filter(([key]) => key !== POSITION_STAT_KEYS.x && key !== POSITION_STAT_KEYS.y)),
    ]),
  );
}

function distance(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.hypot(from.x - to.x, from.y - to.y);
}

describe("levelGoals：四条布局目标各有反方向的真设计", () => {
  it("布局是不是设计里的值：没写坐标说不达标，写了坐标的那份说没有一个由投影临时排", () => {
    const before = levelGoals(compileRpg(bareRing()).base, bareRing());
    expect(goal(before, "layout-authored").achieved).toBe(false);
    expect(goal(before, "layout-authored").metric).toBe(0);
    expect(goal(before, "layout-authored").reading).toContain("2 个可显示个体里有 2 个没写全坐标");

    const authored = run(bareRing()).document;
    const after = levelGoals(compileRpg(authored).base, authored);
    expect(goal(after, "layout-authored").achieved).toBe(true);
    expect(goal(after, "layout-authored").metric).toBe(2);
    expect(goal(after, "layout-authored").reading).toBe("2 个可显示个体的位置都写在文档里，没有一个由投影临时排");
    // 反向对照：达标那句不能因为"反正跑过了"就说谎——只写一个键仍是半套，仍算没摆过
    const halfOnly = write(bareRing(), "e1", POSITION_STAT_KEYS.x, 700);
    const half = levelGoals(compileRpg(halfOnly).base, halfOnly);
    expect(goal(half, "layout-authored").achieved).toBe(false);
    expect(goal(half, "layout-authored").metric).toBe(0);
    expect(goal(half, "layout-authored").reading).toContain("2 个可显示个体里有 2 个没写全坐标");
    // 再反向一层：把第二个键补上，那个个体就退出"没摆过"——半套与整套在判定上是两回事
    const fullPair = write(halfOnly, "e1", POSITION_STAT_KEYS.y, 500);
    const pair = levelGoals(compileRpg(fullPair).base, fullPair);
    expect(goal(pair, "layout-authored").metric).toBe(1);
    expect(goal(pair, "layout-authored").reading).toContain("有 1 个没写全坐标");
  });

  it("机关不在「布局是设计里的值」这条范围内，而且这句话写在判据里", () => {
    const readings = levelGoals(compileRpg(battlefield()).base, battlefield());
    const layout = goal(readings, "layout-authored");
    expect(layout.criterion).toContain("机关不在这条范围内");
    expect(layout.reading).toContain("另有 1 个机关不在这条范围内");
    // 反向对照：没有机关的那份不该报出这一句
    expect(goal(levelGoals(compileRpg(bareRing()).base, bareRing()), "layout-authored").reading).not.toContain("机关");
    // 机关没写坐标，但这一条照样能达标：它的位置允许由引用的那个东西锚出来
    const authoredBodies = run(battlefield()).document;
    expect(findEntity(authoredBodies, "t1")?.stats[POSITION_STAT_KEYS.x]).toBeUndefined();
    expect(goal(levelGoals(compileRpg(authoredBodies).base, authoredBodies), "layout-authored").achieved).toBe(true);
  });

  it("不叠在一起：挤在一处的真做一份出来，分开的那份说最近的两个相距多少", () => {
    const piled = levelGoals(compileRpg(crowded()).base, crowded());
    expect(goal(piled, "not-piled").achieved).toBe(false);
    expect(goal(piled, "not-piled").metric).toBe(-6);
    expect(goal(piled, "not-piled").reading).toContain("叠在一处");
    expect(goal(piled, "not-piled").criterion).toContain("机关不算");
    // 反向对照：环上排开的战场达标，读数给的是那个真实距离
    const spread = levelGoals(compileGame(battlefield()), battlefield());
    expect(goal(spread, "not-piled").achieved).toBe(true);
    expect(goal(spread, "not-piled").reading).toBe(`最近的两个个体相距 60 像素`);
    // 只有一个个体时没有对象可读，不能算达标也不能算叠在一起
    const solo = compileRpg(build("只有一个", [{ id: "p1", kind: "player", name: "主角", stats: { x: 500, y: 300 } }])).base;
    expect(goal(levelGoals(solo, build("只有一个", [{ id: "p1", kind: "player", name: "主角", stats: { x: 500, y: 300 } }])), "not-piled").reading).toBe(
      "场上只有一个或零个个体，这一条没有对象",
    );
  });

  it("出生点上不摆白拿的目标：压在脚下的物品与罩住出生点的机关都点名", () => {
    const withItem = levelGoals(compileRpg(keyOnSpawn()).base, keyOnSpawn());
    expect(goal(withItem, "spawn-clear").achieved).toBe(false);
    expect(goal(withItem, "spawn-clear").reading).toContain("「钥匙」");
    const withTrigger = levelGoals(compileRpg(standingWins()).base, standingWins());
    expect(goal(withTrigger, "spawn-clear").achieved).toBe(false);
    expect(goal(withTrigger, "spawn-clear").reading).toContain("「脚下」");
    // 反向对照：战场上的药包在环上（离出生点 180），机关锚在它身上也不罩住出生点
    expect(goal(levelGoals(compileGame(battlefield()), battlefield()), "spawn-clear").achieved).toBe(true);
    // 敌人贴脸不算这一条：它不是「踩一步就完成」的目标
    expect(goal(levelGoals(compileRpg(crowded()).base, crowded()), "spawn-clear").achieved).toBe(false);
  });

  it("开局距离能反应：太远与贴脸是两个不同的读数，没有敌人时明说没有对象", () => {
    const far = goal(levelGoals(compileRpg(farFight()).base, farFight()), "approach-band");
    expect(far.achieved).toBe(false);
    expect(far.reading).toContain("离得太远");
    // (1080-100, 700-380) 相距 1030.9，超出上限 520 的那一截就是读数
    expect(far.metric).toBeCloseTo(-510.92, 2);
    const pointBlank = goal(levelGoals(compileRpg(crowded()).base, crowded()), "approach-band");
    expect(pointBlank.achieved).toBe(false);
    expect(pointBlank.reading).toContain("贴脸，没有反应时间");
    // 贴脸那一份离出生点只有 √2 像素，差 118.6 才进带
    expect(pointBlank.metric).toBeCloseTo(-118.59, 2);
    expect(goal(levelGoals(compileGame(battlefield()), battlefield()), "approach-band").achieved).toBe(true);
    // 没有敌人：这一条根本没有对象，明说而不是"默认通过"
    const noEnemy = compileRpg(build("没有敌人", [{ id: "p1", kind: "player", name: "主角", stats: { x: 600, y: 380 } }])).base;
    const reading = goal(levelGoals(noEnemy, build("没有敌人", [{ id: "p1", kind: "player", name: "主角", stats: { x: 600, y: 380 } }])), "approach-band");
    expect(reading.achieved).toBe(true);
    expect(reading.reading).toBe("场上没有敌人，这一条没有对象可读");
    expect(reading.metric).toBe(0);
  });

  it("目标清单的顺序就是 LEVEL_GOAL_ORDER，一条不多一条不少", () => {
    const ids = levelGoals(compileRpg(battlefield()).base, battlefield()).map((item) => item.id);
    expect(ids).toEqual([...LEVEL_GOAL_ORDER]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("designLevel：把投影排好的位置写成文档里的坐标", () => {
  it("author 那一轮一个像素都不挪：四种走法的报告与位置表逐字节相同", () => {
    const input = battlefield();
    const designed = run(input);
    // 前提要看得见：这一格只下了一轮，而那轮就是 author-the-layout（没有真挪动掺进来）
    expect(designed.rounds.map((round) => [round.goalId, round.leverId, round.kept])).toEqual([["layout-authored", "author-the-layout", true]]);
    expect(designed.moves.length).toBe(5);
    expect(designed.moves.every((item) => item.kind === "author")).toBe(true);
    expect(designed.moves.every((item) => item.from.x === item.to.x && item.from.y === item.to.y)).toBe(true);
    // 结论：报告与位置表都逐字节相同，变的只有「这个位置是谁给的」
    expect(JSON.stringify(designed.after)).toBe(JSON.stringify(designed.before));
    const written = compileRpg(designed.document).base;
    expect(JSON.stringify(places(written))).not.toBe(JSON.stringify(places(compileRpg(input).base)));
    // 把来历那一格摘掉再比：坐标真的一个都没动，上一条的"不同"就只来自来历
    expect(JSON.stringify(places(written, false))).toBe(JSON.stringify(places(compileRpg(input).base, false)));
    // 机关仍然跟着药包：这一格没给它写坐标
    const trigger = written.triggers.find((t) => t.id === "t1")!;
    const item = written.items.find((i) => i.id === "i1")!;
    expect({ x: trigger.x, y: trigger.y }).toEqual({ x: item.x, y: item.y });
    expect(trigger.positionIsDesign).toBe(false);
  });

  it("写进去的就是投影此刻排出来的那一对数：环位置在文档里读得出来", () => {
    const designed = run(bareRing());
    const plan = compileRpg(bareRing()).base;
    for (const id of ["p1", "e1"]) {
      const authored = designed.document.entities.find((entity) => entity.id === id)!;
      const actor = [plan.player, ...plan.enemies].find((candidate) => candidate?.id === id)!;
      expect([authored.stats[POSITION_STAT_KEYS.x], authored.stats[POSITION_STAT_KEYS.y]]).toEqual([actor!.x, actor!.y]);
    }
    // 半套坐标（只写 x=700）不被保留：投影按「没摆过」退回环上，写进去的是环上那一份
    const half = run(write(bareRing(), "e1", POSITION_STAT_KEYS.x, 700));
    const e1 = findEntity(half.document, "e1")!;
    expect([e1.stats[POSITION_STAT_KEYS.x], e1.stats[POSITION_STAT_KEYS.y]]).toEqual([plan.enemies[0]!.x, plan.enemies[0]!.y]);
    expect(e1.stats[POSITION_STAT_KEYS.x]).toBe(900);
    expect(half.notes.join(" ")).toContain("只写了");
    expect(half.moves.filter((item) => item.halfAuthored).map((item) => item.entityId)).toEqual(["e1"]);
  });

  it("纯函数：同一份文档同一个 at 两次逐字节相同，且不动输入", () => {
    const input = crowded();
    const snapshot = JSON.stringify(input);
    const first = run(input);
    expect(JSON.stringify(first)).toBe(JSON.stringify(run(input)));
    expect(JSON.stringify(input)).toBe(snapshot);
    // 换 at 只换时间戳：被写过的实体与文档盖成 at，没写过的保持原值
    const later = run(crowded(), LATER);
    const normalize = (document: GameDocument) => JSON.stringify(document).replace(new RegExp(`${AT}|${LATER}`, "g"), "T");
    expect(normalize(later.document)).toBe(normalize(first.document));
    expect(later.document.updatedAt).toBe(LATER);
    const touched = new Set(first.moves.map((item) => item.entityId));
    for (const entity of later.document.entities) {
      expect(entity.updatedAt).toBe(touched.has(entity.id) ? LATER : AT);
    }
    // 默认 at 用文档自己的 updatedAt，不读时钟
    const stamped = { ...crowded(), updatedAt: LATER };
    const byDefault = designLevel(stamped);
    expect(byDefault.document.updatedAt).toBe(LATER);
  });

  it("上游已经摆过的位置：这一格不重写它，也不把它算成自己写的", () => {
    // 混合的一份底稿：四个体还在同心环上，药包的位置是作者自己写的（贴在场地左下角）。
    // 这一份的形状正好把 author 那条杠杆的两个分支都走出来——
    // 「没摆过的写下来」与「摆过的跳过」，而跳过这一半在纯几何达标的底稿上根本不会执行。
    const source = battlefield();
    const item = source.entities.find((entity) => entity.kind === "item")!;
    const mine = { x: ACTOR_RADIUS, y: ARENA.height - ACTOR_RADIUS };
    const seeded = write(write(source, item.id, POSITION_STAT_KEYS.x, mine.x), item.id, POSITION_STAT_KEYS.y, mine.y);
    const fullKeys = (entity: GameEntity) =>
      Number.isFinite(entity.stats[POSITION_STAT_KEYS.x]) && Number.isFinite(entity.stats[POSITION_STAT_KEYS.y]);
    const base = compileRpg(seeded).base;
    const bodies = [base.player, ...base.enemies, ...base.items, ...base.npcs].filter((actor): actor is NonNullable<typeof actor> => !!actor);
    // 前提要看得见：这份底稿确实混合，否则下面那些数什么都不是
    expect(bodies.length, '场上有 5 个可显示个体才谈得上"4 处新写 + 1 处作者的"').toBe(5);
    expect(bodies.filter((actor) => fullKeys(findEntity(seeded, actor.id)!)).map((actor) => actor.id)).toEqual([item.id]);
    expect(fullKeys(findEntity(seeded, item.id)!)).toBe(true);

    const designed = run(seeded);
    // 摆过的那一个不冒领成本格写的：改动清单里没有它
    expect(designed.moves.map((move) => move.entityId), '药包的位置本来就是作者写的，这一格不许把它列成自己写的').not.toContain(item.id);
    expect(designed.rounds.map((round) => [round.goalId, round.leverId, round.kept, round.metricBefore, round.metricAfter])).toEqual([
      ["layout-authored", "author-the-layout", true, 1, 5],
    ]);
    // 剩下 4 个各写一处，且每一条 author 改动指向的个体在输入里都没写全坐标——
    // 这条不变量比"没有 i1"更通用：任何一份底稿都不许把作者摆过的位置列成自己写的
    const authoredMoves = designed.moves.filter((move) => move.kind === "author");
    expect(authoredMoves).toHaveLength(4);
    for (const move of designed.moves) {
      expect(fullKeys(findEntity(seeded, move.entityId)!), `${move.entityName} 在输入里已经写全坐标，不该出现在改动清单里`).toBe(false);
      expect(move.authoredBefore, `${move.entityName} 的位置是投影排的，这条改动必须这么标`).toBe(false);
    }
    // 场上带坐标的数 = 本格新写的 + 作者那一处：把作者的跳过当成没得跳，这个等式就成不了
    expect(goal(designed.goals, "layout-authored").metric).toBe(bodies.length);
    expect(goal(designed.goals, "layout-authored").metric).toBe(authoredMoves.length + 1);
    // 摆过的那一对数原样活着：投影此刻排的就是它，跳过不等于改写
    const writtenItem = findEntity(designed.document, item.id)!;
    expect([writtenItem.stats[POSITION_STAT_KEYS.x], writtenItem.stats[POSITION_STAT_KEYS.y]]).toEqual([mine.x, mine.y]);
    // 界面上那句"原样写成坐标"的名单里不许出现作者已经摆过的那个个体
    const disclosure = designed.notes.find((note) => note.includes("原样把投影排的同心环写进文档"));
    expect(disclosure, '这条披露必须由这一格自己说清来源').toBeTruthy();
    expect(disclosure).toContain("4 个位置");
    expect(disclosure, '把药包列进"本格写成坐标"的名单就是冒领').not.toContain(item.name);
  });

  it("幂等：再跑一次不该再动一个坐标", () => {
    const first = run(battlefield());
    const second = run(first.document);
    expect(second.rounds).toHaveLength(0);
    expect(second.moves).toHaveLength(0);
    expect(second.stopReason).toBe("achieved");
    expect(JSON.stringify(second.document)).toBe(JSON.stringify(first.document));
    // 撤回到处都是「没有杠杆可留」的那一类：跑不达标的那份第二遍仍然只试同一条、仍然撤回
    const far = run(farFight());
    const farAgain = run(far.document);
    expect(farAgain.rounds.map((round) => [round.leverId, round.kept])).toEqual([["set-the-approach", false]]);
    expect(JSON.stringify(farAgain.document)).toBe(JSON.stringify(far.document));
  });

  it("每一处保留的改动都在文档里，撤回的一律不留痕（叠回原稿逐键比）", () => {
    for (const document of [battlefield(), bareRing(), standingWins(), keyOnSpawn(), crowded(), farFight(), stackedFour()]) {
      const designed = run(document);
      expect(positionsOf(designed.document)).toEqual(replayKept(document, designed.rounds));
      expect(unchangedExceptStatsAndStamps(document, designed.document)).toEqual([]);
      // 只改坐标：其余数值键逐键相同，一个都没多一个都没少
      expect(numbersExceptPositions(designed.document)).toEqual(numbersExceptPositions(document));
    }
  });
});

describe("与上一格的界线：站着不动也能赢有纯布局的那一半", () => {
  it("同一份文档：tuneCombat 用尽杠杆修不好，designLevel 一轮就修好", () => {
    const document = keyOnSpawn();
    // 前提：idle 那一种走法真的第一帧就通关，不是我读错了报告
    expect(runOf(playtestRpg(compileRpg(document)), "idle").status).toBe("won");
    const tuned = tuneCombat(document, { at: AT });
    expect(runOf(tuned.after, "idle").status).toBe("won");
    expect(goal(combatGoals(tuned.after), "idle-not-win").achieved).toBe(false);
    expect(tuned.achieved).toBe(false);
    expect(tuned.stopReason).toBe("no-lever-left");

    const designed = run(document);
    expect(runOf(designed.after, "idle").status).toBe("playing");
    expect(designed.achieved).toBe(true);
    expect(goal(designed.goals, "spawn-clear").achieved).toBe(true);
    // 钥匙被挪出「踩一步就算」的范围：从出生点算起的距离超过 minGapPixels
    const moved = findEntity(designed.document, "i1")!;
    expect([moved.stats[POSITION_STAT_KEYS.x], moved.stats[POSITION_STAT_KEYS.y]]).toEqual([640, 380]);
    expect(distance({ x: 600, y: 380 }, { x: moved.stats[POSITION_STAT_KEYS.x]!, y: moved.stats[POSITION_STAT_KEYS.y]! })).toBeGreaterThanOrEqual(
      LEVEL_RULES.minGapPixels + LEVEL_RULES.slackPixels,
    );
  });

  it("机关让路要点名：写了坐标就不再跟着它引用的那个东西", () => {
    const designed = run(standingWins());
    expect(designed.rounds.map((round) => [round.goalId, round.leverId, round.kept])).toEqual([
      ["layout-authored", "author-the-layout", true],
      ["spawn-clear", "clear-the-spawn", true],
    ]);
    const trigger = findEntity(designed.document, "t1")!;
    expect([trigger.stats[POSITION_STAT_KEYS.x], trigger.stats[POSITION_STAT_KEYS.y]]).toEqual([720, 380]);
    const plan = compileRpg(designed.document).base;
    const placed = plan.triggers.find((t) => t.id === "t1")!;
    expect(placed.positionIsDesign).toBe(true);
    // 引用关系照旧报得出影响谁，但位置不再跟着玩家
    expect(placed.affects).toEqual({ id: "p1", name: "主角" });
    expect({ x: placed.x, y: placed.y }).not.toEqual({ x: plan.player!.x, y: plan.player!.y });
    expect(placed.x).toBe(720);
    const note = designed.notes.join(" ");
    expect(note).toContain("从此它不再跟着它引用的那个东西");
    expect(note).toContain("那个东西以后再挪，机关不会跟着挪");
    // 反向对照：没被写坐标的那些机关仍然跟着锚点
    expect(goal(designed.goals, "spawn-clear").achieved).toBe(true);
    expect(designed.moves.filter((item) => item.entityKind === "trigger").length).toBe(1);
  });

  it("达标之后不许抢上一格的功劳：多出来的战斗目标只记成连带读数", () => {
    const designed = run(standingWins());
    expect(designed.combatMetBefore).toBe(2);
    expect(designed.combatMetAfter).toBe(3);
    expect(designed.combatGoalsTotal).toBe(5);
    const note = designed.notes.join(" ");
    expect(note).toContain("多达标的是「站着不动不能赢」");
    expect(note).toContain("不记成数值上的功劳");
    // 反向对照：没弄坏也没多达标的那一份说的是另一句话
    expect(run(battlefield()).notes.join(" ")).toContain("这条对照就是「布局没有把数值格的成绩弄坏」的证据");
  });
});

describe("两条杠杆共用同一个阈值时，各自动的是哪一档", () => {
  it("分开一对用尽之后才轮到让路：让路距离比分开距离多留出物品自身的门槛", () => {
    // 「压在出生点上」与「叠在一起」用的是同一个判据（gap < minGapPixels），所以正常情况下
    // separate-pairs 会先把那件物品挪开、spawn-clear 顺手达标；只有分开已经无路可走时
    // 才轮到 clear-the-spawn。这一份就是那条少见的路径，它钉的是让路距离本身。
    const designed = run(stackedFour());
    expect(designed.rounds.map((round) => [round.round, round.goalId, round.leverId, round.kept])).toEqual([
      [1, "not-piled", "separate-pairs", true],
      [2, "not-piled", "separate-pairs", true],
      [3, "not-piled", "separate-pairs", false],
      [4, "spawn-clear", "clear-the-spawn", true],
      [5, "approach-band", "set-the-approach", false],
    ]);
    const yielded = designed.moves.find((item) => item.entityId === "i1")!;
    expect([yielded.leverId, yielded.entityKind, yielded.from]).toEqual(["clear-the-spawn", "item", { x: 600, y: 380 }]);
    // 让路要给的是「离开出生点的范围」+「不撞上别人的范围」，比分开一对那一档（40）多留出 minGapPixels
    expect(yielded.to).toEqual({ x: 672, y: 380 });
    expect(distance({ x: 600, y: 380 }, yielded.to)).toBe(LEVEL_RULES.minGapPixels * 2 + LEVEL_RULES.slackPixels);
    // 反向对照：少留那一档就会落回分开一对所用的 40 像素——那正是甲与乙待的地方
    expect(yielded.to.x).not.toBe(640);
    expect(goal(designed.goals, "spawn-clear").achieved).toBe(true);
    // 分开仍然没做成：甲乙两个还重叠在一起，这一格停在这条目标上
    expect(goal(designed.goals, "not-piled").reading).toBe("1 对个体叠在一处（叠得最近的一对是「甲」与「乙」，相距 0 像素）");
    expect(designed.achieved).toBe(false);
    expect(designed.stopReason).toBe("no-lever-left");
    // 连带读数：这一格把布局挪开之后多达标的那条战斗目标要按名字记，不能算成数值的功劳
    expect([designed.combatMetBefore, designed.combatMetAfter, designed.combatGoalsTotal]).toEqual([3, 4, 5]);
    expect(designed.notes.join(" ")).toContain("多达标的是「一直躲不该几秒就死」");
  });
});

describe("保留条件：读数没变好就撤，挤破已达标的就撤", () => {
  it("读数没变好的那一轮撤回，且不留下坐标", () => {
    const designed = run(crowded());
    const dull = designed.rounds.find((round) => round.metricAfter === round.metricBefore && !round.kept)!;
    expect([dull.round, dull.leverId, dull.goalId, dull.metricBefore, dull.metricAfter]).toEqual([4, "separate-pairs", "not-piled", -1, -1]);
    expect(dull.revertedBecause).toContain("这条目标的读数没有变好");
    // 这一轮的挪动没进文档：贴脸甲停在被撤回的那个读数上，而不是这一轮试过的位置
    expect(findEntity(designed.document, "e1")!.stats[POSITION_STAT_KEYS.x]).not.toBe(68.2842712474619);
    // 反向对照：它最终读到的坐标是第 5 轮保留下来的那一份
    expect(findEntity(designed.document, "e1")!.stats[POSITION_STAT_KEYS.x]).toBe(266.2741699796952);
    expect(designed.notes.join(" ")).toContain("撤回了");
  });

  it("分开一对会把另一对挤到同一点：挤破已达标的布局目标也撤回", () => {
    const designed = run(crowded());
    // 整轮的骨架：4 轮保留、2 轮撤回，多一次少一次都是判定的变化
    expect(designed.rounds.map((round) => [round.round, round.kept])).toEqual([
      [1, true],
      [2, true],
      [3, true],
      [4, false],
      [5, true],
      [6, false],
    ]);
    const last = designed.rounds.at(-1)!;
    expect([last.round, last.leverId, last.kept, last.metricBefore, last.metricAfter]).toEqual([6, "set-the-approach", false, -80, 0]);
    expect(last.revertedBecause).toBe("破了已达标的 布局目标「不叠在一起」");
    // 读数严格变好（-80 → 0）仍然被撤回：这一格的保留条件不止「这条目标变好」
    expect(last.metricAfter).toBeGreaterThan(last.metricBefore);
    expect(designed.achieved).toBe(false);
    expect(designed.stopReason).toBe("no-lever-left");
    expect(goal(designed.goals, "approach-band").achieved).toBe(false);
    expect(goal(designed.goals, "not-piled").achieved).toBe(true);
    expect(designed.notes.join(" ")).toContain("停在");
    // 反向对照：把 keep 规则里 `broke.length === 0` 那半条删掉，这一轮就会被保留，这条断言立刻红
    expect(designed.moves.some((item) => item.entityId === "e2" && item.to.x === 266.2741699796952)).toBe(false);
  });

  it("挤破上一格已达标的战斗目标：读数变好也要撤回，文档一个坐标都不留", () => {
    const document = farFight();
    // 前提要看得见：这一份是四种战斗目标全达标的设计，问题只在开局距离
    const before = combatGoals(playtestRpg(compileRpg(document)));
    expect(before.filter((item) => item.achieved).length).toBe(5);
    expect(goal(levelGoals(compileRpg(document).base, document), "approach-band").achieved).toBe(false);

    const designed = run(document);
    expect(designed.rounds).toHaveLength(1);
    const round = designed.rounds[0]!;
    expect([round.leverId, round.kept]).toEqual(["set-the-approach", false]);
    expect(round.metricAfter).toBe(0);
    expect(round.metricBefore).toBeCloseTo(-510.92, 2);
    expect(round.revertedBecause).toBe("破了已达标的 战斗目标「不是一照面就结束」");
    expect(designed.moves).toHaveLength(0);
    expect(designed.achieved).toBe(false);
    expect(designed.stopReason).toBe("no-lever-left");
    // 撤回就是撤回：交回的文档与输入逐字节相同，敌人还在 1080,700
    expect(JSON.stringify(designed.document)).toBe(JSON.stringify(document));
    expect(designed.combatMetBefore).toBe(5);
    expect(designed.combatMetAfter).toBe(5);
  });

  it("任何一份底稿都不许让已达标的战斗目标倒退", () => {
    for (const document of [battlefield(), bareRing(), standingWins(), keyOnSpawn(), crowded(), farFight(), stackedFour(), manyStones(12)]) {
      const designed = run(document);
      expect(designed.combatMetAfter).toBeGreaterThanOrEqual(designed.combatMetBefore);
      expect(designed.notes.join(" ")).not.toContain("出现这一句就是矛盾");
    }
  });
});

describe("停下时说实话：轮次用尽、没有杠杆、跑不起来", () => {
  it("三十件物品挤在同一点：12 轮全保留仍然分不开，停在轮次上限而不是达标", () => {
    const designed = run(manyStones(30));
    expect(designed.rounds).toHaveLength(LEVEL_RULES.maxRounds);
    expect(designed.rounds.every((round) => round.kept)).toBe(true);
    expect(designed.achieved).toBe(false);
    expect(designed.stopReason).toBe("round-cap");
    expect(goal(designed.goals, "not-piled").achieved).toBe(false);
    expect(goal(designed.goals, "not-piled").reading).toContain("219 对个体叠在一处");
    expect(designed.notes.join(" ")).toContain(`停在轮次上限 ${LEVEL_RULES.maxRounds}`);
    expect(designed.notes.join(" ")).toContain("不是「没必要改」");
  });

  it("没有玩家：一个坐标都不写，文档原样交回，理由点名玩家", () => {
    const document = noPlayer();
    const designed = run(document);
    expect(designed.stopReason).toBe("not-runnable");
    expect(designed.achieved).toBe(false);
    expect(designed.rounds).toHaveLength(0);
    expect(designed.moves).toHaveLength(0);
    expect(JSON.stringify(designed.document)).toBe(JSON.stringify(document));
    expect(designed.notes).toHaveLength(1);
    expect(designed.notes[0]).toContain("没有玩家实体");
    // 读数仍然算得出来：没有出生点，但「有没有写坐标」这条读得到
    expect(goal(designed.goals, "layout-authored").achieved).toBe(false);
    expect(goal(designed.goals, "layout-authored").reading).toContain("2 个可显示个体里有 2 个没写全坐标");
    // 反向对照：有玩家的那份不会走这条早退路
    expect(run(bareRing()).notes.length).toBeGreaterThan(1);
  });

  it("每条限度都在结论里，界面上少一行都算说谎", () => {
    const designed = run(battlefield());
    expect(LEVEL_DESIGN_LIMITS).toHaveLength(3);
    for (const limit of LEVEL_DESIGN_LIMITS) expect(limit.length).toBeGreaterThan(10);
    expect(LEVEL_DESIGN_LIMITS.join(" ")).toContain(`${ARENA.width}×${ARENA.height}`);
    const text = designed.notes.join(" ");
    expect(text).toContain("阈值来自本文件的常量");
    expect(text).toContain("不代表这一关好玩");
    expect(text).toContain("模型里没有地形、房间与高度");
    // 阈值披露与判定共用同一份清单：每条 criterion 都出现在 notes 里，一条不漏
    for (const item of designed.goals) expect(text).toContain(item.criterion);
  });
});

describe("场地边界那一侧从入口走：没有地方可挪就交回空改动", () => {
  /** 场地右边界上第一个体心能待的位置：再往右就被钳回这里 */
  const edge = ARENA.width - ACTOR_RADIUS;

  function pairAt(x: number): GameDocument {
    const stone = (id: string, name: string): Spec => ({ id, kind: "item", name, stats: { stackSize: 1, x, y: 400 } });
    return build("贴边的一对", [
      { id: "p1", kind: "player", name: "主角", stats: { health: 20, speed: 200, x: 100, y: 400 } },
      stone("i1", "右上的甲"),
      stone("i2", "右上的乙"),
      {
        id: "q1",
        kind: "quest",
        name: "捡两个",
        stats: {},
        refs: [
          { to: "i1", role: "需要拾取" },
          { to: "i2", role: "需要拾取" },
        ],
      },
    ]);
  }

  /** 主角在 playerX、敌人贴右边：两者相距 1184-playerX，而"放到 320 处"算出来还是那面墙 */
  function foePinnedAtEdge(playerX: number): GameDocument {
    return build("贴边的敌人", [
      { id: "p1", kind: "player", name: "主角", stats: { health: 60, speed: 200, x: playerX, y: 400 } },
      { id: "w1", kind: "weapon", name: "短刃", stats: { damage: 2, range: 40 }, refs: [{ to: "p1", role: "装备于" }] },
      { id: "e1", kind: "enemy", name: "贴边的敌人", stats: { health: 20, damage: 1, speed: 0, detectionRange: 200, xpReward: 0, x: edge, y: 400 } },
      { id: "q1", kind: "quest", name: "讨伐", stats: {}, refs: [{ to: "e1", role: "需要打倒" }] },
    ]);
  }

  /** 罩住出生点的那个机关：要么自己写了坐标，要么锚在主角身上——位置一模一样，来历不同 */
  function triggerOnSpawn(withOwnCoords: boolean): GameDocument {
    return build("脚下的机关", [
      { id: "p1", kind: "player", name: "主角", stats: { health: 20, speed: 200, x: 600, y: 380 } },
      { id: "w1", kind: "weapon", name: "短刃", stats: { damage: 2, range: 40 }, refs: [{ to: "p1", role: "装备于" }] },
      { id: "e1", kind: "enemy", name: "远处的敌人", stats: { health: 30, damage: 1, speed: 0, detectionRange: 0, x: 900, y: 380 } },
      {
        id: "t1",
        kind: "trigger",
        name: "脚下的机关",
        stats: withOwnCoords ? { radius: 80, delay: 1, cooldown: 2, x: 600, y: 380 } : { radius: 80, delay: 1, cooldown: 2 },
        refs: [{ to: "p1", role: "贴着" }],
      },
      { id: "q1", kind: "quest", name: "踩一下", stats: {}, refs: [{ to: "t1", role: "需要激活" }] },
    ]);
  }

  /** 十二对物品各挤一处：每轮只能分开一对，第 12 轮刚好分完 */
  function twelvePairs(): GameDocument {
    const specs: Spec[] = [
      { id: "p1", kind: "player", name: "主角", stats: { health: 40, speed: 200, x: 100, y: 100 } },
      { id: "w1", kind: "weapon", name: "短刃", stats: { damage: 2, range: 40 }, refs: [{ to: "p1", role: "装备于" }] },
      { id: "e1", kind: "enemy", name: "远处的敌人", stats: { health: 30, damage: 1, speed: 0, detectionRange: 200, x: 400, y: 100 } },
    ];
    for (const k of Array.from({ length: LEVEL_RULES.maxRounds }, (_, index) => index)) {
      const x = 160 + k * 90;
      specs.push({ id: `i${k}a`, kind: "item", name: `甲${k}`, stats: { stackSize: 1, x, y: 600 } });
      specs.push({ id: `i${k}b`, kind: "item", name: `乙${k}`, stats: { stackSize: 1, x: x + 20, y: 600 } });
    }
    specs.push({ id: "q1", kind: "quest", name: "捡完", stats: {}, refs: [] });
    return build("十二对", specs);
  }

  function moved(round: LevelRound): string[] {
    return round.attempted.map((item) => `${item.entityName}(${item.from.x},${item.from.y})→(${item.to.x},${item.to.y})`);
  }

  it("一对物品正贴在场内右边界：分开这条没有地方可挪，连一轮都进不了", () => {
    const designed = run(pairAt(edge));
    expect(designed.rounds).toHaveLength(0);
    expect(designed.moves).toHaveLength(0);
    expect(designed.stopReason).toBe("no-lever-left");
    expect(goal(designed.goals, "not-piled").reading).toContain("相距 0 像素");
    // 原样交回：一个坐标都没被写过
    expect(designed.document.entities.map((entity) => entity.stats[POSITION_STAT_KEYS.x])).toEqual([100, edge, edge, undefined]);
    // 对照组：同一对往回让四像素，那一档挪动就试得出来（虽然还是分不开）
    const short = run(pairAt(edge - 4));
    expect(moved(short.rounds[0]!)).toEqual([`右上的乙(${edge - 4},400)→(${edge},400)`]);
    expect(short.rounds[0]!.kept).toBe(false);
  });

  it("敌人贴脸又贴边：放到 320 那一步被墙钳回原地，等于没有地方可挪", () => {
    // 主角 1084（比 minApproachPixels 少 20）、敌人 1184：1084+320=1404 越界，钳回 1184 = 原地
    const pinned = edge - (LEVEL_RULES.minApproachPixels - 20);
    const designed = run(foePinnedAtEdge(pinned));
    expect(designed.rounds).toHaveLength(0);
    expect(designed.stopReason).toBe("no-lever-left");
    expect(goal(designed.goals, "approach-band").reading).toContain("最近的敌人离出生点 100 像素：贴脸，没有反应时间");
    // 对照组：把主角拉回 660，524 像素是「太远」，但那一档在场内有地方，于是真的挪了一轮
    const far = run(foePinnedAtEdge(660));
    expect(moved(far.rounds[0]!)).toEqual([`贴边的敌人(${edge},400)→(${660 + LEVEL_APPROACH_TARGET},400)`]);
    expect(far.achieved).toBe(true);
  });

  it("机关本来就自己写了坐标：让路那一轮挪它，但不说「从此它不再跟着引用走」", () => {
    const own = run(triggerOnSpawn(true));
    expect(moved(own.rounds[0]!)).toEqual(["脚下的机关(600,380)→(720,380)"]);
    expect(own.rounds[0]!.attempted[0]!.authoredBefore).toBe(true);
    expect(own.notes.join(" ")).not.toContain("从此它不再跟着");
    // 同一份场地、同一个位置，只是这个位置改由主角锚出来：那句话就必须出现
    const anchored = run(triggerOnSpawn(false));
    expect(moved(anchored.rounds[0]!)).toEqual(["脚下的机关(600,380)→(720,380)"]);
    expect(anchored.rounds[0]!.attempted[0]!.authoredBefore).toBe(false);
    expect(anchored.notes.join(" ")).toContain("从此它不再跟着它引用的那个东西（「主角」）走");
  });

  it("恰好第 12 轮才分开最后一对：停因说的是达标，不是轮次上限", () => {
    const designed = run(twelvePairs());
    expect(designed.rounds).toHaveLength(LEVEL_RULES.maxRounds);
    expect(designed.rounds.every((round) => round.kept)).toBe(true);
    expect(designed.achieved).toBe(true);
    expect(designed.stopReason).toBe("achieved");
    // 最后一对是被墙钳开的：1170 往右 40 像素越界，落在 1184 才刚过 minGapPixels
    expect(moved(designed.rounds[LEVEL_RULES.maxRounds - 1]!)).toEqual([`乙11(1170,600)→(${edge},600)`]);
    const text = designed.notes.join(" ");
    expect(text).not.toContain("停在轮次上限");
    expect(text).toContain(`${LEVEL_GOAL_ORDER.length} 条布局目标全部达标`);
  });

  it("场上没有一个可显示个体：这句话直说没有对象，不含「都写在文档里」", () => {
    const designed = run(build("只有任务", [{ id: "q1", kind: "quest", name: "空的", stats: {} }]));
    expect(designed.stopReason).toBe("not-runnable");
    expect(goal(designed.goals, "layout-authored").achieved).toBe(false);
    expect(goal(designed.goals, "layout-authored").reading).toBe("场上没有任何可显示个体，这一条没有对象");
    // 有个体但一个坐标都没写的那一份，说的是另一句话
    expect(goal(run(noPlayer()).goals, "layout-authored").reading).toContain("2 个可显示个体里有 2 个没写全坐标");
  });

  it("每一轮的 kept 与「有没有撤回理由」严格互补：notes 那句按理由筛轮数就靠这个", () => {
    for (const document of [battlefield(), crowded(), farFight(), stackedFour(), keyOnSpawn(), twelvePairs()]) {
      const designed = run(document);
      for (const round of designed.rounds) {
        expect([document.name, round.round, round.kept === (round.revertedBecause === null)]).toEqual([
          document.name,
          round.round,
          true,
        ]);
      }
      const reverted = designed.rounds.filter((round) => round.revertedBecause !== null);
      if (reverted.length) expect(designed.notes.join(" ")).toContain(`撤回了 ${reverted.length} 轮：`);
    }
  });

  /**
   * `LEVEL_LEVERS` 是导出面：谁都可能在分派之外拿它做一次预览。
   * 这一条**越过了 `designLevel` 的分派**（链上的界面不会这样调），钉的是这张表自己的契约：
   * 递给它任何一份合法计划——哪怕没有玩家、也没有可分开的对——只交回空数组，不抛在 `piles[0]` 那一步。
   */
  it("越过分派直接喂这张表：没有玩家也没有可分开的对时，四条全部交回空", () => {
    const placed = build("只站着一个旅人", [
      { id: "n1", kind: "npc", name: "路过的旅人", stats: { health: 3, x: 300, y: 300 } },
      { id: "q1", kind: "quest", name: "问问", stats: {}, refs: [{ to: "n1", role: "需要对话" }] },
    ]);
    const plan = compileGame(placed);
    expect(plan.player).toBeFalsy();
    for (const lever of LEVEL_LEVERS) {
      expect([lever.id, lever.moves({ document: placed, plan, lever })]).toEqual([lever.id, []]);
    }
    // 反向对照：那个旅人没摆过位置时 author 那条就给得出一处——这张表不是恒为空
    const bare = build("旅人没摆过", [
      { id: "n1", kind: "npc", name: "路过的旅人", stats: { health: 3 } },
      { id: "q1", kind: "quest", name: "问问", stats: {}, refs: [{ to: "n1", role: "需要对话" }] },
    ]);
    const barePlan = compileGame(bare);
    const author = LEVEL_LEVERS.find((lever) => lever.id === "author-the-layout");
    if (!author) throw new Error("杠杆表里没有 author-the-layout");
    expect(author.moves({ document: bare, plan: barePlan, lever: author }).map((item) => `${item.entityName}[${item.kind}]`)).toEqual([
      "路过的旅人[author]",
    ]);
    for (const lever of LEVEL_LEVERS.filter((item) => item.id !== "author-the-layout")) {
      expect([lever.id, lever.moves({ document: bare, plan: barePlan, lever })]).toEqual([lever.id, []]);
    }
  });
});

describe("杠杆表：目标与杠杆互相认领，没有孤儿", () => {
  it("每条目标至少一条杠杆，每条杠杆的目标都在清单里", () => {
    for (const id of LEVEL_GOAL_ORDER) {
      expect(LEVEL_LEVERS.filter((lever) => lever.goalId === id).length).toBeGreaterThanOrEqual(1);
    }
    for (const lever of LEVEL_LEVERS) {
      expect(LEVEL_GOAL_ORDER).toContain(lever.goalId);
      expect(lever.label.length).toBeGreaterThan(5);
      expect(lever.rationale.length).toBeGreaterThan(10);
    }
    expect(new Set(LEVEL_LEVERS.map((lever) => lever.id)).size).toBe(LEVEL_LEVERS.length);
  });

  it("阈值常量彼此一致：分开距离按半径算，带正中就是目标位置", () => {
    expect(LEVEL_RULES.minGapPixels).toBe(2 * ACTOR_RADIUS);
    expect(LEVEL_APPROACH_TARGET).toBe((LEVEL_RULES.minApproachPixels + LEVEL_RULES.maxApproachPixels) / 2);
    expect(LEVEL_RULES.slackPixels).toBeGreaterThan(0);
    // 反向对照：带正中确实落在带内
    expect(LEVEL_APPROACH_TARGET).toBeGreaterThan(LEVEL_RULES.minApproachPixels);
    expect(LEVEL_APPROACH_TARGET).toBeLessThan(LEVEL_RULES.maxApproachPixels);
  });

  it("写值的门在模型入口：NaN 与被拒的键根本走不到这一格，所以『写不进去就抛』那句留成哨兵", () => {
    // 这一格用 setStat 写值；把 NaN 塞给同一条路（经由 plan 的位置）时它必须拒绝，
    // 否则「钳位」「有限数」这些断言都只是我在测试里自己写的规则。
    // 口径要写清：下面两条证的是**入口会拒**，不是 designLevel 会抛——
    // `writePositions` 里那句 throw（臂表记在 :520）是给"入口拒了却还被叫去写"这种矛盾留的哨兵，
    // 这一格给不出能走到它的底稿：坐标来自 placeAlong 的钳位结果，永远是有限数。
    const document = bareRing();
    expect(setStat(document, "e1", POSITION_STAT_KEYS.x, Number.NaN).reason).toContain("有限数");
    expect(setStat(document, "没有这个实体", POSITION_STAT_KEYS.x, 10).reason).toContain("这个实体不在文档里");
    // 重合的两点不会写出 NaN 坐标：挪开之后仍在场内且距离达标
    const stacked = build("重合", [
      { id: "p1", kind: "player", name: "主角", stats: { health: 20, speed: 200, x: 600, y: 380 } },
      { id: "e1", kind: "enemy", name: "甲", stats: { health: 5, damage: 1, speed: 150, detectionRange: 200, x: 600, y: 380 } },
      { id: "e2", kind: "enemy", name: "乙", stats: { health: 5, damage: 1, speed: 150, detectionRange: 200, x: 600, y: 380 } },
      { id: "q1", kind: "quest", name: "讨伐", stats: {}, refs: [{ to: "e1", role: "需要打倒" }, { to: "e2", role: "需要打倒" }] },
    ]);
    const designed = run(stacked);
    // 前提：真的下过挪动，否则下面那个循环是空转
    expect(designed.moves.length).toBeGreaterThan(0);
    expect(designed.moves.every((item) => item.kind === "shift")).toBe(true);
    for (const move of designed.moves) {
      expect(Number.isFinite(move.to.x)).toBe(true);
      expect(Number.isFinite(move.to.y)).toBe(true);
      for (const axis of [POSITION_STAT_KEYS.x, POSITION_STAT_KEYS.y] as const) {
        const entity = findEntity(designed.document, move.entityId)!;
        expect(entity.stats[POSITION_STAT_KEYS.x]).toBeGreaterThanOrEqual(ACTOR_RADIUS);
        expect(entity.stats[axis]).toBeLessThanOrEqual(axis === POSITION_STAT_KEYS.x ? ARENA.width - ACTOR_RADIUS : ARENA.height - ACTOR_RADIUS);
      }
    }
  });

  it("挪动的 kinds 与 goalId 都填得出来：界面按这个分别显示「写了坐标」与「真的挪了」", () => {
    const designed = run(standingWins());
    const byKind = new Map<string, LevelMove[]>();
    for (const item of designed.moves) {
      expect(item.entityKind).toBeDefined();
      expect(LEVEL_GOAL_ORDER).toContain(item.goalId);
      expect(item.leverLabel.length).toBeGreaterThan(3);
      byKind.set(item.kind, [...(byKind.get(item.kind) ?? []), item]);
    }
    expect(byKind.get("author")!.map((item) => item.entityId).sort()).toEqual(["e1", "p1"]);
    expect(byKind.get("shift")!.map((item) => item.entityId)).toEqual(["t1"]);
    expect(byKind.get("author")!.every((item) => item.authoredBefore === false)).toBe(true);
  });
});
