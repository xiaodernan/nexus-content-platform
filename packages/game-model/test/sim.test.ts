import { describe, expect, it } from "vitest";
import {
  ACTOR_RADIUS,
  ARENA,
  CONTACT_COOLDOWN,
  compileGame,
  createGame,
  entitiesOfKind,
  initialState,
  linkEntities,
  setStat,
  simSummary,
  step,
  updateEntity,
  type GameDocument,
  type GamePlan,
  type SimInput,
  type SimState,
} from "../src/index";

/**
 * §50 的模拟规则。这一层是"这游戏能不能通、难度是不是离谱"唯一能被断言的地方
 * （§53 的 Playtest Agent 将来跑的就是它），所以每条断言都在问：**结果是不是由设计里的数算出来的**。
 *
 * 布局是可预期的：玩家在场地上正中央，单个敌人在正右方的环上、单个物品在两者之间，
 * 所以下面所有"往右走"的用例都不依赖任何随机数——随机化会让一次失败无从复现。
 */

function write(document: GameDocument, id: string, key: string, value: number): GameDocument {
  const result = setStat(document, id, key, value);
  if (result.reason) throw new Error(`前置数值写入失败：${result.reason}`);
  return result.document;
}

function link(document: GameDocument, from: string, to: string, role: string): GameDocument {
  const result = linkEntities(document, from, to, role);
  if (result.reason) throw new Error(`前置引用失败：${result.reason}`);
  return result.document;
}

const idle: SimInput = { dx: 0, dy: 0, attack: false };
const right: SimInput = { dx: 1, dy: 0, attack: false };

function run(plan: GamePlan, state: SimState, input: SimInput, seconds: number, tick = 1 / 60): SimState {
  let current = state;
  for (let elapsed = 0; elapsed < seconds; elapsed += tick) current = step(plan, current, input, tick);
  return current;
}

/** 一份"玩家 + 一个敌人 + 一个物品 + 一条引用了它们两个的任务"的可通关设计 */
function winnable(): { plan: GamePlan; enemyId: string; itemId: string } {
  let doc = createGame("可通关");
  const [player] = entitiesOfKind(doc, "player");
  const [enemy] = entitiesOfKind(doc, "enemy");
  const [item] = entitiesOfKind(doc, "item");
  const [quest] = entitiesOfKind(doc, "quest");
  doc = write(doc, player!.id, "attackPower", 10);
  doc = write(doc, enemy!.id, "health", 10);
  doc = write(doc, enemy!.id, "damage", 1);
  doc = write(doc, enemy!.id, "speed", 0);
  doc = link(doc, quest!.id, enemy!.id, "讨伐");
  doc = link(doc, quest!.id, item!.id, "收集");
  return { plan: compileGame(doc), enemyId: enemy!.id, itemId: item!.id };
}

/**
 * 那段驱动是"下面两条用例都通关"的地基，所以它只有一条：贴着敌人打完，再往回走捡物品
 * （物品在玩家与敌人之间，全程不碰随机数）。改它等于同时改两条用例的红绿。
 */
function playUntilWon(plan: GamePlan): SimState {
  const enemy = plan.enemies[0]!;
  let state: SimState = { ...initialState(plan), px: enemy.x - 5, py: enemy.y };
  for (let i = 0; i < 10 && state.status === "playing"; i += 1) {
    state = run(plan, state, { dx: 0, dy: 0, attack: true }, 0.6);
  }
  return run(plan, state, { dx: -1, dy: 0, attack: false }, 3);
}

