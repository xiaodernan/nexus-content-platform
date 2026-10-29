import { describe, expect, it } from "vitest";
import {
  GAME_KIND_STATUS,
  LEVEL_BONUS,
  XP_BASE,
  XP_PER_KILL_FALLBACK,
  XP_STEP,
  addEntity,
  compileForKind,
  compileRpg,
  createGame,
  entitiesOfKind,
  findEntity,
  initialRpgState,
  linkEntities,
  removeEntity,
  rpgStep,
  rpgSummary,
  setStat,
  xpToNext,
  type GameDocument,
  type RpgPlan,
  type RpgState,
  type SimInput,
} from "../src/index";

/**
 * §51 的最后一条管线：RPG 原型（成长/战斗循环）。
 *
 * 与 story.test.ts 同一套纪律：这里钉的全是"会不会说谎"——
 * 经验是不是作者写的那个数、兜底有没有被标出来、等级门是不是真的把没到级的完成扣住了、
 * 升级曲线是不是投影的那份常数。每条负面断言都配同一次运行里的正向对照。
 */

/** 造一份空文档：删光模板那 11 个空实体，避免模板名字与兜底值混进断言 */
function emptyDoc(name: string): GameDocument {
  let doc = createGame(name);
  for (const entity of [...doc.entities]) {
    doc = removeEntity(doc, entity.id);
  }
  return doc;
}

function addEnemy(doc: GameDocument, name: string, stats: Record<string, number>): { document: GameDocument; id: string } {
  let next = addEntity(doc, { kind: "enemy", name });
  const created = entitiesOfKind(next, "enemy").find((e) => e.name === name)!;
  for (const [key, value] of Object.entries(stats)) {
    const written = setStat(next, created.id, key, value);
    if (written.reason) throw new Error(`前置写入失败：${written.reason}`);
    next = written.document;
  }
  return { document: next, id: created.id };
}

function addQuest(doc: GameDocument, name: string, stats: Record<string, number>): { document: GameDocument; id: string } {
  let next = addEntity(doc, { kind: "quest", name });
  const created = entitiesOfKind(next, "quest").find((e) => e.name === name)!;
  for (const [key, value] of Object.entries(stats)) {
    const written = setStat(next, created.id, key, value);
    if (written.reason) throw new Error(`前置写入失败：${written.reason}`);
    next = written.document;
  }
  return { document: next, id: created.id };
}

/** 造一个能打的玩家：attackPower 必须写——模型里没有伤害来源时投影给 0（那条纪律有 play.test 钉着） */
function addFighter(doc: GameDocument, attackPower: number): GameDocument {
  const next = addEntity(doc, { kind: "player", name: "冒险者" });
  const created = entitiesOfKind(next, "player").find((e) => e.name === "冒险者")!;
  const written = setStat(next, created.id, "attackPower", attackPower);
  if (written.reason) throw new Error(`前置写入失败：${written.reason}`);
  return written.document;
}

function link(doc: GameDocument, from: string, to: string, role: string): GameDocument {
  const result = linkEntities(doc, from, to, role);
  if (result.reason) throw new Error(`前置引用失败：${result.reason}`);
  return result.document;
}

/**
 * 一份"击杀 25 经验 → 同帧升到 2 级 → 2 级门放行 → 任务结算"的底稿：
 * `drive` 跑到它末尾就是通关。两条用例共用（等级门那条、HUD 那句"通关"那条），
 * 因为"能赢"这件事只该有一个构造法——两处各写一遍，改一处就会让另一处悄悄变成空跑。
 */
function winnableDocument(name: string): GameDocument {
  let doc = emptyDoc(name);
  doc = addFighter(doc, 5);
  const quest = addQuest(doc, "到了级再交", { requiredLevel: 2 });
  doc = quest.document;
  const enemy = addEnemy(doc, "看门的", { xpReward: 25, health: 2 });
  doc = enemy.document;
  return link(doc, findEntity(doc, quest.id)!.id, enemy.id, "打倒");
}

