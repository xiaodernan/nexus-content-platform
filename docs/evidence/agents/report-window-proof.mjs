// NEXUS M2 v71 (exec-host + runtime) — A TEST REPORT'S VERDICT IS THE COMMAND'S OWN, BUT ITS EVIDENCE IS
// QUOTED FROM PIPES THE BUDGET MAY HAVE CUT, AND THE REPORT MUST SAY WHICH (ADR 0016 amendment 71).
// v60 gave the bridge's SENTENCE both pipes under their own labels; the structured `TestReport` still carried
// neither. So a chip that reads `passed/total` — the Studio dock's verification chips, a ledger replay, the
// commit-after-green gate — could see `1/1 ✓` while the answer it did NOT see was 2 500 bytes of stdout
// trimmed to 2 000. This proof measures the field with REAL processes: an exit code is exactly the fact no
// fixture can be trusted to reproduce faithfully (v60's lesson about comparing two different processes).
// §1 the three shapes through `execTestRunner` at a small ceiling; §2 the same fact surviving a registry
// round and a ledger JSONL round trip; §3 the shapes where the key must NOT appear (clean run, vacuous
// `only`-miss, §28 refusal); §4 states the bound v60 measured and this file does not re-run.
// Run after `npm run build`:  node docs/evidence/agents/report-window-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry, appendTestReport, loadTestReports, registerTestTools } = rt;
const { createExecHost, execTestRunner } = eh;

function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(base + n)) n += 1;
  mkdirSync(base + n, { recursive: true });
  return base + n;
}
const temps = [];
const root = mkTmp('nexus-v71-proof');
temps.push(root);
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const CEILING = 512;

/** one program, one ceiling; the argv is the policy's only shape, so the gate can never widen */
const program = (name, source) => {
  const file = join(root, name);
  writeFileSync(file, source, 'utf8');
  return file;
}
const hostFor = (script, budget = CEILING) =>
  createExecHost({ root, allow: [{ argv: ['node', script], timeoutMs: 20_000, maxOutputBytes: budget }], envAllow: ['PATH'], maxTimeoutMs: 20_000, maxOutputBytes: budget }, {});
const reportOf = async (script, budget) => {
  const r = await execTestRunner(hostFor(script, budget), ['node', script], { preApproved: true, cwd: '.', env: { PATH: process.env.PATH ?? '' } }).run();
  return r;
};

const LOUD_OUT = program('loud-out.mjs', `process.stdout.write(${JSON.stringify('answer line '.repeat(400))});\nprocess.exit(0);\n`);
const LOUD_ERR = program('loud-err.mjs', `process.stderr.write(${JSON.stringify('noise line '.repeat(400))});\nprocess.stdout.write('the answer, whole and small\\n');\nprocess.exit(0);\n`);
const LOUD_BOTH = program('loud-both.mjs', `process.stdout.write(${JSON.stringify('A'.repeat(4000))});\nprocess.stderr.write(${JSON.stringify('E'.repeat(4000))});\nprocess.exit(1);\n`);
const QUIET = program('quiet.mjs', "process.stdout.write('all good\\n');\nprocess.exit(0);\n");

console.log('§1 三种截断形状：判据是命令自己的，证据是被剪的管子');
const rOut = await reportOf(LOUD_OUT);
const rErr = await reportOf(LOUD_ERR);
const rBoth = await reportOf(LOUD_BOTH);
for (const [label, rep, ok, streams] of [['stdout cut', rOut, true, ['stdout']], ['stderr cut, answer whole', rErr, true, ['stderr']], ['both cut, exit 1', rBoth, false, ['stdout', 'stderr']]]) {
  console.log(`  ${label.padEnd(26)} ok=${rep.ok} ${rep.passed}/${rep.total} · truncatedStreams=${JSON.stringify(rep.truncatedStreams)} · ${rep.detail.slice(0, 96)}…`);
  assert.equal(rep.ok, ok, `${label}: a cut changes the EVIDENCE, never the verdict — exit ${ok ? 0 : 1} is git's/npm's own answer`);
  assert.deepEqual(rep.truncatedStreams, streams, `${label}: the report names which pipe the budget took`);
  assert.ok(/output truncated at budget/.test(rep.detail), `${label}: and its sentence has said so since v56/v60`);
}
assert.equal(rOut.truncatedStreams === undefined ? 'ABSENT' : rOut.truncatedStreams.join('+'), 'stdout', 'a green run can still be a window on its own answer');
const quiet = await reportOf(QUIET, 1 << 16);
console.log(`  quiet, generous ceiling      ok=${quiet.ok} · truncatedStreams in report? ${'truncatedStreams' in quiet}`);
assert.equal('truncatedStreams' in quiet, false, 'absent, never an empty list — the uncut report is byte-for-byte the report it was before v71');

