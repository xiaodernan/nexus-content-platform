// NEXUS M2 v55 (exec-host) — A KILLED PARENT IS NOT A KILLED TREE (ADR 0016 amendment 55).
// The host's `killedByBudget: true` has always meant ONE thing — the process the host started was
// terminated — and it has always been read as a second thing it never covered: that the run is over.
// Measured with real processes before this file was written: a program that leaves a DETACHED child
// behind kept writing 6 more heartbeats after the host reported `killedByBudget: true, signal:
// SIGTERM`, and the temp directory it was writing into could not be deleted, because a live process
// still held it open. The sandbox's own cleanup was being outlived by the thing it killed.
//
// What the increment does, and what it refuses to do:
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
//   §5 a non-detached child is NOT a survivor — the plain kill already gets it, so the increment is
//      scoped to what measurement showed, not to a general promise of killing every descendant;
//   §6 the v51 record carries the new claim, and the v30/v51 readers are unmoved by it.
// §9 throughout: real processes, but every file under os.tmpdir, nothing of THIS repo touched, home
// HEAD compared byte-wise at the end — and cleanup waits for survivors, because that is the bug.
// Run after `npm run build`:  node docs/evidence/agents/reap-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
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
writeFileSync(`${workRoot}/grand.js`, 'const fs = require("node:fs");\n(async () => {\n  for (let i = 0; i < 40; i++) {\n    fs.appendFileSync(process.argv[2], "beat " + process.argv[3] + " " + i + "\\n");\n    await new Promise((r) => setTimeout(r, 120));\n  }\n})();\n');
/** The run the host starts: it spawns the grandchild (detached or not) and then idles forever. */
writeFileSync(`${workRoot}/parent.js`, [
  'const { spawn } = require("node:child_process");',
  'const fs = require("node:fs");',
  'const [log, tag, mode] = process.argv.slice(2);',
  'fs.appendFileSync(log, "parent " + process.pid + " " + tag + "\\n");',
  'const opts = { stdio: "ignore", detached: mode === "detached", windowsHide: true };',
  'const c = spawn(process.execPath, [process.argv[1].replace(/parent\\.js$/, "grand.js"), log, tag + "-g"], opts);',
  'if (mode === "detached") c.unref();',
  'fs.appendFileSync(log, "parent " + process.pid + " spawned " + c.pid + " detached=" + (mode === "detached") + "\\n");',
  'setInterval(() => {}, 1000);',
].join('\n'));

const fsDisk = {
  readFileSync: (file, encoding) => readFileSync(file, encoding),
  mkdirSync: (dir) => mkdirSync(dir, { recursive: true }),
  writeFileSync: (file, data, encoding) => writeFileSync(file, data, encoding),
};
const beats = (tag) => (existsSync(BEATS) ? readFileSync(BEATS, 'utf8').split('\n').filter((l) => l.includes(tag)).length : 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const parentPid = (tag) => {
  const line = readFileSync(BEATS, 'utf8').split('\n').find((l) => l.startsWith('parent ') && l.includes(tag));
  return line === undefined ? 0 : Number(line.split(' ')[1]);
};

/** One run of the real parent, through a real host, killed at `timeoutMs`. */
async function runKilled(tag, { mode, reapTree, journal, timeoutMs = 700 }) {
  const argv = ['node', `${workRoot}/parent.js`, BEATS, tag, mode];
  const policy = {
    root: workRoot,
    allow: [{ argv, timeoutMs, maxOutputBytes: 4096 }],
    envAllow: ['PATH', 'SYSTEMROOT', 'HOME', 'USERPROFILE'],
    maxTimeoutMs: 30_000,
    maxOutputBytes: 4096,
  };
  const options = { spawnLike: NODE_SPAWN, reapTree };
  if (journal) options.journal = { disk: fsDisk, file: journal };
  const result = await createExecHost(policy, options).run({ argv, cwd: '', env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT } }, { preApproved: true });
  return { argv, result };
}