/** 无头驱动：冲向最近的目标（敌人/物品）并挥击。确定性——没有随机项 */
function drive(plan: RpgPlan, state: RpgState, seconds: number): RpgState {
  const tick = 1 / 60;
  let current = state;
  for (let elapsed = 0; elapsed < seconds; elapsed += tick) {
    if (current.base.status !== "playing") break;
    const targets = [
      ...plan.base.enemies.map((e) => ({ x: e.x, y: e.y })),
      ...plan.base.items.map((i) => ({ x: i.x, y: i.y })),
    ];
    const nearest = targets
      .map((t) => ({ ...t, d: Math.hypot(t.x - current.base.px, t.y - current.base.py) }))
      .sort((a, b) => a.d - b.d)[0];
    const input: SimInput = nearest ? { dx: nearest.x - current.base.px, dy: nearest.y - current.base.py, attack: true } : { dx: 0, dy: 0, attack: true };
    current = rpgStep(plan, current, input, tick);
  }
  return current;
}

describe("compileRpg：经验从哪来", () => {
  it("作者写了 xpReward 就用作者的（design），没写的用投影兜底并逐个报数", () => {
    let doc = emptyDoc("经验来源");
    doc = addFighter(doc, 5);
    const marked = addEnemy(doc, "设计过的", { xpReward: 42, health: 1 });
    doc = marked.document;
    const blank = addEnemy(doc, "没写的", { health: 1 });
    doc = blank.document;

    const plan = compileRpg(doc);
    const designed = plan.enemyXp.find((e) => e.name === "设计过的")!;
    expect(designed).toMatchObject({ xp: 42, from: "design" });
    const fallback = plan.enemyXp.find((e) => e.name === "没写的")!;
    expect(fallback).toMatchObject({ xp: XP_PER_KILL_FALLBACK, from: "default" });
    // 兜底这件事被说出来：1 个（不是 2 个——写了的那不参与计数）
    expect(plan.notes.join(" ")).toContain(`1 个敌人的经验用的投影兜底 ${XP_PER_KILL_FALLBACK}`);
    expect(plan.notes.join(" ")).not.toContain("2 个敌人的经验用的投影兜底");
  });

  it("任务经验只发作者写了 xpReward 的：没写就是 0 并报出来，不替设计补一个数", () => {
    let doc = emptyDoc("任务经验");
    doc = addFighter(doc, 5);
    const withXp = addQuest(doc, "有赏钱", { xpReward: 30 });
    doc = withXp.document;
    const withoutXp = addQuest(doc, "没赏钱", {});
    doc = withoutXp.document;

    const plan = compileRpg(doc);
    const paid = plan.quests.find((q) => q.name === "有赏钱")!;
    expect(paid).toMatchObject({ xpReward: 30, hasXpReward: true, requiredLevel: 0 });
    const unpaid = plan.quests.find((q) => q.name === "没赏钱")!;
    expect(unpaid).toMatchObject({ xpReward: 0, hasXpReward: false });
    // 正向对照：有一条写了，"没有任务发经验"这句话就不许出现
    expect(plan.notes.join(" ")).not.toContain("没有一条任务写了 xpReward");
    // 真的全没写时，这句话才出现——不发经验这件事要说出来
    const lone = addQuest(emptyDoc("全没赏钱"), "也没赏钱", {});
    expect(compileRpg(lone.document).notes.join(" ")).toContain("没有一条任务写了 xpReward");
  });

  it("requiredLevel 被读进等级门；曲线上 next 级要 XP_BASE + (level-1)×XP_STEP", () => {
    let doc = emptyDoc("等级门");
    doc = addFighter(doc, 5);
    const gated = addQuest(doc, "要练级", { requiredLevel: 3, xpReward: 10 });
    doc = gated.document;

    const plan = compileRpg(doc);
    expect(plan.quests[0]).toMatchObject({ requiredLevel: 3, xpReward: 10 });
    expect(plan.xpBase).toBe(XP_BASE);
    expect(plan.xpStep).toBe(XP_STEP);
    expect(xpToNext(plan, 1)).toBe(XP_BASE);
    expect(xpToNext(plan, 2)).toBe(XP_BASE + XP_STEP);
    expect(plan.levelBonus).toEqual({ ...LEVEL_BONUS });
    expect(plan.notes.join(" ")).toContain("1 条任务带 requiredLevel");
  });

  it("同一份文档两次编译逐字段相同（纯函数）", () => {
    let doc = emptyDoc("确定性");
    doc = addFighter(doc, 5);
    const enemy = addEnemy(doc, "史莱姆", { xpReward: 12 });
    doc = enemy.document;
    expect(compileRpg(doc)).toEqual(compileRpg(doc));
  });

  it("没有玩家就开不了场：blocker 来自底层计划，RPG 不另立一套", () => {
    let doc = emptyDoc("没有玩家");
    const enemy = addEnemy(doc, "游荡的", { xpReward: 10 });
    doc = enemy.document;
    const plan = compileRpg(doc);
    expect(plan.playable).toBe(false);
    expect(plan.blockers.join(" ")).toContain("没有玩家实体");
  });
});

