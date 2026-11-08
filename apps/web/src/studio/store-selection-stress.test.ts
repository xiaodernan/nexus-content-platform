import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, createNode, type DesignDocument, type DesignNode } from '@nexus/design-model';
import { studio } from '@/studio/store';

/**
 * §147 #32 选中响应的压力版不变量：无论选中序列多长、怎么切（select / toggle / clear / 再选），
 * 只要没动文档，派生引用（layout / tokens / history / assetContext / document）必须一路守恒。
 *
 * 单步版（store-selection-identity.test.ts）只验了"选一次"。这里验"连续多步乱切"——
 * 因为如果某一步 selection 的提交意外触发了 layoutCache / derivedCache 的 miss
 * （比如 viewport 之类的键被顺带改了），单步测抓不到，长序列会暴露。
 */

function docWith(nodes: DesignNode[]): DesignDocument {
  const base = createDocument('选中压力', 'website');
  const page = base.pages.find((p) => p.id === base.activePageId)!;
  const record: Record<string, DesignNode> = { ...page.nodes };
  for (const node of nodes) record[node.id] = { ...node, parentId: page.rootId };
  return { ...base, pages: base.pages.map((p) => (p.id === page.id ? { ...p, nodes: record } : p)) };
}

function childIds(): string[] {
  const page = studio.getSnapshot().page!;
  return Object.keys(page.nodes).filter((id) => id !== page.rootId);
}

describe('studio 选中响应：长序列选中引用守恒（§147 #32 压力）', () => {
  beforeEach(() => {
    // bootstrap 末尾 fire-and-forget 的 /api/... 刷新在 node 环境里钉成"立刻失败"，走 catch 分支
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    studio.clearSelection();
  });

  it('连续 24 步乱切选中，派生引用全程不动', () => {
    studio.bootstrap(
      docWith(Array.from({ length: 6 }, (_, i) => createNode({ type: 'container', name: `N${i}` }))),
    );
    const ids = childIds();
    const base = studio.getSnapshot();
    const baseLayout = base.layout;
    const baseTokens = base.tokens;
    const baseHistory = base.history;
    const baseAssets = base.assetContext;
    const baseDoc = base.document;

    const ops: Array<() => void> = [
      () => studio.select([ids[0]!]),
      () => studio.select([ids[1]!]),
      () => studio.toggleSelection(ids[2]!),
      () => studio.select([ids[3]!, ids[4]!]),
      () => studio.toggleSelection(ids[3]!),
      () => studio.clearSelection(),
      () => studio.select([ids[5]!]),
      () => studio.select([]),
      () => studio.select([ids[0]!, ids[2]!, ids[4]!]),
      () => studio.toggleSelection(ids[1]!),
      () => studio.select([ids[4]!]),
      () => studio.clearSelection(),
    ];

    for (let i = 0; i < 24; i++) {
      ops[i % ops.length]!();
      const s = studio.getSnapshot();
      expect(s.layout).toBe(baseLayout);
      expect(s.tokens).toBe(baseTokens);
      expect(s.history).toBe(baseHistory);
      expect(s.assetContext).toBe(baseAssets);
      expect(s.document).toBe(baseDoc);
    }
  });
});