try {
  // ---------- §1 the survivor is real, and the record says the tree was not attempted ----------
  const { result: plain } = await runKilled('plain', { mode: 'detached', reapTree: false });
  assert.equal(plain.ran, true, 'the process started, so this is a kill and not a refusal');
  assert.equal(plain.killedByBudget, true, 'the host did kill the process it started');
  assert.equal(plain.signal, 'SIGTERM', 'and the direct kill reported what a direct kill reports');
  assert.equal(plain.descendantsStopped, 'not-attempted', 'v55: the claim the host is actually able to make');
  const atKill = beats('plain-g');
  await sleep(900);
  const afterPlain = beats('plain-g');
  assert.ok(afterPlain > atKill, `a detached child kept writing after the host said the run was killed (${atKill} beats at the kill, ${afterPlain} 0.9 s later)`);
  console.log(`[reap-proof] §1 killed parent, living tree: ${afterPlain - atKill} MORE heartbeats after killedByBudget=true · descendantsStopped="${plain.descendantsStopped}"`);

  // ---------- §2 the reaper, on the platform that has one; §60 says which that is ----------
  const { result: reaped } = await runKilled('reap', { mode: 'detached', reapTree: true });
  const beatsAtKill = beats('reap-g');
  await sleep(900);
  const beatsLater = beats('reap-g');
  if (TREE_REAPER_AVAILABLE) {
    assert.equal(reaped.descendantsStopped, 'reaped', `the reaper was asked and reported success on ${process.platform}`);
    assert.equal(beatsLater, beatsAtKill, `the survivor went silent: ${beatsAtKill} beats at the kill, ${beatsLater} 0.9 s later — no growth`);
    // The substitution is visible in the exit fields the OS reported, and the record keeps them.
    assert.equal(reaped.killedByBudget, true, 'the host still knows it ended this run by budget');
    assert.notEqual(reaped.signal, 'SIGTERM', 'yet the signal a `child.kill()` would have reported is NOT what a force-kill of the tree reports');
    console.log(`[reap-proof] §2 reaped on ${process.platform}: exit=${reaped.exitCode} signal=${reaped.signal} killedByBudget=${reaped.killedByBudget} · heartbeats ${beatsAtKill} → ${beatsLater} (silence)`);
  } else {
    assert.equal(reaped.descendantsStopped, 'unsupported-platform', 'no reaper exists here, and the host says that instead of pretending');
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
  assert.equal(typeof DEFAULT_TREE_REAPER(0), 'boolean', 'the default reaper answers a question even about a pid that cannot exist');
  assert.equal(DEFAULT_TREE_REAPER(0), false, 'and it does not upgrade "I could not" into "I did"');
  assert.equal(typeof TREE_REAPER_AVAILABLE, 'boolean', 'the host exposes whether reaping exists HERE, so §2 could assert the truth of this box instead of a hope');
  console.log(`[reap-proof] §4 platform=${process.platform} TREE_REAPER_AVAILABLE=${TREE_REAPER_AVAILABLE} · DEFAULT_TREE_REAPER(0)=false (a failed call is reported, never hidden)`);

  // ---------- §5 scope: an ATTACHED child was never the problem ----------
  const { result: attached } = await runKilled('attach', { mode: 'attached', reapTree: false });
  const attachedAtKill = beats('attach-g');
  await sleep(900);
  const attachedLater = beats('attach-g');
  assert.equal(attached.descendantsStopped, 'not-attempted', 'the host started one process and stopped it; that is all it claims');
  assert.equal(attachedLater, attachedAtKill, `an attached child died with its parent (${attachedAtKill} beats, then nothing) — so this increment is about DETACHED survivors, and §1/§2 measured exactly that`);
  console.log(`[reap-proof] §5 attached child: ${attachedAtKill} beats at the kill, ${attachedLater} after — no survivor to reap, which is why the default was never a bug, only a limit`);

  // ---------- §6 v51 carries the new claim; v30/v51 readers are unmoved ----------
  const journal = `${workRoot}/journal/reap.jsonl`;
  await runKilled('journaled', { mode: 'detached', reapTree: true, journal });
  const { records, malformed } = loadExecAudits(fsDisk, journal);
  assert.equal(malformed, 0, 'the v51 reader takes the new field without complaint (shape-before-trust, unchanged)');
  assert.equal(records.length, 1, 'and the killed run is journalled like any other outcome');
  assert.equal(records[0].killedByBudget, true, 'the record says the budget killed it');
  assert.equal(records[0].descendantsStopped, TREE_REAPER_AVAILABLE ? 'reaped' : 'unsupported-platform', 'and says what became of the tree — the two facts an operator needs together');
  assert.ok(records[0].argv.length === 5 && records[0].argv[0] === 'node' && records[0].argv[1].endsWith('parent.js'), 'the argv is recorded verbatim, as in v51');
  console.log(`[reap-proof] §6 the v51 record of a killed run: killedByBudget=${records[0].killedByBudget} descendantsStopped="${records[0].descendantsStopped}" · seq ${records[0].seq}, rule ${records[0].rule}, malformed 0`);
} finally {
  // The finding applies to the proof itself: a survivor can hold the directory open, so the
  // cleanup reaps the trees it started before removing them. Deleting first and hoping is v53 behaviour.
  for (const tag of ['plain', 'reap', 'attach', 'journaled']) {
    const pid = parentPid(tag);
    if (pid > 0) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
  }
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
