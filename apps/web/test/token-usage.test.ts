import { describe, expect, it } from 'vitest';
import { createDocument, createNode, findPage } from '@nexus/design-model';
import type { DesignDocument, DesignNode } from '@nexus/design-model';
import { tokenUsage } from '@/studio/token-usage';

/**
 * `tokenUsage`（§12 设计系统面板的"有多少节点在引用它"）的第一份单测。
 *
 * 这个文件自己的注释写着"**这段算法有语义要钉住**，而组件里那段是算不出单测的"——
 * 语义有两条，一条是**一个节点多次引用同一个 token 只算一次**（面板上写的是"N 处引用"，
 * 指"有 N 个节点在用它"，不是"N 个字段提到过它"），另一条是**只认样式类字段里的绑定**，
 * 不认节点名字或正文里出现的 `{color.primary}`。既然语义已经写清楚了，就该有凭证。
 *
 * 还有一条容易被忽略的：组件那一路是**字符串扫描**（`ComponentDefinition` 不是节点形状，
 * `collectTokenRefs` 收不了它），所以组件里的引用**认**——但它是**每个组件算一次**：
 * 同一个组件里同一个 token 出现在两个字段，仍只算 1（与"一个节点只算一次"同一口径）。
 * （这一条是实测出来的：先按"组件不是节点、所以算两次"写断言，跑出来是 1——
 * 读实现才看清它是**按组件**去重的，不��按字段。）
 *
 * 纯函数：不读库、不碰 DOM。
 */

function docWith(nodes: DesignNode[]): DesignDocument {
  const doc = createDocument('token-usage-probe');
  const page = findPage(doc)!;
  // 模板页（Home）自带一批引用（hero 之类的节点），**先清空**：
  // 这一份测的是"这一次加的引用算几个"，不是"整份文档里一共几个"。
  const root = page.nodes[page.rootId]!;
  page.nodes = { [root.id]: root } as typeof page.nodes;
  root.children = [];
  root.style.fills = [];
  root.style.strokes = [];
  for (const node of nodes) {
    page.nodes[node.id] = node;
    root.children.push(node.id);
  }
  return doc;
}

/** 一个在 style.fills 里引用了 token 的节点 */
function nodeWithFill(token: string): DesignNode {
  const node = createNode({ type: 'frame', name: 'N' });
  node.style.fills = [{ kind: 'solid', color: token }];
  return node;
}

describe('tokenUsage · 节点侧', () => {
  it('样式里引用了一个 token → 那个 token 记 1', () => {
    const doc = docWith([nodeWithFill('{color.primary}')]);
    const usage = tokenUsage(doc);
    expect(usage.get('color.primary')).toBe(1);
  });

  it('同一个节点引用同一个 token 多次 → 仍然只算 1（"N 个节点在用它"）', () => {
    const node = createNode({ type: 'frame', name: 'N' });
    node.style.fills = [{ kind: 'solid', color: '{color.primary}' }];
    node.style.strokes = [{ paints: [{ kind: 'solid', color: '{color.primary}' }], width: 1, position: 'inside' }];
    const doc = docWith([node]);
    expect(tokenUsage(doc).get('color.primary')).toBe(1);
  });

  it('两个节点各引用一次 → 算 2', () => {
    const doc = docWith([nodeWithFill('{color.primary}'), nodeWithFill('{color.primary}')]);
    expect(tokenUsage(doc).get('color.primary')).toBe(2);
  });

  it('节点名里写着 {color.primary} → 不算引用（名字不是样式）', () => {
    const node = createNode({ type: 'frame', name: '{color.primary}' });
    const doc = docWith([node]);
    expect(tokenUsage(doc).get('color.primary')).toBeUndefined();
  });

  it('正文里写着 {color.primary} → 不算引用（正文不是样式）', () => {
    const node = createNode({ type: 'text', name: 'T', text: '这里写着 {color.primary}' });
    const doc = docWith([node]);
    expect(tokenUsage(doc).get('color.primary')).toBeUndefined();
  });

  it('裸色值（#ffffff）不是 token 引用', () => {
    const doc = docWith([nodeWithFill('#ffffff')]);
    expect(tokenUsage(doc).size).toBe(0);
  });

  it('没被任何节点引用的 token 不在表里（表里只有被引用的）', () => {
    const doc = docWith([nodeWithFill('{color.primary}')]);
    const usage = tokenUsage(doc);
    expect(usage.has('color.primary')).toBe(true);
    expect(usage.has('color.secondary')).toBe(false);
  });
});

describe('tokenUsage · 组件侧（字符串扫描那一路）', () => {
  it('组件的 prop 缺省值里引用了 token → 算 1', () => {
    const doc = docWith([]);
    doc.components.push({
      id: 'cmp-1',
      name: '按钮',
      rootId: 'r',
      props: [{ name: 'bg', type: 'color', default: '{color.primary}' }],
      variants: [],
      slots: [],
    });
    expect(tokenUsage(doc).get('color.primary')).toBe(1);
  });

  it('组件里同一个 token 出现在两个字段 → 仍算 1（每个组件只算一次，与"一个节点只算一次"同一口径）', () => {
    const doc = docWith([]);
    doc.components.push({
      id: 'cmp-1',
      name: '按钮',
      rootId: 'r',
      props: [
        { name: 'bg', type: 'color', default: '{color.primary}' },
        { name: 'fg', type: 'color', default: '{color.primary}' },
      ],
      variants: [],
      slots: [],
    });
    expect(tokenUsage(doc).get('color.primary')).toBe(1);
  });

  it('两个组件各引用一次 → 算 2', () => {
    const doc = docWith([]);
    for (const id of ['cmp-1', 'cmp-2']) {
      doc.components.push({
        id,
        name: 'C',
        rootId: 'r',
        props: [{ name: 'bg', type: 'color', default: '{color.primary}' }],
        variants: [],
        slots: [],
      });
    }
    expect(tokenUsage(doc).get('color.primary')).toBe(2);
  });

  it('组件与节点引用同一个 token → 两边各算各的', () => {
    const doc = docWith([nodeWithFill('{color.primary}')]);
    doc.components.push({
      id: 'cmp-1',
      name: '按钮',
      rootId: 'r',
      props: [{ name: 'bg', type: 'color', default: '{color.primary}' }],
      variants: [],
      slots: [],
    });
    expect(tokenUsage(doc).get('color.primary')).toBe(2);
  });
});
