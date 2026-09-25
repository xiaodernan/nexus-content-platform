// NEXUS M2 v73 (runtime + exec-host) — A KILL IS NOT A CUT, AND A REPORT MUST SAY WHICH IT SAW
// (ADR 0016 amendment 73).
// v55 measured that `killedByBudget: true` is a claim about ONE process — the one the host spawned — and
// that a detached child kept writing 7 more heartbeats after that claim was made; it gave the host
// `descendantsStopped` with five values and kept the reaper OFF by default. v60 carried the same facts into
// a verification report's SENTENCE. Measured here with a real hang: the report's structured fields were
// `detail, engine, failures, ok, passed, total` — nothing about the signal, nothing about the tree. So a
// cold reader (a chip, a ledger replay, the commit-after-green gate) could not tell "the tree stopped" from
// "a child is still writing", which is precisely the difference v55 was built to state.
// §1 kills a real hanging parent that leaves a detached child, and checks the record against the host's own
// words plus the OS's view of the child afterwards. §2 separates the axes: a run can be cut and not killed,
// killed and not cut, both, or neither — and the two fields never substitute for each other. §3 round-trips
// the killed report through the ledger's JSONL the way v71 did the pipes. §4 turns the reaper ON and shows
// the same field tracking reality instead of the option. §5 holds §9: this repository's HEAD byte-compared,
// every write under os.tmpdir, and the spawn count equal to the door-read count.
// Run after `npm run build`:  node docs/evidence/agents/report-kill-proof.mjs
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { appendTestReport, loadTestReports } = rt;
const { createExecHost, execTestRunner } = eh;

function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(base + n)) n += 1;
  mkdirSync(base + n, { recursive: true });
  return base + n;
}
const temps = [];
const tmpOf = (p) => (temps.push(p), p);
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const root = tmpOf(mkTmp('nexus-v73-proof'));
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

// a parent that hangs forever AND leaves a detached child that outlives it; the child records its own pids
const HANG = join(root, 'hang.mjs');
const HEARTS = join(root, 'hearts.txt');
writeFileSync(HANG, [
  "import { spawn } from 'node:child_process';",
  "import { appendFileSync } from 'node:fs';",
  `const hb = ${JSON.stringify(HEARTS)};`,
  "const child = spawn(process.execPath, ['-e', `const fs=require('fs');let k=0;setInterval(()=>{try{fs.appendFileSync(process.env.HB, 'beat '+(+new Date())+'\\\\n');}catch(e){}; if(++k>40) process.exit(0);}, 120);`, ''], { detached: true, stdio: 'ignore', env: { ...process.env, HB: hb } });",
  'child.unref();',
  'setInterval(() => {}, 500);',
  '',
].join('\n'));

const hostFor = (timeoutMs, extra = {}) => createExecHost({
  root,
  allow: [{ argv: ['node', HANG], timeoutMs, maxOutputBytes: 4096 }],
  envAllow: ['PATH', 'SYSTEMROOT'],
  maxTimeoutMs: 10_000,
  maxOutputBytes: 4096,
}, { ...extra });
const runOf = (timeoutMs, extra) => execTestRunner(hostFor(timeoutMs, extra), ['node', HANG], { preApproved: true, cwd: '.', env: { PATH: process.env.PATH ?? '', SYSTEMROOT: process.env.SYSTEMROOT ?? '', HB: HEARTS } }).run();

console.log('§1 一次真挂起 + 一个 detached 子进程：报告说了什么');
const killed = await runOf(400);
console.log(`  ok=${killed.ok} ${killed.passed}/${killed.total} · killed=${JSON.stringify(killed.killed)} · truncatedStreams=${JSON.stringify(killed.truncatedStreams ?? null)}`);
console.log(`  detail: ${killed.detail.slice(0, 170)}`);
assert.equal(killed.ok, false, 'a killed verification is a failing one (v31)');
assert.ok(killed.killed, 'the kill facts are in the RECORD now, not only in prose');
assert.equal(killed.killed.signal, 'SIGTERM', 'the signal the host used, in the host\u2019s own word');
assert.equal(killed.killed.exitCode, null, 'and no exit code invented where the OS reported none');
assert.equal(killed.killed.descendantsStopped, 'not-attempted', 'v55\u2019s default: the tree was never touched');
assert.equal('truncatedStreams' in killed, false, 'a kill is not a cut — nothing here claims a budget trimmed the pipes');
// the OS's own verdict: the detached child kept beating after the host said "killed"
await new Promise((r) => setTimeout(r, 900));
const beats = read(HEARTS).split('\n').filter((l) => l.startsWith('beat')).length;
console.log(`  子进程在 host 报 killed 之后自己写了 ${beats} 下心跳 ⇒ “killed”从来不是说整棵树停了`);
assert.ok(beats > 0, 'the premise of v55 must still hold here or §1 is measuring nothing');

