import { describe, expect, it } from "vitest";
import {
  WORLD_ELEVATION_MAX,
  WORLD_PLATEAU_LIMIT,
  WORLD_PLATEAU_RADIUS_MAX,
  WORLD_PLATEAU_RADIUS_MIN,
  WORLD_TERRAIN_HEIGHT_MAX,
  buildWorldScene,
  createWorld,
  setWorldNodePosition,
  setWorldTerrain,
  validateWorld,
  type WorldDocument,
  type WorldNode,
  type WorldPlateau,
} from "../src";
import {
  WorldDocumentSchema,
  WorldSaveRequestSchema,
  WorldTerrainSchema,
} from "@nexus/schemas";

/**
 * §140 第四片：可走的地形（圆台）。钉的是四件会骗人的事：
 *  ① 高度查询在重叠处取**最高**的圆台，不是平均也不是后画的赢——平均会填缝、后画会让
 *     同一块地的高度取决于作者先点哪个（确定性）；
 *  ② 没有地形 = 平地 = 0，老世界（没有 terrain 字段）照常走得动；
 *  ③ 写入端不合法就不写、原因交回，不悄悄归零也不抛异常（与 elevation 同一边）；
 *  ④ 地形过得了 wire 契约：PUT 进、读回来还在，越界的进不来。
 */

function node(id: string, kind: WorldNode["kind"], title = id): WorldNode {
  return { id, kind, title, body: "", updatedAt: "2026-01-01T00:00:00.000Z" };
}

function doc(name = "地形世界"): WorldDocument {
  return createWorld(name);
}

function plateau(id: string, over: Partial<WorldPlateau> = {}): WorldPlateau {
  return { id, x: 0, y: 0, radius: 5, height: 2, ...over };
}

function withNode(base: WorldDocument, id = "n1"): WorldDocument {
  return { ...base, nodes: [...base.nodes, node(id, "geography")] };
}

