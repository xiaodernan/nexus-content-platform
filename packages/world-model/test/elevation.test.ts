import { describe, expect, it } from "vitest";
import {
  WORLD_ELEVATION_MAX,
  buildWorldScene,
  createWorld,
  setWorldNodeElevation,
  setWorldNodePosition,
  type WorldDocument,
  type WorldKind,
  type WorldNode,
} from "../src";

/**
 * §140 的高程：图上写的"这个条目浮多高"。
 * 这里钉的是两件会骗人的事——高程只属于摆过位置的条目（不给 fallback 的暗中定高）、
 * 拖动平面坐标不把作者写过的高度打回地面。不合法的写入要交回原因，不是悄悄归零。
 */

function node(id: string, kind: WorldKind, title = id, body = ""): WorldNode {
  return { id, kind, title, body, updatedAt: "2026-01-01T00:00:00.000Z" };
}

function doc(): WorldDocument {
  return createWorld(`w-${Date.now()}`);
}

describe("setWorldNodeElevation", () => {
  it("没摆过位置的条目不收高程：原因说清要先摆位置，文档一个字没动", () => {
    const world = doc();
    const added = { ...world, nodes: [...world.nodes, node("n1", "geography")] };
    const before = JSON.stringify(added.positions);
    const result = setWorldNodeElevation(added, "n1", 4);
    expect(result.reason).toContain("先在世界图上");
    expect(JSON.stringify(result.document.positions)).toBe(before);
  });

  it("合法写入：elevation 存下、x/y 原样保留", () => {
    const world = doc();
    const withNode = { ...world, nodes: [...world.nodes, node("n1", "geography")] };
    const positioned = setWorldNodePosition(withNode, "n1", { x: 30, y: 40 });
    const result = setWorldNodeElevation(positioned, "n1", 4.5);
    expect(result.reason).toBeNull();
    expect(result.document.positions.n1).toEqual({ x: 30, y: 40, elevation: 4.5 });
  });

  it("越界与不是数都拒绝：原因带范围，文档不动", () => {
    const world = doc();
    const withNode = { ...world, nodes: [...world.nodes, node("n1", "geography")] };
    const positioned = setWorldNodePosition(withNode, "n1", { x: 1, y: 2 });
    for (const bad of [-1, WORLD_ELEVATION_MAX + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = setWorldNodeElevation(positioned, "n1", bad);
      expect(result.reason).not.toBeNull();
      expect(result.document).toEqual(positioned);
    }
  });

  it("拖动落点不带 elevation 时保留原高度；带了就更新（越界收到界内）", () => {
    const world = doc();
    const withNode = { ...world, nodes: [...world.nodes, node("n1", "geography")] };
    const elevated = setWorldNodePosition(withNode, "n1", { x: 10, y: 10, elevation: 5 });
    const dragged = setWorldNodePosition(elevated, "n1", { x: 20, y: 30 });
    expect(dragged.positions.n1).toEqual({ x: 20, y: 30, elevation: 5 });
    const rewritten = setWorldNodePosition(dragged, "n1", { x: 25, y: 35, elevation: 99 });
    expect(rewritten.positions.n1).toEqual({ x: 25, y: 35, elevation: WORLD_ELEVATION_MAX });
  });
});

describe("高程进场景投影", () => {
  it("摆过的条目带它写的高度；没摆的与没写的都是 0", () => {
    const world = doc();
    const withNodes = {
      ...world,
      nodes: [...world.nodes, node("a", "geography"), node("b", "history"), node("c", "lore")],
    };
    const a = setWorldNodePosition(withNodes, "a", { x: 5, y: 6, elevation: 4 });
    const b = setWorldNodePosition(a, "b", { x: 7, y: 8 });
    const scene = buildWorldScene(b);
    const byId = new Map(scene.entities.map((e) => [e.id, e]));
    expect(byId.get("a")!.elevation).toBe(4);
    expect(byId.get("b")!.elevation).toBe(0);
    expect(byId.get("c")!.elevation).toBe(0); // fallback：不给它暗中定高
    expect(byId.get("c")!.placed).toBe("fallback");
  });

  it("限度跟着改口：说清高程是条目属性、脚下没有坡", () => {
    const scene = buildWorldScene(doc());
    const joined = scene.limits.join(" ");
    expect(joined).toContain("高程");
    expect(joined).toContain("没有坡");
  });
});
