/**
 * §147 路径选档的**模型层依据**——不是浏览器断（`worker is slower` 不是本脚本能检出的），
 * 而是回答「为什么」那半边：要证明的不是「哪个更快」，而是「`structuredClone` 与
 * `runHealthJob` 各自花了多少，clone 占大头时同步路就没被它抹掉」。`worker` / `sync` 的真实
 * 对决在浏览器里（Playwright `scripts/perf-browser.mts`）才看得到，本脚本只负责把
 * 「克隆这一步到底贵不贵」摆在桌面上——这一步不成立，任何「worker 输在 IPC」的解说都是推断。
 *
 * 用法：`npx tsx scripts/perf-health-crossover.mts [节点数] [重复次数]`
 */
import { performance } from 'node:perf_hooks';
import { createDocument, createNode, createPage } from '../packages/creative-model/src/nodes';
import { runHealthJob } from '../apps/web/src/lib/health-job';
import type { DesignDocument } from '../packages/creative-model/src/types';

const N = Number.parseInt(process.argv[2] ?? '1000', 10);
const REPEAT = Number.parseInt(process.argv[3] ?? '5', 10);

function buildFlat(n: number): DesignDocument {
  const document = createDocument(`健康 ${n}`);
  const page = createPage('Health');
  document.pages = [page];
  document.activePageId = page.id;
  const root = page.nodes[page.rootId]!;
  for (let i = 1; i < n; i += 1) {
    const node = createNode({ type: 'text', name: `t-${i}`, text: `健康 ${i}` });
    page.nodes[node.id] = node;
    root.children.push(node.id);
  }
  return document;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function timeIt(label: string, fn: () => void, rounds = REPEAT): { median: number; all: number[] } {
  fn(); // warmup
  const all: number[] = [];
  for (let i = 0; i < rounds; i += 1) {
    const start = performance.now();
    fn();
    all.push(performance.now() - start);
  }
  console.log(`${label}: ${all.map((ms) => ms.toFixed(2)).join(' / ')} ms（中位 ${median(all).toFixed(2)}）`);
  return { median: median(all), all };
}

const document = buildFlat(N);
const nodes = Object.keys(document.pages[0]!.nodes).length;
console.log('# §147 体检作业的模型层开销（100% 内存、同形状）');
console.log(`# 节点数 = ${nodes}`);

const cloneTime = timeIt('structuredClone（document）', () => structuredClone(document));
const
  computeTime = timeIt('runHealthJob（detached structuredClone 形状）', () => {
    const clone = structuredClone(document);
    runHealthJob({ document: clone });
  });
// 真正的 worker 路径里克隆数 = 2（文档进 worker、报告出 worker）；本脚本只量输入这一半
console.log(`# 输入克隆占作业大头的约 ${((cloneTime.median / computeTime.median) * 100).toFixed(0)}%——这个数直接决定"worker 输在克隆"是否成立`);
console.log(`# worker 报告出 worker 那一半未量到（报告 ~ KB 级，不会是大头，记 notMeasured）`);
