import { describe, expect, it } from "vitest";
import {
  PUZZLE_VIEW_NOTES,
  addEntity,
  compileForKind,
  createGame,
  entitiesOfKind,
  initialState,
  linkEntities,
  puzzleLinks,
  removeEntity,
  setStat,
  step,
  type GameDocument,
  type GamePlan,
  type SimInput,
  type SimState,
} from "../src/index";

/**
 * §51 的解谜画法：谜题的结构 = 文档里已有的引用图（机关=触发器、影响谁=引用、目标=引用了
 * 触发器的任务按「激活」判定）。这一层不发明"门 / 钥匙 / 按钮"实体，也不发明顺序谜题——
 * §54 没有这些东西，画法与判定只能把作者真的连了的东西点亮。
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

/** 清空模板再加指定实体，返回它们的 id：避免模板混进断言（与 exploration.test.ts 同一口径） */
function fresh(name: string, kinds: ("player" | "enemy" | "item" | "npc" | "trigger" | "quest" | "dialogue")[]): {
  doc: GameDocument;
  ids: string[];
} {
  let doc = createGame(name);
  for (const entity of [...doc.entities]) doc = removeEntity(doc, entity.id);
  const ids: string[] = [];
  for (const kind of kinds) {
    doc = addEntity(doc, { kind, name: kind + ids.length });
    const created = entitiesOfKind(doc, kind).at(-1)!;
    ids.push(created.id);
  }
  return { doc, ids };
}

const idle: SimInput = { dx: 0, dy: 0, attack: false };

function run(plan: GamePlan, state: SimState, input: SimInput, seconds: number, tick = 1 / 60): SimState {
  let current = state;
  for (let elapsed = 0; elapsed < seconds; elapsed += tick) current = step(plan, current, input, tick);
  return current;
}

/** 玩家 + 半径 200 的机关 + 引用了机关的任务：玩家初始在场地正中，机关在环上（240px 外，踩不到） */
function puzzleFixture(): { plan: GamePlan; triggerId: string; questId: string } {
  const { doc, ids } = fresh("谜题", ["player", "trigger", "quest"]);
  const [player, trigger, quest] = ids;
  if (!player || !trigger || !quest) throw new Error("测试前提不成立");
  let written = write(doc, trigger, "radius", 200);
  written = link(written, quest, trigger, "开启");
  const plan = compileForKind({ ...written, kind: "puzzle" });
  if (plan.pipeline !== "topdown") throw new Error("puzzle 必须派 topdown");
  return { plan: plan.plan, triggerId: trigger, questId: quest };
}

/** 玩家 + 机关 + 它引用的 NPC，**没有任务**：专测记账本身，不会踩一下就通关 */
function triggerFixture(): { plan: GamePlan; triggerId: string } {
  const { doc, ids } = fresh("机关", ["player", "npc", "trigger"]);
  const [, npc, trigger] = ids;
  if (!npc || !trigger) throw new Error("测试前提不成立");
  const written = link(write(doc, trigger, "radius", 200), trigger, npc, "影响");
  const plan = compileForKind({ ...written, kind: "puzzle" });
  if (plan.pipeline !== "topdown") throw new Error("puzzle 必须派 topdown");
  return { plan: plan.plan, triggerId: trigger };
}

