import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, createNode, createPage, type DesignStore } from '@nexus/design-model';
import { StudioStore } from '../src/studio/store';

/**
 * layoutCache 的回归钉（§147 选中响应；2026-10-23 给 `77404ed` 收尾）。
 *
 * 缓存里那份解的命中判据是"同一把 key（revision｜代数｜页｜视口｜模式）+ 同一个文档对象"。
 * 几样条件各守一种帧，缺一样都会把**错的**布局交出去：
 *
 * - **只改选区**（revision 不跳、文档不动）：必须命中——命中才谈得上"选中不重算布局"；
 * - **事务内半程提交**（`applyWithinTransaction` 换掉文档对象，revision 与代数都不跳）：
 *   必须**不**命中——键一字不差而文档变了，交出上一帧那份解就是画旧内容。
 *   `derivedCache` 用身份判据防的是同一件事（过期 token 表，见那里的注释）；
 * - **换视口**：键里的视口变了 → 必须不命中——design 档的解不能当平板档的交出去。
 *
 * 第二条就是 `77404ed` 砍掉的那个判据（`doc === document`）。它当时把命中条件换成
 * "key + 代数"，想修的是"增量路没跑过"——但那是 `resolveFor` 下面 `prev` 基准的事
 * （`9dfe8b2` 已修，钉子在同目录 `studio-incremental-layout.test.ts`），与 early-return
 * 这一行不是同一处；这一行真正守的是"键相同 ≠ 同一帧文档"。
 */

/** 横向一行两个孩子：改一个不影响另一个的几何（增量复用的最小现场） */
function scene(name: string): {
  document: ReturnType<typeof createDocument>;
  pageId: string;
  aId: string;
  bId: string;
} {
  const document = createDocument(name, 'website');
  const page = createPage('Page');
  document.pages = [page];
  document.activePageId = page.id;
  const root = page.nodes[page.rootId]!;
  const a = createNode({ type: 'text', name: 'a', text: '甲' });
  const b = createNode({ type: 'text', name: 'b', text: '乙' });
  page.nodes[a.id] = a;
  page.nodes[b.id] = b;
  root.children.push(a.id, b.id);
  return { document, pageId: page.id, aId: a.id, bId: b.id };
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

describe('layoutCache：命中判据的三种帧', () => {
  it('只改选区：layout / tokens 原样复用（缓存命中，不重算）', () => {
    stubFetch();
    const { document, aId } = scene('选中');
    const store = new StudioStore();
    store.bootstrap(document);

    const first = store.getSnapshot();
    expect(first.layout).not.toBeNull();

    store.select([aId]);
    const afterSelect = store.getSnapshot();
    expect(
      afterSelect.layout,
      '选中这一帧重算了布局 → §147 的常数级开销没守住（early-return 没命中）',
    ).toBe(first.layout);
    expect(afterSelect.tokens, 'token 表只随文档变，选中不动文档').toBe(first.tokens);

    // 再选一次（同样的 id）：每一次纯选中提交都该命中，不是只有第一帧碰巧
    store.select([aId]);
    expect(store.getSnapshot().layout, '第二次纯选中提交同样该命中').toBe(first.layout);
  });

  it('事务内文档变了而键没变（半程提交）：不能把上一帧的布局交出去', () => {
    stubFetch();
    const { document, pageId, bId } = scene('半程提交');
    const store = new StudioStore();
    store.bootstrap(document);
    expect(store.getSnapshot().layout!.nodes[bId]!.node.text).toBe('乙');

    // AI 事务的中段：applyWithinTransaction 换掉文档对象，但 revision 与代数都不跳
    // （commands.ts 里只有 commitTransaction 才跳）→ 这一帧的缓存键与上一帧一字不差。
    const design = (store as unknown as { design: DesignStore }).design;
    design.beginTransaction({ label: 'AI 一批', source: 'ai', patches: [] });
    design.applyWithinTransaction({
      pageId,
      ops: [{ op: 'set', nodeId: bId, path: 'text', value: '甲乙丙' }],
    });
    store.select([bId]); // 半程上来的任何一次提交都会 buildSnapshot（选中也会）

    const mid = store.getSnapshot();
    expect(
      mid.page!.nodes[bId]!.text,
      '模型层这一刀要生效（否则不是布局陈旧，是补丁没打上）',
    ).toBe('甲乙丙');
    expect(
      mid.layout!.nodes[bId]!.node.text,
      '布局里嵌的还是旧节点 → 缓存把上一帧那份解交了出去（键相同但文档已经变了）',
    ).toBe('甲乙丙');

    design.abortTransaction(); // 收尾：别把半开的事务留给后面的帧
  });

  it('换视口：键里的视口变了 → 布局重算，token 表照旧复用', () => {
    stubFetch();
    const { document } = scene('视口');
    const store = new StudioStore();
    store.bootstrap(document);
    const before = store.getSnapshot();

    store.setViewport('tablet');
    const after = store.getSnapshot();
    expect(
      after.layout,
      'design 档的解不能当平板档交出去（键里的视口变了就该重算）',
    ).not.toBe(before.layout);
    expect(after.tokens, '文档没动：token 表照旧复用').toBe(before.tokens);
  });
});
