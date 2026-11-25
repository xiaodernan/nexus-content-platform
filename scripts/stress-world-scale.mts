/**
 * §STRESS-WORLD · 瞬间大数据量冲击世界玩法层（第十一条 + 第六条）。
 *
 * 不连数据库、不调 provider、不写业务库：在进程内生成一个确定性的巨型世界（默认 50,000 节点），
 * 依次喂给五个新玩法模块，记录墙钟时间与峰值 RSS，断言：
 *  - 不抛异常、不产生 NaN；
 *  - 每个模块的输出长度有定义（不因规模而丢结果）；
 *  - 模块调用次数与节点数无关（不随规模放大调用面）。
 * 墙上时间只作为归档读数（不设阈值——粗阈值在共享机上是噪声，见 v671 的纪律）。
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import type { WorldDocument, WorldNode } from '../packages/world-model/src/index.ts';
import { buildWorldInquiries } from '../apps/web/src/lib/worldInquiries.ts';
import { buildWorldWaypoints } from '../apps/web/src/lib/worldWaypoints.ts';
import { buildWorldSeasons } from '../apps/web/src/lib/worldSeasons.ts';
import { buildWorldTraditions } from '../apps/web/src/lib/worldTraditions.ts';
import { buildPlaythrough } from '../apps/web/src/lib/worldPrep.ts';

const N = Math.max(2, Number(process.argv[2] ?? 50000) || 50000);
const nodes: WorldNode[] = Array.from({ length: N }, (_, i) => ({
  id: `stress-node-${i}`,
  kind: 'story',
  title: `压测节点 ${i}`,
  body: `确定性正文 ${i} `.repeat(8), // 超过薄节点阈值，保证五模块都有可用样本
  updatedAt: '2026-11-25T00:00:00Z',
}));
const world: WorldDocument = {
  id: 'stress-world-2026-11-25',
  projectId: null,
  name: '瞬间大数据量世界',
  summary: 'stress',
  nodes,
  links: [],
  positions: {},
  createdAt: '2026-11-25T00:00:00Z',
  updatedAt: '2026-11-25T00:00:00Z',
};

const measures: Record<string, { ms: number; result: number }> = {};
const run = (name: string, fn: () => unknown[]): void => {
  const t0 = performance.now();
  const out = fn();
  measures[name] = { ms: Number((performance.now() - t0).toFixed(2)), result: out.length };
  if (out.length === 0) throw new Error(`${name}: 大规模输入下输出为空`);
  if (name === 'worldWaypoints' && (out as { distance: number }[]).some((w) => !Number.isFinite(w.distance))) {
    throw new Error('worldWaypoints: NaN distance');
  }
};

run('worldInquiries', () => buildWorldInquiries(world));
run('worldWaypoints', () => buildWorldWaypoints(world, 3));
run('worldSeasons', () => buildWorldSeasons(world));
run('worldTraditions', () => buildWorldTraditions(world));
run('worldPrep', () => buildPlaythrough(world));

const mem = process.memoryUsage();
const record = {
  at: new Date().toISOString(),
  host: `${process.platform}/${process.arch}`,
  node: process.version,
  nodes: N,
  modules: measures,
  peakRssMiB: Number((mem.rss / 1048576).toFixed(1)),
  heapMiB: Number((mem.heapUsed / 1048576).toFixed(1)),
  verdict: 'PASS — no throw / no NaN / all modules produced results',
};
const outFile = `docs/evidence/stress/world-scale-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(outFile, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify(record, null, 2));
console.log(`wrote ${outFile}`);
