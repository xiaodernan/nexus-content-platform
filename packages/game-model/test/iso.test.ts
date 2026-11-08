import { describe, expect, it } from "vitest";
import { ARENA, ISO_MARGIN, ISO_VIEW_NOTES, isoDepth, isoGroundRadius, isoProject, isoView } from "../src/index";

/**
 * §51 的 2.5D：等轴测只是同一份关卡计划到屏幕的另一种映射。
 *
 * 这里钉的全是"换画法会不会顺手改掉事实"：四角必须还落在同一块画布里（不是另开一个世界）、
 * 不同世界点不许撞到同一个屏幕点（否则看起来像两个东西站在一起）、
 * 远近只决定绘制顺序（`isoDepth` 与屏幕 y 同序），以及比例是 2:1 这件肉眼分不清的事。
 */

describe("等轴测投影（2.5D）", () => {
  it("确定，且是 2:1——同一块场地算两次一模一样", () => {
    const a = isoView();
    const b = isoView();
    expect(a).toEqual(b);
    expect(a.sy).toBe(a.sx / 2);
    expect(isoView({ width: 800, height: 400 }).sy).toBe(isoView({ width: 800, height: 400 }).sx / 2);
  });

  it("场地的四个角落投影后都在画布内（含边距），并且互不重合", () => {
    const view = isoView();
    const corners = [
      isoProject(view, 0, 0),
      isoProject(view, ARENA.width, 0),
      isoProject(view, ARENA.width, ARENA.height),
      isoProject(view, 0, ARENA.height),
    ];
    for (const corner of corners) {
      expect(corner.x).toBeGreaterThanOrEqual(ISO_MARGIN);
      expect(corner.x).toBeLessThanOrEqual(ARENA.width - ISO_MARGIN);
      expect(corner.y).toBeGreaterThanOrEqual(ISO_MARGIN);
      expect(corner.y).toBeLessThanOrEqual(ARENA.height - ISO_MARGIN);
    }
    expect(new Set(corners.map((c) => `${c.x},${c.y}`)).size).toBe(4);
  });

  it("方向是等轴测的：+x 往右下、+y 往左下（俯视图里 y 只是往下）", () => {
    const view = isoView();
    const origin = isoProject(view, 600, 380);
    const right = isoProject(view, 700, 380);
    const down = isoProject(view, 600, 480);
    expect(right.x).toBeGreaterThan(origin.x);
    expect(right.y).toBeGreaterThan(origin.y);
    expect(down.x).toBeLessThan(origin.x);
    expect(down.y).toBeGreaterThan(origin.y);
  });

  it("单射：网格上不同的世界点不会落到同一个屏幕点", () => {
    const view = isoView();
    const seen = new Set<string>();
    let count = 0;
    for (let x = 0; x <= ARENA.width; x += 50) {
      for (let y = 0; y <= ARENA.height; y += 50) {
        const p = isoProject(view, x, y);
        seen.add(`${p.x.toFixed(8)},${p.y.toFixed(8)}`);
        count += 1;
      }
    }
    expect(seen.size).toBe(count);
  });

  it("远近只决定绘制顺序：isoDepth 越大，投影后的屏幕 y 越靠下", () => {
    const view = isoView();
    const far = isoProject(view, 100, 100);
    const near = isoProject(view, 900, 500);
    expect(isoDepth(100, 100)).toBeLessThan(isoDepth(900, 500));
    expect(far.y).toBeLessThan(near.y);
    // 同一个 x+y 上的两点深度相同——排序在这一层没有更细的次序，界面必须自己稳定
    expect(isoDepth(300, 0)).toBe(isoDepth(150, 150));
  });

  it("地面椭圆：横向是纵向的两倍（同一个 2:1），并随半径线性放大", () => {
    const view = isoView();
    const small = isoGroundRadius(view, 16);
    const large = isoGroundRadius(view, 32);
    expect(small.rx).toBeGreaterThan(0);
    expect(small.ry).toBeCloseTo(small.rx / 2, 10);
    expect(large.rx).toBeCloseTo(small.rx * 2, 10);
    expect(large.ry).toBeCloseTo(small.ry * 2, 10);
  });

  it("限度三条都在：不换规则、不引入碰撞、不冒充 3D", () => {
    expect(ISO_VIEW_NOTES.length).toBeGreaterThanOrEqual(3);
    expect(ISO_VIEW_NOTES.join("\n")).toContain("同一个 step");
    expect(ISO_VIEW_NOTES.join("\n")).toContain("不参与碰撞");
    expect(ISO_VIEW_NOTES.join("\n")).toContain("不是 3D 模型");
  });
});
