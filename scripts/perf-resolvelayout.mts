/**
 * §147 模型层基准：纯函数 `resolveLayout` / `resolveLayoutIncremental` 的耗时与相等性。
 *
 * 为什么是模型层而不是浏览器：选中响应 / 属性写入那两扇门（PERFORMANCE.md 第 271 / 516 行）
 * 的瓶颈都在 `resolveLayout`（属性写入占整段 80%+，10k 节点 analyzeHealth 里 94ms），
 * 而它是纯函数——不碰库、不碰 DOM，量出来就是模型层自己的成本，不受本机并发干扰，
 * 也不依赖 Playwright 能不能在这台机器上起 Chromium（dev server 在 dev 模式下数字还虚高 5×）。
 *
 * 用法：`npx tsx scripts/perf-resolvelayout.mts [节点数,...]`（默认 1000,4000,10000）。
 * 不连库、不起浏览器，跑完直接打印每档的 full / incremental 中位数与两者输出是否逐项相等。
 *
 * 这份基线给下一刀用：增量布局今天只保证"相等"（`runLayout` 收到 prevLayout/changed 仍走全量），
 * 真正的复用（"没碰到的分支不重算"）是下一片。那一刀落地后，这里 incremental 应当明显低于 full，
 * 且两者输出仍逐项相等——"相等"是红线，"更快"是证据。
 */
import { performance } from 'node:perf_hooks';
import { starterPage, createNode } from '../packages/design-model/src/nodes';
import { resolveLayout, resolveLayoutIncremental, type ResolvedLayout } from '../packages/design-model/src/layout';
import type { Page } from '../packages/design-model/src/types';

function buildPage(nodeCount: number): Page {
  const page = starterPage('Bench');
  const root = page.nodes[page.rootId]!;
  for (let i = 0; i < nodeCount; i += 1) {
    const node = createNode({ type: 'container', parentId: root.id, name: `n${i}` });
    page.nodes[node.id] = node;
    root.children.push(node.id);
  }
  return page;
}

function timeIt(fn: () => void, runs: number): number {
  fn(); // warmup（JIT 没热的数没有参考价值）
  const start = performance.now();
  for (let i = 0; i < runs; i += 1) fn();
  return (performance.now() - start) / runs;
}

function layoutsEqual(a: ResolvedLayout, b: ResolvedLayout): boolean {
  if (a.rootId !== b.rootId) return false;
  const ids = Object.keys(a.nodes);
  if (ids.length !== Object.keys(b.nodes).length) return false;
  for (const id of ids) {
    const na = a.nodes[id]!;
    const nb = b.nodes[id];
    if (!nb) return false;
    if (na.x !== nb.x || na.y !== nb.y || na.width !== nb.width || na.height !== nb.height || na.depth !== nb.depth) {
      return false;
    }
  }
  return true;
}

const scales = (process.argv[2] ?? '1000,4000,10000')
  .split(',')
  .map((n) => Number.parseInt(n, 10))
  .filter((n) => Number.isFinite(n) && n > 0);
const RUNS = 20;

console.log(`# §147 resolveLayout 模型层基线（runs=${RUNS}，去掉 1 次预热取中位数）`);
for (const n of scales) {
  const page = buildPage(n);
  const full = timeIt(() => resolveLayout(page), RUNS);

  // 增量：以全量结果为 prevLayout，改一个子节点（root 的第 0 个孩子）——今天应当等价于全量
  const prev = resolveLayout(page);
  const changedId = page.nodes[page.rootId]!.children[0]!;
  const inc = timeIt(() => resolveLayoutIncremental(page, { prevLayout: prev, changedNodeIds: new Set([changedId]) }), RUNS);

  const fullResult = resolveLayout(page);
  const incResult = resolveLayoutIncremental(page, { prevLayout: prev, changedNodeIds: new Set([changedId]) });
  const equal = layoutsEqual(fullResult, incResult);

  console.log(
    `nodes=${n.toString().padStart(5)}  full=${full.toFixed(2).padStart(8)}ms  incremental=${inc.toFixed(2).padStart(8)}ms  ` +
      `speedup=${(full / inc).toFixed(2)}x  equal=${equal}`,
  );
}
