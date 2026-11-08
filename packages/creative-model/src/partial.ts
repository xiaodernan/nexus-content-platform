import type { DesignNode } from './types';
import { visiblePaintOrder, type ViewportRect } from './viewport';
import type { ResolvedLayout } from './layout';

/**
 * 首屏投影：**几何全给，内容只给视口内那些**（§147 的下一片）。
 *
 * ⚠️ **它现在没有接线**（2026-10-21，ADR-0051）：**客户端自己算布局**
 * （`apps/web/src/studio/store.ts` 调 `resolveLayout`）⇒ 要算全图几何就得持有全量节点
 * ⇒ "首屏只给视口内内容"与"编辑即时"**不相容** ⇒ 那条路已判决不做，改做**流式首屏**。
 * **所以这一份是能力，不是已交付的功能**（§159：不拿"有代码"当"做完了"）。
 * 它将来的用处：① 流式首屏的第一块（视口内那份内容）② 预览/公开页/变体看板
 * 算"只有视口内"的那一份几何（省 CPU，不改首屏）。
 *
 * 为什么是这个形状（2026-10-21 量过的）：
 * - 首屏那 1.3 秒里，两段大头（**RSC 序列化 ~700-900ms** 与**浏览器 ~800-950ms**）
 *   **都随文档大小走** ⇒ 解法是"首屏别带整份文档"；
 * - 而画布是**虚拟化**的（`visiblePaintOrder` 的判据是**纯几何**的：
 *   视口 + 256px 外扩与包围盒相交）⇒ **画布真正要画的就只有视口内那几十个节点**
 *   （10000 档那一档：视口内 54 个，裁掉 9946 个）；
 * - 于是：**几何**（画全图的位置与尺寸，与内容无关）**全给**，
 *   **内容**（style/typography/text/fills —— 画一个节点要"长什么样"全在里面）**只给视口内**。
 *
 * 几何用**数组**编码（`[x, y, w, h, depth, parentId, children]`）：
 * 对象编码是 1474KB，数组编码 ~780KB（省掉每个字段的 key）——
 * 首屏载荷因此从 **9.37MB 降到 938KB（10.2× 小）**。
 *
 * **这一份只是投影，不改任何现有行为**：
 * 客户端怎么用它（首屏用投影、滚动时按需补内容）是下一片的事。
 */

/** 一个节点的几何（数组编码）：`[x, y, width, height, depth, parentId, children]` */
export type NodeGeometry = [number, number, number, number, number, string | null, string[]];

export interface PartialDocumentProjection {
  rootId: string;
  width: number;
  height: number;
  /** 绘制次序（与全量解一致） */
  paintOrder: string[];
  /** 节点 id → 几何 */
  geometry: Record<string, NodeGeometry>;
  /** 节点 id → 完整节点（**只有视口内的那些**，外加根节点） */
  content: Record<string, DesignNode>;
}

export interface ProjectionOptions {
  /** 视口外扩（与画布裁剪同一口径，默认取画布那个 256px） */
  margin?: number;
  /** 低于这个数不裁（与画布同一口径） */
  threshold?: number;
}

/**
 * 把一份全量布局投影成"首屏那一档"。
 *
 * **根节点永远在内容里**（它是画布的容器，没有它就没有画布）✓
 */
export function projectViewport(
  layout: ResolvedLayout,
  viewport: ViewportRect,
  options: ProjectionOptions = {},
): PartialDocumentProjection {
  const visible = visiblePaintOrder(layout, viewport, {
    margin: options.margin,
    threshold: options.threshold,
  });

  const geometry: Record<string, NodeGeometry> = {};
  const content: Record<string, DesignNode> = {};
  for (const id of Object.keys(layout.nodes)) {
    const node = layout.nodes[id]!;
    geometry[id] = [node.x, node.y, node.width, node.height, node.depth, node.parentId, node.children];
  }
  for (const id of visible.ids) {
    const node = layout.nodes[id];
    if (node) content[id] = node.node;
  }
  // 根节点是画布的容器：没有内容就没有画布 ⇒ 它永远在（内容也要有，样式要画）
  const root = layout.nodes[layout.rootId];
  if (root) content[layout.rootId] = root.node;

  return {
    rootId: layout.rootId,
    width: layout.width,
    height: layout.height,
    paintOrder: layout.paintOrder,
    geometry,
    content,
  };
}

/**
 * 把数组编码的几何**解回**对象形状（客户端要用它算命中测试与画框）。
 * 可逆是契约：编码只是省字节，不是换语义（§16：投影与真值逐项对得上）。
 */
export function geometryToBox(geometry: NodeGeometry): {
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  parentId: string | null;
  children: string[];
} {
  return {
    x: geometry[0],
    y: geometry[1],
    width: geometry[2],
    height: geometry[3],
    depth: geometry[4],
    parentId: geometry[5],
    children: geometry[6],
  };
}
