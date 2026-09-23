import { describe, expect, it } from "vitest";
import {
  CANVAS_VIRTUALIZATION_THRESHOLD,
  VIEWPORT_CULL_MARGIN,
  createDocument,
  createNode,
  resolveLayout,
  visiblePaintOrder,
  type ResolvedLayout,
} from "../src";

/**
 * §146/§147 的视口裁剪。测的是"什么时候才允许改变 DOM 里有没有这个节点"，
 * 因为这四项每一条都对应一种会让用户误判的失败：
 * 小文档被无谓裁剪 → 自动化测试与读屏少元素；视口没量到就裁 → 首帧一片空白；
 * 根框被裁 → 页面背景消失。
 */

function layoutWithNodes(count: number): ResolvedLayout {
  const document = createDocument("裁剪测试");
  const page = document.pages[0]!;
  const root = page.nodes[page.rootId]!;
  for (let i = 0; i < count; i += 1) {
    const node = createNode({ type: "text", name: `N${i}`, text: `T${i}`, parentId: root.id });
    // 竖着排开：每个节点占一行，视口只盖得住前面几行
    node.position = { x: 0, y: i * 30 };
    page.nodes[node.id] = node;
    root.children.push(node.id);
  }
  return resolveLayout(page, {});
}

const viewport = { x: 0, y: 0, width: 1440, height: 900 };

describe("visiblePaintOrder", () => {
  it("小文档不裁：DOM 行为不因几个节点而改变", () => {
    const layout = layoutWithNodes(40);
    const result = visiblePaintOrder(layout, viewport);
    expect(result.virtualized).toBe(false);
    expect(result.culled).toBe(0);
    expect(result.ids).toEqual(layout.paintOrder);
  });

  it("过了阈值才裁，并且始终留着根框", () => {
    const layout = layoutWithNodes(CANVAS_VIRTUALIZATION_THRESHOLD + 60);
    const result = visiblePaintOrder(layout, viewport);
    expect(result.virtualized).toBe(true);
    expect(result.ids.length).toBeLessThan(layout.paintOrder.length);
    expect(result.culled).toBe(layout.paintOrder.length - result.ids.length);
    expect(result.ids).toContain(layout.rootId);
  });

  it("视口外但在一圈余量内的仍然画：滚动边缘不该看到元素凭空长出来", () => {
    const layout = layoutWithNodes(CANVAS_VIRTUALIZATION_THRESHOLD + 60);
    const tight = visiblePaintOrder(layout, viewport, { margin: 0 });
    const withMargin = visiblePaintOrder(layout, viewport, { margin: VIEWPORT_CULL_MARGIN });
    expect(withMargin.ids.length).toBeGreaterThan(tight.ids.length);
  });

  it("视口还没量到（首帧、隐藏标签页）时不裁，宁可多画也不给一片空白", () => {
    const layout = layoutWithNodes(CANVAS_VIRTUALIZATION_THRESHOLD + 60);
    const result = visiblePaintOrder(layout, { x: 0, y: 0, width: 0, height: 0 });
    expect(result.virtualized).toBe(false);
    expect(result.ids).toEqual(layout.paintOrder);
  });

  it("paintOrder 里指向不存在的节点：丢掉而不是抛", () => {
    const layout = layoutWithNodes(CANVAS_VIRTUALIZATION_THRESHOLD + 60);
    const broken: ResolvedLayout = { ...layout, paintOrder: [...layout.paintOrder, "ghost_node"] };
    const result = visiblePaintOrder(broken, viewport);
    expect(result.ids).not.toContain("ghost_node");
    expect(result.virtualized).toBe(true);
  });

  it("顺序保持绘制次序：裁剪不能把叠放关系打乱", () => {
    const layout = layoutWithNodes(CANVAS_VIRTUALIZATION_THRESHOLD + 60);
    const result = visiblePaintOrder(layout, viewport);
    const original = layout.paintOrder.filter((id) => result.ids.includes(id));
    expect(result.ids).toEqual(original);
  });
});