describe("解谜画法（§51 Puzzle）", () => {
  it("引用了触发器的任务按「激活」判定：goal kind 是 activate，标签说明激活谁", () => {
    const { plan, triggerId } = puzzleFixture();
    const quest = plan.quests[0];
    if (!quest) throw new Error("测试前提不成立：任务没有编译出来");
    const trigger = plan.triggers.find((t) => t.id === triggerId)!;
    expect(quest.judgeable).toBe(true);
    expect(quest.goals).toEqual([{ kind: "activate", actorId: triggerId, label: `激活 ${trigger.name}` }]);
  });

  it("引用 NPC / 对话的任务仍然判不出：why 要说清触发器如今是可判定的、这两类不是", () => {
    const { doc, ids } = fresh("判不出", ["player", "npc", "dialogue", "quest"]);
    const [, npc, dialogue, quest] = ids;
    if (!npc || !dialogue || !quest) throw new Error("测试前提不成立");
    let written = link(doc, quest, npc, "汇报");
    written = link(written, quest, dialogue, "旁白");
    const plan = compileForKind({ ...written, kind: "2d" });
    if (plan.pipeline !== "topdown") throw new Error("2d 必须派 topdown");
    const compiled = plan.plan.quests[0];
    if (!compiled) throw new Error("测试前提不成立");
    expect(compiled.judgeable).toBe(false);
    expect(compiled.why).toContain("不是敌人、物品或触发器");
  });

  it("踩进机关范围记「激活」，首次时刻不再变：之后再次踩到只加计数", () => {
    const { plan, triggerId } = triggerFixture();
    const trigger = plan.triggers.find((t) => t.id === triggerId);
    if (!trigger) throw new Error("测试前提不成立");
    const start = initialState(plan);
    expect(start.activated[triggerId]).toBeUndefined();
    // 站上机关跑 0.2 秒：第一帧就该激活
    const first = run(plan, { ...start, px: trigger.x, py: trigger.y }, idle, 0.2);
    const at = first.activated[triggerId];
    expect(at).toBeDefined();
    expect(at!).toBeLessThanOrEqual(0.2);
    expect(first.events.some((e) => e.text.includes(`激活触发器`))).toBe(true);
    // 再站 2 秒：冷却过后 triggersFired 继续加，但「首次激活」的时刻不动
    const later = run(plan, first, idle, 2);
    expect(later.counters.triggersFired).toBeGreaterThan(first.counters.triggersFired);
    expect(later.activated[triggerId]).toBe(at);
    expect(later.events.some((e) => e.text.includes("再次踩到"))).toBe(true);
  });

  it("激活达成 → 引用它的任务完成 → 通关：谜题的赢是真的判定出来的", () => {
    const { plan, triggerId, questId } = puzzleFixture();
    const trigger = plan.triggers.find((t) => t.id === triggerId)!;
    const start = initialState(plan);
    // 没踩机关：任务不完成，还在进行中
    expect(run(plan, start, idle, 1).status).toBe("playing");
    const done = run(plan, { ...start, px: trigger.x, py: trigger.y }, idle, 1);
    expect(done.questDone[questId]).toBeDefined();
    expect(done.status).toBe("won");
    expect(done.outcome).toContain("全部完成");
  });

  it("混合目标（拾取 + 激活）：只做一半不解锁，两件都做了才算通关", () => {
    const { doc, ids } = fresh("混合", ["player", "item", "trigger", "quest"]);
    const [, item, trigger, quest] = ids;
    if (!item || !trigger || !quest) throw new Error("测试前提不成立");
    let written = write(doc, trigger, "radius", 200);
    written = link(written, quest, item, "钥匙");
    written = link(written, quest, trigger, "开启");
    const compiled = compileForKind({ ...written, kind: "puzzle" });
    if (compiled.pipeline !== "topdown") throw new Error("puzzle 必须派 topdown");
    const plan = compiled.plan;
    const itemActor = plan.items[0];
    const triggerActor = plan.triggers[0];
    if (!itemActor || !triggerActor) throw new Error("测试前提不成立");
    const start = initialState(plan);
    // 只踩机关：差一把钥匙
    const half = run(plan, { ...start, px: triggerActor.x, py: triggerActor.y }, idle, 1);
    expect(half.status).toBe("playing");
    expect(Object.keys(half.activated)).toContain(triggerActor.id);
    // 补拾取（先在机关处、再到物品处）：两个目标齐了才赢
    const picked = run(plan, { ...half, px: itemActor.x, py: itemActor.y }, idle, 0.2);
    expect(picked.counters.pickups).toBe(1);
    const done = run(plan, { ...picked, px: triggerActor.x, py: triggerActor.y }, idle, 1);
    expect(done.status).toBe("won");
  });

  it("puzzleLinks 只画作者连了的引用：机关→NPC 有线，没引用的机关没有线", () => {
    const { doc, ids } = fresh("连线", ["player", "npc", "trigger", "quest"]);
    const [, npc, triggerA] = ids;
    if (!npc || !triggerA) throw new Error("测试前提不成立");
    // triggerA 引用 NPC；再加一个不引用任何东西的机关
    const written = link(doc, triggerA, npc, "影响");
    const withSecond = addEntity(written, { kind: "trigger", name: "孤立开关" });
    const plan = compileForKind({ ...withSecond, kind: "puzzle" });
    if (plan.pipeline !== "topdown") throw new Error("puzzle 必须派 topdown");
    const compiled = plan.plan;
    const links = puzzleLinks(compiled);
    expect(links.length).toBe(1);
    const linkOnly = links[0]!;
    const triggerEntity = compiled.triggers.find((t) => t.id === triggerA)!;
    const npcActor = compiled.npcs[0]!;
    expect(linkOnly.triggerId).toBe(triggerA);
    expect(linkOnly.from).toEqual({ x: triggerEntity.x, y: triggerEntity.y });
    expect(linkOnly.to).toEqual({ x: npcActor.x, y: npcActor.y });
    expect(linkOnly.targetKind).toBe("npc");
    // 确定性：同一份计划两次调用逐字段相同（HUD 与画布各调一次不该漂）
    expect(puzzleLinks(compiled)).toEqual(links);
  });

  it("机关引用了不在场上的东西（比如任务）不画线：位置都不存在，线就是编的", () => {
    const { doc, ids } = fresh("悬空", ["player", "trigger", "quest"]);
    const [, trigger, quest] = ids;
    if (!trigger || !quest) throw new Error("测试前提不成立");
    const written = link(doc, trigger, quest, "计分");
    const plan = compileForKind({ ...written, kind: "puzzle" });
    if (plan.pipeline !== "topdown") throw new Error("puzzle 必须派 topdown");
    expect(plan.plan.triggers[0]?.affects).not.toBeNull(); // 引用成立，HUD 会说"它引用的是…"
    expect(puzzleLinks(plan.plan)).toEqual([]); // 但连线上没有可画的那一端
  });

  it("解谜不改规则：puzzle 派出的计划与 2D 逐字段相等", () => {
    const { doc, ids } = fresh("不改规则", ["player", "item", "trigger", "quest"]);
    const [, item, trigger, quest] = ids;
    if (!item || !trigger || !quest) throw new Error("测试前提不成立");
    let written = write(doc, trigger, "radius", 200);
    written = link(written, quest, trigger, "开启");
    written = link(written, quest, item, "钥匙");
    const as2d = compileForKind({ ...written, kind: "2d" });
    const asPuzzle = compileForKind({ ...written, kind: "puzzle" });
    expect(asPuzzle.pipeline).toBe("topdown");
    if (asPuzzle.pipeline === "topdown" && as2d.pipeline === "topdown") {
      expect(asPuzzle.view).toBe("puzzle");
      expect(asPuzzle.plan).toEqual(as2d.plan);
    }
  });

  it("限度三条都在：不换规则、不替设计补谜题、不假装支持顺序谜题", () => {
    expect(PUZZLE_VIEW_NOTES.length).toBeGreaterThanOrEqual(3);
    expect(PUZZLE_VIEW_NOTES.join("\n")).toContain("同一个 step");
    expect(PUZZLE_VIEW_NOTES.join("\n")).toContain("不替设计补谜题");
    expect(PUZZLE_VIEW_NOTES.join("\n")).toContain("不假装支持");
  });
});
