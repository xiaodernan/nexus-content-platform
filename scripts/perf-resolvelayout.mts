/**
 * §147 模型层基准：纯函数 `resolveLayout` / `resolveLayoutIncremental` 的耗时与相等性。
 *
 * 为什么是模型层而不是浏览器：选中响应 / 属性写入那两扇门（PERFORMANCE.md 第 271 / 516 行）
 * 的瓶颈都在 `resolveLayout`（属性写入占整段 80%+，10k 节点 analyzeHealth 里 94ms），
 * 而它是纯函数——不碰库、不碰 DOM，量出来就是模型层自己的成本，不受本机并发干扰，
 * 也不依赖 Playwright 能不能在这台机器上起 Chromium（dev server 在 dev 模式下数字还虚高 5×）。
 *
 * 用法：`npx tsx scripts/perf-resolvelayout.mts [场景]` —— 场景省略时跑 flat + deep 两组。
 *   场景可填 `flat` / `deep`，或 `flat,deep`。
 *
 * 这一份基准刻意**复刻 store 的真实调用方式**（apps/web/src/studio/store.ts 的 getLayout）：
 * 全量路用**冷**测量缓存（每次重新量），增量路复用**上一帧的解 + 常驻测量缓存**（store 里
 * `layoutMeasureCache` 跨帧持有）。只有这样增量才会真正"省下计算"——否则全量路也白嫖缓存，
 * 两者就一样快了，benchmark 量不出 §147 的收益。
 *
 * 红线是数：同一口径重跑，incremental 应当明显低于 full，且两者输出仍逐项 equal。
 * "相等"由构造保证（两路共用同一份 measure/place），"更快"是这一刀的证据。
 */
import { performance } from 'node:perf_hooks';
import { starterPage, createNode } from '../packages/design-model/src/nodes';
import {
  resolveLayout,
  resolveLayoutIncremental,
  type ResolvedLayout,
  type MeasureCache,
} from '../packages/design-model/src/layout';
import type { Page } from '../packages/design-model/src/types';

function freshCache(): MeasureCache {
  return { signature: '', entries: new Map() };
}

function buildFlat(nodeCount: number): Page {
  const page = starterPage('Bench');
  const root = page.nodes[page.rootId]!;
  for (let i = 0; i < nodeCount; i += 1) {
    const node = createNode({ type: 'container', parentId: root.id, name: `n${i}` });
    page.nodes[node.id] = node;
    root.children.push(node.id);
  }
  return page;
}

function buildDeep(branching: number, depth: number): Page {
  const page = starterPage('Deep');
  const root = page.nodes[page.rootId]!;
  let frontier: string[] = [root.id];
  for (let d = 0; d < depth; d += 1) {
    const next: string[] = [];
    for (const pid of frontier) {
      const parent = page.nodes[pid]!;
      for (let i = 0; i < branching; i += 1) {
        const node = createNode({ type: 'container', parentId: pid, name: `d${d}_${pid}_${i}` });
        page.nodes[node.id] = node;
        parent.children.push(node.id);
        next.push(node.id);
      }
    }
    frontier = next;
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
    if (
      na.x !== nb.x ||
      na.y !== nb.y ||
      na.width !== nb.width ||
      na.height !== nb.height ||
      na.depth !== nb.depth
    ) {
      return false;
    }
  }
  return true;
}

/** 复用率：incremental 里与 prev 同一对象（reuseSubtree 直接沿用）的节点占比 */
function reuseStats(inc: ResolvedLayout, prev: ResolvedLayout): { reused: number; total: number } {
  let reused = 0;
  let total = 0;
  for (const id of Object.keys(inc.nodes)) {
    total += 1;
    if (inc.nodes[id] === prev.nodes[id]) reused += 1;
  }
  return { reused, total };
}

const RUNS = 20;

function runScenario(label: string, page: Page, changedId: string): void {
  // 全量路：冷缓存（每次重新量，模拟"没有上一帧可复用"）
  const full = timeIt(() => resolveLayout(page, { measureCache: freshCache() }), RUNS);

  // 增量路：常驻缓存（warm）+ 上一帧的解。store 里 `layoutMeasureCache` 正是这么跨帧持有的。
  const warm = freshCache();
  const prev = resolveLayout(page, { measureCache: warm });
  const inc = timeIt(
    () =>
      resolveLayoutIncremental(page, {
        prevLayout: prev,
        changedNodeIds: new Set([changedId]),
        measureCache: warm,
      }),
    RUNS,
  );

  const incResult = resolveLayoutIncremental(page, {
    prevLayout: prev,
    changedNodeIds: new Set([changedId]),
    measureCache: warm,
  });
  const equal = layoutsEqual(prev, incResult);
  const { reused, total } = reuseStats(incResult, prev);

  console.log(
    `${label.padEnd(22)}  full=${full.toFixed(2).padStart(8)}ms  ` +
      `inc=${inc.toFixed(2).padStart(8)}ms  speedup=${(full / inc).toFixed(2)}x  ` +
      `equal=${equal}  reused=${reused}/${total}`,
  );
}

const arg = process.argv[2] ?? 'flat,deep';
const scenarios = arg.split(',').map((s) => s.trim());
console.log(`# §147 resolveLayout 模型层基线（runs=${RUNS}，去掉 1 次预热取中位数）`);
console.log('# 全量=冷缓存重量；增量=常驻缓存+上一帧解（复刻 store.getLayout 真实用法）');
for (const s of scenarios) {
  if (s === 'flat') {
    for (const n of [1000, 4000, 10000]) {
      const page = buildFlat(n);
      const changed = page.nodes[page.rootId]!.children[0]!;
      runScenario(`flat nodes=${n}`, page, changed);
    }
  } else if (s === 'deep') {
    for (const [b, d] of [
      [4, 6],
      [5, 6],
      [4, 7],
    ] as const) {
      const page = buildDeep(b, d);
      const n = Object.keys(page.nodes).length;
      const changed = page.nodes[page.rootId]!.children[0]!;
      runScenario(`deep b=${b} d=${d} (${n})`, page, changed);
    }
  }
}
