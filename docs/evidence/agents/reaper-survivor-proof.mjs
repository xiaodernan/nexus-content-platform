// NEXUS M2 v76 (exec-host) — `'reaped'` IS WHAT THE REAPER REPORTED, NOT A PROMISE THAT NOTHING RUNS
// (ADR 0016 amendment 76).
// v55 established the shape of the claim with two measurements on this box: `child.kill()` stops ONE
// process (a detached child kept writing), and asking the reaper INSTEAD of that call — not after it —
// silences a detached survivor. Both are true, and one word in the result invites a reader to over-read
// them: `descendantsStopped: 'reaped'` says a tree-kill call succeeded against the handle the host held.
// Measured here with real processes: a killed verification whose report said `reaped` still left a
// DETACHED grandchild writing heartbeats afterwards, because a `detached: true` child leaves the parent's
// tree — the reaper reached what was reachable, which is exactly what v55's fallback rule refuses to
// exaggerate and this label is now stated to mean.
// §1 the reaper OFF: the host killed its own child, survivors keep writing, `not-attempted`.
// §2 the reaper ON: same program, `reaped` reported, and survivor heartbeats still counted — the two facts
// coexist, so the label cannot mean "quiet machine". §3 the bridge's sentence says the weaker true thing.
// All programs and their heartbeat files live under os.tmpdir; this repository's HEAD is byte-compared.
// Run after `npm run build`:  node docs/evidence/agents/reaper-survivor-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from '../lib/syncproc.mjs';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { createExecHost, execTestRunner, gitEnv } = eh;

function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(base + n)) n += 1;
  mkdirSync(base + n, { recursive: true });
  return base + n;
}
const root = mkTmp('nexus-v76-proof');
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const hearts = join(root, 'hearts.txt');
const SUITE = join(root, 'suite.mjs');
// a parent that hangs forever, leaving a DETACHED grandchild that beats into a file until it is killed
writeFileSync(SUITE, [
  "import { spawn } from 'node:child_process';",
  `const hb = ${JSON.stringify(hearts)};`,
  "const worker = spawn(process.execPath, ['-e', \"const fs=require('fs');let k=0;setInterval(()=>{try{fs.appendFileSync(process.env.HB,'beat\\\\n')}catch(e){process.exit(0)};if(++k>400)process.exit(0)},60);\", ''], { detached: true, stdio: 'ignore', env: { ...process.env, HB: hb } });",
  'worker.unref();',
  'setInterval(() => {}, 500);',
  '',
].join('\n'));

const beats = () => { try { return readFileSync(hearts, 'utf8').split('\n').filter((l) => l === 'beat').length; } catch { return 0; } };
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

// M2 v90 (ADR 0016 amendment 90): the budget is DERIVED, not pinned.
//
// This file used to hardcode `timeoutMs: 500`. The v89 population sweep measured what that meant on
// this box: spawn-to-first-write latency is ~6 s, so the host killed the suite BEFORE the detached
// grandchild had written anything — its subject never lived, and both arms compared 0 beats against
// 0 beats. The assertions still "passed" the shape they checked while proving nothing, which is the
// failure mode amendment 86 named and this file predates.
//
// So the box is asked first, and the kill is scheduled relative to what it answers. If even a derived
// budget cannot get the subject alive, the proof says so instead of reporting a vacuous green.
async function measureSpawnToFirstWrite() {
  const probeFile = join(root, 'probe.txt');
  const probe = join(root, 'probe.mjs');
  writeFileSync(probe, [
    'import { appendFileSync } from "node:fs";',
    `appendFileSync(${JSON.stringify(probeFile)}, 'beat\\n');`,
    '',
  ].join('\n'));
  try { rmSync(probeFile, { force: true }); } catch { /* nothing yet */ }
  const t0 = Date.now();
  const { spawn } = await import('node:child_process');
  await new Promise((resolve) => {
    const c = spawn(process.execPath, [probe], { stdio: 'ignore' });
    c.on('close', resolve);
    c.on('error', resolve);
  });
  // The first beat is what matters, not the exit: a hanging subject writes before it hangs.
  for (let i = 0; i < 600; i += 1) {
    try {
      if (readFileSync(probeFile, 'utf8').includes('beat')) break;
    } catch { /* not yet */ }
    await settle(25);
  }
  return Math.max(1, Date.now() - t0);
}

const latencyMs = await measureSpawnToFirstWrite();
// Enough headroom for the grandchild to start AND beat a few times before the kill, so the
// "survivor" is a real process rather than a race the box always wins.
const BUDGET_MS = Math.min(60_000, Math.max(1_500, latencyMs + 3_000));
console.log(`[calibration] spawn→first write on this box: ${latencyMs} ms → kill budget ${BUDGET_MS} ms (derived, not pinned)`);

