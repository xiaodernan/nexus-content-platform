#!/usr/bin/env node
/**
 * §LOAD /bible concurrent web probe (evidence: docs/evidence/load-web-ssr-2026-11-17.md).
 *
 * SUPERSEDED by `load-web-ssr-sweep.mts` — the first cold-compile run saw 126/170 requests
 * drop because the Next dev server was still compiling when the burst hit; most were hard
 * disconnects, not 500s. The sweep restarts per tier and waits for warm, landing 496/500 real
 * 200s. This script is kept as the first-failure scene record.
 *
 * Difference vs the sweep: the sweep spawns one dev server per tier (cold cache) and waits
 * one full warm-up before load; this script fires 170x3 + burst in one run (cold and hot
 * compile states mixed together).
 *
 * Protocol:
 *   - next dev -p 3401 (the repo's usual way; this measures the dev path's real SSR cost, not
 *     the production CDN path — the evidence says so);
 *   - warm: 3 sequential gets per route (with compile);
 *   - steady: /bible · /guide · /about-nexus 170 requests each (maxSockets=48);
 *   - burst: /bible 110 requests (maxSockets=96) — instant collision;
 *   - routes are the ones that do NOT touch the business DB (local Postgres may be down);
 *   - output docs/evidence/load-web-ssr-2026-11-17.{json,md}.
 *
 * No SLA is claimed (§59): single run, single machine, single route; numbers are facts, not promises.
 */
import { spawn } from 'node:child_process';

interface BatchReport { label: string; path: string; wallMs: number; rps: number }
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const PORT = 3401;
const BASE = `http://127.0.0.1:${PORT}`;
const EVIDENCE_JSON = join(ROOT, 'docs/evidence/load-web-ssr-2026-11-17.json');

const child = spawn('node', ['node_modules/next/dist/bin/next', 'dev', '-p', String(PORT)], {
  cwd: join(ROOT, 'apps/web'),
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', () => {});
child.stderr.on('data', () => {});

interface Sample { status: number; bytes: number; ms: number }
const pool = (maxSockets: number): http.Agent => new http.Agent({ keepAlive: true, maxSockets });
const steadyPool = pool(48);
const burstPool = pool(96);

function get(path: string, agent: http.Agent): Promise<Sample> {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    const req = http.get(`${BASE}${path}`, { agent, timeout: 30_000 }, (res) => {
      let bytes = 0;
      res.on('data', (chunk) => (bytes += chunk.length));
      res.on('end', () => {
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        resolve({ status: res.statusCode ?? 0, bytes, ms });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}

async function waitForServer(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r: Sample = await get('/bible', pool(1));
      if (r.status === 200) return;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error('dev server did not become ready in time');
}

function stats(samples: Sample[]): {
  n: number; ok: number; errors: number; p50: number; p95: number; p99: number; mean: number; max: number; bytesTotal: number;
} {
  const ok = samples.filter((s) => s.status >= 200 && s.status < 300).length;
  const errors = samples.length - ok;
  const msSorted = samples.map((s) => s.ms).sort((a, b) => a - b);
  const q = (p: number) => msSorted[Math.min(msSorted.length - 1, Math.floor(p * msSorted.length))] ?? 0;
  const sum = msSorted.reduce((a, b) => a + b, 0);
  return {
    n: samples.length,
    ok,
    errors,
    p50: round2(q(0.5)),
    p95: round2(q(0.95)),
    p99: round2(q(0.99)),
    mean: round2(sum / msSorted.length),
    max: round2(msSorted[msSorted.length - 1] ?? 0),
    bytesTotal: samples.reduce((a, b) => a + b.bytes, 0),
  };
}
const round2 = (n: number): number => Math.round(n * 100) / 100;


async function runBatch(label: string, path: string, count: number, agent: http.Agent): Promise<BatchReport & ReturnType<typeof stats>> {
  const t0 = Date.now();
  const poolTasks = new Array(count).fill(null).map(() => get(path, agent).catch(() => ({ status: 0, bytes: 0, ms: 0 })));
  const samples = await Promise.all(poolTasks);
  const wallMs = Date.now() - t0;
  return { label, path, wallMs, rps: round2((count / wallMs) * 1000), ...stats(samples) };
}


try {
  process.stdout.write('waiting for dev server...\n');
  await waitForServer();
  process.stdout.write('server ready\n');

  // warm (with compile)
  for (const p of ['/bible', '/guide', '/about-nexus']) {
    for (let i = 0; i < 3; i++) await get(p, pool(1)).catch(() => {});
  }

  const results = [];
  results.push(await runBatch('steady', '/bible', 170, steadyPool));
  results.push(await runBatch('steady', '/guide', 170, steadyPool));
  results.push(await runBatch('steady', '/about-nexus', 170, steadyPool));
  results.push(await runBatch('burst', '/bible', 110, burstPool));

  const report = {
    date: '2026-11-17', printer: 'scripts/load-web-ssr.mts', routeRationale: 'no-business-DB routes (local Postgres may be down); excludes /discover//n/*/search pages',
    server: 'next dev -p 3401 (dev path; Turbopack dev overhead; not the production CDN+SSR cached path)',
    results,
  };
  writeFileSync(EVIDENCE_JSON, JSON.stringify(report, null, 2), 'utf8');
  console.log('evidence written', EVIDENCE_JSON);
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  console.error('load test failed', error);
  process.exitCode = 1;
} finally {
  child.kill();
}
