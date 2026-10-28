// NEXUS M2 v55 (exec-host) — A KILLED PARENT IS NOT A KILLED TREE (ADR 0016 amendment 55).
// The host's `killedByBudget: true` has always meant ONE thing — the process the host started was
// terminated — and it has always been read as a second thing it never covered: that the run is over.
// Measured with real processes before this file was written: a program that leaves a DETACHED child
// behind kept writing 6 more heartbeats after the host reported `killedByBudget: true, signal:
// SIGTERM`, and the temp directory it was writing into could not be deleted, because a live process
// still held it open. The sandbox's own cleanup was being outlived by the thing it killed.
//
// What the increment does, and what it refuses to do:
//   §0 the box is measured before its processes are judged: spawn→first-write latency, in ms, becomes
//      the kill budget (4×, floored at 700) — v86, because a budget under the latency kills a run that
//      never executed a line, and every claim below is a claim about what happened AFTER a kill;
//   §1 the survivor, measured — the host kills, the child keeps writing, and the record SAYS the
//      tree was not attempted;
//   §2 the same command with `reapTree: true` on win32 — silence, and the exit fields the OS
//      actually reported (code 1, signal null) beside `killedByBudget: true`, not smoothed over;
//   §3 WHY the reaper replaces the kill instead of following it: `taskkill /T` on a pid the host
//      already killed reports not-found, and the survivor carries on — so kill-then-reap is a
//      no-op that LOOKS like hygiene;
//   §4 the platform answer is a value, not a rumour: where there is no reaper the host says
//      `unsupported-platform` and the survivor still writes, and this section asserts whichever
//      branch is true HERE rather than pretending both were measured;
//   §5 which children a plain kill already gets is a PLATFORM answer, measured here: on win32 an
//      attached child dies with its parent, so the increment is scoped to detached survivors; on
//      POSIX the same attached child KEEPS WRITING (v534 measured it — a parent's death does not end
//      its children), so there the limit covers every child, and the platform branch says so;
//   §6 the v51 record carries the new claim, and the v30/v51 readers are unmoved by it.
// §9 throughout: real processes, but every file under os.tmpdir, nothing of THIS repo touched, home
// HEAD compared byte-wise at the end — and cleanup waits for survivors, because that is the bug.
// v534 (amendment 520): the teardown and §0's probe end are platform-honest too — taskkill on win32,
// a recorded-pid SIGTERM on POSIX (the old teardown called taskkill unconditionally, which on Linux
// is a spawn error nobody read; the survivors outlived the run).
// v86 turned two of §9's rules on this file itself: an assertion about silence may not be satisfied by
// a survivor that never existed (`0 === 0`), and teardown reaps the ORPHANS the parents recorded,
// because a detached grandchild is not in a dead parent's tree. A cleanup that throws now reports the
// finding it masked instead of replacing it.
// Run after `npm run build`:  node docs/evidence/agents/reap-proof.mjs
// sweep-budget-ms: 600000
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from '../lib/syncproc.mjs';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { NODE_SPAWN, createExecHost, DEFAULT_TREE_REAPER, TREE_REAPER_AVAILABLE, loadExecAudits } = eh;

const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const workRoot = mkTmp('nexus-v55-proof');
const BEATS = `${workRoot}/heartbeats.txt`;

/** A grandchild that outlives its parent by a wide margin if nobody stops it. */
writeFileSync(`${workRoot}/grand.js`, 'const fs = require("node:fs");\n(async () => {\n  for (let i = 0; i < 1500; i++) {\n    fs.appendFileSync(process.argv[2], "beat " + process.argv[3] + " " + i + "\\n");\n    await new Promise((r) => setTimeout(r, 120));\n  }\n})();\n');
/** The run the host starts: it spawns the grandchild (detached or not) and then idles forever. */
writeFileSync(`${workRoot}/parent.js`, [
  'const { spawn } = require("node:child_process");',
  'const fs = require("node:fs");',
  'const [log, tag, mode] = process.argv.slice(2);',
  'fs.appendFileSync(log, "parent " + process.pid + " " + tag + "\\n");',
  'const opts = { stdio: "ignore", detached: mode === "detached", windowsHide: true };',
  'const c = spawn(process.execPath, [process.argv[1].replace(/parent\\.js$/, "grand.js"), log, tag + "-g"], opts);',
  'if (mode === "detached") c.unref();',
  'fs.appendFileSync(log, "parent " + process.pid + " spawned " + c.pid + " tag=" + tag + " detached=" + (mode === "detached") + "\\n");',
  'setInterval(() => {}, 1000);',
].join('\n'));

