import { describe, expect, it } from 'vitest';
import { createNode, type DesignNode } from '@nexus/design-model';
import { flattenLayers, keepAncestors, type LayerTree } from '../src/studio/layers-flat';

/**
 * §147 图层面板窗口化的那一半纯逻辑：把树展开成一维。
 *
 * 为什么单独测它而不是只在浏览器里数一眼行数：虚拟化改变的是"渲染多少行"，
 * 而**列表的顺序与内容不许变**——那是唯一能让"改重构"与"改行为"分开的地方。
 * 浏览器里数行数只能证明变少了，证明不了少掉的是该少的那些。
 */

function treeOf(nodes: DesignNode[], rootId: string): LayerTree {
  const map: Record<string, DesignNode> = {};
  for (const n of nodes) map[n.id] = n;
  return { rootId, nodes: map };
}

/** 一棵形状确定的小树：root → [A[a1,a2], B, C[c1]] */
function sample(): LayerTree {
  const root = createNode({ type: 'frame', name: 'Root' });
  const a = createNode({ type: 'section', name: 'A', parentId: root.id });
  const a1 = createNode({ type: 'text', name: 'A1', parentId: a.id });
  const a2 = createNode({ type: 'text', name: 'A2', parentId: a.id });
  const b = createNode({ type: 'text', name: 'B', parentId: root.id });
  const c = createNode({ type: 'container', name: 'C', parentId: root.id });
  const c1 = createNode({ type: 'button', name: 'C1', parentId: c.id });
  root.children = [a.id, b.id, c.id];
  a.children = [a1.id, a2.id];
  c.children = [c1.id];
  return treeOf([root, a, a1, a2, b, c, c1], root.id);
}

const names = (rows: { node: DesignNode }[]) => rows.map((r) => r.node.name);

describe('flattenLayers：展开的顺序与内容', () => {
  it('深度优先、兄弟按 children 的顺序，root 自己不算一行', () => {
    const tree = sample();
    expect(names(flattenLayers(tree, {}, null))).toEqual(['A', 'A1', 'A2', 'B', 'C', 'C1']);
    expect(flattenLayers(tree, {}, null).every((r) => r.node.id !== tree.rootId)).toBe(true);
  });

  it('depth 是缩进层级：顶层 0，孩子的孩子 2', () => {
    const rows = flattenLayers(sample(), {}, null);
    expect(Object.fromEntries(rows.map((r) => [r.node.name, r.depth]))).toEqual({
      A: 0,
      A1: 1,
      A2: 1,
      B: 0,
      C: 0,
      C1: 1,
    });
  });

  it('折叠只藏子树：父行留着、箭头还得画成 ▸', () => {
    const tree = sample();
    const aId = tree.nodes[tree.rootId]!.children[0]!;
    const collapsed = flattenLayers(tree, { [aId]: true }, null);
    expect(names(collapsed)).toEqual(['A', 'B', 'C', 'C1']);
    // 折叠不改 hasChildren：那一行仍要画成可展开的 ▸，否则用户没法把它再打开
    expect(collapsed.find((r) => r.node.id === aId)?.hasChildren).toBe(true);
    // 反向对照：不折叠时 A1/A2 在列表里——上面那条少两行不是因为它们从来没被展开过
    expect(names(flattenLayers(tree, {}, null))).toContain('A1');
  });

  it('悬空的 childId 被丢掉，不崩也不画成空行', () => {
    const tree = sample();
    const aId = tree.nodes[tree.rootId]!.children[0]!;
    tree.nodes[aId]!.children = [...tree.nodes[aId]!.children, 'n_已经不在这份文档里'];
    const rows = flattenLayers(tree, {}, null);
    expect(names(rows)).toEqual(['A', 'A1', 'A2', 'B', 'C', 'C1']);
    expect(rows.find((r) => r.node.id === aId)?.hasChildren).toBe(true);
  });

  it('过滤时只有顶层被筛，命中的那一层往下整份保留（与改造前同一语义）', () => {
    const tree = sample();
    const c1Id = tree.nodes[tree.rootId]!.children[2]!;
    const keep = keepAncestors(tree, new Set([c1Id]));
    expect(names(flattenLayers(tree, {}, keep))).toContain('C');
    // C 自己没命中，但它是命中节点的祖先，所以整行留下、它的子树也跟着留（不是只留一条空行）
    expect(names(flattenLayers(tree, {}, keep))).toEqual(['C', 'C1']);
  });

  it('keepAncestors 收的是"命中点往上到 root 之前"，不把 root 也拉进来', () => {
    const tree = sample();
    const aId = tree.nodes[tree.rootId]!.children[0]!;
    const a1Id = tree.nodes[aId]!.children[0]!;
    const keep = keepAncestors(tree, new Set([a1Id]));
    expect([...keep].sort()).toEqual([a1Id, aId].sort());
    expect(keep.has(tree.rootId)).toBe(false);
    // 深层命中要一路带到顶层，否则搜一个叶子节点会把它的整条祖先链裁没
    expect(names(flattenLayers(tree, {}, keep))).toEqual(['A', 'A1', 'A2']);
  });

  it('1000 层的深链不爆调用栈（显式栈换来的那一条）', () => {
    const nodes: DesignNode[] = [];
    let parent = createNode({ type: 'frame', name: 'Root' });
    nodes.push(parent);
    const rootId = parent.id;
    for (let i = 0; i < 1000; i += 1) {
      const child = createNode({ type: 'container', name: `L${i}`, parentId: parent.id });
      parent.children = [child.id];
      nodes.push(child);
      parent = child;
    }
    const rows = flattenLayers(treeOf(nodes, rootId), {}, null);
    expect(rows).toHaveLength(1000);
    expect(rows[999]?.depth).toBe(999);
  });

  it('4000 节点展开一次是 3999 行——虚拟化裁掉的是渲染，不是这份列表', () => {
    const root = createNode({ type: 'frame', name: 'Root' });
    const nodes: DesignNode[] = [root];
    for (let i = 0; i < 3999; i += 1) {
      const leaf = createNode({ type: 'text', name: `n${i}`, parentId: root.id });
      nodes.push(leaf);
      root.children = [...root.children, leaf.id];
    }
    const rows = flattenLayers(treeOf(nodes, root.id), {}, null);
    expect(rows).toHaveLength(3999);
    // root 自己不是一行，所以 `collapsed[root]` 在这棵树里没有意义：旧实现也从没读过它
    // （折叠状态只挂在渲染出来的那些行上）。这一条断言的是"重构没顺手改这一点"，
    // 而不是"折叠根节点应该清空整页"——后者要做得先给 root 画一行，那是产品决定，不是重构
    expect(flattenLayers(treeOf(nodes, root.id), { [root.id]: true }, null)).toHaveLength(3999);
  });
});