describe("rpgStep：成长循环", () => {
  it("打倒敌人发经验、攒够升级：等级涨、生命回复、伤害按等级加成", () => {
    let doc = emptyDoc("升级");
    doc = addFighter(doc, 5);
    const enemy = addEnemy(doc, "靶子", { xpReward: 25, health: 2 });
    doc = enemy.document;

    const plan = compileRpg(doc);
    const start = initialRpgState(plan);
    const end = drive(plan, start, 20);

    expect(end.level).toBe(2); // 25 ≥ 20：升到 2 级，剩 5 点
    expect(end.xp).toBe(25 - XP_BASE);
    expect(end.levelUps).toBe(1);
    // 生命 = 初始 − 这一路承受的伤害 + 每级回复的 10（从同一次运行的计数器推导，不拍常数）
    expect(end.base.health).toBe(
      start.base.health - end.base.counters.damageTaken + end.levelUps * LEVEL_BONUS.maxHealth,
    );
    // 事件里说得出升级与它的来源（曲线来自投影）
    const log = end.base.events.map((e) => e.text).join("；");
    expect(log).toContain("升到 2 级");
    expect(log).toContain("曲线来自投影");
    expect(log).toContain("打倒 靶子 +25 经验");
  });

  it("任务完成也发经验：拾取触发任务，任务赏钱再推一级", () => {
    let doc = emptyDoc("任务赏钱");
    doc = addFighter(doc, 5);
    const quest = addQuest(doc, "捡到就是你的", { xpReward: 30 });
    doc = quest.document;
    const item = addEntity(doc, { kind: "item", name: "钱袋" });
    doc = item;
    const itemId = entitiesOfKind(doc, "item").find((e) => e.name === "钱袋")!.id;
    doc = link(doc, findEntity(doc, quest.id)!.id, itemId, "拾取");

    const plan = compileRpg(doc);
    expect(plan.quests[0]!.xpReward).toBe(30);
    const end = drive(plan, initialRpgState(plan), 20);

    expect(end.level).toBe(2); // 30 ≥ 20
    expect(end.xp).toBe(30 - XP_BASE);
    const log = end.base.events.map((e) => e.text).join("；");
    expect(log).toContain("完成任务「捡到就是你的」 +30 经验");
  });

  it("等级门：没到级时条件满足也不结算、不发任务赏钱；经验够了升级的同一次击杀能过门", () => {
    // 能过门的一份：击杀 25 经验 → 同帧升到 2 级 → 门（requiredLevel 2）放行 → 任务结算
    const passPlan = compileRpg(winnableDocument("过门"));
    const passEnd = drive(passPlan, initialRpgState(passPlan), 20);
    expect(passEnd.level).toBe(2);
    expect(passEnd.base.status).toBe("won"); // 任务在升到 2 级后结算 → 全部可判定任务完成

    // 过不了门的一份：击杀只有 10 经验，升不了级 → 任务的完成被扣住，不许赢
    let blocked = emptyDoc("过不了门");
    blocked = addFighter(blocked, 5);
    const blockedQuest = addQuest(blocked, "等级不够", { requiredLevel: 2 });
    blocked = blockedQuest.document;
    const blockedEnemy = addEnemy(blocked, "弱敌", { xpReward: 10, health: 2 });
    blocked = blockedEnemy.document;
    blocked = link(blocked, findEntity(blocked, blockedQuest.id)!.id, blockedEnemy.id, "打倒");
    const blockedPlan = compileRpg(blocked);
    const blockedEnd = drive(blockedPlan, initialRpgState(blockedPlan), 20);
    expect(blockedEnd.level).toBe(1);
    expect(blockedEnd.base.status).toBe("playing"); // 没赢：条件满足了但门没过
    expect(Object.keys(blockedEnd.base.questDone)).toHaveLength(0);
    // 正向对照：同一次运行里任务目标是满足的（敌人已死），差的是等级——不是打不死
    expect(blockedEnd.base.enemies.every((e) => !e.active)).toBe(true);
  });

  it("同一状态同一输入逐帧跑出同一结果（纯函数）", () => {
    let doc = emptyDoc("复现");
    doc = addFighter(doc, 5);
    const enemy = addEnemy(doc, "史莱姆", { xpReward: 12, health: 2 });
    doc = enemy.document;
    const plan = compileRpg(doc);
    const a = drive(plan, initialRpgState(plan), 6);
    const b = drive(plan, initialRpgState(plan), 6);
    expect(a).toEqual(b);
  });
});

