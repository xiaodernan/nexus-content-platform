import { describe, expect, it } from "vitest";
import {
  ENTITY_FOOTPRINT_RADIUS,
  WALKER_RADIUS,
  buildWorldScene,
  resolveWalkCollision,
  walkToward,
  type WalkPosition,
  type WorldDocument,
  type WorldKind,
  type WorldNode,
} from "../src";

/**
 * §140 的走动层：碰撞与点击行走。这里钉的是三件不能说谎的事——
 * 碰撞是真的把人挡在占位外面（不是穿过）、行走是纯函数（同一状态同一步 = 同一结果）、
 * "绕不过大障碍"这个限度是算术本身造成的（停在占位表面，不是静默放弃）。
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

/** 摆好坐标的条目：authored 位置进场景，别让 fallback 环的坐标混进断言 */
function sceneWith(...points: { id: string; x: number; z: number }[]) {
  const nodes = points.map((p) => node(p.id, "items"));
  const positions = Object.fromEntries(points.map((p) => [p.id, { x: p.x, y: p.z }]));
  return buildWorldScene(world({ nodes, positions }));
}

const MIN = ENTITY_FOOTPRINT_RADIUS + WALKER_RADIUS;

describe("resolveWalkCollision", () => {
  it("空场景不改变位置，也没挡你", () => {
    const scene = sceneWith();
    expect(resolveWalkCollision(scene, 3, 4)).toEqual({ x: 3, z: 4, blockedBy: null });
  });

  it("走进占位被推到表面：距离恰好是两半径之和，方向沿被推开的法线", () => {
    const scene = sceneWith({ id: "a", x: 10, z: 0 });
    const result = resolveWalkCollision(scene, 10 + MIN / 2, 0);
    expect(result.blockedBy).toBe("a");
    expect(Math.hypot(result.x - 10, result.z)).toBeCloseTo(MIN, 6);
    expect(result.x).toBeGreaterThan(10); // 从东侧靠近就被推回东侧，不是穿到对面
    expect(result.z).toBeCloseTo(0, 6);
  });

  it("占位外的人一动不动", () => {
    const scene = sceneWith({ id: "a", x: 10, z: 0 });
    expect(resolveWalkCollision(scene, 0, 0)).toEqual({ x: 0, z: 0, blockedBy: null });
  });

  it("站在条目正中心沿 +x 推出——不抛异常也不 NaN", () => {
    const scene = sceneWith({ id: "a", x: 5, z: 5 });
    const result = resolveWalkCollision(scene, 5, 5);
    expect(Number.isNaN(result.x)).toBe(false);
    expect(Number.isNaN(result.z)).toBe(false);
    expect(result.x).toBeCloseTo(5 + MIN, 6);
    expect(result.blockedBy).toBe("a");
  });

  it("两个占位都压着人：逐个解完之后站在这两个圆之外", () => {
    const scene = sceneWith(
      { id: "a", x: 0, z: 0 },
      { id: "b", x: 1.6, z: 0 },
    );
    // 站在两者中间：距 a 和 b 都小于 min
    const result = resolveWalkCollision(scene, 0.8, 0);
    expect(Math.hypot(result.x - 0, result.z)).toBeGreaterThanOrEqual(MIN - 1e-6);
    expect(Math.hypot(result.x - 1.6, result.z)).toBeGreaterThanOrEqual(MIN - 1e-6);
    expect(result.blockedBy).toBe("a"); // 按场景顺序，先记第一个挡路的
  });

  it("同一位置反复解出同一结果（确定性）", () => {
    const scene = sceneWith({ id: "a", x: 2, z: 3 });
    expect(resolveWalkCollision(scene, 2.4, 3.1)).toEqual(resolveWalkCollision(scene, 2.4, 3.1));
  });
});

describe("walkToward（点击行走的一步）", () => {
  it("空地上一步走 step 个单位，不到就是没到", () => {
    const scene = sceneWith();
    const step = walkToward(scene, { x: 0, z: 0 }, { x: 10, z: 0 }, 3);
    expect(step).toEqual({ x: 3, z: 0, blockedBy: null, arrived: false });
    const arrive = walkToward(scene, { x: 8, z: 0 }, { x: 10, z: 0 }, 3);
    expect(arrive).toEqual({ x: 10, z: 0, blockedBy: null, arrived: true });
  });

  it("目标点在占位里（点了条目身上）：停在占位表面并报 arrived", () => {
    const scene = sceneWith({ id: "a", x: 10, z: 0 });
    const result = walkToward(scene, { x: 0, z: 0 }, { x: 10, z: 0 }, 20);
    expect(result.arrived).toBe(true);
    expect(Math.hypot(result.x - 10, result.z)).toBeCloseTo(MIN, 6);
    expect(result.blockedBy).toBe("a");
  });

  it("撞上占位就停在表面：反复走也不会更近——这个限度是算术造成的，可复现", () => {
    const scene = sceneWith({ id: "a", x: 0, z: 6 });
    let at: WalkPosition & { arrived: boolean } = { x: 0, z: -6, blockedBy: null, arrived: false };
    for (let i = 0; i < 60; i += 1) {
      at = walkToward(scene, at, { x: 0, z: 6 }, 1);
      if (at.arrived) break;
    }
    // 直线穿过条目走不到 target：最终停在占位表面，不再前进
    expect(at.arrived).toBe(false);
    expect(Math.hypot(at.x - 0, at.z - 6)).toBeCloseTo(MIN, 6);
  });

  it("不修改传入的坐标对象（纯函数，React 里敢直接用）", () => {
    const scene = sceneWith({ id: "a", x: 0, z: 0 });
    const from = Object.freeze({ x: MIN / 2, z: 0 });
    const target = Object.freeze({ x: 5, z: 5 });
    // 冻结对象上一旦发生写入会抛 TypeError——这条断言钉住"没改输入"
    expect(() => walkToward(scene, from, target, 1)).not.toThrow();
    expect(from.x).toBe(MIN / 2);
  });
});
