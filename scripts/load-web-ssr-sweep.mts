#!/usr/bin/env node
/**
 * §LOAD-sweep web 高并发分档探针（证据 docs/evidence/load-web-ssr-2026-11-17.md）。
 *
 * 对 `/bible`（无业务库 SSR 路由）逐档重启 next dev，测：
 *   baseline（顺序 30 请求，maxSockets=1） + 6 / 12 / 24 / 48 并发（各 100 请求）。
 *
 * 记录：status 直方图（被丢还是 HTTP 错误一目了然）、p50/p95/p99、吞吐、冲突率。
 * 不做 SLA（§159）：dev 路径读数，不是生产承诺。
 */
import { spawn } from 'node:child_process';
import http from 'node:http';

const PORT = 3401;
const BASE = `http://127.0.0.1:${PORT}`;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function get(agent, path) {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    const req = http.get(`${BASE}${path}`, { agent, timeout: 20_000 }, (res) => {
      let bytes = 0;
      res.on('data', (c) => (bytes += c.length));
      res.on('end', () => {
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        resolve({ status: res.statusCode ?? 0, bytes, ms });
      });
    });
    req.on('error', () => resolve({ status: 0, bytes: 0, ms: 0 }));
    req.on('timeout', () => req.destroy());
  });
}

function startServer() {
  const child = spawn('node', ['node_modules/next/dist/bin/next', 'dev', '-p', String(PORT)], {
    cwd: process.cwd() + '\\apps\\web',
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  return child;
}

async function waitForServer(timeoutMs = 150_000) {
  const deadline = Date.now() + timeoutMs;
  const probeAgent = new http.Agent({ keepAlive: false, maxSockets: 1 });
  while (Date.now() < deadline) {
    const r = await get(probeAgent, '/bible').catch(() => ({ status: 0 }));
    if (r.status >= 200 && r.status < 400) return;
    await new Promise((r2) => setTimeout(r2, 500));
  }
  throw new Error('dev server 未就绪');
}

async function tier(name, concurrency, count, path) {
  const child = startServer();
  try {
    await waitForServer();
    // warm once
    await get(new http.Agent({ maxSockets: 1 }), path);
    const agent = new http.Agent({ keepAlive: true, maxSockets: concurrency });
    const t0 = Date.now();
    const samples = await Promise.all(Array.from({ length: count }, () => get(agent, path)));
    const wallMs = Date.now() - t0;
    const ok = samples.filter((s) => s.status >= 200 && s.status < 300).length;
    const msSorted = samples.map((s) => s.ms).sort((a, b) => a - b);
    const q = (p) => msSorted[Math.min(msSorted.length - 1, Math.floor(p * msSorted.length))];
    const histogram = {};
    for (const s of samples) histogram[s.status] = (histogram[s.status] ?? 0) + 1;
    const report = {
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
  } finally {
    child.kill();
    // 等待端口真正释放
    await new Promise((r) => setTimeout(r, 1500));
  }
}

const out = [];
out.push(await tier('baseline', 1, 30, '/bible'));
out.push(await tier('tier-6', 6, 100, '/bible'));
out.push(await tier('tier-12', 12, 100, '/bible'));
out.push(await tier('tier-24', 24, 100, '/bible'));
out.push(await tier('tier-48', 48, 100, '/bible'));
console.log('TIERS_JSON ' + JSON.stringify(out));
