import { describe, expect, it } from "vitest";
import {
  LABEL_LIMIT,
  NEARBY_RADIUS,
  SCENE_LIMITS,
  WORLD_KIND_COLORS,
  buildWorldScene,
  nearestEntities,
  pickLabelTargets,
  sceneLegend,
  type WorldDocument,
  type WorldKind,
  type WorldNode,
} from "../src";

/**
 * §140 的 3D 投影。测的是"位置从哪来"和"没位置时怎么办"——
 * 这两处一旦含糊，用户走在一个看起来被设计过、其实按序号排在环上的世界里，
 * 而谁都没告诉他。
 */

function node(id: string, kind: WorldKind, title = id, body = ""): WorldNode {
  return { id, kind, title, body, updatedAt: "2026-01-01T00:00:00.000Z" };
}

function world(over: Partial<WorldDocument> = {}): WorldDocument {
  return {
    id: "w1",
    projectId: "p1",
    name: "测试世界",
    summary: "",
    nodes: [],
    links: [],
    positions: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("buildWorldScene（§45 的位置 → §140 的地面）", () => {
  it("摆过位置的条目用那个坐标，并标成 authored", () => {
    const scene = buildWorldScene(
      world({
        nodes: [node("a", "geography"), node("b", "factions")],
        positions: { a: { x: 12.5, y: -7.25 } },
      }),
    );
    const a = scene.entities.find((e) => e.id === "a")!;
    const b = scene.entities.find((e) => e.id === "b")!;
    expect([a.x, a.z]).toEqual([12.5, -7.25]); // 图上的 y 就是世界里的 z（向南）
    expect(a.placed).toBe("authored");
    expect(b.placed).toBe("fallback");
    expect(scene.stats).toMatchObject({ entities: 2, authored: 1, fallback: 1 });
  });

  it("没摆过位置的按文档顺序排在同心环上：确定、有限、不重叠", () => {
    const nodes = Array.from({ length: 11 }, (_, i) => node(`n${i}`, "lore"));
    const first = buildWorldScene(world({ nodes }));
    const again = buildWorldScene(world({ nodes }));
    // 没有任何随机：同一份文档两次投影逐字节相同
    expect(JSON.stringify(again)).toBe(JSON.stringify(first));

    const coords = first.entities.map((e) => `${e.x},${e.z}`);
    expect(new Set(coords).size).toBe(coords.length);
    expect(coords.every((c) => c.split(",").every((v) => Number.isFinite(Number(v))))).toBe(true);
    // 第 9 个开始换到第二圈，半径更大
    expect(Math.hypot(first.entities[0]!.x, first.entities[0]!.z)).toBeLessThan(
      Math.hypot(first.entities[9]!.x, first.entities[9]!.z),
    );
  });

  it("颜色只表示类别：同类不同长度的正文颜色一样", () => {
    const scene = buildWorldScene(
      world({ nodes: [node("short", "creatures", "短", "一句话"), node("long", "creatures", "长", "啊".repeat(5000))] }),
    );
    const [a, b] = scene.entities;
    expect(a!.color).toBe(b!.color);
    expect(a!.color).toBe(WORLD_KIND_COLORS.creatures);
  });

  it("只有一端有位置的连线不画，也不假装画了", () => {
    const scene = buildWorldScene(
      world({
        nodes: [node("a", "geography"), node("b", "geography")],
        positions: { a: { x: 1, y: 1 } },
        links: [{ id: "l1", from: "a", to: "missing-node", label: "通向不存在的东西" }],
      }),
    );
    expect(scene.links[0]!.points).toBeNull();
    expect(scene.stats.links).toBe(1);
    expect(scene.stats.linksDrawn).toBe(0);
  });

  it("两端都在图上才给出线段的两个点", () => {
    const scene = buildWorldScene(
      world({
        nodes: [node("a", "geography"), node("b", "geography")],
        positions: { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } },
        links: [{ id: "l1", from: "a", to: "b", label: "相邻" }],
      }),
    );
    expect(scene.links[0]!.points).toEqual({ from: [1, 2], to: [3, 4] });
    expect(scene.stats.linksDrawn).toBe(1);
  });

  it("外接框把 fallback 的环也包进去，相机不会被内容穿出画面", () => {
    const scene = buildWorldScene(world({ nodes: Array.from({ length: 17 }, (_, i) => node(`n${i}`, "items")) }));
    const far = Math.max(...scene.entities.map((e) => Math.max(Math.abs(e.x), Math.abs(e.z))));
    expect(scene.bounds.radius).toBeGreaterThanOrEqual(far);
  });

  it("限度随场景一起出去，而且说的是真做不到的事", () => {
    const scene = buildWorldScene(world({ nodes: [node("a", "lore")] }));
    expect(scene.limits).toEqual([...SCENE_LIMITS]);
    const joined = scene.limits.join(" ");
    expect(joined).toContain("同心环");
    expect(joined).toContain("碰撞");
    expect(joined).toContain("占位几何体");
  });

  it("空世界也是一份合法场景：0 个条目、半径仍可用、图例为空", () => {
    const scene = buildWorldScene(world({ name: "还没开始写" }));
    expect(scene.entities).toEqual([]);
    expect(scene.links).toEqual([]);
    expect(scene.bounds.radius).toBeGreaterThan(0);
    expect(sceneLegend(scene)).toEqual([]);
  });
});

describe("走近了看（§140 的 explore）", () => {
  const scene = buildWorldScene(
    world({
      nodes: [node("near", "geography", "近处"), node("far", "geography", "远处"), node("tie", "geography", "同距")],
      positions: { near: { x: 0, y: 0 }, far: { x: 90, y: 90 }, tie: { x: 4, y: 0 }, a2: { x: -4, y: 0 } },
    }),
  );

  it("只返回半径内的，按距离由近到远", () => {
    expect(nearestEntities(scene, { x: 0, z: 0 }).map((e) => e.id)).toEqual(["near", "tie"]);
  });

  it("同样距离时按 id 排，顺序不随调用次数漂", () => {
    const two = buildWorldScene(
      world({
        nodes: [node("zz", "lore"), node("aa", "lore")],
        positions: { zz: { x: 1, y: 0 }, aa: { x: 1, y: 0 } },
      }),
    );
    const order = nearestEntities(two, { x: 0, z: 0 }).map((e) => e.id);
    expect(order).toEqual(["aa", "zz"]);
    expect(nearestEntities(two, { x: 0, z: 0 }).map((e) => e.id)).toEqual(order);
  });

  it("阈值是共用的一个数，别处改不了", () => {
    expect(NEARBY_RADIUS).toBeGreaterThan(0);
    expect(nearestEntities(scene, { x: 0, z: 0 }, 0.001).map((e) => e.id)).toEqual(["near"]);
  });
});

describe("图例", () => {
  it("只列出现过的类别，顺序按九类固定顺序而不是数量", () => {
    const scene = buildWorldScene(
      world({
        nodes: [node("a", "story"), node("b", "lore"), node("c", "lore"), node("d", "geography")],
      }),
    );
    expect(sceneLegend(scene).map((l) => l.kind)).toEqual(["lore", "geography", "story"]);
    expect(sceneLegend(scene).map((l) => l.count)).toEqual([2, 1, 1]);
  });
});

describe("pickLabelTargets（标签只给最近的几个）", () => {
  const scene = buildWorldScene(
    world({
      nodes: [node("far", "lore"), node("mid", "lore"), node("near", "lore"), node("tie-b", "lore"), node("tie-a", "lore")],
      positions: {
        far: { x: 100, y: 0 },
        mid: { x: 10, y: 0 },
        near: { x: 1, y: 0 },
        "tie-b": { x: 0, y: 5 },
        "tie-a": { x: 0, y: -5 },
      },
    }),
  );

  it("按距离由近到远，同距按 id 排（反复调用顺序不漂）", () => {
    const first = pickLabelTargets(scene, { x: 0, z: 0 }).map((t) => t.id);
    expect(first).toEqual(["near", "tie-a", "tie-b", "mid", "far"]);
    expect(pickLabelTargets(scene, { x: 0, z: 0 }).map((t) => t.id)).toEqual(first);
  });

  it("带上距离，标签才知道自己该多大/要不要显示", () => {
    const [near] = pickLabelTargets(scene, { x: 0, z: 0 });
    expect(near!.distance).toBe(1);
  });

  it("上限是真的：limit=2 只给 2 个，limit=0 给空而不是全部", () => {
    expect(pickLabelTargets(scene, { x: 0, z: 0 }, 2)).toHaveLength(2);
    expect(pickLabelTargets(scene, { x: 0, z: 0 }, 0)).toEqual([]);
    expect(LABEL_LIMIT).toBeGreaterThanOrEqual(10);
  });

  it("空世界也给得出空列表，不抛", () => {
    expect(pickLabelTargets(buildWorldScene(world()), { x: 0, z: 0 })).toEqual([]);
  });
});
