import { describe, expect, it } from "vitest";
import {
  buildWorldScene,
  createWorld,
  setWorldNodeModelAsset,
  setWorldNodePosition,
  type WorldDocument,
  type WorldKind,
  type WorldNode,
} from "../src";

/**
 * §34 的 model 类资产挂载：世界条目在 3D 世界里用哪个模型渲染。
 * 钉的是三件事——挂上/摘掉是删键而不是写空串（"没挂"与"挂了空 id"是两种状态）、
 * 空串与非字符串被拒且原因交回调用方、这条写入不碰位置与高程。
 * 场景投影那边（SceneEntity.modelAssetId）由 scene.test.ts 那一侧照看。
 */

function node(id: string, kind: WorldKind): WorldNode {
  return { id, kind, title: id, body: "", updatedAt: "2026-01-01T00:00:00.000Z" };
}

function docWithNode(): WorldDocument {
  const world = createWorld(`w-${Date.now()}`);
  return { ...world, nodes: [...world.nodes, node("n1", "creatures")] };
}

describe("setWorldNodeModelAsset", () => {
  it("挂上：条目带上 modelAssetId，updatedAt 跟着走", () => {
    const world = docWithNode();
    const result = setWorldNodeModelAsset(world, "n1", "asset-123");
    expect(result.reason).toBeNull();
    expect(result.document.nodes.find((n) => n.id === "n1")?.modelAssetId).toBe("asset-123");
    expect(result.document.updatedAt).not.toBe(world.updatedAt);
  });

  it("摘掉（null）是删键：modelAssetId 这个键不在条目上，不是空串", () => {
    let world = docWithNode();
    world = setWorldNodeModelAsset(world, "n1", "asset-123").document;
    const off = setWorldNodeModelAsset(world, "n1", null);
    const target = off.document.nodes.find((n) => n.id === "n1");
    expect(target).not.toBeUndefined();
    expect("modelAssetId" in (target ?? {})).toBe(false);
    // 场景投影那边：没有这个键，条目就还是用类别几何体占位
    const scene = buildWorldScene(off.document);
    expect(scene.entities.find((e) => e.id === "n1")?.modelAssetId).toBeUndefined();
  });

  it("空串与非字符串一律拒，原因交回调用方，文档原样不动", () => {
    const world = docWithNode();
    for (const bad of ["", "   ", 42, undefined] as unknown[]) {
      const result = setWorldNodeModelAsset(world, "n1", bad as string | null);
      expect(result.document).toBe(world);
      expect(result.reason, `输入 ${String(bad)} 竟然被收下了`).toBeTruthy();
    }
  });

  it("不存在的条目：原样返回 + 原因（与其它 setter 同一口径）", () => {
    const world = docWithNode();
    const result = setWorldNodeModelAsset(world, "nope", "asset-1");
    expect(result.document).toBe(world);
    expect(result.reason).toContain("不在世界文档里");
  });

  it("与位置/高程互不干扰：挂模型不会把位置或高度打回去", () => {
    let world = docWithNode();
    world = setWorldNodePosition(world, "n1", { x: 3, y: -2, elevation: 2 });
    const off = setWorldNodeModelAsset(world, "n1", "asset-9").document;
    expect(off.positions?.["n1"]).toEqual({ x: 3, y: -2, elevation: 2 });
    // 场景投影把资产 id 带到实体上：WorldWalk 的 ModelAsset 认的就是这一格
    const scene = buildWorldScene(off);
    expect(scene.entities.find((e) => e.id === "n1")?.modelAssetId).toBe("asset-9");
  });
});
