// NEXUS M2 v152 — EBUSY cross-plane probe (ADR 0016 amendment 152, correcting 151).
//
// WHAT THIS MEASURES, AND WHY IT WAS REWRITTEN.
//
// Amendment 151 recorded this probe's worktree result as **0 EBUSY in 340 spawns (0.00%)**, and concluded
// that "the failures previously attributed to EBUSY in amendment 107 were `otherErr`, not EBUSY". Re-run
// against the shipped proof on 2026-10-02, the same four scenarios reported **340 EBUSY in 340 spawns
// (100.00%)** — and a plain sequential `spawnSync('git', ['rev-parse','HEAD'])` ×20 reported **20/20
// EBUSY**. So the record contradicted both the proof and `docs/KNOWN_ISSUES.md`, which had said EBUSY was
// unconditional on this host all along.
//
// The rewrite fixes the reason the original could not settle the question: it wrapped a SYNCHRONOUS
// `spawnSync` inside a `new Promise` executor, so the four "concurrent" spawns in each batch ran one after
// another before `Promise.all` ever resolved. **The concurrency was decorative**, and a contention
// measurement whose spawns never contend cannot tell contention from an unconditional fault.
//
// So this version measures BOTH arms:
//   - a CONCURRENT arm, using async `spawn` so `concurrency` children really are alive at once;
//   - a SEQUENTIAL arm, one child at a time, which is the control.
//
// If the sequential arm is also ~100%, the fault has nothing to do with contention, and any claim that it
// does is a claim about a measurement nobody took. That is the comparison the record needs.
//
// The proof is a MEASUREMENT, not a gate: it always exits 0 and writes a JSON artifact under `.scratch/`.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SCRATCH = path.join(REPO_ROOT, '.scratch');

/**
 * Run one git command ASYNCHRONOUSLY and classify the outcome.
 *
 * Async `spawn` is the only spawn family that works on this host (`docs/evidence/lib/syncproc.mjs`
 * re-implements the sync API on top of it for exactly that reason), which is also why the concurrent arm
 * can be real here and the sequential `spawnSync` arm cannot.
 */
function runGitAsync(args, cwd = REPO_ROOT) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ outcome: error?.code === 'EBUSY' ? 'ebusy' : 'otherErr', code: error?.code ?? null });
      return;
    }
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += String(d); });
    child.on('error', (error) => {
      resolve({ outcome: error?.code === 'EBUSY' ? 'ebusy' : 'otherErr', code: error?.code ?? null });
    });
    child.on('close', (code) => {
      if (code === 0) resolve({ outcome: 'ok' });
      else if (stderr.includes('EBUSY')) resolve({ outcome: 'ebusy' });
      else resolve({ outcome: 'otherErr', code });
    });
  });
}

/** One sequential `spawnSync` call, classified the same way — the CONTROL arm. */
function runGitSync(args, cwd = REPO_ROOT) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 30000 });
  if (r.status === 0) return { outcome: 'ok' };
  if (r.error?.code === 'EBUSY' || (r.stderr && r.stderr.includes('EBUSY'))) return { outcome: 'ebusy' };
  return { outcome: 'otherErr', code: r.error?.code ?? r.status };
}

const tally = (rows) => {
  const out = { total: rows.length, ok: 0, ebusy: 0, otherErr: 0 };
  for (const r of rows) {
    if (r.outcome === 'ok') out.ok++;
    else if (r.outcome === 'ebusy') out.ebusy++;
    else out.otherErr++;
  }
  out.rate = out.total ? Number(((out.ebusy / out.total) * 100).toFixed(2)) : 0;
  return out;
};

/** CONCURRENT arm: `concurrency` async children alive at once, `iterations` batches. */
async function measureConcurrent({ label, args, concurrency, iterations }) {
  const rows = [];
  for (let i = 0; i < iterations; i++) {
    const batch = await Promise.all(
      Array.from({ length: concurrency }, () => runGitAsync(args)),
    );
    rows.push(...batch);
  }
  const result = tally(rows);
  console.log(`[ebusy] CONCURRENT  ${label}: total=${result.total} ok=${result.ok} ebusy=${result.ebusy} otherErr=${result.otherErr} rate=${result.rate}%`);
  return { arm: 'concurrent', label, ...result };
}

/** SEQUENTIAL arm: the control. One child at a time, same shape, same count. */
function measureSequential({ label, args, total }) {
  const rows = [];
  for (let i = 0; i < total; i++) rows.push(runGitSync(args));
  const result = tally(rows);
  console.log(`[ebusy] SEQUENTIAL  ${label}: total=${result.total} ok=${result.ok} ebusy=${result.ebusy} otherErr=${result.otherErr} rate=${result.rate}%`);
  return { arm: 'sequential', label, ...result };
}

