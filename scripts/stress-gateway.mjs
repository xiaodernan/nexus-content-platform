#!/usr/bin/env node
/**
 * Gateway load generator — a real, dependency-free stress probe.
 *
 * Why this exists: the web SSR tiers are already measured (docs/STRESS-TESTS.md), but the Java edge
 * (nexus-gateway) had no repeatable load number. This script hammers ONE URL through the gateway with a
 * fixed number of keep-alive workers and reports what actually happened: status histogram, RPS and
 * p50/p95/p99. It is deliberately small enough to read in one sitting.
 *
 * Usage:
 *   node scripts/stress-gateway.mjs --url http://127.0.0.1:8097/api/projects?limit=1 \
 *       --concurrency 50 --seconds 10 [--header "Authorization: Bearer ..."] [--json]
 *
 * Honest boundaries:
 *   - Client and server share this machine, so these numbers include localhost networking and the
 *     client's own event loop. They are a regression baseline, not a capacity claim about real hardware.
 *   - Every request from this host uses ONE rate-limit key (127.0.0.1), which is exactly what the
 *     rate-limit arm wants: a single bucket under contention.
 *   - A status is counted when the response ENDS; an aborted request is an error, never a silent success.
 */
import http from 'node:http';
import { performance } from 'node:perf_hooks';

function parseArgs(argv) {
  const out = { url: null, concurrency: 32, seconds: 10, headers: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') out.url = argv[++i];
    else if (a === '--concurrency') out.concurrency = Number(argv[++i]);
    else if (a === '--seconds') out.seconds = Number(argv[++i]);
    else if (a === '--header') out.headers.push(argv[++i]);
    else if (a === '--json') out.json = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!out.url) throw new Error('--url is required');
  if (!Number.isFinite(out.concurrency) || out.concurrency < 1) throw new Error('--concurrency must be >= 1');
  if (!Number.isFinite(out.seconds) || out.seconds <= 0) throw new Error('--seconds must be > 0');
  return out;
}

const args = parseArgs(process.argv.slice(2));
const target = new URL(args.url);
const headerPairs = args.headers.map((h) => {
  const at = h.indexOf(':');
  if (at < 0) throw new Error(`--header expects "Name: value", got: ${h}`);
  return [h.slice(0, at).trim(), h.slice(at + 1).trim()];
});

const agent = new http.Agent({ keepAlive: true, maxSockets: args.concurrency });
const deadline = performance.now() + args.seconds * 1000;
const durations = [];
const statuses = new Map();
const errors = new Map();
let inFlight = 0;
let peakInFlight = 0;

function oneRequest() {
  return new Promise((resolve) => {
    const started = performance.now();
    inFlight += 1;
    if (inFlight > peakInFlight) peakInFlight = inFlight;

    const req = http.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method: 'GET',
        agent,
        headers: Object.fromEntries(headerPairs),
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          const elapsed = performance.now() - started;
          durations.push(elapsed);
          const code = String(res.statusCode);
          statuses.set(code, (statuses.get(code) ?? 0) + 1);
          inFlight -= 1;
          resolve();
        });
        res.on('error', (err) => {
          recordError(err);
          inFlight -= 1;
          resolve();
        });
      },
    );
    req.setTimeout(30000, () => req.destroy(new Error('client_timeout_30s')));
    req.on('error', (err) => {
      recordError(err);
      inFlight -= 1;
      resolve();
    });
    req.end();
  });
}

function recordError(err) {
  const key = err.code ?? err.message ?? 'unknown';
  errors.set(key, (errors.get(key) ?? 0) + 1);
}

async function worker() {
  while (performance.now() < deadline) {
    await oneRequest();
  }
}

const startedAt = performance.now();
await Promise.all(Array.from({ length: args.concurrency }, () => worker()));
const wallMs = performance.now() - startedAt;
agent.destroy();

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[idx].toFixed(2));
}

const sorted = [...durations].sort((a, b) => a - b);
const summary = {
  target: args.url,
  concurrency: args.concurrency,
  seconds: args.seconds,
  wallSeconds: Number((wallMs / 1000).toFixed(2)),
  requests: durations.length,
  rps: Number((durations.length / (wallMs / 1000)).toFixed(1)),
  peakInFlight,
  status: Object.fromEntries([...statuses.entries()].sort()),
  errors: Object.fromEntries([...errors.entries()].sort()),
  latencyMs: {
    min: sorted.length ? Number(sorted[0].toFixed(2)) : null,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.length ? Number(sorted[sorted.length - 1].toFixed(2)) : null,
  },
};

if (args.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`target        ${summary.target}`);
  console.log(`load          ${summary.concurrency} keep-alive workers for ${summary.seconds}s (${summary.wallSeconds}s wall)`);
  console.log(`requests      ${summary.requests}  (${summary.rps} rps, peak in flight ${summary.peakInFlight})`);
  console.log(`status        ${JSON.stringify(summary.status)}`);
  console.log(`errors        ${JSON.stringify(summary.errors)}`);
  console.log(`latency ms    p50=${summary.latencyMs.p50} p95=${summary.latencyMs.p95} p99=${summary.latencyMs.p99} max=${summary.latencyMs.max}`);
}
