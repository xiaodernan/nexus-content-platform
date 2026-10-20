import { describe, expect, it } from 'vitest';
import { createDocument, createNode, createPage } from '../src/nodes';
import { resolveLayout, resolveLayoutIncremental, type MeasureCache } from '../src/layout';
import { TokenStore } from '../src/tokens';
import type { DesignDocument, Page } from '../src/types';

/**
 * §147 的下一格：**跨帧的测量缓存**（ROADMAP #133 之后定下的那格）。
 *
 * 上一格（增量重解）只在"位置没变"时才省下计算，于是**扁平文档**完全没受益：
 * 一万节点全挂 root 时，改一个节点 → 其余 9999 个兄弟**全部移位** → 位置全变 → 沿用不上。
 * 那一格查清之后定的下一格就是这里：**尺寸没变的部分，测量结果可以留着**——
 * 测量（真的去量文字）是布局里最贵的一截，而它跟"位置变没变"无关。
 *
 * 这一份量的不是时间，是**量文字被调了几次**（唯一真正花钱的一步）：
 * ① 扁平一万节点：改一个 → 全量量 9999 次，增量只量 **1 次**；
 * ② 改**内容**的那个节点必须重测（否则会拿回旧尺寸 → "改完字还是旧高度"）；
 * ③ 换了测量参数 → 整份缓存作废（同一个 measureText 换成另一个，量出来的宽度会不同）。
 */
function flatPage(n: number): { document: DesignDocument; page: Page } {
  const document = createDocument(`扁平 ${n}`);
  const page = createPage('Flat');
  document.pages = [page];
  document.activePageId = page.id;
  const root = page.nodes[page.rootId]!;
  for (let i = 1; i < n; i += 1) {
    const node = createNode({ type: 'text', name: `t-${i}`, text: `第 ${i} 行` });
    page.nodes[node.id] = node;
    root.children.push(node.id);
  }
  return { document, page };
}

/** 一个会记账的 measureText：量了几次就是几笔账 */
function countingMeasure(): { fn: never; calls: () => number; reset: () => void } {
  let calls = 0;
  const fn = ((text: string, typography: { fontSize?: number }, width: number | null) => {
    calls += 1;
    const size = typography?.fontSize ?? 16;
    const per = size * 0.6;
    const lines = width ? Math.max(1, Math.ceil((text.length * per) / width)) : 1;
    return { width: Math.min(width ?? Number.POSITIVE_INFINITY, text.length * per), height: lines * size * 1.5 };
  }) as never;
  return { fn, calls: () => calls, reset: () => { calls = 0; } };
}

describe('跨帧的测量缓存：扁平文档也能省下"量文字"', () => {
  it('扁平的一万节点：改一个之后，测量只做 1 次（全量要做 9999 次）', () => {
    const { page } = flatPage(10_000);
    const { fn: measureText, calls, reset } = countingMeasure();
    const cache: MeasureCache = { entries: new Map(), signature: '' };

    // 上一帧
    resolveLayout(page, { measureText, measureCache: cache });
    const before = resolveLayout(page, { measureText, measureCache: cache });
    const afterFirst = calls();
    expect(afterFirst, '第一帧就该把整份量一遍').toBeGreaterThan(9000);

    // 改最浅的一个节点的内容
    const root = page.nodes[page.rootId]!;
    const targetId = root.children[0]!;
    const target = page.nodes[targetId]!;
    page.nodes[targetId] = { ...target, text: '改成另一句话' };

    // 全量：缓存清空（内容可能整体换过）→ 又量一遍
    cache.entries.clear();
    reset();
    const full = resolveLayout(page, { measureText, measureCache: cache });
    const fullCalls = calls();
    expect(fullCalls, '全量要把整份重量一遍').toBeGreaterThan(9000);

    // 增量：同一份缓存（被改到的条目由增量路作废）→ 只量被改的那一个
    reset();
    const incremental = resolveLayoutIncremental(page, {
      prevLayout: before,
      changedNodeIds: new Set([targetId]),
      measureText,
      measureCache: cache,
    });
    const incrementalCalls = calls();
    expect(incrementalCalls, `增量只该量被改的那一个，却量了 ${incrementalCalls} 次`).toBe(1);

    // 而且结果必须与全量**逐项相等**（省下计算不能改变结果）
    expect(incremental.paintOrder).toEqual(full.paintOrder);
    expect(incremental.nodes).toEqual(full.nodes);
  });

  it('被改了内容的那个节点必须重测：沿用旧尺寸就是"改完字还是旧高度"', () => {
    const { page } = flatPage(200);
    const { fn: measureText } = countingMeasure();
    const cache: MeasureCache = { entries: new Map(), signature: '' };
    resolveLayout(page, { measureText, measureCache: cache });
    const before = resolveLayout(page, { measureText, measureCache: cache });

    const root = page.nodes[page.rootId]!;
    const targetId = root.children[0]!;
    const target = page.nodes[targetId]!;
    const longer = 'a'.repeat(200);
    page.nodes[targetId] = { ...target, text: longer };

    const incremental = resolveLayoutIncremental(page, {
      prevLayout: before,
      changedNodeIds: new Set([targetId]),
      measureText,
      measureCache: cache,
    });
    const full = resolveLayout(page, { measureText, measureCache: cache });

    // 改过的那个节点：**宽度**要按新文字算。
    // （高度不该变：这些节点没有宽度约束 → 文字不换行 → 行数还是一行——
    //  断言"高度变了"就是量错了东西，那正是"量一个不存在的现象"。）
    expect(incremental.nodes[targetId]!.width, '被改的节点沿用了旧宽度').not.toBe(
      before.nodes[targetId]!.width,
    );
    expect(incremental.nodes[targetId]!.width).toBe(full.nodes[targetId]!.width);
  });

  it('换了测量参数 → 整份缓存作废（旧的宽度不再可信）', () => {
    const { page } = flatPage(50);
    const first = countingMeasure();
    const cache: MeasureCache = { entries: new Map(), signature: '' };
    resolveLayout(page, { measureText: first.fn, measureCache: cache });
    expect(cache.entries.size, '第一帧之后缓存里应该有东西').toBeGreaterThan(0);

    // 换一个 measureText（量出来的宽度会不同）→ 缓存必须整份作废。
    // 注意比的是**身份**不是源码：两个源码一样的计数器也不是同一个函数，量出来的东西未必一样。
    const second = countingMeasure();
    resolveLayout(page, { measureText: second.fn, measureCache: cache });
    expect(second.calls(), '换了参数还沿用旧缓存 → 那些节点没被重新量').toBeGreaterThan(0);
  });
});

