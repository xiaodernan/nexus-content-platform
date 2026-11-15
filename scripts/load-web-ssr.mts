#!/usr/bin/env node
/**
 * §LOAD-/bible 高并发 web 实测探针（evidence：docs/evidence/load-web-ssr-2026-11-17.md）。
 *
 * **SUPERSEDED by `load-web-ssr-sweep.mts`**（冷编译级联解释首发 run 的 126/170 失联：
 * dev 首次编译未就绪时并发涌入，大部分被硬断而不是 500；sweep 每档重启 + warm 后复测，
 * 496/500 真实 200）。本脚本保留作首发失败现场记录。
 *
 * 与 sweep 的区别：sweep 每档 spawn 新 dev server（冷缓存）+ 一次 warm 视为就绪；本脚本一次性
 * 连发 170×3 + burst（冷 / 热编译状态混在一起，错误率与"服务器扛不住"混淆）。
 */
 *
 * 协议：
 *   - next dev -p 3401（本仓既有跑法；测的是 dev 路径的 SSR 层真实开销，不是生产 CDN 路径
 *     ——证据里如实说明）；
 *   - warm：每路由先 3 次顺序 GET 预热（含编译）；
 *   - steady：/bible · /guide · /about-nexus 各 170 个请求（maxSockets=48 并发池）；
 *   - burst：/bible 110 个请求（maxSockets=96）——瞬时撞库；
 *   - 路由一律选 **不连业务库** 的那几条（本机 Postgres 未必在线）；
 *   - 产出 docs/evidence/load-web-ssr-2026-11-17.{json,md}。
 *
 * 不看做 SLA（§159）：单次、单机、单路由；数值只记事实，不承诺。
 */
import { spawn } from 'node:child_process';
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

const pool = (maxSockets) => new http.Agent({ keepAlive: true, maxSockets });
const steadyPool = pool(48);
const burstPool = pool(96);

function get(path, agent) {
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

async function waitForServer(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await get('/bible', pool(1));
      if (r.status === 200) return;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error('dev server 未在时限内就绪');
}

function stats(samples) {
  const ok = samples.filter((s) => s.status >= 200 && s.status < 300).length;
  const errors = samples.length - ok;
  const msSorted = samples.map((s) => s.ms).sort((a, b) => a - b);
  const q = (p) => msSorted[Math.min(msSorted.length - 1, Math.floor(p * msSorted.length))];
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
const round2 = (n) => Math.round(n * 100) / 100;

async function runBatch(label, path, count, agent) {
  const t0 = Date.now();
  const poolTasks = new Array(count).fill(null).map(() => get(path, agent).catch(() => ({ status: 0, bytes: 0, ms: 0 })));
  const samples = await Promise.all(poolTasks);
  const wallMs = Date.now() - t0;
  return { label, path, wallMs, rps: round2((count / wallMs) * 1000), ...stats(samples) };
}

try {
  process.stdout.write('waiting for dev server…\n');
  await waitForServer();
  process.stdout.write('server ready\n');

  // warm（编译）
  for (const p of ['/bible', '/guide', '/about-nexus']) {
    for (let i = 0; i < 3; i++) await get(p, pool(1)).catch(() => {});
  }

  const results = [];
  results.push(await runBatch('steady', '/bible', 170, steadyPool));
  results.push(await runBatch('steady', '/guide', 170, steadyPool));
  results.push(await runBatch('steady', '/about-nexus', 170, steadyPool));
  results.push(await runBatch('burst', '/bible', 110, burstPool));

  const report = {
    date: '2026-11-17', printer: 'scripts/load-web-ssr.mts', routeRationale: '无业务库路由（本机 Postgres 未必在线）；不含 /discover//n/*/search 等打库页',
    server: 'next dev -p 3401（开发路径，含 Turbopack dev 开销；不是生产 CDN+SSR 缓存路径）',
    results,
  };
  writeFileSync(EVIDENCE_JSON, JSON.stringify(report, null, 2), 'utf8');
  console.log('✓ evidence 写入', EVIDENCE_JSON);
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  console.error('✗ 压力测试失败：', error);
  process.exitCode = 1;
} finally {
  child.kill();
}