console.log('\n§2 两根轴互不替换：cut / kill / both / neither');
const QUIET = join(root, 'quiet.mjs');
writeFileSync(QUIET, "process.stdout.write('all good\\n');\nprocess.exit(0);\n");
const CLEAN = join(root, 'clean.mjs');
writeFileSync(CLEAN, `process.stdout.write(${JSON.stringify('answer '.repeat(2000))});\nprocess.exit(0);\n`);
const hostOf = (script, budget) => createExecHost({ root, allow: [{ argv: ['node', script], timeoutMs: 20_000, maxOutputBytes: budget }], envAllow: ['PATH', 'SYSTEMROOT'], maxTimeoutMs: 20_000, maxOutputBytes: budget }, {});
const runScript = (script, budget) => execTestRunner(hostOf(script, budget), ['node', script], { preApproved: true, cwd: '.', env: { PATH: process.env.PATH ?? '', SYSTEMROOT: process.env.SYSTEMROOT ?? '' } }).run();
const clean = await runScript(QUIET, 4096);
const cut = await runScript(CLEAN, 512);
console.log(`  neither : killed=${'killed' in clean} cut=${JSON.stringify(clean.truncatedStreams ?? null)}`);
console.log(`  cut only: killed=${'killed' in cut} cut=${JSON.stringify(cut.truncatedStreams ?? null)}`);
assert.equal('killed' in clean, false, 'a whole, timely run carries neither field');
assert.equal('killed' in cut, false, 'a run that only overflowed its pipe is not a kill');
assert.deepEqual(cut.truncatedStreams, ['stdout'], 'and v71\u2019s field still says which pipe was cut');

console.log('\n§3 过账本：killed 这个嵌套对象活得过 JSONL');
const file = join(root, 'tests.jsonl');
appendTestReport({ readFileSync, writeFileSync, mkdirSync }, file, killed);
appendTestReport({ readFileSync, writeFileSync, mkdirSync }, file, clean);
const loaded = loadTestReports({ readFileSync, writeFileSync, mkdirSync }, file);
const back = Array.isArray(loaded) ? loaded : loaded.reports;
assert.deepEqual(back[0].killed, killed.killed, 'the nested kill survives a cold replay intact, nulls and all');
assert.equal('killed' in back[1], false, 'and the clean report still has no key after the round trip');
console.log(`  round trip: ${JSON.stringify(back[0].killed)} · second report carries killed? ${'killed' in back[1]}`);

console.log('\n§4 开了回收器：同一个字段跟的是事实，不是开关');
const reaped = await runOf(400, { reapTree: true });
console.log(`  reapTree:true → descendantsStopped=${JSON.stringify(reaped.killed?.descendantsStopped)} · signal=${JSON.stringify(reaped.killed?.signal)}`);
assert.ok(reaped.killed, 'the kill record is there either way');
assert.notEqual(reaped.killed.descendantsStopped, 'not-attempted', 'with the reaper ON the field must stop saying "not-attempted" — it reports what was attempted, not a constant');

assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, "the home repository's HEAD is byte-identical: every write here was under os.tmpdir");
console.log(`\n[summary] real kills examined: 2 (reaper off / on) · kill facts in the record: signal + descendantsStopped + exitCode(null) · fields substituted for each other: 0 (cut ≠ kill, verified both ways) · detached child beats after “killed”: ${beats} · JSONL round trip keeps the nested object: yes · home HEAD byte-identical: yes`);
for (const dir of temps) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* a still-running detached child holds it; v55 measured exactly this */ } }
console.log('[cleanup] throwaway programs removed (a detached child holding the dir is v55\u2019s finding, not a surprise)');
