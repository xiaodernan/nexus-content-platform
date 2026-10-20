import { describe, expect, it } from 'vitest';
import { createDocument, createNode, createPage } from '../src/nodes';
import { resolveLayout, resolveLayoutIncremental, type MeasureCache } from '../src/layout';
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
