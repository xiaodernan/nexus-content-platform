import { describe, expect, it } from 'vitest';
import { createDocument, createNode, type DesignDocument, type DesignNode } from '@nexus/design-model';
import { tokenUsage } from '@/studio/token-usage';
import { referenceCounts } from '@/studio/AssetsPanel';

/**
 * §147 顺手把两个面板的派生计数从"随节点数线性（或更糟）"降下来，
 * 这里钉的是**语义没被换算法换掉**——性能改动最容易在没人看的地方改掉答案。
 *
 * 两处都挂在 `[document]` 上，也就是每次改动整份重算，所以它们的复杂度是真实开销：
 * token 引用计数原来是 节点数 × token 数 × 字符串长度，资产引用计数原来是 资产数 × 节点数。
 */

/** 把造好的节点挂到起手文档的活动页上（不经过 Command：这里测的是纯派生函数，不是编辑语义） */
function docWith(nodes: DesignNode[]): DesignDocument {
  const base = createDocument('派生计数', 'website');
  const page = base.pages.find((p) => p.id === base.activePageId)!;
  const record: Record<string, DesignNode> = { ...page.nodes };
  for (const node of nodes) record[node.id] = { ...node, parentId: page.rootId };
  return { ...base, pages: base.pages.map((p) => (p.id === page.id ? { ...p, nodes: record } : p)) };
}

describe('tokenUsage（§12 面板的"N 处引用"）', () => {
  it('只算样式类字段里的绑定，一个节点多次引用同一 token 只算一次', () => {
    const plain = docWith([]);
    const before = tokenUsage(plain).get('space.4') ?? 0;
    // 同一个 token 出现在两个字段上：应当只多算 1
    const bound = docWith([
      createNode({ type: 'container', name: '绑定测试', layout: { gap: '{space.4}', padding: { top: '{space.4}', right: 0, bottom: 0, left: 0 } } }),
    ]);
    expect(tokenUsage(bound).get('space.4') ?? 0).toBe(before + 1);
  });

  it('节点名字里出现的 "{color.primary}" 不算引用（与 lint 同一口径，§16）', () => {
    const plain = docWith([]);
    const before = tokenUsage(plain).get('color.primary') ?? 0;
    // 只改名字：把绑定写法放进**名字**里，而不是任何样式字段
    const renamed = docWith([createNode({ type: 'container', name: '这个框叫 {color.primary} 但没绑定它' })]);
    expect(tokenUsage(renamed).get('color.primary') ?? 0).toBe(before);
  });

  it('起手页真的在用的 token 必须出现，否则面板会一直说"未使用"', () => {
    const counts = tokenUsage(docWith([]));
    expect(counts.get('color.primary') ?? 0).toBeGreaterThan(0);
  });

  it('没被引用的 token 不出现在表里（调用方回落到"未使用"）', () => {
    expect(tokenUsage(docWith([])).get('不存在的 token')).toBeUndefined();
  });

  it('空文档不炸，返回空表', () => {
    const empty: DesignDocument = { ...createDocument('空', 'website'), pages: [], components: [] };
    expect(tokenUsage(empty).size).toBe(0);
  });
});

describe('referenceCounts（资产面板的引用数）', () => {
  const imageNode = (assetId: string, times = 1) =>
    createNode({
      type: 'image',
      name: `图 ${assetId}`,
      style: { fills: Array.from({ length: times }, () => ({ kind: 'image' as const, assetId })) },
    });

  it('数的是"有几个节点在引用它"，同一节点里重复出现只算一次', () => {
    expect(referenceCounts(docWith([imageNode('asset-a')])).get('asset-a')).toBe(1);
    // 同一个节点里两个 fill 引用同一资产：仍然只算 1
    expect(referenceCounts(docWith([imageNode('asset-b', 2)])).get('asset-b')).toBe(1);
    // 两个不同节点各引用一次 → 2
    expect(referenceCounts(docWith([imageNode('asset-b'), imageNode('asset-b')])).get('asset-b')).toBe(2);
  });

  it('node.assetId 那一处引用也数（不只是 fills）', () => {
    const node = { ...createNode({ type: 'image', name: '直接挂资产' }), assetId: 'asset-direct' } as DesignNode;
    expect(referenceCounts(docWith([node])).get('asset-direct')).toBe(1);
  });

  it('没人引用的资产不在表里（调用方回落到 0）', () => {
    expect(referenceCounts(docWith([])).get('asset-nowhere')).toBeUndefined();
  });

  it('一遍扫出所有资产的计数，互不干扰', () => {
    const counts = referenceCounts(docWith([imageNode('a1'), imageNode('a2'), imageNode('a2')]));
    expect(counts.get('a1')).toBe(1);
    expect(counts.get('a2')).toBe(2);
  });
});