describe("推进的两种「没人可推」", () => {
  it("计划里没有玩家：时间照走，但一个字段都不动——不凭空造一个玩家出来推", () => {
    // `sim.ts:134` 那段 `return next` 从没走过，因为 `initialState` 在没有玩家时直接把状态标成
    // "lost"，而 `step` 第一行就退了。会递进这一格的是**外面交进来的状态**（存档回放、别的驱动器
    // 拿着旧档）：状态上写着"进行中"，计划里却没有玩家。那时候唯一不撒谎的走法是原样交回。
    let doc = createGame("没有玩家但状态说进行中");
    const [player] = entitiesOfKind(doc, "player");
    doc = updateEntity(doc, player!.id, { kind: "npc", name: "路过的" });
    const plan = compileGame(doc);
    expect(plan.player).toBe(null); // 前提：这真是一份没有玩家的计划
    const state: SimState = { ...initialState(plan), status: "playing" };
    const next = step(plan, state, right, 1 / 60);
    expect(next).not.toBe(state); // 确实走了那一步拷贝，不是原地退回
    expect(next.t).toBeCloseTo(state.t + 1 / 60, 10); // 时间照走（它是"推进过"的一部分）
    expect({ px: next.px, py: next.py }).toEqual({ px: state.px, py: state.py }); // 人没动
    expect(next.events).toEqual(state.events);
    expect(next.status).toBe("playing"); // 不许在这里偷偷改判成输
    // 正向对照：同一份输入递进有玩家的计划，位置就真的动了——冻住的是那个玩家，不是 step
    const { plan: withPlayer } = winnable();
    const moved = step(withPlayer, initialState(withPlayer), right, 1 / 60);
    expect(moved.px).not.toBe(initialState(withPlayer).px);
  });

  it("任务的目标在状态里找不到：那条任务判不成完成，也不算「差一点就完成」", () => {
    // `sim.ts:215` 那个 `: false`（`sim ? !sim.active : false`）防的是**计划自己不一致**——
    // 任务的 goal 还指着某个 actor，而状态里那一份已经没有它了（正常投影产不出这种计划，
    // 所以这里照第十七条链的规矩反事实地改一份计划喂进去：删的是计划，不是断言）。
    const { plan } = winnable();
    const orphaned: GamePlan = { ...plan, enemies: [], items: [] };
    const quest = orphaned.quests.find((q) => q.judgeable)!;
    expect(quest.goals.length, "前提：这条任务确实带着判不出来的目标").toBeGreaterThan(0);
    const end = run(orphaned, initialState(orphaned), idle, 5);
    expect(Object.keys(end.questDone), "目标都不在状态里，凭什么算完成").toHaveLength(0);
    expect(end.status).not.toBe("won");
    // 正向对照：同一份"确实能通关"的驱动、同一份计划但目标还在——那条任务就完成了
    // （红的是"目标不在状态里"，不是"没驱动够久"）
    const intact = playUntilWon(plan);
    expect(Object.keys(intact.questDone).length, "对照组里任务没完成，那这条断言什么都没钉住").toBeGreaterThan(0);
  });
});