/**
 * 2026-10-21 补的一条真缺口（自己审自己当天写的代码时查出来的）：
 *
 * 缓存的键只看「节点 id + 约束」，而**测量用的字号、间距、字体名都来自 token 解析**
 * （`resolveNum` 与 `fontFamily` 都走 `tokens.resolveValue`）——
 * token 一变而键没变，就会拿回旧尺寸（"改了字号，高度却还是老的"）。
 * 这与"改了节点内容却沿用旧测量"是同一个坑，只是内容不在节点上、在 token 表里。
 *
 * 库自己的注释早就写着"签名包括 tokens"，**实现里却没有** → 契约与实现不符，这一格把它补上。
 */
describe('测量缓存与 token：token 一变，旧尺寸不能沿用', () => {
  /** 一页两个文本节点：第一个的字号来自 token（`{size.body}`），第二个与 token 无关 */
  function tokenPage(): { page: Page; targetId: string; otherId: string } {
    const document = createDocument('token');
    const page = createPage('Token');
    document.pages = [page];
    document.activePageId = page.id;
    const root = page.nodes[page.rootId]!;
    const a = createNode({ type: 'text', name: 'a', text: '第一行', typography: { fontSize: '{size.body}' } });
    const b = createNode({ type: 'text', name: 'b', text: '第二行' });
    page.nodes[a.id] = a;
    page.nodes[b.id] = b;
    root.children.push(a.id, b.id);
    return { page, targetId: a.id, otherId: b.id };
  }

  const sizeToken = (value: number): TokenStore =>
    new TokenStore([{ key: 'size.body', type: 'dimension', value }]);

  it('改了字号 token → 高度必须跟着变（不能拿回旧测量）', () => {
    const { page, targetId } = tokenPage();
    const { fn: measureText } = countingMeasure();
    const cache: MeasureCache = { entries: new Map(), signature: '' };

    const first = resolveLayout(page, { measureText, tokens: sizeToken(16), measureCache: cache });
    const h1 = first.nodes[targetId]!.height;

    // 只改 token，节点一个字都没动
    const second = resolveLayout(page, { measureText, tokens: sizeToken(32), measureCache: cache });
    const h2 = second.nodes[targetId]!.height;

    expect(h2, '字号 16 → 32，高度却没变 → 沿用了旧测量').toBeGreaterThan(h1);
    // 而且必须与全量解算一致（省下计算不能改变结果）
    const full = resolveLayout(page, { measureText, tokens: sizeToken(32) });
    expect(h2).toBe(full.nodes[targetId]!.height);
  });

  it('同一个事务里既改 token 又改别的节点 → 受 token 影响的节点也不能拿旧尺寸', () => {
    const { page, targetId, otherId } = tokenPage();
    const { fn: measureText } = countingMeasure();
    const cache: MeasureCache = { entries: new Map(), signature: '' };

    const before = resolveLayout(page, { measureText, tokens: sizeToken(16), measureCache: cache });
    const h1 = before.nodes[targetId]!.height;

    // 改 token 的同时改了**另一个**节点 → 改动集合里只有那个节点，
    // 增量路因此会沿用缓存：签名若不含 token，这里就会拿回旧高度
    const other = page.nodes[otherId]!;
    page.nodes[otherId] = { ...other, text: '换了一句更长的文字' };

    const incremental = resolveLayoutIncremental(page, {
      prevLayout: before,
      changedNodeIds: new Set([otherId]),
      measureText,
      tokens: sizeToken(32),
      measureCache: cache,
    });
    const full = resolveLayout(page, { measureText, tokens: sizeToken(32) });

    expect(incremental.nodes[targetId]!.height, '受 token 影响的节点沿用了旧高度').toBeGreaterThan(h1);
    expect(incremental.nodes[targetId]!.height).toBe(full.nodes[targetId]!.height);
  });

  it('改与测量无关的颜色 token → 缓存也整份作废（保守但安全：宁可多量一次）', () => {
    const { page } = tokenPage();
    const { fn: measureText, calls, reset } = countingMeasure();
    const cache: MeasureCache = { entries: new Map(), signature: '' };
    resolveLayout(page, { measureText, tokens: sizeToken(16), measureCache: cache });

    reset();
    const withColor = new TokenStore([
      { key: 'size.body', type: 'dimension', value: 16 },
      { key: 'color.brand', type: 'color', value: '#ff0000' },
    ]);
    resolveLayout(page, { measureText, tokens: withColor, measureCache: cache });
    expect(calls(), '换了 token 表还沿用旧缓存 → 那些节点没被重新量').toBeGreaterThan(0);
  });
});
