import { describe, expect, it } from 'vitest';
import { createDocument, createNode, createPage, type DesignPatch } from '@nexus/design-model';
import {
  hitAtK,
  mean,
  missingPatchReferences,
  rankOfId,
  reciprocalRank,
} from '../src/server/domain/evaluation';

/**
 * §85 评测打分原语的契约。这些函数的输出会写进 docs/EVALUATION.md，
 * 排名错一位、或引用收集漏一类 op，整份评估就整体说谎——所以每一类
 * 补丁 op 的引用收集都要有一只眼睛盯着。
 */

describe('rankOfId / hitAtK / reciprocalRank', () => {
  it('名次从 1 起算，缺席是 0', () => {
    expect(rankOfId('a', ['a', 'b'])).toBe(1);
    expect(rankOfId('b', ['a', 'b'])).toBe(2);
    expect(rankOfId('c', ['a', 'b'])).toBe(0);
  });

  it('hitAtK 的边界：正好第 k 名算命中，第 k+1 名不算', () => {
    expect(hitAtK(5, 5)).toBe(true);
    expect(hitAtK(6, 5)).toBe(false);
    expect(hitAtK(0, 5)).toBe(false);
  });

  it('倒数排名：第 1 名 1 分、第 2 名 0.5、第 4 名 0.25、缺席 0', () => {
    expect(reciprocalRank(1)).toBe(1);
    expect(reciprocalRank(2)).toBe(0.5);
    expect(reciprocalRank(4)).toBe(0.25);
    expect(reciprocalRank(0)).toBe(0);
  });

  it('mean：空输入返回 0 而不是 NaN', () => {
    expect(mean([])).toBe(0);
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('missingPatchReferences（Hallucination 的确定性代理）', () => {
  const doc = createDocument('引用完整性样板', 'website');
  const page = doc.pages[0]!;
  const node = createNode({ type: 'text', name: '标题', parentId: page.rootId, text: '一句话' });
  page.nodes[node.id] = node;
  page.nodes[page.rootId]!.children = [node.id];

  const patch = (ops: DesignPatch['ops']): DesignPatch[] => [{ id: 'p1', ops }];
  // insert op 的 node 必须是完整节点形状——手写 {style:{},layout:{}} 过不了类型门禁
  const withId = (id: string, type: 'text' | 'container') => {
    const fresh = createNode({ type, name: id, parentId: page.rootId });
    fresh.id = id;
    return fresh;
  };

  it('引用存在的节点/页面：无捏造', () => {
    expect(missingPatchReferences(patch([
      { op: 'set', nodeId: node.id, path: 'style.opacity', value: 0.5 },
      { op: 'removePage', pageId: page.id },
    ]), doc)).toEqual([]);
  });

  it('引用不存在的节点：报出来（捏造引用就是幻觉）', () => {
    expect(missingPatchReferences(patch([
      { op: 'set', nodeId: 'node-不存在', path: 'style.opacity', value: 0.5 },
    ]), doc)).toEqual(['node-不存在']);
  });

  it('reparent 的两端都要存在，reorder 的父节点也要存在', () => {
    expect(missingPatchReferences(patch([
      { op: 'reparent', nodeId: node.id, parentId: 'parent-不存在' },
      { op: 'reorder', parentId: 'parent-也不存在', from: 0, to: 1 },
    ]), doc)).toEqual(['parent-不存在', 'parent-也不存在']);
  });

  it('insert 只查 parentId；新建的节点本身不算引用', () => {
    expect(missingPatchReferences(patch([
      { op: 'insert', node: withId('全新节点', 'text'), parentId: page.rootId, index: 0 },
    ]), doc)).toEqual([]);
    expect(missingPatchReferences(patch([
      { op: 'insert', node: withId('全新节点', 'text'), parentId: '父-不存在' },
    ]), doc)).toEqual(['父-不存在']);
  });

  it('本批先建后引（链式插入）：是编排不是幻觉', () => {
    expect(missingPatchReferences(patch([
      { op: 'insert', node: withId('区块', 'container'), parentId: page.rootId },
      { op: 'insert', node: withId('网格', 'container'), parentId: '区块' },
      { op: 'insert', node: withId('卡片', 'text'), parentId: '网格' },
    ]), doc)).toEqual([]);
  });

  it('引用本批后面才建的 id：op 按应用顺序走，照样算捏造', () => {
    expect(missingPatchReferences(patch([
      { op: 'insert', node: withId('先来的', 'text'), parentId: '后面才建' },
      { op: 'insert', node: withId('后面才建', 'container'), parentId: page.rootId },
    ]), doc)).toEqual(['后面才建']);
  });

  it('removeAsset / removeComponent / removePage 的 id 各归各的清单', () => {
    expect(missingPatchReferences(patch([
      { op: 'removeAsset', assetId: 'asset-不存在' },
      { op: 'removeComponent', componentId: 'component-不存在' },
      { op: 'removePage', pageId: 'page-不存在' },
    ]), doc)).toEqual(['asset-不存在', 'component-不存在', 'page-不存在']);
  });

  it('文档级与 token 级 op 不携带引用（addPage 的新页进本批 created）', () => {
    expect(missingPatchReferences(patch([
      { op: 'setToken', key: 'color.primary', value: '#123456' },
      { op: 'setVisualDna', dna: null },
      { op: 'addPage', page: createPage('新页'), setActive: true },
    ]), doc)).toEqual([]);
  });
});