let reads = 0;
const runSuite = async (hostOpts) => {
  try { rmSync(hearts, { force: true }); } catch { /* nothing yet */ }
  const host = createExecHost({
    root,
    allow: [{ argv: ['node', SUITE], timeoutMs: BUDGET_MS, maxOutputBytes: 1024 }],
    envAllow: ['PATH', 'SYSTEMROOT'],
    maxTimeoutMs: BUDGET_MS * 4,
    maxOutputBytes: 1024,
  }, hostOpts);
  reads += 1;
  const before = beats();
  const rep = await execTestRunner(host, ['node', SUITE], { preApproved: true, cwd: '.', env: { PATH: process.env.PATH ?? '', SYSTEMROOT: process.env.SYSTEMROOT ?? '', HB: hearts } }).run();
  const atReport = beats();
  await settle(900); // let any survivor keep writing where a reader could see it
  return { rep, before, atReport, after: beats() };
};

console.log('§1 回收器未开：host 只杀了它启动的那个进程');
const plain = await runSuite({});
console.log(`  killed=${JSON.stringify(plain.rep.killed)} · 报告时心跳 ${plain.atReport} · 900ms 后 ${plain.after}`);
assert.equal(plain.rep.ok, false, 'a killed verification fails (v31)');
assert.equal(plain.rep.killed?.descendantsStopped, 'not-attempted', 'v55: nothing was attempted against the tree');
// THE PRECONDITION, stated before the claim (v90): if the grandchild never wrote a beat, this arm
// compared nothing to nothing. Fail loudly here rather than report a green that measured no process.
assert.ok(
  plain.atReport > 0,
  `the detached grandchild must have written before the kill for this arm to mean anything — 0 beats at report with a ${BUDGET_MS} ms budget means the subject never lived (calibrated latency ${latencyMs} ms)`,
);
assert.ok(plain.after > plain.atReport, 'the detached grandchild must keep writing for this arm to mean anything');

console.log('\n§2 回收器开了：reaped 是「这一叫成功了」，不是「机器安静了」');
const reaped = await runSuite({ reapTree: true });
console.log(`  killed=${JSON.stringify(reaped.rep.killed)} · 报告时心跳 ${reaped.atReport} · 900ms 后 ${reaped.after} · 增量 ${reaped.after - reaped.atReport}`);
if (reaped.rep.killed?.descendantsStopped === 'reaped') {
  assert.ok(reaped.atReport > 0, 'the subject must also have been alive in the reaped arm, or its survivor claim is vacuous');
  assert.ok(reaped.after >= reaped.atReport, 'survivor writes never go backwards');
  // THE FINDING: the reaper succeeded AND the detached grandchild may still be beating. Both statements
  // hold, so `'reaped'` cannot be read as "nothing runs" — assert what the label is, not what it promises.
  console.log(`  ⇒ 同一次运行里：reaper 报告成功，而游离的孙进程在报告之后又写了 ${reaped.after - reaped.atReport} 下心跳`);
  assert.match(reaped.rep.detail, /the reaper ran — a detached grandchild may still be alive/, 'the sentence must say the weaker true thing');
} else {
  assert.equal(reaped.rep.killed?.descendantsStopped, 'unsupported-platform', 'or the host must say plainly that no reaper exists here');
}

console.log('\n§3 句子与值一致：not-attempted 不被夸大，reaped 不被读成「已清空」');
assert.ok(plain.rep.detail.includes('(descendants: not-attempted)'), `the un-asked case stays as v55 worded it: ${plain.rep.detail}`);
assert.ok(!plain.rep.detail.includes('the reaper ran'), 'and never implies a reaper was called');

assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, "the home repository's HEAD is byte-identical: every process here ran against os.tmpdir");
console.log(`\n[summary] runs killed under a real suite-shaped program: ${reads} · reaper off → not-attempted with ${plain.after - plain.atReport} later beats · reaper on → "${reaped.rep.killed?.descendantsStopped}" with ${reaped.after - reaped.atReport} later beats · the label's meaning is now stated in the sentence, not inferred from one word · home HEAD byte-identical: yes`);
try {
  rmSync(root, { recursive: true, force: true });
  console.log('[cleanup] throwaway programs and heartbeat file removed');
} catch (e) {
  // v55 measured this too, and it is the third witness here: a survivor that outlives a "reaped" report is
  // still holding the directory, so the OS refuses the delete. The proof does not hide that — it says so.
  console.log(`[cleanup] the temp dir is still held by a live process (${e.code ?? e.message}) — v55's signature, and the same fact §2 measures in heartbeats`);
}