const SCENARIOS = [
  { label: 'rev-parse HEAD (baseline lightweight read)', args: ['rev-parse', 'HEAD'], concurrency: 8, iterations: 20, sequential: 20 },
  { label: 'status --porcelain (census shape)', args: ['status', '--porcelain'], concurrency: 4, iterations: 15, sequential: 20 },
  { label: 'checkout HEAD (clone -c ... checkout shape)', args: ['checkout', 'HEAD'], concurrency: 4, iterations: 20, sequential: 20 },
];

async function main() {
  const plane = process.env.SWEEP_ISOLATED ? 'isolated' : 'worktree';
  console.log('[ebusy] starting cross-plane measurement');
  console.log('[ebusy] cwd:', REPO_ROOT);
  console.log('[ebusy] plane:', plane);
  mkdirSync(SCRATCH, { recursive: true });

  const scenarios = [];
  for (const s of SCENARIOS) {
    const concurrent = await measureConcurrent(s);
    const sequential = measureSequential({ label: s.label, args: s.args, total: s.sequential });
    scenarios.push({ shape: s.label, concurrent, sequential });
  }

  // The clone shape is measured separately because it must create and remove a directory per call.
  const cloneRows = [];
  for (let i = 0; i < 10; i++) {
    const batch = await Promise.all(
      Array.from({ length: 4 }, async (_, c) => {
        const dir = path.join(SCRATCH, `ebusy-clone-${Date.now()}-${i}-${c}`);
        const r = await runGitAsync(['clone', '--shared', '--no-checkout', REPO_ROOT, dir]);
        try { rmSync(dir, { recursive: true, force: true }); } catch { /* the clone may have failed first */ }
        return r;
      }),
    );
    cloneRows.push(...batch);
  }
  const cloneResult = tally(cloneRows);
  console.log(`[ebusy] CONCURRENT  clone --shared --no-checkout (isolated staging shape): total=${cloneResult.total} ok=${cloneResult.ok} ebusy=${cloneResult.ebusy} otherErr=${cloneResult.otherErr} rate=${cloneResult.rate}%`);
  scenarios.push({ shape: 'clone --shared --no-checkout (isolated staging shape)', concurrent: { arm: 'concurrent', label: 'clone --shared --no-checkout', ...cloneResult }, sequential: null });

  const allConcurrent = tally(scenarios.flatMap((s) => Array(s.concurrent.total).fill({ outcome: s.concurrent.ebusy ? 'ebusy' : 'ok' })));
  const totals = {
    concurrent: { total: scenarios.reduce((n, s) => n + s.concurrent.total, 0), ebusy: scenarios.reduce((n, s) => n + s.concurrent.ebusy, 0) },
    sequential: { total: scenarios.reduce((n, s) => n + (s.sequential?.total ?? 0), 0), ebusy: scenarios.reduce((n, s) => n + (s.sequential?.ebusy ?? 0), 0) },
  };

  // The comparison the record needs, stated as arithmetic rather than as an opinion.
  const seqRate = totals.sequential.total ? (totals.sequential.ebusy / totals.sequential.total) * 100 : 0;
  const conRate = totals.concurrent.total ? (totals.concurrent.ebusy / totals.concurrent.total) * 100 : 0;
  const verdict =
    seqRate >= 95 && conRate <= 5
      ? 'SYNC-FAMILY: the SEQUENTIAL arm fails while the CONCURRENT arm is clean, so the fault belongs to the spawnSync API itself and NOT to contention — a claim that concurrency causes it is a claim about a measurement nobody took'
      : conRate >= 95 && seqRate <= 5
        ? 'CONTENTION: only the concurrent arm fails, so concurrency is what triggers it'
        : seqRate === 0 && conRate === 0
          ? 'CLEAN: neither arm failed'
          : 'MIXED: the two arms differ without either being extreme — read the per-shape numbers';

  console.log(`\n[ebusy] TOTALS concurrent ${totals.concurrent.ebusy}/${totals.concurrent.total} (${conRate.toFixed(2)}%) · sequential ${totals.sequential.ebusy}/${totals.sequential.total} (${seqRate.toFixed(2)}%)`);
  console.log(`[ebusy] VERDICT ${verdict}`);

  const artifact = {
    plane,
    timestamp: new Date().toISOString(),
    note: 'v152 rewrite: the concurrent arm uses async spawn (the original wrapped a SYNCHRONOUS spawnSync in a Promise executor, so its batches never overlapped) and the sequential arm is the control.',
    scenarios,
    totals,
    verdict,
  };
  const outPath = path.join(SCRATCH, `ebusy-${plane}-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  console.log('[ebusy] artifact:', outPath);

  // A MEASUREMENT, not a gate: the numbers are the product, whatever they say.
  assert.equal(typeof verdict, 'string', 'the measurement must reach a stated verdict');
  console.log('[ebusy] measurement complete');
}

await main();
