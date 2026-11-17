#!/usr/bin/env node
/**
 * §LOAD-4 sweep · prod `next start` tiered probe (evidence: docs/evidence/stress-nextstart-2026-11-19.md).
 *
 * One persistent prod server (`next start`) on :3461 — unlike the dev-sweep
 * (load-web-ssr-sweep.mts, :3401, fresh dev per tier), this measures steady-state
 * production behaviour: JIT is already warm, pages are statically generated where
 * possible, SSR dynamic is streamed by Node, not by the dev compiler.
 *
 * Records: status histogram, p50/p95/p99, throughput, conflict rate.
 * No SLA is claimed (§59); numbers are this machine, this ref, this hour.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';

const PORT = 3461;
const BASE = `http://127.0.0.1:${PORT}`;

interface Sample { status: number; bytes: number; ms: number }

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function get(agent: http.Agent, path: string): Promise<Sample> {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const req = http.get(`${BASE}${path}`, { agent, timeout: 30_000 }, (res) => {
      let bytes = 0;
      res.on('data', (c: Buffer) => (bytes += c.length));
      res.on('end', () => {
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        resolve({ status: res.statusCode ?? 0, bytes, ms });
      });
    });
    req.on('error', () => resolve({ status: 0, bytes: 0, ms: 0 }));
    req.on('timeout', () => req.destroy());
  });
}

function startServer(): ChildProcess {
  const child = spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
    cwd: process.cwd() + '\\apps\\web',
    stdio: ['ignore', 'ignore', 'ignore'],
    env: { ...process.env, NEXUS_AI_SERVICE_URL: 'http://127.0.0.1:3200', NODE_ENV: 'production' },
  });
  return child;
}

async function waitForServer(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const probeAgent = new http.Agent({ keepAlive: false, maxSockets: 1 });
  while (Date.now() < deadline) {
    const r = await get(probeAgent, '/bible').catch(() => ({ status: 0, bytes: 0, ms: 0 }));
    if (r.status >= 200 && r.status < 400) return;
    await new Promise((r2) => setTimeout(r2, 750));
  }
  throw new Error('prod server did not become ready');
}

interface TierReport {
  label: string;
  concurrency: number;
  requests: number;
  ok: number;
  errors: number;
  histogram: Record<string, number>;
  wallMs: number;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  bytesTotal: number;
}

async function tier(name: string, concurrency: number, count: number, path: string): Promise<TierReport> {
  const agent = new http.Agent({ keepAlive: true, maxSockets: concurrency });
  const t0 = Date.now();
  const samples: Sample[] = await Promise.all(Array.from({ length: count }, () => get(agent, path)));
  const wallMs = Date.now() - t0;
  agent.destroy();
  const ok = samples.filter((s) => s.status >= 200 && s.status < 300).length;
  const msSorted = samples.map((s) => s.ms).sort((a, b) => a - b);
  const q = (p: number) => msSorted[Math.min(msSorted.length - 1, Math.floor(p * msSorted.length))] ?? 0;
  const histogram: Record<string, number> = {};
  for (const s of samples) histogram[s.status] = (histogram[s.status] ?? 0) + 1;
  const report: TierReport = {
    label: name,
    concurrency,
    requests: count,
    ok,
    errors: count - ok,
    histogram,
    wallMs,
    rps: round2((count / wallMs) * 1000),
    p50: round2(q(0.5)),
    p95: round2(q(0.95)),
    p99: round2(q(0.99)),
    max: round2(msSorted[msSorted.length - 1] ?? 0),
    bytesTotal: samples.reduce((a, b) => a + b.bytes, 0),
  };
  console.log(JSON.stringify(report));
  return report;
}

const child = startServer();
try {
  await waitForServer();
  // warm once so JIT + page cache are hot before measuring
  await get(new http.Agent({ maxSockets: 1 }), '/bible');
  const out: TierReport[] = [];
  out.push(await tier('baseline', 1, 30, '/bible'));
  out.push(await tier('tier-6', 6, 100, '/bible'));
  out.push(await tier('tier-12', 12, 100, '/bible'));
  out.push(await tier('tier-24', 24, 100, '/bible'));
  out.push(await tier('tier-48', 48, 100, '/bible'));
  out.push(await tier('tier-12-root', 12, 60, '/'));
  console.log('TIERS_JSON ' + JSON.stringify(out));
} finally {
  child.kill();
  await new Promise((r) => setTimeout(r, 1500));
}
