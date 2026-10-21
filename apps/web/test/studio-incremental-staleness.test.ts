import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, createNode, createPage } from '@nexus/design-model';
import { StudioStore } from '../src/studio/store';

/**
 * §147 增量路的**陈旧内容**这一格。
 *
 * 增量路会沿用上一帧那个对象（`ResolvedNode` **内嵌旧的节点对象**）——
 * 省下计算的做法本身没错，但它成立的前提是"没被登记进改动集合的节点，内容真的没变"。
 * 有两种 op 会破坏这个前提：
 *
 * ① `removeComponent` / `removeAsset`：**扫遍所有页面**去解引用（定义没了，引用它的实例一起解开；
 *    资产下架了，引用它的填充一起剥掉），而那些节点**不在 op 里** → 改动集合算不全；
 * ② `restoreAsset` / `restoreComponent`：op 里**带着**那些节点 → 登记进改动集合就够。
 *
 * 算不全的那一种（本文件第一条用例）只能走全量：算不全就不假装算全。
 */

/** 一份最小现场：一个引用了资产的图片节点 + 一个无关的文本节点 */
function scene(): {
  document: ReturnType<typeof createDocument>;
  pageId: string;
  imageId: string;
  textId: string;
} {
  const document = createDocument('陈旧内容', 'website');
  const page = createPage('Page');
  document.pages = [page];
  document.activePageId = page.id;
  const root = page.nodes[page.rootId]!;
  const image = createNode({ type: 'image', name: '图', size: { width: 200, height: 100 } });
  const text = createNode({ type: 'text', name: '字', text: '一句话' });
  image.style = { ...image.style, fills: [{ kind: 'image', assetId: 'a1' }] };
  page.nodes[image.id] = image;
  page.nodes[text.id] = text;
  root.children.push(image.id, text.id);
  document.assets = [
    {
      id: 'a1',
      name: '一张图',
      kind: 'image',
      storageKey: 'k/a1',
      mimeType: 'image/png',
      createdAt: '2026-10-21T00:00:00.000Z',
    },
  ];
  return { document, pageId: page.id, imageId: image.id, textId: text.id };
}

function hasAssetFill(fills: unknown, assetId: string): boolean {
  if (!Array.isArray(fills)) return false;
  return fills.some(
    (p) => p && typeof p === 'object' && (p as { kind?: string }).kind === 'image' && (p as { assetId?: string }).assetId === assetId,
  );
}

/** bootstrap 会顺手去刷快照/发布/批注：给一个什么都不知道的 fetch，别让它们变成未处理的拒绝 */
function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
      if (url.includes('/snapshots')) return json({ snapshots: [], branches: [] });
      if (url.includes('/publication')) return json({ publication: null });
      return json({});
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('增量路的陈旧内容：内容变了却沿用上一帧那个对象', () => {
  it('删资产（会扫遍所有页面解引用）+ 同一批里改别的节点 → 画布不能还画着已删资产', () => {
    stubFetch();
    const { document, imageId, textId } = scene();
    const studio = new StudioStore();
    studio.bootstrap(document);

    // 同一批里两刀：删资产（隐式动所有引用它的节点）+ 改一个**无关**节点的属性
    studio.execute('删资产并改文字', [
      { op: 'removeAsset', assetId: 'a1' },
      { op: 'set', nodeId: textId, path: 'name', value: '改了名字' },
    ]);

    const snapshot = studio.getSnapshot();
    // 模型那份是真值：资产确实已经解开了
    expect(
      hasAssetFill(snapshot.page?.nodes[imageId]?.style.fills, 'a1'),
      '模型里这个节点已经不该再引用已删的资产（否则是补丁没生效，不是布局陈旧）',
    ).toBe(false);
    // 布局那份必须与模型一致：增量路沿用旧对象时，画布会还画着已删资产
    const laid = snapshot.layout?.nodes[imageId]?.node;
    expect(
      hasAssetFill(laid?.style.fills, 'a1'),
      '画布上还画着已删资产的填充 → 增量路沿用了上一帧那个对象（内嵌旧节点）',
    ).toBe(false);
  });

  it('撤销式地"放回资产"（op 里带着那些节点）→ 画布要跟着回来', () => {
    stubFetch();
    const { document, pageId, imageId, textId } = scene();
    const studio = new StudioStore();
    studio.bootstrap(document);

    // 先单独删掉（这一批的改动集合是空的 → 走全量 → 布局是对的）
    studio.execute('删资产', [{ op: 'removeAsset', assetId: 'a1' }]);
    expect(
      hasAssetFill(studio.getSnapshot().layout?.nodes[imageId]?.node?.style.fills, 'a1'),
      '删完之后画布上不该还有这张资产',
    ).toBe(false);

    // 再"放回来"：op 里**带着**那个节点 → 它必须进改动集合，否则增量路会沿用旧对象
    studio.execute('放回资产并改文字', [
      {
        op: 'restoreAsset',
        asset: {
          id: 'a1',
          name: '一张图',
          kind: 'image',
          storageKey: 'k/a1',
          mimeType: 'image/png',
          createdAt: '2026-10-21T00:00:00.000Z',
        },
        paints: [{ pageId, nodeId: imageId, fills: [{ kind: 'image', assetId: 'a1' }] }],
        nodes: [{ pageId, nodeId: imageId, assetId: 'a1' }],
      },
      { op: 'set', nodeId: textId, path: 'name', value: '改了名字' },
    ]);

    expect(
      hasAssetFill(studio.getSnapshot().layout?.nodes[imageId]?.node?.style.fills, 'a1'),
      '资产放回来了，画布上却没有 → 那个节点没进改动集合，增量路沿用了旧对象',
    ).toBe(true);
  });
});