describe('模拟的可复现性', () => {
  it('同一份计划 + 同一段输入 = 完全相同的状态（Playtest 的前提）', () => {
    const { plan } = winnable();
    const script: SimInput[] = [right, right, { ...right, attack: true }, idle];
    const once = script.reduce((state, input, i) => step(plan, state, input, 1 / 60 + i * 0.01), initialState(plan));
    const twice = script.reduce((state, input, i) => step(plan, state, input, 1 / 60 + i * 0.01), initialState(plan));
    expect(twice).toEqual(once);
    // 反向对照：输入不同就必须得出不同结果——否则上面那条相等只是因为 step 根本没动状态
    const different = run(plan, initialState(plan), idle, 1);
    expect(different.px).not.toBe(once.px);
  });

  it('step 不改传入的 state（React 里直接 setState 才不会踩到旧对象）', () => {
    const { plan } = winnable();
    const before = initialState(plan);
    const snapshot = JSON.stringify(before);
    step(plan, before, right, 1 / 30);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('切标签页回来的大 dt 被夹住：一帧最多推进 0.1 秒', () => {
    const { plan } = winnable();
    const start = initialState(plan);
    const oneFrame = step(plan, start, right, 5);
    expect(oneFrame.t - start.t).toBeCloseTo(0.1, 6);
    expect(oneFrame.px - start.px).toBeLessThan(plan.player!.speed * 0.2);
  });
});

describe('移动与边界', () => {
  it('站着不动就不会莫名掉血；走到敌人跟前才会挨打', () => {
    const { plan } = winnable();
    const start = initialState(plan);
    expect(run(plan, start, idle, 3).health).toBe(start.health);
    const walked = run(plan, start, right, 3);
    expect(walked.px).toBeGreaterThan(start.px);
    expect(walked.health).toBeLessThan(start.health);
    expect(walked.counters.damageTaken).toBeGreaterThan(0);
  });

  it('一直往右走会停在场地边上，而不是走出去', () => {
    const { plan } = winnable();
    const ended = run(plan, initialState(plan), right, 30);
    expect(ended.px).toBeCloseTo(ARENA.width - ACTOR_RADIUS, 1);
    expect(ended.py).toBeCloseTo(ARENA.height / 2, 1);
  });
});

describe('伤害与冷却', () => {
  it('接触伤害按冷却结算，不是每帧一次', () => {
    const { plan } = winnable();
    const enemy = plan.enemies.find((e) => e.id === plan.enemies[0]!.id)!;
    // 把玩家直接放到敌人身上：站在一起 2.1 秒应该结算 3 次（0s / 1s / 2s），不是 126 帧
    const stuck = { ...initialState(plan), px: enemy.x, py: enemy.y };
    const after = run(plan, stuck, idle, 2.1);
    expect(after.counters.damageTaken).toBe(enemy.damage * 3);
    expect(after.t).toBeGreaterThan(2);
    // 反向对照：一次 60fps 的连续帧里只该有一次结算，冷却没生效的话会是 60 倍
    const oneSecond = run(plan, stuck, idle, 1 / 60);
    expect(oneSecond.counters.damageTaken).toBe(enemy.damage);
    expect(CONTACT_COOLDOWN).toBe(1);
  });

  it('玩家有伤害来源才打得动；没有就永远打不倒（不假装给了 1 点攻击力）', () => {
    const { plan, enemyId } = winnable();
    let state = initialState(plan);
    const enemy = plan.enemies.find((e) => e.id === enemyId)!;
    state = { ...state, px: enemy.x - 5, py: enemy.y };
    // 每 0.6 秒挥一次（冷却 0.5），10 点攻击 × 几下就该打死 10 血的敌人
    let swings = 0;
    while (state.status === 'playing' && state.enemies.find((e) => e.id === enemyId)!.active && swings < 20) {
      state = run(plan, state, { dx: 0, dy: 0, attack: true }, 0.6);
      swings += 1;
    }
    expect(state.enemies.find((e) => e.id === enemyId)!.active).toBe(false);
    expect(state.events.some((e) => e.text.includes('打倒'))).toBe(true);

    // 同一份设计，把伤害来源拿掉：玩家 attackPower 没了、也没有引用到玩家的武器
    let noDamage = createGame('打不动');
    const foe = entitiesOfKind(noDamage, 'enemy')[0]!;
    noDamage = write(noDamage, foe.id, 'health', 5);
    const plan2 = compileGame(noDamage);
    const target = plan2.enemies.find((e) => e.id === foe.id)!;
    let stuck = { ...initialState(plan2), px: target.x - 3, py: target.y };
    for (let i = 0; i < 40; i += 1) stuck = step(plan2, stuck, { dx: 0, dy: 0, attack: true }, 0.6);
    expect(stuck.enemies.find((e) => e.id === foe.id)!.health).toBe(5);
    expect(stuck.counters.damageDealt).toBe(0);
    expect(plan2.notes.join(' ')).toContain('只能躲、不能打');
  });
});

describe('任务、胜负与超时', () => {
  it('打完敌人、捡到物品 → 任务完成 → 通关，且 outcome 指回任务数', () => {
    const { plan, itemId } = winnable();
    const state = playUntilWon(plan);
    expect(state.items.find((i) => i.id === itemId)!.active).toBe(false);
    expect(state.status).toBe('won');
    expect(state.outcome).toContain('1 条可判定的任务全部完成');
  });

  it('任务没有可判定的条件就永远通不了关（也不假装"自动完成"）', () => {
    let doc = createGame('判不出来');
    const [player] = entitiesOfKind(doc, 'player');
    doc = write(doc, player!.id, 'attackPower', 10);
    const plan = compileGame(doc); // 模板任务一条引用都没有
    expect(plan.quests.every((q) => !q.judgeable)).toBe(true);
    const state = run(plan, initialState(plan), idle, 20);
    expect(state.status).not.toBe('won');
    expect(Object.keys(state.questDone)).toHaveLength(0);
    expect(plan.notes.join(' ')).toContain('没有"赢"');
  });

  it('timeLimit 到点判失败，原因里写着是哪条任务超时', () => {
    let doc = createGame('限时');
    const [player] = entitiesOfKind(doc, 'player');
    const [enemy] = entitiesOfKind(doc, 'enemy');
    const [quest] = entitiesOfKind(doc, 'quest');
    doc = write(doc, player!.id, 'attackPower', 10);
    doc = write(doc, enemy!.id, 'speed', 0);
    doc = write(doc, quest!.id, 'timeLimit', 2);
    doc = link(doc, quest!.id, enemy!.id, '讨伐');
    const plan = compileGame(doc);
    const state = run(plan, initialState(plan), idle, 5);
    expect(state.status).toBe('lost');
    expect(state.outcome).toContain('超时');
    expect(plan.notes.join(' ')).toContain('按**秒**解释');
  });

  it('生命归零判失败，outcome 说清在多少秒、承受了多少伤害', () => {
    let doc = createGame('被围杀');
    const [player] = entitiesOfKind(doc, 'player');
    const [enemy] = entitiesOfKind(doc, 'enemy');
    doc = write(doc, player!.id, 'health', 2);
    doc = write(doc, enemy!.id, 'damage', 3);
    doc = write(doc, enemy!.id, 'speed', 0);
    const plan = compileGame(doc);
    const target = plan.enemies.find((e) => e.id === enemy!.id)!;
    const state = run(plan, { ...initialState(plan), px: target.x, py: target.y }, idle, 2);
    expect(state.status).toBe('lost');
    expect(state.outcome).toContain('生命值归零');
    expect(state.outcome).toContain('承受 3 点伤害');
  });
});

describe('触发器只记账', () => {
  it('踩到触发器会记一次数并说明"没有效果语义"，但不改变别的状态', () => {
    let doc = createGame('触发器');
    const [trigger] = entitiesOfKind(doc, 'trigger');
    const [npc] = entitiesOfKind(doc, 'npc');
    doc = write(doc, trigger!.id, 'radius', 400);
    doc = link(doc, trigger!.id, npc!.id, '触发后对话');
    const plan = compileGame(doc);
    const before = initialState(plan);
    const after = run(plan, before, idle, 2);
    // 触发器没写 cooldown，兜底成"最快 1 秒再结算一次"：2 秒 = 2 次，
    // 关键是它不是每帧一次（60fps 下会是 ~120 次），否则 counters 就没有意义了
    expect(after.counters.triggersFired).toBe(2);
    expect(after.events.some((e) => e.text.includes('没有"之后发生什么"'))).toBe(true);
    // 反向对照：记账不等于有效果——生命、任务、敌人状态一个都没动
    expect(after.health).toBe(before.health);
    expect(after.questDone).toEqual(before.questDone);
    expect(after.enemies).toEqual(before.enemies);
    // 冷却生效：连续踩 10 秒也只该再多几次，而不是每帧一次
    expect(run(plan, before, idle, 10).counters.triggersFired).toBeLessThan(12);
  });
});

it('simSummary 只报真有来源的数，不编分数', () => {
  const { plan } = winnable();
  const summary = simSummary(run(plan, initialState(plan), idle, 1));
  expect(summary).toContain('跑了 1 秒');
  expect(summary).toContain('进行中');
  expect(summary).not.toMatch(/分|score|评分/);
});
