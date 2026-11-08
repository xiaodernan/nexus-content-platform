import type { ResolvedLayout } from "./layout";

/**
 * §146/§147 的画布虚拟化：文档大了以后不再把整页节点塞进 DOM。
 *
 * 为什么要一个"阈值"而不是无条件裁剪：小文档全量渲染本来就不慢，
 * 而 DOM 里有没有一个节点是**可观察行为**（选中、读屏、自动化测试都靠它）。
 * 只有到了"不裁就掉帧"的规模才改变这个行为，并且改变是看得见、可断言的：
 * 画布上会显示"按视口裁剪：显示 N / M"。
 *
 * 保留根框是有意的：根框就是页面背景，裁掉它会让"页面本身"在视口外时整块消失。
 */

export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 低于这个节点数不裁剪：那点儿 DOM 不值得改变可观察行为 */
export const CANVAS_VIRTUALIZATION_THRESHOLD = 400;

/** 视口外扩一圈再裁：滚动与拖拽时不该在边缘看到"元素凭空长出来" */
export const VIEWPORT_CULL_MARGIN = 256;

export interface VisibilityResult {
  ids: string[];
  /** 被裁掉的数量（0 表示没裁） */
  culled: number;
  virtualized: boolean;
}

function intersects(box: { x: number; y: number; width: number; height: number }, view: ViewportRect): boolean {
  return (
    box.x <= view.x + view.width &&
    box.x + box.width >= view.x &&
    box.y <= view.y + view.height &&
    box.y + box.height >= view.y
  );
}

export function visiblePaintOrder(
  layout: ResolvedLayout,
  viewport: ViewportRect,
  options?: { threshold?: number; margin?: number },
): VisibilityResult {
  const threshold = options?.threshold ?? CANVAS_VIRTUALIZATION_THRESHOLD;
  const margin = options?.margin ?? VIEWPORT_CULL_MARGIN;
  const total = layout.paintOrder.length;

  if (total <= threshold || viewport.width <= 0 || viewport.height <= 0) {
    // 视口还没量到（首帧、隐藏标签页）时**不裁**：宁可多画，也不要画出一片空白让人以为文档坏了
    return { ids: layout.paintOrder, culled: 0, virtualized: false };
  }

  const view: ViewportRect = {
    x: viewport.x - margin,
    y: viewport.y - margin,
    width: viewport.width + margin * 2,
    height: viewport.height + margin * 2,
  };
  const ids = layout.paintOrder.filter((id) => {
    if (id === layout.rootId) return true;
    const node = layout.nodes[id];
    return node ? intersects(node, view) : false;
  });
  return { ids, culled: total - ids.length, virtualized: true };
}
