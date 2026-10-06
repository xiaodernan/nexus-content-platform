import { describe, expect, it } from "vitest";
import {
  ARENA,
  EXPLORATION_REVEAL_RADIUS,
  EXPLORATION_VIEW_NOTES,
  addEntity,
  compileForKind,
  createGame,
  discoverableIds,
  entitiesOfKind,
  removeEntity,
  revealedNow,
  type GamePlan,
} from "../src/index";

/**
 * §51 的探索画法：同一份关卡计划，走近才看得见。
 *
 * 钉的全是"这一格不发明东西"：可发现的只是摆上场的那四类、半径是一个视图常量
 * （模型里没有视野字段，不按类别给不同半径）、玩家照旧参与同一个 step——
 * 探索改的只有"哪些东西现在画出来"。
 */

/** 造一份只有指定几个实体的文档：删光模板那 11 个空实体再加，避免模板混进断言 */
function planWith(name: string, entities: { kind: "enemy" | "item" | "npc" | "trigger"; x?: string }[]): {
  plan: GamePlan;
  ids: string[];
} {
  let doc = createGame(name);
  for (const entity of [...doc.entities]) {
    doc = removeEntity(doc, entity.id);
  }
  const ids: string[] = [];
  for (const [index, entity] of entities.entries()) {
    doc = addEntity(doc, { kind: entity.kind, name: entity.kind + index });
    const created = entitiesOfKind(doc, entity.kind).find((e) => e.name === entity.kind + index)!;
    ids.push(created.id);
  }
  const projection = compileForKind({ ...doc, kind: "2d" });
  if (projection.pipeline !== "topdown") throw new Error("2d 必须派 topdown");
  return { plan: projection.plan, ids };
}

describe("探索画法（§51 Exploration）", () => {
  it("半径内的照得见：半径 0 也照得见自己（圆心取等）", () => {
    const { plan, ids } = planWith("边界", [{ kind: "item" }, { kind: "npc" }]);
    const first = plan.items[0] ?? plan.npcs[0] ?? plan.enemies[0];
    if (!first) throw new Error("测试前提不成立：场上一个可发现物都没有");
    const near = revealedNow(plan, { x: first.x, y: first.y }, 0);
    expect(near).toContain(first.id); // 半径 0 也照得见自己：圆心取等
    expect(ids.length).toBeGreaterThan(0);
  });

  it("半径是欧氏的：斜向 106+106（≈150 内）照得见，120+120（≈170）照不见", () => {
    const { plan } = planWith("斜角", [{ kind: "item" }]);
    const probe = plan.items[0] ?? plan.npcs[0] ?? plan.enemies[0];
    if (!probe) throw new Error("测试前提不成立：场上一个可发现物都没有");
    // (106,106)：欧氏 ≈ 149.97 ≤ 150 → 照得见；曼哈顿 = 212 > 150 → 若按曼哈顿算这句就翻车
    expect(revealedNow(plan, { x: probe.x - 106, y: probe.y - 106 })).toContain(probe.id);
    // (120,120)：欧氏 ≈ 169.7 > 150 → 照不见；切比雪夫 = 120 ≤ 150 → 若按棋盘距离算这句就翻车
    expect(revealedNow(plan, { x: probe.x - 120, y: probe.y - 120 })).not.toContain(probe.id);
  });

  it("可发现的清单就是摆上场的那四类：玩家不在其中", () => {
    const { plan, ids } = planWith("分母", [{ kind: "enemy" }, { kind: "item" }, { kind: "trigger" }]);
    expect(discoverableIds(plan)).toEqual(ids);
    if (plan.player) expect(discoverableIds(plan)).not.toContain(plan.player.id);
    // 顺序按 敌人→物品→NPC→触发器 稳定给出：HUD 的计数不该因遍历顺序漂
    expect(discoverableIds(plan)).toEqual(discoverableIds(plan));
  });

  it("同一份计划换探索画法，规则一个数都不改：view 变、plan 逐字段相等", () => {
    let doc = createGame("不改规则");
    for (const entity of [...doc.entities]) doc = removeEntity(doc, entity.id);
    doc = addEntity(doc, { kind: "enemy", name: "守门" });
    doc = addEntity(doc, { kind: "item", name: "钥匙" });
    const topdown = compileForKind({ ...doc, kind: "2d" });
    const exploration = compileForKind({ ...doc, kind: "exploration" });
    expect(exploration.pipeline).toBe("topdown");
    if (exploration.pipeline === "topdown" && topdown.pipeline === "topdown") {
      expect(exploration.view).toBe("exploration");
      expect(exploration.plan).toEqual(topdown.plan);
    }
  });

  it("半径是这一格的常量：比场地的一半小，也不随场地缩放", () => {
    expect(EXPLORATION_REVEAL_RADIUS).toBeGreaterThan(0);
    expect(EXPLORATION_REVEAL_RADIUS).toBeLessThan(Math.min(ARENA.width, ARENA.height) / 2);
  });

  it("限度三条都在：不换规则、发现不进库、不发明新东西", () => {
    expect(EXPLORATION_VIEW_NOTES.length).toBeGreaterThanOrEqual(3);
    expect(EXPLORATION_VIEW_NOTES.join("\n")).toContain("同一个 step");
    expect(EXPLORATION_VIEW_NOTES.join("\n")).toContain("不进文档也不进库");
    expect(EXPLORATION_VIEW_NOTES.join("\n")).toContain("不发明新的东西");
  });
});
