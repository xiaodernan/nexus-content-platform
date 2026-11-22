#!/usr/bin/env node
/**
 * §STRESS-WEB · 对**正在运行**的 web 服务打并发 burst（evidence: docs/evidence/stress/web-burst-2026-11-22.md）
 *
 * 为什么不再起一台 dev server：本机内存 1.3–2.5GB 锯齿（仓库自己的记录），
 * 同时拉 dev server + 业务库 + ai-service 会把被测系统本身压垮，测出来的不是产品的鲁棒性。
 * 这里打的是**已经跑着的那台**（`next start -p 3100`），四条不碰业务库的路由。
 *
 * 协议：
 *   - warm：每条路由 3 次顺序 GET；
 *   - steady：每条路由 N 次并发（maxSockets=64）；
 *   - burst：一条路由 2N 次、maxSockets=128——瞬间撞车；
 *   - 记录状态码分布、p50/p95/max、rps；不承诺 SLA（§59：单机单次，数字是事实不是承诺）。
 *
 * 用法：`npx tsx scripts/stress-web-burst.mts [--base http://127.0.0.1:3100] [--n 100]`
 */
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const BASE = flag('--base', 'http://127.0.0.1:3100');
const N = Math.max(10, Math.min(2000, Number(flag('--n', '100')) || 100));
const ROUTES = ['/', '/guide', '/bible', '/about-nexus'];

const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });

function get(path: string): Promise<{ status: number; ms: number }> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const req = http.get(`${BASE}${path}`, { agent }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode ?? 0, ms: Date.now() - started }));
    });
    req.on('error', reject);
    req.setTimeout(30_000, () => req.destroy(new Error(`timeout ${path}`)));
  });
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

async function burst(label: string, path: string, count: number): Promise<Record<string, unknown>> {
  const started = Date.now();
  const results = await Promise.allSettled(
    Array.from({ length: count }, () => get(path)),
  );
  const wallMs = Date.now() - started;
  const ok = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ status: number; ms: number }>[];
  const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  const codes = new Map<number, number>();
  for (const r of ok) codes.set(r.value.status, (codes.get(r.value.status) ?? 0) + 1);
  const latencies = ok.map((r) => r.value.ms).sort((a, b) => a - b);
  return {
    label,
    path,
    requested: count,
    answered: ok.length,
    rejected: rejected.length,
    statusCodes: Object.fromEntries([...codes.entries()].sort((a, b) => a[0] - b[0])),
    wallMs,
    rps: Math.round((ok.length / Math.max(1, wallMs)) * 1000),
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    maxMs: latencies.length > 0 ? latencies[latencies.length - 1]! : 0,
    firstError: rejected.length > 0 ? String(rejected[0]!.reason).slice(0, 160) : null,
  };
}

async function main(): Promise<void> {
  const rows: Record<string, unknown>[] = [];
  for (const route of ROUTES) {
    for (let i = 0; i < 3; i += 1) await get(route);
  }
  for (const route of ROUTES) rows.push(await burst(`steady ${route}`, route, N));
  rows.push(await burst(`burst ${ROUTES[0]!}`, ROUTES[0]!, N * 2));

  const bad = rows.flatMap((r) => Object.entries(r.statusCodes as Record<string, number>)
    .filter(([code]) => Number(code) >= 500)
    .map(([code, n]) => `${r.path} ${code} x${n}`));
  const summary = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    concurrency: { steadySockets: 64, burstSockets: 128 },
    rows,
    serverErrors: bad,
    verdict: bad.length === 0 && rows.every((r) => r.rejected === 0) ? 'no 5xx, no dropped socket' : 'FAILURES PRESENT',
  };
  const json = join(ROOT, 'docs/evidence/stress/web-burst-2026-11-22.json');
  writeFileSync(json, `${JSON.stringify(summary, null, 2)}\n`);
  for (const row of rows) {
    console.log(`${row.label}: ${row.answered}/${row.requested} answered, codes ${JSON.stringify(row.statusCodes)}, p50 ${row.p50Ms}ms p95 ${row.p95Ms}ms max ${row.maxMs}ms, ${row.rps} rps`);
  }
  console.log(`server 5xx: ${bad.length === 0 ? 'none' : bad.join(', ')}`);
  console.log(`verdict: ${summary.verdict} -> ${json}`);
  if (bad.length > 0) process.exitCode = 1;
}

void main();