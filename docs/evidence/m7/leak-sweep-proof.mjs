/**
 * M7 v222 — the leak sweep, proved three ways: the decision table over synthetic containers, the WIRING that
 * makes the proof actually call it before it takes a port, and the rule run against the real host WITHOUT
 * removing anything.
 *
 * Run: node docs/evidence/m7/leak-sweep-proof.mjs
 *
 * The defect this exists for: `studio-publish.mjs` starts its throwaway PostgreSQL with `docker run -d --rm`
 * and removes it in a `finally`. That covers every exit the proof can see — a failed assertion included — but
 * it cannot cover a HARD KILL, and `--rm` only removes a container that STOPS. Measured 2026-10-10:
 * `nexus-publish-e2e-db-1791461501643-9348` had been **Up 2 days**, holding 127.0.0.1:51149 and a PostgreSQL
 * instance, from a run killed during teardown.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { containersToRetire, sweepLeftoverDatabases, pidIsAlive, LEFTOVER_PREFIX, MAX_AGE_MS } from '../../../tools/harness/leakSweep.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const PROOF = join(REPO_ROOT, 'tools/harness/studio-publish.mjs');

/** Async spawn: `execFileSync` answers EBUSY on this host (ADR 0016 amendment 152), so nothing here is sync. */
function runAsync(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += String(d); });
    child.stderr.on('data', (d) => { stderr += String(d); });
    child.on('error', (e) => resolve({ code: -1, stdout, stderr: String(e?.message ?? e) }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

// ── §1 the decision table, pure ───────────────────────────────────────────────────────────────────────
const NOW = 1_800_000_000_000;
const alive = new Set([4242]);
const isAlive = (pid) => alive.has(pid);
const at = (ageMs, pid) => ({ name: `${LEFTOVER_PREFIX}${NOW - ageMs}-${pid}` });

const cases = [
  { label: 'a fresh container whose owner is ALIVE is left alone (a concurrent run)', input: [at(60_000, 4242)], expect: [] },
  { label: 'a fresh container whose owner is GONE is retired', input: [at(60_000, 999999)], expect: ['owner-gone'] },
  { label: 'an old container whose owner is ALIVE is retired on AGE (a recycled pid)', input: [at(MAX_AGE_MS + 1, 4242)], expect: ['stale'] },
  { label: 'an old container whose owner is GONE is retired as owner-gone, not stale', input: [at(MAX_AGE_MS + 1, 999999)], expect: ['owner-gone'] },
  { label: 'exactly at the age bound is NOT stale (the bound is exclusive)', input: [at(MAX_AGE_MS, 4242)], expect: [] },
  { label: 'a foreign name is not ours and is left alone', input: [{ name: 'careeros-backend' }, { name: 'nexus-platform-postgres' }], expect: [] },
  { label: 'a prefixed name the shape does not match is left alone rather than guessed at', input: [{ name: `${LEFTOVER_PREFIX}not-a-stamp` }], expect: [] },
  { label: 'a missing name does not throw', input: [{}, { name: undefined }], expect: [] },
  { label: 'the two reasons coexist in one listing', input: [at(60_000, 999999), at(MAX_AGE_MS + 1, 4242), at(60_000, 4242)], expect: ['owner-gone', 'stale'] },
];

for (const c of cases) {
  const got = containersToRetire(c.input, { now: NOW, isAlive }).map((d) => d.reason);
  assert.deepEqual(got, c.expect, `§1 ${c.label} — got ${JSON.stringify(got)}, expected ${JSON.stringify(c.expect)}`);
}
console.log(`[§1] decision table: ${cases.length} cases, all as stated — owner-gone and stale are the only two reasons, a live owner is never swept, and an unrecognised name is left alone`);

// ── §2 the decision is PURE ───────────────────────────────────────────────────────────────────────────
{
  const input = [at(60_000, 999999), at(MAX_AGE_MS + 1, 4242)];
  const frozen = JSON.parse(JSON.stringify(input));
  const first = containersToRetire(input, { now: NOW, isAlive });
  const second = containersToRetire(input, { now: NOW, isAlive });
  assert.deepEqual(input, frozen, '§2 the input listing was MUTATED — the sweep would then be order-dependent');
  assert.deepEqual(first, second, '§2 two identical calls disagreed — the decision is not a function of its inputs');
  console.log(`[§2] purity: the listing is untouched and two identical calls agree (${first.length} to retire)`);
}

// ── §3 the wiring: the proof calls the sweep BEFORE it takes a port ───────────────────────────────────
{
  const src = readFileSync(PROOF, 'utf8');
  assert.ok(src.includes("from './leakSweep.mjs'"), '§3 the proof does not import the sweep, so nothing is wired');
  assert.ok(src.includes('await sweepLeftoverDatabases('), '§3 the proof imports the sweep but never calls it');

  const sweepAt = src.indexOf('await sweepLeftoverDatabases(');
  const portAt = src.indexOf('const dbPort = await freePort()');
  const startAt = src.indexOf("'run', '-d', '--rm', '--name', DB_CONTAINER");
  assert.ok(portAt > 0 && startAt > 0, '§3 could not find where the proof takes a port and starts the database');
  assert.ok(sweepAt < portAt, `§3 the sweep runs AFTER the port is taken (sweep@${sweepAt}, port@${portAt}) — a corpse would still make the port choice look busy`);
  assert.ok(sweepAt < startAt, '§3 the sweep runs AFTER the database starts, which is too late to be a sweep');
  console.log(`[§3] wiring: imported, called at offset ${sweepAt}, BEFORE the port is taken (${portAt}) and before the database starts (${startAt})`);
}

// ── §4 the sweep is a courtesy, not a gate: a failed LIST does not stop the run ───────────────────────
{
  const calls = [];
  const failingRun = async (cmd, args) => { calls.push([cmd, ...args].join(' ')); return { code: 1, stdout: '', stderr: 'daemon is not reachable' }; };
  const r = await sweepLeftoverDatabases(failingRun, { now: NOW, isAlive, log: () => {} });
  assert.equal(r.listed, false, '§4 a failed listing was reported as a successful one');
  assert.deepEqual(r.retired, [], '§4 retired something without a listing');
  assert.equal(calls.length, 1, `§4 a failed listing still made ${calls.length} calls — it must make exactly the one it failed on`);
  console.log('[§4] a failed listing is reported and NOT fatal: no removal is attempted, and the caller decides');
}

// ── §5 the sweep against a REAL abandoned container ───────────────────────────────────────────────────
// §1–§2 proved the DECISION over synthetic listings, and a listing with nothing in it would make a
// "the rule meets the world" section vacuous — an empty set passes as clean. So this section CREATES the
// defect: a real container named the way a killed run names one, carrying a pid that is certainly not alive.
// It is the exact shape of the 2-day-old corpse, made on purpose and cleaned up either way.
{
  const daemon = await runAsync('docker', ['version', '--format', '{{.Server.Version}}']);
  if (daemon.code !== 0) {
    console.log(`[§5] SKIPPED — no docker daemon here (${daemon.stderr.trim().slice(0, 80)}); the rule was proved over synthetic listings in §1–§2`);
  } else {
    // A pid far beyond any real one, so `pidIsAlive` answers false for a reason that is not timing.
    const DEAD_PID = 999999999;
    assert.equal(pidIsAlive(DEAD_PID), false, `§5 pid ${DEAD_PID} is ALIVE on this host, so this section cannot stage an orphan`);
    const orphan = `${LEFTOVER_PREFIX}${Date.now()}-${DEAD_PID}`;

    const started = await runAsync('docker', ['run', '-d', '--rm', '--name', orphan, '--entrypoint', 'sh', 'pgvector/pgvector:pg16', '-c', 'sleep 300']);
    assert.equal(started.code, 0, `§5 could not stage the orphan: ${started.stderr.trim()}`);
    try {
      const before = await runAsync('docker', ['ps', '--filter', `name=${orphan}`, '--format', '{{.Names}}']);
      assert.equal(before.stdout.trim(), orphan, '§5 the staged orphan is not running, so there is nothing to sweep');

      const swept = await sweepLeftoverDatabases(runAsync, { log: (l) => console.log(l) });
      const retiredNames = swept.retired.map((d) => d.name);
      assert.ok(retiredNames.includes(orphan), `§5 the sweep did not retire the orphan (it retired ${JSON.stringify(retiredNames)}) — this is the 2-day-old leak, reproduced`);
      assert.deepEqual(swept.retired.find((d) => d.name === orphan).reason, 'owner-gone', '§5 the orphan was retired for the wrong reason — its owner is the dead pid, not its age');

      const after = await runAsync('docker', ['ps', '--filter', `name=${orphan}`, '--format', '{{.Names}}']);
      assert.equal(after.stdout.trim(), '', '§5 the orphan is STILL running after the sweep reported retiring it');
      console.log(`[§5] end-to-end: a real orphan was staged, the sweep retired it as owner-gone, and docker no longer lists it (${swept.seen} name(s) seen, ${swept.retired.length} retired)`);
    } finally {
      // Belt and braces: if an assertion above fired before the sweep ran, the container must not survive.
      await runAsync('docker', ['rm', '-f', orphan]);
    }
  }
}

// ── §6 the decision layer holds no capability ─────────────────────────────────────────────────────────
{
  const src = readFileSync(join(REPO_ROOT, 'tools/harness/leakSweep.mjs'), 'utf8');
  assert.ok(!/child_process/.test(src), '§6 the decision module imports child_process — the pure layer must hold no capability, so the caller injects `run`');
  assert.ok(!/process\.exit/.test(src), '§6 the decision module exits the process — a library must not');
  console.log('[§6] the decision module holds no capability: no child_process, no process.exit — the caller injects `run`, which is what let §4 be proved without a daemon');
}

console.log('\n[leak-sweep-proof] ALL SECTIONS PASSED (the rule is a pure function of the listing, the proof calls it before it takes a port, and a failed listing is a courtesy, not a gate)');
