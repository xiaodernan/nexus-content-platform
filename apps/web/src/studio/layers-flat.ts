import type { DesignNode } from '@nexus/design-model';

/**
 * 图层树的**展开成一维**：虚拟化要的是"第 i 行是谁"，而树给的是父子关系。
 *
 * 为什么单独一个文件：这一段是 §147 那笔瓶颈的全部逻辑（3999 行 DOM 变成几十行的前提是
 * 先有一维数组），而它不需要 React、不需要 DOM、也不需要 store——纯函数才能把
 * "折叠 / 过滤 / 悬空 childId" 这些规则逐条钉住，而不是靠浏览器里数一眼。
 *
 * 语义与改造前的递归渲染逐字对齐（这是重构，不是改行为）：
 * - 过滤只作用在**顶层**：命中的那一层保留，它底下的子树整份跟着走（原来就是这个形状，
 *   因为"命中节点的祖先链要可见"与"命中节点的孩子不该被凭空吞掉"两条都要成立）；
 * - `collapsed` 只藏子树，父行照旧带 `hasChildren`（箭头还得画成 ▸）；
 * - `children` 里指向不存在节点的 id 被丢掉（历史文档或被删节点的兜底）。
 */

export interface LayerRow {
  node: DesignNode;
  depth: number;
  hasChildren: boolean;
}

export interface LayerTree {
  rootId: string;
  nodes: Record<string, DesignNode>;
}

export function flattenLayers(tree: LayerTree, collapsed: Record<string, boolean>, keep: Set<string> | null): LayerRow[] {
  const root = tree.nodes[tree.rootId];
  if (!root) return [];
  const out: LayerRow[] = [];
  // 显式栈而不是递归：一棵 4000 节点的深树不该靠调用栈撑
  const stack: { node: DesignNode; depth: number }[] = [];
  const pushChildren = (node: DesignNode, depth: number): void => {
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      const child = tree.nodes[node.children[i]!];
      if (child) stack.push({ node: child, depth });
    }
  };
  if (keep) {
    // 过滤时只有顶层条目被筛，命中的那一层往下整份保留
    const tops = root.children.map((id) => tree.nodes[id]).filter((n): n is DesignNode => Boolean(n));
    for (let i = tops.length - 1; i >= 0; i -= 1) stack.push({ node: tops[i]!, depth: 0 });
  } else {
    pushChildren(root, 0);
  }

  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (keep && depth === 0 && !keep.has(node.id)) continue;
    const children = node.children.filter((id) => Boolean(tree.nodes[id]));
    out.push({ node, depth, hasChildren: children.length > 0 });
    if (!collapsed[node.id]) pushChildren(node, depth + 1);
  }
  return out;
}

/**
 * 过滤要保留的集合：命中节点 + 它们每一层的祖先。
 * 与 `flattenLayers` 分开是因为它读的是"哪些节点匹配"，而匹配规则（名字、文本、类型）
 * 属于面板的输入，不该混进树的展开里。
 */
export function keepAncestors(tree: LayerTree, matches: Set<string>): Set<string> {
  const keep = new Set<string>();
  for (const id of matches) {
    let cursor: DesignNode | undefined = tree.nodes[id];
    while (cursor && cursor.id !== tree.rootId) {
      keep.add(cursor.id);
      cursor = cursor.parentId ? tree.nodes[cursor.parentId] : undefined;
    }
  }
  return keep;
}