console.log('\n§2 过账本：这个事实要走完它被读到的每一站');
const file = join(root, 'tests.jsonl');
const fsLike = { readFileSync, writeFileSync, mkdirSync };
appendTestReport(fsLike, file, await reportOf(LOUD_BOTH));
appendTestReport(fsLike, file, await reportOf(QUIET, 1 << 16));
const loadedRaw = loadTestReports(fsLike, file);
const loaded = Array.isArray(loadedRaw) ? loadedRaw : loadedRaw.reports;
assert.ok(Array.isArray(loaded) && loaded.length === 2, `the ledger must hand back both reports, got ${JSON.stringify(Object.keys(loadedRaw))}`);
console.log(`  ledger round trip: ${loaded.map((r) => JSON.stringify(r.truncatedStreams ?? null)).join(', ')}`);
assert.deepEqual(loaded[0].truncatedStreams, ['stdout', 'stderr'], 'the key survives the JSONL the dock replays cold');
assert.equal('truncatedStreams' in loaded[1], false, 'and its absence survives too — a cold reader never sees an empty list it has to interpret');

console.log('\n§3 三种不该出现这个键的形状');
const vacuous = await execTestRunner(hostFor(QUIET, 1 << 16), ['node', QUIET], { preApproved: true, cwd: '.', env: {} }).run('someone-else');
assert.equal('truncatedStreams' in vacuous, false, `a vacuous miss ran nothing at all: ${vacuous.detail}`);
const refused = await execTestRunner(hostFor(LOUD_OUT), ['node', LOUD_OUT], {}).run();
assert.equal(refused.ok, false, 'a §28 refusal is a failing report (v31)');
assert.equal(refused.failures[0].name, 'never-ran', 'filed under the name that keeps "nobody asked" from reading as "the test failed" (v60)');
assert.equal('truncatedStreams' in refused, false, 'and it names no pipe, because no pipe was opened');
console.log(`  vacuous only-miss · §28 refusal(never-ran) · clean run: none carries the key`);

console.log('\n§4 界限：这条 hazard 对唯一接线的套件是潜伏的，不是活的');
const shipped = readFileSync('./agents/exec-host/src/execTestRunner.ts', 'utf8');
assert.ok(shipped.includes('truncatedStreams'), 'the bridge copies the host list into the report');
console.log('  v60 实测：唯一接线的命令(design-model vitest)在 2 000B/管 的上限下 stdout 592B、stderr 0B ⇒ 本文件不重跑它，也不声称这条门曾骗过人');

const nowHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(nowHead, homeHead, "the home repository's HEAD is byte-identical: every write here was under os.tmpdir");
console.log(`\n[summary] reports read: 6 shapes · carrying the pipe list: 3 (stdout / stderr / stdout+stderr) · carrying NO key: 3 (clean, vacuous only-miss, §28 refusal) · verdicts changed by a cut: 0 (exit code is the command's own) · JSONL round keeps the list AND its absence: yes · home HEAD byte-identical: yes`);
execFileSync('node', ['-e', `for (const d of ${JSON.stringify(temps)}) require("fs").rmSync(d,{recursive:true,force:true})`]);
console.log('[cleanup] throwaway programs and ledger removed');