describe("HUD 那行摘要：没人、通关、失败三格各说什么", () => {
  it("计划里没有玩家：伤害那句照实说 0，不凭空造一个玩家来算加成", () => {
    // `rpg.ts:240` 那个 `: 0` 与 `:243` 的「失败」在上一片之前从没被执行过：正常底稿都有玩家，
    // 而 `initialState` 一发现没玩家就把状态判成 lost，于是 HUD 只在"进行中"那一格被人读过。
    // 这一格不是理论——删掉玩家的那份存档就是这个形状。
    let doc = emptyDoc("没有玩家");
    const enemy = addEnemy(doc, "还在的", { health: 3 });
    doc = enemy.document;
    const plan = compileRpg(doc);
    expect(plan.base.player, "前提：这份计划真的没有玩家").toBe(null);
    const state = initialRpgState(plan);
    expect(state.base.status).toBe("lost");
    const hud = rpgSummary(plan, state);
    expect(hud).toContain("伤害 0");
    expect(hud).toContain("失败");
    expect(hud).not.toContain("进行中");
    // 正向对照：同一份加一个写了 attackPower=5 的玩家 → 伤害是设计里的数（0 级不加成），状态说进行中
    const withPlayer = compileRpg(addFighter(doc, 5));
    const live = initialRpgState(withPlayer);
    const lit = rpgSummary(withPlayer, live);
    expect(lit).toContain(`伤害 ${5 + LEVEL_BONUS.damage * live.levelUps}`);
    expect(lit).not.toContain("伤害 0");
    expect(lit).toContain("进行中");
  });

  it("打赢的那一份，HUD 末尾说的是「通关」，不是开局那句「进行中」", () => {
    const plan = compileRpg(winnableDocument("打赢"));
    const before = rpgSummary(plan, initialRpgState(plan));
    expect(before).toContain("进行中");
    const end = drive(plan, initialRpgState(plan), 20);
    expect(end.base.status, "前提：这份底稿真的打赢了").toBe("won");
    const hud = rpgSummary(plan, end);
    expect(hud).toContain("通关");
    expect(hud).not.toContain("进行中");
    expect(hud).not.toContain("失败");
  });
});

describe("状态表与分派对齐", () => {
  it("GAME_KIND_STATUS 说 rpg，compileForKind 就派得出 rpg——表与实现不许各说各话", () => {
    expect(GAME_KIND_STATUS["rpg-prototype"].pipeline).toBe("rpg");
    const doc = createGame("对齐");
    const projection = compileForKind({ ...doc, kind: "rpg-prototype" });
    expect(projection.pipeline).toBe("rpg");
    if (projection.pipeline === "rpg") {
      expect(projection.plan.playable).toBe(true);
      expect(projection.plan.enemyXp.length).toBeGreaterThan(0);
    }
  });
});