describe("terrainHeightAt：这个点站在多高", () => {
  function sceneWith(plateaus: WorldPlateau[]) {
    return buildWorldScene({ ...doc(), terrain: { kind: "plateaus", plateaus } });
  }

  it("圆台中心与台内取台面高度，台外取 0", () => {
    const scene = sceneWith([plateau("a", { x: 0, y: 0, radius: 5, height: 2 })]);
    expect(scene.terrain.heightAt(0, 0)).toBe(2);
    expect(scene.terrain.heightAt(4.9, 0)).toBe(2);
    expect(scene.terrain.heightAt(5, 0)).toBe(2); // 边界含进去：走上台沿那一格就该是台面
    expect(scene.terrain.heightAt(5.1, 0)).toBe(0);
    expect(scene.terrain.heightAt(-3, 40)).toBe(0);
  });

  it("没有地形 = 平地：老世界（没有 terrain）照样走路", () => {
    const legacy = buildWorldScene(doc());
    expect(legacy.terrain.authored).toBe(false);
    expect(legacy.terrain.heightAt(0, 0)).toBe(0);
    expect(legacy.terrain.plateaus).toEqual([]);
  });

  it("重叠处取最高的圆台，不取决于先画谁", () => {
    // 两个圆台确实重叠：low 圆心 0 半径 10（-10..10），high 圆心 14 半径 10（4..24）。
    // 4..10 是重叠区——那里高的是 high；low 的内圈（-10..4）只有 low 自己
    const scene = sceneWith([
      plateau("low", { x: 0, y: 0, radius: 10, height: 1 }),
      plateau("high", { x: 14, y: 0, radius: 10, height: 4 }),
    ]);
    expect(scene.terrain.heightAt(14, 0)).toBe(4);
    expect(scene.terrain.heightAt(6, 0)).toBe(4); // 重叠区：取最高，不是平均 2.5
    expect(scene.terrain.heightAt(0, 0)).toBe(1); // low 独占的内圈
    expect(scene.terrain.heightAt(20, 0)).toBe(4);
    expect(scene.terrain.heightAt(30, 0)).toBe(0);
    // 交换数组顺序，同一个点答案不变（确定性：不能"先画的赢"）
    const swapped = sceneWith([
      plateau("high", { x: 14, y: 0, radius: 10, height: 4 }),
      plateau("low", { x: 0, y: 0, radius: 10, height: 1 }),
    ]);
    expect(swapped.terrain.heightAt(6, 0)).toBe(4);
    expect(swapped.terrain.heightAt(0, 0)).toBe(1);
  });

  it("高度 0 的圆台不参与覆盖：它就在地平面上，不把别处压成 0", () => {
    // flat 半径 30 把 island（x=20 r=5）整个盖住——0 高的台子不该把 island 吞成平地
    const scene = sceneWith([
      plateau("flat", { x: 0, y: 0, radius: 30, height: 0 }),
      plateau("island", { x: 20, y: 0, radius: 5, height: 3 }),
    ]);
    expect(scene.terrain.heightAt(10, 0)).toBe(0); // flat 自己就是地面
    expect(scene.terrain.heightAt(20, 0)).toBe(3); // island 在 flat 里面照样高
    expect(scene.terrain.authored).toBe(true);
  });

  it("浮点尾数不出现在高度上（相机位置不该带 1.9999999）", () => {
    const scene = sceneWith([plateau("a", { height: 2.35 })]);
    expect(scene.terrain.heightAt(0, 0)).toBe(2.35);
    expect(String(scene.terrain.heightAt(0, 0))).toBe("2.35");
  });

  it("高度查询对平面坐标负责：x/z 与 §45 图坐标同一套（z 就是图的 y）", () => {
    const positioned = setWorldNodePosition(withNode(doc()), "n1", { x: 3, y: 4 });
    expect(positioned.positions.n1).toEqual({ x: 3, y: 4 });
    const scene = buildWorldScene(positioned);
    const entity = scene.entities.find((e) => e.id === "n1")!;
    expect(entity.x).toBe(3);
    expect(entity.z).toBe(4);
    // 作者在这条位置旁边画一个圆台：场景投影认它，高度查询也认它
    const sceneWithTerrain = buildWorldScene(
      setWorldTerrain(positioned, {
        kind: "plateaus",
        plateaus: [plateau("a", { x: 3, y: 4, radius: 5, height: 2 })],
      }).document,
    );
    expect(sceneWithTerrain.terrain.heightAt(3, 4)).toBe(2);
  });
});