const fsDisk = {
  readFileSync: (file, encoding) => readFileSync(file, encoding),
  mkdirSync: (dir) => mkdirSync(dir, { recursive: true }),
  writeFileSync: (file, data, encoding) => writeFileSync(file, data, encoding),
};
const beats = (tag) => (existsSync(BEATS) ? readFileSync(BEATS, 'utf8').split('\n').filter((l) => l.includes(tag)).length : 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * M2 v86 — the pids this proof may still owe a kill to. `parentPid` alone was NOT enough: §1's whole
 * finding is that a DETACHED grandchild outlives its parent, so by cleanup time the parent is dead and
 * `taskkill /PID <parent> /T` walks a tree that no longer exists — the survivor is an ORPHAN, reachable
 * only through the handle the parent recorded WHILE it was alive. §3's ordering lesson, applied to the
 * proof's own teardown.
 */
const treeHandles = (tag) => {
  if (!existsSync(BEATS)) return [];
  const lines = readFileSync(BEATS, 'utf8').split('\n');
  const parent = lines.find((l) => l.startsWith('parent ') && !l.includes(' spawned ') && l.includes(tag));
  const spawned = lines.filter((l) => l.startsWith('parent ') && l.includes(' spawned ') && l.includes(`tag=${tag} `)).map((l) => Number(l.split(' spawned ')[1].split(' ')[0]));
  return [...new Set([parent ? Number(parent.split(' ')[1]) : 0, ...spawned].filter((n) => Number.isInteger(n) && n > 0))];
};

/** The parent's own pid — what §1 records and §3 targets. 0 when there is no such line, including when the file itself never appeared (v86: cleanup must not throw over a failure it did not cause). */
const parentPid = (tag) => {
  if (!existsSync(BEATS)) return 0;
  const line = readFileSync(BEATS, 'utf8').split('\n').find((l) => l.startsWith('parent ') && !l.includes(' spawned ') && l.includes(tag));
  return line === undefined ? 0 : Number(line.split(' ')[1]);
};

/** End a process this proof started: taskkill's tree on win32, a direct signal elsewhere (handles are recorded, so orphans are still named). */
const killTree = (pid) => {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
  else {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
};

/**
 * M2 v86 — `ran: true` is the host's claim about ONE process: the spawn call it made succeeded.
 * It says nothing about whether that process ever RAN, and on this box the difference is measured,
 * not theoretical: `node --version` as a child took 6 000+ ms to produce nothing at all while a
 * saturated host let `git --version` answer in 10 594 ms. So a budget of 700 ms killed a parent
 * that had not yet executed its first statement, the heartbeat file never existed, and this proof's
 * central assertion — `beatsLater === beatsAtKill`, "the survivor went silent" — was satisfied by
 * 0 === 0. A silence measured over an absent survivor is not a finding about reaping.
 *
 * Therefore every run below is sampled while it is in flight, and an assertion about what happened
 * AFTER the kill is only allowed if the survivor was seen WRITING BEFORE it.
 */
const grewWhileAlive = (samples) => samples.some((s, i) => i > 0 && s.n > samples[i - 1].n && s.n > 0);

/** The kill budget, derived from §0's measurement of THIS host rather than from a constant. */
let KILL_BUDGET_MS = 700;

/** One run of the real parent, through a real host, killed at `timeoutMs`. */
async function runKilled(tag, { mode, reapTree, journal, timeoutMs = null }) {
  const budget = timeoutMs ?? KILL_BUDGET_MS;
  const argv = ['node', `${workRoot}/parent.js`, BEATS, tag, mode];
  const policy = {
    root: workRoot,
    allow: [{ argv, timeoutMs: budget, maxOutputBytes: 4096 }],
    envAllow: ['PATH', 'SYSTEMROOT', 'HOME', 'USERPROFILE'],
    maxTimeoutMs: 60_000,
    maxOutputBytes: 4096,
  };
  const options = { spawnLike: NODE_SPAWN, reapTree };
  if (journal) options.journal = { disk: fsDisk, file: journal };
  const started = Date.now();
  let sampling = true;
  const samples = [];
  const sampler = (async () => {
    while (sampling) {
      await sleep(120);
      samples.push({ t: Date.now() - started, n: beats(`${tag}-g`) });
    }
  })();
  const result = await createExecHost(policy, options).run({ argv, cwd: '', env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT } }, { preApproved: true });
  sampling = false;
  await sampler;
  return { argv, result, budget, samples, live: grewWhileAlive(samples) };
}

try {
  // ---------- §0 what a child costs to EXIST here, measured before any of it is killed ----------
  // Every assertion below is about what happens AFTER a kill, so the proof first measures how long
  // a child takes to run AT ALL on this box. The number is not decoration: it becomes the budget the
  // other sections kill at, so no section can be red because a constant in this file was smaller
  // than the host's spawn latency (v85's rule, turned on this proof).
  const latencyStarted = Date.now();
  const latencyRun = runKilled('latency', { mode: 'attached', reapTree: false, timeoutMs: 30_000 });
  let spawnLatencyMs = null;
  while (Date.now() - latencyStarted < 30_000) {
    const pid = parentPid('latency');
    if (pid > 0) {
      spawnLatencyMs = Date.now() - latencyStarted;
      killTree(pid); // end the probe instead of waiting out its ceiling
      break;
    }
    await sleep(50);
  }
  await latencyRun;
  assert.ok(spawnLatencyMs !== null, `no node child wrote anything within 30 000 ms — this box cannot run a proof about killing processes, and saying so is §0's job, not an assertion's`);
  KILL_BUDGET_MS = Math.max(700, spawnLatencyMs * 4);
  console.log(`[reap-proof] §0 spawn→first-write latency = ${spawnLatencyMs}ms (measured, this run), so every kill below happens at ${KILL_BUDGET_MS}ms = max(700, 4×latency) — a budget under the latency would kill a process that never ran`);

  // ---------- §1 the survivor is real, and the record says the tree was not attempted ----------
  const { result: plain, live: plainLive } = await runKilled('plain', { mode: 'detached', reapTree: false });
  assert.equal(plain.ran, true, 'the process started, so this is a kill and not a refusal');
  assert.ok(plainLive, 'and the survivor was OBSERVED WRITING while its parent was still alive — §1 below compares two counts, and a count that never moves proves nothing about either');
  assert.equal(plain.killedByBudget, true, 'the host did kill the process it started');
  assert.equal(plain.signal, 'SIGTERM', 'and the direct kill reported what a direct kill reports');
  assert.equal(plain.descendantsStopped, 'not-attempted', 'v55: the claim the host is actually able to make');
  const atKill = beats('plain-g');
  assert.ok(atKill > 0, `the detached grandchild had written ${atKill} beats by the kill — 0 would mean the parent died before spawning it, i.e. the budget was a fact about this box, not about the host`);
  await sleep(900);
  const afterPlain = beats('plain-g');
  assert.ok(afterPlain > atKill, `a detached child kept writing after the host said the run was killed (${atKill} beats at the kill, ${afterPlain} 0.9 s later)`);
  console.log(`[reap-proof] §1 killed parent, living tree: ${afterPlain - atKill} MORE heartbeats after killedByBudget=true · descendantsStopped="${plain.descendantsStopped}"`);

  // ---------- §2 the reaper, on the platform that has one; §60 says which that is ----------
  const { result: reaped, live: reapLive } = await runKilled('reap', { mode: 'detached', reapTree: true });
  const beatsAtKill = beats('reap-g');
  assert.ok(reapLive, 'the same precondition as §1: the survivor this section calls silent was seen writing first');
  await sleep(900);
  const beatsLater = beats('reap-g');
  if (TREE_REAPER_AVAILABLE) {
    assert.equal(reaped.descendantsStopped, 'reaped', `the reaper was asked and reported success on ${process.platform}`);
    assert.ok(beatsAtKill > 0, `the survivor had ${beatsAtKill} beats at the kill — "no growth" over an absent process is 0 === 0, which is not a finding (v86)`);
    assert.equal(beatsLater, beatsAtKill, `the survivor went silent: ${beatsAtKill} beats at the kill, ${beatsLater} 0.9 s later — no growth`);
    // The substitution is visible in the exit fields the OS reported, and the record keeps them.
    assert.equal(reaped.killedByBudget, true, 'the host still knows it ended this run by budget');
    assert.notEqual(reaped.signal, 'SIGTERM', 'yet the signal a `child.kill()` would have reported is NOT what a force-kill of the tree reports');
    console.log(`[reap-proof] §2 reaped on ${process.platform}: exit=${reaped.exitCode} signal=${reaped.signal} killedByBudget=${reaped.killedByBudget} · heartbeats ${beatsAtKill} → ${beatsLater} (silence)`);
  } else {
    assert.equal(reaped.descendantsStopped, 'unsupported-platform', 'no reaper exists here, and the host says that instead of pretending');
    assert.ok(beatsAtKill > 0, `the survivor had ${beatsAtKill} beats before the platform branch ran at all`);
    assert.ok(beatsLater > beatsAtKill, 'and the survivor behaves exactly as in §1');
    console.log(`[reap-proof] §2 no reaper on ${process.platform}: stated as unsupported, survivor wrote ${beatsLater - beatsAtKill} more — the silence claim would have been a lie here`);
  }

  // ---------- §3 why the reaper REPLACES the kill: after the kill there is no tree to find ----------
  if (TREE_REAPER_AVAILABLE) {
    const dead = parentPid('plain');
    assert.ok(dead > 0, 'the parent of §1 recorded its own pid, so the control below targets a real process');
    const late = spawnSync('taskkill', ['/PID', String(dead), '/T', '/F'], { encoding: 'utf8', windowsHide: true });
    const beforeLate = beats('plain-g');
    await sleep(700);
    const afterLate = beats('plain-g');
    assert.notEqual(late.status, 0, `reaping AFTER the kill targets a pid that is already gone (taskkill status ${late.status}) — this is the shape of a no-op that looks like hygiene`);
    assert.ok(afterLate > beforeLate, 'and the survivor is still writing while the reaper reports nothing to kill');
    console.log(`[reap-proof] §3 kill-then-reap: taskkill on the dead pid → status ${late.status}, heartbeats still grew ${beforeLate} → ${afterLate} · reaping must be a SUBSTITUTION`);
  } else {
    console.log('[reap-proof] §3 skipped: no tree reaper on this platform, so there is no ordering to measure here');
  }

  // ---------- §4 the answer is a value the caller can branch on, not a silent no ----------
  // M2 v86: the default reaper is ASYNC. It cannot use the synchronous spawn API on this host —
  // `spawnSync`/`execFileSync`/`execSync` all fail with EBUSY, in a worker thread too — so it
  // drives `taskkill` through the working async path and answers with a Promise. That is exactly
  // why §2 was able to pass above: before v86 the sync call always failed here, so `reapTree: true`
  // silently degraded to a plain kill and this file could never reach its `'reaped'` branch.
  const probe = DEFAULT_TREE_REAPER(0);
  assert.equal(typeof probe.then, 'function', 'the default reaper is async, so the host awaits it (v86)');
  assert.equal(await probe, false, 'and it does not upgrade "I could not" into "I did"');
  assert.equal(typeof TREE_REAPER_AVAILABLE, 'boolean', 'the host exposes whether reaping exists HERE, so §2 could assert the truth of this box instead of a hope');
  console.log(`[reap-proof] §4 platform=${process.platform} TREE_REAPER_AVAILABLE=${TREE_REAPER_AVAILABLE} · DEFAULT_TREE_REAPER(0)=false (async, and a failed call is reported, never hidden)`);

  // ---------- §5 scope: WHICH children a plain kill already gets — a platform answer, measured here ----------
  const { result: attached, live: attachLive } = await runKilled('attach', { mode: 'attached', reapTree: false });
  const attachedAtKill = beats('attach-g');
  await sleep(900);
  const attachedLater = beats('attach-g');
  assert.equal(attached.descendantsStopped, 'not-attempted', 'the host started one process and stopped it; that is all it claims');
  assert.ok(attachLive && attachedAtKill > 0, `the attached grandchild was seen writing BEFORE the kill (${attachedAtKill} beats) — v86: without that, "no growth after" below is 0 === 0 and would certify any silence whatsoever, including the silence of a process that never started`);
  if (process.platform === 'win32') {
    assert.equal(attachedLater, attachedAtKill, `an attached child died with its parent on win32 (${attachedAtKill} beats, then nothing) — so on this platform the increment is scoped to DETACHED survivors, and §1/§2 measured exactly that`);
    console.log(`[reap-proof] §5 attached child on win32: ${attachedAtKill} beats at the kill, ${attachedLater} after — no survivor to reap, which is why the default was never a bug, only a limit`);
  } else {
    assert.ok(attachedLater > attachedAtKill, `an attached child KEPT WRITING on ${process.platform} (${attachedAtKill} → ${attachedLater} beats) — a parent's death does not end its children here, so §1's limit covers EVERY child, not only detached ones; the host's answer is the platform one, "unsupported-platform", and it is the truth`);
    console.log(`[reap-proof] §5 attached child on ${process.platform}: ${attachedAtKill} → ${attachedLater} beats — surviving is not a detached-only property here, and the host says so (${attached.descendantsStopped})`);
  }

  // ---------- §6 v51 carries the new claim; v30/v51 readers are unmoved ----------
  const journal = `${workRoot}/journal/reap.jsonl`;
  const { result: journaled, live: journalLive } = await runKilled('journaled', { mode: 'detached', reapTree: true, journal });
  assert.ok(journalLive, 'and the journalled run is a real killed run: its survivor was writing before the kill');
  assert.equal(journaled.descendantsStopped, TREE_REAPER_AVAILABLE ? 'reaped' : 'unsupported-platform', 'the run whose record §6 reads really was decided the way §2 says this platform decides');
  const { records, malformed } = loadExecAudits(fsDisk, journal);
  assert.equal(malformed, 0, 'the v51 reader takes the new field without complaint (shape-before-trust, unchanged)');
  assert.equal(records.length, 1, 'and the killed run is journalled like any other outcome');
  assert.equal(records[0].killedByBudget, true, 'the record says the budget killed it');
  assert.equal(records[0].descendantsStopped, TREE_REAPER_AVAILABLE ? 'reaped' : 'unsupported-platform', 'and says what became of the tree — the two facts an operator needs together');
  assert.ok(records[0].argv.length === 5 && records[0].argv[0] === 'node' && records[0].argv[1].endsWith('parent.js'), 'the argv is recorded verbatim, as in v51');
  console.log(`[reap-proof] §6 the v51 record of a killed run: killedByBudget=${records[0].killedByBudget} descendantsStopped="${records[0].descendantsStopped}" · seq ${records[0].seq}, rule ${records[0].rule}, malformed 0`);
} catch (finding) {
  // M2 v86 — a cleanup that throws REWRITES the finding. Before this line the file's only reported
  // failure was `ENOENT: open …\heartbeats.txt` raised BY the cleanup, while the assertion that
  // actually failed (§1, at 700 ms, on a box where a node child needs seconds) was gone: two
  // different bugs, one error message, and the misleading one was the one a reader saw.
  console.error(`[reap-proof] ✗ the finding, before any cleanup touched it: ${finding instanceof Error ? finding.message : String(finding)}`);
  throw finding;
} finally {
  // The finding applies to the proof itself: a survivor can hold the directory open, so the
  // cleanup reaps the trees it started before removing them. Deleting first and hoping is v53 behaviour.
  // v86: the tree, not the parent — §1 deliberately leaves an ORPHAN, and an orphan is not reachable
  // through its dead parent's pid, so the handles come from the line the parent wrote while alive.
  const handles = ['latency', 'plain', 'reap', 'attach', 'journaled'].flatMap((tag) => treeHandles(tag));
  for (const pid of handles) killTree(pid);
  console.log(`[reap-proof] teardown: ${handles.length} process handle(s) recorded by the parents themselves were killed before the directory was touched (parent-only reaping would have found a dead tree and an open file)`);
  await sleep(400);
  let removed = false;
  for (let i = 0; i < 8 && !removed; i += 1) {
    try {
      rmSync(workRoot, { recursive: true, force: true });
      removed = !existsSync(workRoot);
    } catch {
      await sleep(400);
    }
  }
  assert.ok(removed, 'every throwaway file is gone — and proving that needed the very reaping this increment is about');
}

assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — every process here wrote only inside os.tmpdir');
console.log('[reap-proof] ALL ASSERTIONS PASSED (the host now says what it stopped, and can stop more when asked)');

function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(`${base}${n}`)) n += 1;
  mkdirSync(`${base}${n}`, { recursive: true });
  return `${base}${n}`;
}
