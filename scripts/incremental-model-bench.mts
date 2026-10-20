/**
 * §147 增量重解的**模型层对照**：同一份文档，同一次改动，量「增量」与「全量」各花多少。
 *
 * 为什么要有这个脚本（浏览器里那支量不出来）：
 * 浏览器里那支（`scripts/perf-browser.mts`）量的 10000 档文档是**扁平的**——一页 10000 个节点全挂 root，
 * 改其中一个 → 其余 9999 个兄弟**全部移位** → 上一帧的 resolved 一个都沿用不上 → 复用率 0。
 * 那个结果**不是增量的错**，是"形状 × 改动位置"决定的；这一份把两种形状都摆出来，
 * 于是"增量在哪种场景有收益"这件事是可重复量的，而不是靠一句推断。
 *
 * 量的不是时间而是**量文字被调了几次**（`measureText` 是布局里唯一真正花钱的一步）——
 * 时间受机器负载影响太大，次数不会。
 *
 * 用法：`npx tsx scripts/incremental-model-bench.mts [节点数]`
 * （默认 10000；要更接近浏览器的口径，看 `measureText` 换成 `heuristicMeasure` 那一档。）
 */
import { performance } from 'node:perf_hooks';
import { createDocument, createNode, createPage } from '../packages/design-model/src/nodes';
import { resolveLayout, resolveLayoutIncremental, type MeasureCache } from '../packages/design-model/src/layout';
import type { DesignDocument, DesignNode, Page } from '../packages/design-model/src/types';

const N = Number.parseInt(process.argv[2] ?? '10000', 10);
const REPEAT = 3;

/** 一棵**扁平**的树：一页 N 个节点全挂 root（这正是 §146 那一档的形状） */
function buildFlat(n: number): DesignDocument {
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
  return document;
}

/** 一棵**深**的树：每层 6~12 个孩子、深 6 层（`scripts/perf-baseline.mts` 的形状） */
function buildDeep(n: number): DesignDocument {
  const document = createDocument(`深树 ${n}`);
  const page = createPage('Deep');
  document.pages = [page];
  document.activePageId = page.id;
  const root = page.nodes[page.rootId]!;
  const queue: Array<{ parent: DesignNode; depth: number }> = [{ parent: root, depth: 0 }];
  let made = 1;
  while (queue.length && made < n) {
    const { parent, depth } = queue.shift()!;
    const children = depth === 0 ? 12 : 6;
    for (let i = 0; i < children && made < n; i += 1) {
      const branch = depth < 6 && i < 4;
      const type = branch ? 'container' : i % 4 === 0 ? 'button' : 'text';
      const node = createNode({
        type,
        name: `${type}-${made}`,
        parentId: parent.id,
        text: type === 'text' || type === 'button' ? '一句话' : undefined,
        size: type === 'button' ? { width: 120, height: 40 } : undefined,
      });
      page.nodes[node.id] = node;
      parent.children.push(node.id);
      made += 1;
      if (branch) queue.push({ parent: node, depth: depth + 1 });
    }
  }
  return document;
}

function firstLeaf(page: Page): DesignNode {
  const walk = (id: string): DesignNode => {
    const node = page.nodes[id]!;
    const child = node.children[0];
    return child ? walk(child) : node;
  };
  return walk(page.rootId);
}

/**
 * 一个会记账的 measureText。
 *
 * 它**故意**比真实测量慢（真实的是 `heuristicMeasure`，一次字符串长度乘算）——
 * 所以这里量出来的"次数差"是**上界**：真实收益比这个数小得多。
 * 浏览器那一档的真实数在 `docs/PERFORMANCE.md`「2026-10-21」那两节（省 25-28%）。
 */
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

function scenario(
  name: string,
  document: DesignDocument,
  target: DesignNode,
): void {
  const page = document.pages[0]!;
  const { fn: measureText, calls, reset } = countingMeasure();
  const cache: MeasureCache = { entries: new Map(), signature: '' };

  // 上一帧
  resolveLayout(page, { measureText, measureCache: cache });
  const before = resolveLayout(page, { measureText, measureCache: cache });

  // 改它的内容（改了内容 → 尺寸要重算）
  page.nodes[target.id] = { ...target, text: '改成另一句话' };

  // 全量：缓存整份作废（内容可能整体换过）
  cache.entries.clear();
  reset();
  const fullTimes: number[] = [];
  for (let i = 0; i < REPEAT; i += 1) {
    cache.entries.clear();
    const started = performance.now();
    resolveLayout(page, { measureText, measureCache: cache });
    fullTimes.push(performance.now() - started);
  }
  const fullCalls = calls();

  // 增量：同一份缓存（被改到的条目由增量路作废）
  reset();
  const incTimes: number[] = [];
  let incCalls = 0;
  for (let i = 0; i < REPEAT; i += 1) {
    reset();
    const started = performance.now();
    resolveLayoutIncremental(page, {
      prevLayout: before,
      changedNodeIds: new Set([target.id]),
      measureText,
      measureCache: cache,
    });
    incTimes.push(performance.now() - started);
    incCalls = calls();
  }

  // 相等性：省下计算不能改变结果
  const full = resolveLayout(page, { measureText, measureCache: cache });
  const inc = resolveLayoutIncremental(page, {
    prevLayout: before,
    changedNodeIds: new Set([target.id]),
    measureText,
    measureCache: cache,
  });
  const same =
    JSON.stringify(full.paintOrder) === JSON.stringify(inc.paintOrder) &&
    JSON.stringify(full.nodes) === JSON.stringify(inc.nodes);

  console.log(`\n${name}`);
  console.log(`  全量：${fullCalls} 次测量，${fullTimes[0]!.toFixed(1)}ms`);
  console.log(`  增量：${incCalls} 次测量，${incTimes[0]!.toFixed(1)}ms`);
  console.log(`  增量/全量相等：${same ? '是' : '**否**'}`);
}

console.log(`§147 增量重解的模型层对照（${N} 个节点）`);
console.log('量的 measureText 故意比真实的慢 → 这里的"次数差"是上界，真实收益见 docs/PERFORMANCE.md');

const flat = buildFlat(N);
scenario(
  '① 扁平（一页 N 个节点全挂 root）· 改最浅的一个节点',
  flat,
  flat.pages[0]!.nodes[flat.pages[0]!.rootId]!.children[0]
    ? flat.pages[0]!.nodes[flat.pages[0]!.nodes[flat.pages[0]!.rootId]!.children[0]!]!
    : flat.pages[0]!.nodes[flat.pages[0]!.rootId]!,
);

const deep = buildDeep(N);
scenario('② 深树（深 6 层）· 改最深的叶子', deep, firstLeaf(deep.pages[0]!));