describe("setWorldTerrain：不合法就不写，原因交回", () => {
  it("合法写入：整份收下，字段归一，updatedAt 走", () => {
    const result = setWorldTerrain(doc(), {
      kind: "plateaus",
      plateaus: [plateau("p1", { x: 1, y: 2, radius: 3.5, height: 4.25 })],
    });
    expect(result.reason).toBeNull();
    expect(result.document.terrain).toEqual({
      kind: "plateaus",
      plateaus: [{ id: "p1", x: 1, y: 2, radius: 3.5, height: 4.25 }],
    });
  });

  it("类型不认识、圆台数超限、坐标/半径/高度越界：都拒，文档一个字没动", () => {
    const base = doc();
    const before = JSON.stringify(base);
    expect(setWorldTerrain(base, { kind: "hills" as never, plateaus: [] }).reason).toContain("圆台");
    expect(setWorldTerrain(base, null).reason).toBeNull();
    const tooMany = { kind: "plateaus" as const, plateaus: Array.from({ length: WORLD_PLATEAU_LIMIT + 1 }, (_, i) => plateau(`p${i}`)) };
    expect(setWorldTerrain(base, tooMany).reason).toContain(`${WORLD_PLATEAU_LIMIT}`);
    const badRadius = { kind: "plateaus" as const, plateaus: [plateau("p", { radius: WORLD_PLATEAU_RADIUS_MAX + 1 })] };
    expect(setWorldTerrain(base, badRadius).reason).toContain("半径");
    const tinyRadius = { kind: "plateaus" as const, plateaus: [plateau("p", { radius: WORLD_PLATEAU_RADIUS_MIN - 0.5 })] };
    expect(setWorldTerrain(base, tinyRadius).reason).toContain("走一步就掉下去");
    const tooHigh = { kind: "plateaus" as const, plateaus: [plateau("p", { height: WORLD_TERRAIN_HEIGHT_MAX + 0.5 })] };
    expect(setWorldTerrain(base, tooHigh).reason).toContain(`${WORLD_TERRAIN_HEIGHT_MAX}`);
    const dupId = { kind: "plateaus" as const, plateaus: [plateau("p"), plateau("p")] };
    expect(setWorldTerrain(base, dupId).reason).toContain("重复");
    // 每一个被拒的调用都不该留下半个地形
    expect(JSON.stringify(setWorldTerrain(base, tooHigh).document)).toBe(before);
  });

  it("null = 把地形收掉（回到平地），不是加一个空地形", () => {
    const withTerrain = setWorldTerrain(doc(), { kind: "plateaus", plateaus: [plateau("p1")] }).document;
    expect(withTerrain.terrain).toBeDefined();
    const cleared = setWorldTerrain(withTerrain, null);
    expect(cleared.reason).toBeNull();
    expect(cleared.document.terrain).toBeUndefined();
    expect(buildWorldScene(cleared.document).terrain.authored).toBe(false);
  });

  it("加过地形的世界结构上仍然自洽（validateWorld 不报）", () => {
    const world = setWorldTerrain(withNode(doc()), {
      kind: "plateaus",
      plateaus: [plateau("p1", { x: 30, y: 40, height: 2 })],
    }).document;
    expect(validateWorld(world).some((issue) => issue.code === "bad-terrain")).toBe(false);
  });

  it("结构坏的地形进了文档也要被 validateWorld 叫住（bad-terrain）", () => {
    const world = withNode(doc());
    const broken = { ...world, terrain: { kind: "plateaus", plateaus: [plateau("p", { height: 99 })] } } as WorldDocument;
    const issues = validateWorld(broken);
    expect(issues.some((issue) => issue.code === "bad-terrain")).toBe(true);
  });

  it("高度 0 不用 WORLDELEVATIONMAX 之外的新常量：地台再高也出不了世界看得见的范围", () => {
    expect(WORLD_TERRAIN_HEIGHT_MAX).toBe(WORLD_ELEVATION_MAX);
  });
});

describe("地形过得了 wire 契约（§140 × schemas）", () => {
  const world = setWorldTerrain(doc(), {
    kind: "plateaus",
    plateaus: [plateau("p1", { x: 12, y: 34, radius: 8, height: 3.5 })],
  }).document;

  it("模型写的地形过得了契约，且契约不再剥它", () => {
    const parsed = WorldDocumentSchema.safeParse(world);
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.terrain : null).toEqual({
      kind: "plateaus",
      plateaus: [{ id: "p1", x: 12, y: 34, radius: 8, height: 3.5 }],
    });
  });

  it("老世界（没有 terrain）照样读得出，而不是报契约不符", () => {
    expect(WorldDocumentSchema.safeParse(doc()).success).toBe(true);
  });

  it("越界的圆台进不了库（与模型侧的同一边界）", () => {
    expect(WorldTerrainSchema.safeParse({ kind: "plateaus", plateaus: [plateau("p", { height: 6.5 })] }).success).toBe(false);
    expect(WorldTerrainSchema.safeParse({ kind: "plateaus", plateaus: [plateau("p", { radius: 0.5 })] }).success).toBe(false);
    expect(WorldTerrainSchema.safeParse({ kind: "hills", plateaus: [] }).success).toBe(false);
    // 合法的那一端必须进得去
    expect(WorldTerrainSchema.safeParse({ kind: "plateaus", plateaus: [plateau("p", { height: 6, radius: 400 })] }).success).toBe(true);
  });

  it("PUT 的报文包装也不剥 terrain", () => {
    const viaPut = WorldSaveRequestSchema.safeParse({ document: world });
    expect(viaPut.success).toBe(true);
    expect(viaPut.success ? viaPut.data.document.terrain : null).toBeDefined();
  });
});
