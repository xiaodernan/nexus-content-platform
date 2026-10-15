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
  terrainHeightAt,
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
    expect(terrainHeightAt(scene.terrain, 0, 0)).toBe(2);
    expect(terrainHeightAt(scene.terrain, 4.9, 0)).toBe(2);
    expect(terrainHeightAt(scene.terrain, 5, 0)).toBe(2); // 边界含进去：走上台沿那一格就该是台面
    expect(terrainHeightAt(scene.terrain, 5.1, 0)).toBe(0);
    expect(terrainHeightAt(scene.terrain, -3, 40)).toBe(0);
  });

  it("没有地形 = 平地：老世界（没有 terrain）照样走路", () => {
    const legacy = buildWorldScene(doc());
    expect(legacy.terrain.authored).toBe(false);
    expect(terrainHeightAt(legacy.terrain, 0, 0)).toBe(0);
    expect(legacy.terrain.plateaus).toEqual([]);
  });

  it("重叠处取最高的圆台，不取决于先画谁", () => {
    // 两个圆台确实重叠：low 圆心 0 半径 10（-10..10），high 圆心 14 半径 10（4..24）。
    // 4..10 是重叠区——那里高的是 high；low 的内圈（-10..4）只有 low 自己
    const scene = sceneWith([
      plateau("low", { x: 0, y: 0, radius: 10, height: 1 }),
      plateau("high", { x: 14, y: 0, radius: 10, height: 4 }),
    ]);
    expect(terrainHeightAt(scene.terrain, 14, 0)).toBe(4);
    expect(terrainHeightAt(scene.terrain, 6, 0)).toBe(4); // 重叠区：取最高，不是平均 2.5
    expect(terrainHeightAt(scene.terrain, 0, 0)).toBe(1); // low 独占的内圈
    expect(terrainHeightAt(scene.terrain, 20, 0)).toBe(4);
    expect(terrainHeightAt(scene.terrain, 30, 0)).toBe(0);
    // 交换数组顺序，同一个点答案不变（确定性：不能"先画的赢"）
    const swapped = sceneWith([
      plateau("high", { x: 14, y: 0, radius: 10, height: 4 }),
      plateau("low", { x: 0, y: 0, radius: 10, height: 1 }),
    ]);
    expect(terrainHeightAt(swapped.terrain, 6, 0)).toBe(4);
    expect(terrainHeightAt(swapped.terrain, 0, 0)).toBe(1);
  });

  it("高度 0 的圆台不参与覆盖：它就在地平面上，不把别处压成 0", () => {
    // flat 半径 30 把 island（x=20 r=5）整个盖住——0 高的台子不该把 island 吞成平地
    const scene = sceneWith([
      plateau("flat", { x: 0, y: 0, radius: 30, height: 0 }),
      plateau("island", { x: 20, y: 0, radius: 5, height: 3 }),
    ]);
    expect(terrainHeightAt(scene.terrain, 10, 0)).toBe(0); // flat 自己就是地面
    expect(terrainHeightAt(scene.terrain, 20, 0)).toBe(3); // island 在 flat 里面照样高
    expect(scene.terrain.authored).toBe(true);
  });

  it("浮点尾数不出现在高度上（相机位置不该带 1.9999999）", () => {
    const scene = sceneWith([plateau("a", { height: 2.35 })]);
    expect(terrainHeightAt(scene.terrain, 0, 0)).toBe(2.35);
    expect(String(terrainHeightAt(scene.terrain, 0, 0))).toBe("2.35");
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
    expect(terrainHeightAt(sceneWithTerrain.terrain, 3, 4)).toBe(2);
  });

  it("场景投影是纯数据：terrain 上一个函数都不许有（server/client 边界的坑）", () => {
    // 2026-10-10 真踩过：sceneTerrain 当时带一个 heightAt 函数，而 WorldScene 是
    // 服务端组件渲染好后作为 props 传给客户端 3D 组件的——Next 在运行时报
    // "Functions cannot be passed directly to Client Components"，整个 3D 页白屏。
    // TS 挡不住"给数据对象加个箭头属性"，所以这里按 typeof 过一遍 + 整份 JSON 往返相等
    const scene = sceneWith([plateau("p", { height: 2 })]);
    expect(Object.values(scene.terrain).every((v) => typeof v !== "function")).toBe(true);
    // terrain 自己 JSON 往返必须相等：它是要过 server/client 边界的那一份。
    // 只比 terrain 不比整份场景——scene 里有合法的 undefined 可选键（如 modelAssetId），
    // JSON 往返本来就会丢掉那些，那是 JSON 的语义，不是这条要管的
    expect(JSON.parse(JSON.stringify(scene.terrain))).toEqual(scene.terrain);
    // 查询照旧：模块级 terrainHeightAt 收这份纯数据
    expect(terrainHeightAt(scene.terrain, 0, 0)).toBe(2);
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

/**
 * §140 第五片（2026-10-15）：圆锥坡（cone）。钉的四件会骗人的事：
 *  ① 高度沿半径**线性**降到 0（台心 = height，半高在半径一半处，边缘 = 0）——
 *     "坡"必须是能被算术钉住的那一条线性，不是"大概斜一点"；
 *  ② 老文档没有 profile = mesa，投影里补成 'mesa'（渲染层不必写第二套默认）；
 *  ③ 写入端只认 mesa/cone，其余拒收且文档一个字不动；normalize 只写 cone，
 *     不给 mesa 存一栏没人读的默认值；
 *  ④ 契约不剥 profile，坏 profile 进不了库。
 */
describe("圆锥坡（cone）：台心到边缘线性降到 0", () => {
  function sceneWith(plateaus: WorldPlateau[]) {
    return buildWorldScene({ ...doc(), terrain: { kind: "plateaus", plateaus } });
  }

  it("台心 = 高度，半高在半径一半处，边缘与之外 = 0", () => {
    const scene = sceneWith([plateau("hill", { x: 0, y: 0, radius: 10, height: 4, profile: "cone" })]);
    expect(terrainHeightAt(scene.terrain, 0, 0)).toBe(4);
    expect(terrainHeightAt(scene.terrain, 5, 0)).toBe(2); // 线性：d=radius/2 → height/2
    expect(terrainHeightAt(scene.terrain, 2.5, 0)).toBe(3);
    expect(terrainHeightAt(scene.terrain, 10, 0)).toBe(0); // 边缘上就是 0（与半径外一致）
    expect(terrainHeightAt(scene.terrain, 12, 0)).toBe(0);
  });

  it("mesa 与 cone 重叠取最高的那个；mesa 的边缘语义（含进去）不变", () => {
    const scene = sceneWith([
      plateau("mesa", { x: 0, y: 0, radius: 5, height: 2 }), // 缺省剖面 = mesa
      plateau("hill", { x: 0, y: 0, radius: 10, height: 4, profile: "cone" }),
    ]);
    expect(terrainHeightAt(scene.terrain, 0, 0)).toBe(4); // 台心：cone 4 > mesa 2
    expect(terrainHeightAt(scene.terrain, 3, 0)).toBe(2.8); // d=3: cone 4*(1-0.3)=2.8；mesa 2 输了
    expect(terrainHeightAt(scene.terrain, 5, 0)).toBe(2); // mesa 边缘仍算台面；cone 此处只有 2，平
    expect(terrainHeightAt(scene.terrain, 8, 0)).toBe(0.8); // mesa 外、cone 内
  });

  it("老文档（没有 profile）投影里补成 mesa；cone 原样带过去", () => {
    const scene = sceneWith([
      plateau("old"),
      plateau("new", { profile: "cone" }),
    ]);
    expect(scene.terrain.plateaus.map((p) => p.profile)).toEqual(["mesa", "cone"]);
  });

  it("setWorldTerrain 只写 cone：mesa 不往 JSON 里塞默认值", () => {
    const cone = setWorldTerrain(doc(), {
      kind: "plateaus",
      plateaus: [plateau("p", { profile: "cone" })],
    });
    expect(cone.reason).toBeNull();
    expect(cone.document.terrain?.plateaus[0]).toEqual({
      id: "p", x: 0, y: 0, radius: 5, height: 2, profile: "cone",
    });
    const mesa = setWorldTerrain(doc(), { kind: "plateaus", plateaus: [plateau("p")] });
    expect(mesa.reason).toBeNull();
    expect(mesa.document.terrain?.plateaus[0]).not.toHaveProperty("profile");
  });

  it("坏 profile 拒收，文档一个字没动；validateWorld 同一句口径", () => {
    const base = doc();
    const before = JSON.stringify(base);
    const bad = setWorldTerrain(base, {
      kind: "plateaus",
      plateaus: [plateau("p", { profile: "hill" as never })],
    });
    expect(bad.reason).toContain("剖面");
    expect(JSON.stringify(bad.document)).toBe(before);

    const broken = {
      ...base,
      terrain: { kind: "plateaus", plateaus: [plateau("p", { profile: "hill" as never })] },
    } as WorldDocument;
    expect(validateWorld(broken).some((i) => i.code === "bad-terrain" && i.message.includes("剖面"))).toBe(true);
  });

  it("契约：cone 进得了库也读得回来，坏 profile 被挡在门口", () => {
    const world = setWorldTerrain(doc(), {
      kind: "plateaus",
      plateaus: [plateau("p", { profile: "cone" })],
    }).document;
    const parsed = WorldDocumentSchema.safeParse(world);
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.terrain?.plateaus[0]?.profile : null).toBe("cone");
    expect(
      WorldTerrainSchema.safeParse({
        kind: "plateaus",
        plateaus: [plateau("p", { profile: "hill" as never })],
      }).success,
    ).toBe(false);
  });
});
