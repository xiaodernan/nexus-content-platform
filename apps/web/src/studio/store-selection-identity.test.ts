import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, createNode, type DesignDocument, type DesignNode } from '@nexus/design-model';
import { shallowEqual, studio } from '@/studio/store';

/**
 * §147 #32 选中响应：这一组钉的是"选中**只**改选区时，派生引用必须守恒"。
 *
 * 根因：`commit()` 每次都 `this.snapshot = this.buildSnapshot()`（返回全新对象）→
 * 原 `useStudio()` 让**所有**订阅者把"快照对象变了"当成"我关心的变了"，选区无关的面板
 * （TopBar / StudioShell）也被一次选中拖着重渲染。#32 的两层修复：
 *   1. store 层：`derivedCache`（按文档身份）/ `layoutCache`（按代数）在纯选中帧命中，
 *      复用同一份引用 → `buildSnapshot` 便宜，且 CanvasStage 的 Node memo 比较 `tokens`
 *      / `assets` 时判为"没变"而不重算 nodeStyle；
 *   2. 订阅层：`useStudioSelector` / `useStudioFields` 只取快照里需要的那一小片，
 *      没变就跳过本次重渲染。
 *
 * 这一组测的是第 1 层——它是第 2 层能生效的前提：如果派生引用在选中时仍被换新，
 * Node memo 永远判不等，选路子订阅救不回来。钉住引用守恒，等于钉住了 #32 不退化。
 */

/** 把造好的节点挂到起手文档的活动页上（不经过 Command：这里测的是 store 的提交/缓存语义） */
function docWith(nodes: DesignNode[]): DesignDocument {
  const base = createDocument('选中引用守恒', 'website');
  const page = base.pages.find((p) => p.id === base.activePageId)!;
  const record: Record<string, DesignNode> = { ...page.nodes };
  for (const node of nodes) record[node.id] = { ...node, parentId: page.rootId };
  return { ...base, pages: base.pages.map((p) => (p.id === page.id ? { ...p, nodes: record } : p)) };
}

/** 取活动页上所有非根节点的 id（根节点是画布自身，不选它） */
function childIds(): string[] {
  const page = studio.getSnapshot().page!;
  return Object.keys(page.nodes).filter((id) => id !== page.rootId);
}

describe('studio 选中提交：派生引用守恒（§147 #32）', () => {
  beforeEach(() => {
    // bootstrap 末尾会 fire-and-forget 三个 /api/... 刷新；node 环境里把它们钉成"立刻失败"，
    // 走 catch 分支（列表清空、commit），不真去摸网络，也不挂起。
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    studio.clearSelection();
  });

  it('纯选中提交不 churn layout / tokens / history / assetContext / document 的引用', () => {
    studio.bootstrap(docWith([createNode({ type: 'container', name: 'A' }), createNode({ type: 'container', name: 'B' })]));
    const target = childIds()[0]!;

    const a = studio.getSnapshot();
    const aLayout = a.layout;
    const aTokens = a.tokens;
    const aHistory = a.history;
    const aAssets = a.assetContext;
    const aDoc = a.document;
    const aSelection = a.selection;

    studio.select([target]);
    const b = studio.getSnapshot();

    // 快照对象本身是新的（commit 每次换新对象）——这是全树重渲染的**根因**，已被选路子订阅兜住
    expect(b).not.toBe(a);
    // 但选区无关的派生引用必须守恒：CanvasStage 的 Node memo 靠它们短路重算
    expect(b.layout).toBe(aLayout);
    expect(b.tokens).toBe(aTokens);
    expect(b.history).toBe(aHistory);
    expect(b.assetContext).toBe(aAssets);
    expect(b.document).toBe(aDoc);
    // 只有选区变了（这正是 CanvasStage 手柄层订阅的那一片）
    expect(b.selection).not.toBe(aSelection);
    expect(b.selection).toEqual([target]);
  });

  it('连续选中不同节点仍守恒同一份 layout / derived（无重排、无重算）', () => {
    studio.bootstrap(
      docWith([
        createNode({ type: 'container', name: 'A' }),
        createNode({ type: 'container', name: 'B' }),
        createNode({ type: 'container', name: 'C' }),
      ]),
    );
    const ids = childIds();
    const layout0 = studio.getSnapshot().layout;
    const tokens0 = studio.getSnapshot().tokens;

    studio.select([ids[0]!]);
    expect(studio.getSnapshot().layout).toBe(layout0);
    expect(studio.getSnapshot().tokens).toBe(tokens0);

    studio.select([ids[1]!]);
    expect(studio.getSnapshot().layout).toBe(layout0);
    expect(studio.getSnapshot().tokens).toBe(tokens0);

    // toggle 也只动选区
    studio.toggleSelection(ids[2]!);
    expect(studio.getSnapshot().layout).toBe(layout0);
    expect(studio.getSnapshot().tokens).toBe(tokens0);
  });

  it('换文档后派生引用必须换（缓存按文档身份判据，不会粘住旧引用）', () => {
    // 反面控制：若缓存"从来不换"，上面的"守恒"断言就没有意义。这里证明换文档真的换引用。
    studio.bootstrap(docWith([createNode({ type: 'container', name: 'A' })]));
    const tokensA = studio.getSnapshot().tokens;

    studio.bootstrap(docWith([createNode({ type: 'container', name: 'B' })]));
    const tokensB = studio.getSnapshot().tokens;

    expect(tokensB).not.toBe(tokensA);
  });
});

describe('shallowEqual（useStudioFields 的比对函数）', () => {
  it('同引用短路为相等', () => {
    const o = { a: 1 };
    expect(shallowEqual(o, o)).toBe(true);
  });
  it('同键同原始值相等', () => {
    expect(shallowEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true);
  });
  it('字段值不同不相等', () => {
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
  });
  it('键数不同不相等', () => {
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
  it('数组/对象按引用比（浅层）', () => {
    expect(shallowEqual({ a: [1] }, { a: [1] })).toBe(false);
    const arr = [1];
    expect(shallowEqual({ a: arr }, { a: arr })).toBe(true);
  });
});
