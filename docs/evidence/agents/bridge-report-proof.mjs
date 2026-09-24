// NEXUS M2 v60 (exec-host) — ONE PIPE MAY NOT MUTE THE OTHER IN THE SENTENCE EITHER (ADR 0016 amendment 60).
// v53 gave each stream its own byte ceiling after measuring that a shared counter let stderr starve
// stdout. This proof is about the layer above: the `test.run` bridge turned an ExecRunResult into a
// TestReport with `stderr || stdout` — quote the warning, drop the answer — so the reporting layer
// kept a strictly worse version of the same hazard. v53's bug depended on WHICH PIPE FLUSHED FIRST;
// this one did not, because stderr simply always won. That makes it easier to miss in review and
// harder to defend to a user: the same command can never show its own answer once it warns.
// Measured against real processes before anything was written. Two rules this file holds itself to:
// the OLD rule is recomputed here from the SAME result, so the damage it did is SHOWN and not
// asserted; and every report is checked against the one run that produced it (a spy host records the
// exact ExecRunResult the bridge saw), because a suite re-run prints different timings and a report
// compared against a second process proves nothing.
//   §1 a suite whose answer (42 B) is on stdout and whose deprecation warning (42 B) is on stderr, in
//      both write orders — the old sentence quoted the warning and threw the answer away; the new one
//      quotes BOTH, each named, byte-identically whichever pipe flushed first;
//   §2 a pipe the budget cut AFTER whole lines had survived — the old sentence printed the 5-byte
//      warning, then announced `output truncated at budget (stdout)` while not one of the 2 000
//      surviving stdout bytes was in the report: it described a cut it had itself hidden;
//   §3 a pipe cut so that nothing whole survived must say so WITHOUT claiming the command printed
//      nothing (v48's discipline, arriving in the bridge);
//   §4 a real timeout kill — `exit null` becomes `no exit code reported` (a process that never exited
//      has no exit code), the tree answer v55 made the host able to give is now spoken by the bridge
//      as well, and the pass line printed BEFORE the kill is still heard;
//   §5 the shipped real suite is MEASURED, not excused: which pipes it writes on, and what the old
//      rule did to its summary;
//   §6 a refusal is filed under `never-ran`, not under the predicate's name — the dock chip's tooltip
//      is `failures[0].name: failures[0].message`, so "exit-zero: default-deny" read as a test that ran
//      and failed on a command that was never started. `total` stays 1 deliberately, and §6 is the
//      witness for why the tempting alternative was wrong;
//   §7 §9: every byte written here lived in os.tmpdir, and this repo's HEAD is compared byte-wise.
// What did NOT change: the verdict rule (a cut stream turns neither green to red nor red to green),
// v56's aggregate clause naming the cut pipes, `total`'s meaning, argv, budgets, gates, engine label.
// One note on how this file runs: it pays no rent in v59's synchronous-spawn wall. Its only shell-out
// is ASYNC `execFile('git', …)`, the one path that works on this host, so it imports no bridge and
// stands on its own. Run after `npm run build`:  node docs/evidence/agents/bridge-report-proof.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process'; // ASYNC on purpose: v59 measured that every SYNC spawn is EBUSY on this host
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const gitText = (...args) => new Promise((resolve, reject) => execFile('git', args, { encoding: 'utf8' }, (e, out) => (e ? reject(e) : resolve(out))));

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry, registerTestTools } = rt;
const { NODE_SPAWN, createExecHost, execTestRunner, NEVER_RAN } = eh;

const homeHead = (await gitText('rev-parse', 'HEAD')).trim();
const ENV_NAMES = ['PATH', 'SYSTEMROOT', 'PATHEXT', 'COMSPEC', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'];
const env = () => {
  const out = {};
  for (const n of ENV_NAMES) if (typeof process.env[n] === 'string') out[n] = process.env[n];
  return out;
};
const B = (s) => Buffer.byteLength(s ?? '', 'utf8');
const repoRoot = process.cwd().replace(/\\/g, '/');
const ANSI = /\x1b\[[0-9;]*m/g;

/**
 * The rule v31 shipped and v56 left in place, rebuilt here verbatim — so that this file can show what
 * it did to a real run instead of describing it, and so the fix stays falsifiable if somebody later
 * "simplifies" the bridge back to one pipe.
 */
function oldMessage(r) {
  const parts = [];
  if (r.killedByBudget) parts.push(`killed at timeout budget${r.signal ? ` (${r.signal})` : ''}`);
  parts.push(`exit ${r.exitCode}`);
  const output = r.stderr.trim() !== '' ? r.stderr.trim() : r.stdout.trim();
  if (output !== '') parts.push(output);
  if (r.truncated) parts.push(`output truncated at budget${r.truncatedStreams && r.truncatedStreams.length > 0 ? ` (${r.truncatedStreams.join(' + ')})` : ''}`);
  return parts.join(' · ');
}
/** Every byte a pipe contributed must sit inside the sentence, under that pipe's own label. */
function quotesWholePipe(sentence, stream, text) {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') return true;
  return sentence.includes(`${stream}: ${trimmed}`);
}

const workRoot = join(tmpdir(), 'nexus-v60-report-proof');
rmSync(workRoot, { recursive: true, force: true });
mkdirSync(workRoot, { recursive: true });

// One exact argv per script file, one ceiling per script. No wildcard anywhere in this file.
const rules = [];
const script = (file, src, { cap = 4096, timeoutMs = 30_000 } = {}) => {
  const argv = ['node', join(workRoot, file)];
  writeFileSync(argv[1], src, 'utf8');
  rules.push({ argv, cap, timeoutMs });
  return argv;
};
/**
 * A host that records the EXACT result the bridge was handed. Every section below compares a report to
 * the run that produced it; re-running the command to get a "raw" answer would compare a sentence
 * against a different process, and vitest's own timings differ between runs.
 */
function spyHost(spawnSink) {
  const inner = createExecHost({
    root: workRoot,
    allow: rules.map((r) => ({ argv: r.argv, timeoutMs: r.timeoutMs, maxOutputBytes: r.cap })),
    envAllow: ENV_NAMES,
    maxTimeoutMs: 30_000,
    maxOutputBytes: 1_048_576,
  }, {
    spawnLike: (c, a, o) => {
      if (spawnSink) spawnSink.push([c, ...a].join(' '));
      return NODE_SPAWN(c, a, o);
    },
  });
  const seen = [];
  return { seen, run: async (req, opts) => { const r = await inner.run(req, opts); seen.push(r); return r; } };
}
/** One run, both answers: the ExecRunResult the bridge saw and the TestReport it produced. */
const runOnce = async (h, argv, options = {}) => {
  const rep = await execTestRunner(h, argv, { preApproved: true, env: env(), ...options }).run();
  return { raw: h.seen[h.seen.length - 1], rep, message: rep.ok ? rep.detail : rep.failures[0].message };
};

// ---------- §1: the picking rule, on real pipes, in both write orders ----------
{
  const ANSWER = 'RESULT: 41 passed, 2 failed in src/foo.ts';
  const WARNING = '(node:123) DeprecationWarning: legacy url';
  const answerFirst = script('answer-first.mjs', `console.log(${JSON.stringify(ANSWER)});console.error(${JSON.stringify(WARNING)});process.exit(1)`);
  const warnFirst = script('warn-first.mjs', `console.error(${JSON.stringify(WARNING)});console.log(${JSON.stringify(ANSWER)});process.exit(1)`);
  const sentences = [];
  const labels = [];
  let oldSaid = '';
  for (const [label, argv] of [['stdout written first', answerFirst], ['stderr written first', warnFirst]]) {
    const h = spyHost();
    const { raw, rep, message } = await runOnce(h, argv);
    assert.equal(raw.ran, true, `${label}: this exact argv is on the allowlist`);
    assert.equal(B(raw.stdout), 42, `${label}: 42 bytes of ANSWER really arrived on stdout`);
    assert.equal(B(raw.stderr), 42, `${label}: 42 bytes of WARNING really arrived on stderr`);
    oldSaid = oldMessage(raw);
    assert.equal(oldSaid.includes(ANSWER), false, `${label}: COUNTERFACTUAL — the shipped rule dropped the answer entirely`);
    assert.equal(oldSaid, `exit 1 · ${WARNING}`, `${label}: and this is what it actually said`);
    assert.equal(quotesWholePipe(message, 'stdout', raw.stdout), true, `${label}: stdout quoted in full`);
    assert.equal(quotesWholePipe(message, 'stderr', raw.stderr), true, `${label}: stderr quoted in full`);
    assert.match(message, new RegExp(`^exit 1 · stdout: ${ANSWER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · stderr: `), 'each pipe is NAMED, so a reader knows who said what');
    sentences.push(message);
    labels.push(rep.engine);
  }
  assert.equal(sentences[0], sentences[1], 'the report is ORDER-INDEPENDENT: which pipe flushed first changes nothing');
  assert.notEqual(labels[0], labels[1], 'and the two runs really were two different programs (each engine names its own argv)');
  assert.equal(sentences[0].includes('exit 1'), true, 'the verdict still comes from the exit code, not from the pipes');
  console.log(`[bridge-report-proof] §1 real pipes: answer 42 B on stdout + warning 42 B on stderr · old sentence "${oldSaid}" (answer absent) · new sentence quotes both, identical in either flush order`);
}

// ---------- §2: a cut that LEFT whole lines: the old report hid the survivor and described the cut ----------
{
  const LINE = `${'A'.repeat(99)}\n`;
  const argv = script('loud.mjs', `console.error('warn');console.log(${JSON.stringify(LINE.repeat(25))});process.exit(1)`, { cap: 2000 });
  const h = spyHost();
  const { raw, message } = await runOnce(h, argv);
  assert.equal(raw.truncated, true, 'the 2 000-byte ceiling really bit on 2 500 bytes of stdout');
  assert.deepEqual(raw.truncatedStreams, ['stdout'], 'v56: the cut is attributed to stdout alone');
  assert.equal(B(raw.stdout), 2000, '20 whole lines survived the ceiling');
  assert.equal(quotesWholePipe(message, 'stdout', raw.stdout), true, 'the SURVIVOR travels in the sentence, byte for byte');
  assert.equal(message.includes(LINE.repeat(20).trim()), true, 'measured again, concretely: all 20 kept lines appear');
  assert.match(message, / · output truncated at budget \(stdout\)$/, 'v56 aggregate clause still names the cut pipe');
  assert.equal(oldMessage(raw).includes('A'.repeat(99)), false, 'COUNTERFACTUAL — the old sentence showed only the 5-byte warning while announcing a stdout cut');
  assert.equal(message.startsWith('exit 1 ·'), true, 'the cut changed the words, not the verdict: this command exited 1 and is reported as exiting 1');
  console.log(`[bridge-report-proof] §2 cut-after-survival: 2 000 B of kept stdout now inside a ${B(message)}-byte sentence · old sentence was ${B(oldMessage(raw))} B and named a cut it had hidden`);
}

// ---------- §3: a cut that left NOTHING speaks for itself, without claiming silence ----------
{
  const argv = script('oneline.mjs', `console.log('E'.repeat(3000));process.exit(1)`, { cap: 1000 });
  const h = spyHost();
  const { raw, message } = await runOnce(h, argv);
  assert.equal(raw.stdout, '', 'one 3 000-byte line under a 1 000-byte ceiling leaves no WHOLE line — v48 trims it to nothing');
  assert.equal(raw.truncated, true);
  assert.match(message, /stdout: no WHOLE line survived the output budget/);
  assert.match(message, /NOT a statement that it printed nothing/);
  console.log(`[bridge-report-proof] §3 an emptied pipe: "${message.split(' · ').find((p) => p.startsWith('stdout:'))}"`);
}

// ---------- §4: a real timeout kill — no exit code exists, and the tree answer is heard ----------
{
  const argv = script('hang.mjs', `console.log('RESULT: 43 passed');setTimeout(() => {}, 8000)`, { cap: 4096, timeoutMs: 500 });
  const h = spyHost();
  const t0 = Date.now();
  const { raw, rep, message } = await runOnce(h, argv);
  const ms = Date.now() - t0;
  assert.equal(raw.killedByBudget, true, 'the host killed the process it started');
  assert.equal(raw.exitCode, null, 'and no exit code was ever reported');
  assert.match(message, /^killed at timeout budget \(SIGTERM\) \(descendants: (reaped|reaper-failed|no-pid|unsupported-platform|not-attempted)\)/, "v55: the bridge states what became of the tree, in the host's own words");
  assert.equal(/exit null/.test(message), false, 'v60 retired `exit null` — an exit clause for a process that never exited');
  assert.equal(message.includes('no exit code reported'), true);
  assert.match(message, /stdout: RESULT: 43 passed/, 'what the suite said BEFORE it was cut short is still heard');
  assert.equal(rep.ok, false, 'a verify that never finished may not report green');
  assert.ok(ms < 5_000, `the timeout cut the wait short (${ms}ms)`);
  console.log(`[bridge-report-proof] §4 real kill after ${ms}ms: "${message}"`);
}

// ---------- §5: the SHIPPED suite, measured rather than excused ----------
{
  const SUITE_ARGV = ['node', 'node_modules/vitest/vitest.mjs', 'run', '--root', 'packages/design-model'];
  const suiteRules = rules.length;
  const h = spyHost(); // its policy is the throwaway one, so the suite argv is DEFAULT-DENIED — see below
  const denied = await execTestRunner(h, SUITE_ARGV, { preApproved: true, env: env() }).run();
  assert.equal(h.seen.length, 1);
  assert.equal(h.seen[0].ran, false, 'the confined host will not boot a suite it was never told about');
  assert.equal(denied.failures[0].name, NEVER_RAN, 'and that answer is filed as a run that never happened');
  assert.equal(rules.length, suiteRules, 'no rule was widened to make a point');

  const suiteHost = createExecHost({
    root: repoRoot,
    allow: [{ argv: SUITE_ARGV, timeoutMs: 180_000, maxOutputBytes: 1_048_576 }],
    envAllow: ENV_NAMES,
    maxTimeoutMs: 180_000,
    maxOutputBytes: 1_048_576,
  }, { spawnLike: NODE_SPAWN });
  const seen = [];
  const spy = { run: async (req, opts) => { const r = await suiteHost.run(req, opts); seen.push(r); return r; } };
  const rep = await execTestRunner(spy, SUITE_ARGV, { preApproved: true, env: env() }).run();
  const raw = seen[0];
  assert.equal(raw.ran, true, 'the exact suite argv plans (execsuite-proof owns the gate itself)');
  assert.equal(raw.exitCode, 0, `the real suite is green: ${raw.stderr.slice(0, 200)}`);
  assert.equal(rep.ok, true, 'and the bridge reports it green');
  assert.equal(quotesWholePipe(rep.detail, 'stdout', raw.stdout), true, "all of the suite's stdout travels into the report");
  assert.equal(quotesWholePipe(rep.detail, 'stderr', raw.stderr), true, 'and so does all of its stderr, whatever its size');
  assert.match(rep.detail.replace(ANSI, ''), /Test Files\s+\d+ passed/, "vitest's own summary is inside the labeled report");
  const old = oldMessage(raw);
  assert.equal(old.replace(ANSI, '').includes('Test Files'), B(raw.stderr) === 0, 'the counterfactual as arithmetic: the old rule kept the suite summary ONLY IF stderr stayed silent');
  console.log(`[bridge-report-proof] §5 REAL @nexus/design-model vitest (one process, its own report): stdout ${B(raw.stdout)} B · stderr ${B(raw.stderr)} B · ${B(raw.stderr) === 0 ? 'stderr silent, so v31\'s picking rule happened to pick right for THIS command — the hazard was latent here, not live' : 'stderr SPOKE, so the old rule replaced the suite summary with it'}`);
}

// ---------- §6: a refusal is not a failed test ----------
{
  const noGateArgv = script('gate.mjs', 'process.exit(0)'); // registered BEFORE the host, so it IS allowed
  const spawns = [];
  const h = spyHost(spawns);
  const refused = await execTestRunner(h, ['curl', 'http://evil.test'], { preApproved: true }).run();
  assert.equal(spawns.length, 0, 'the ONLY real promise of an exec sandbox: a refusal costs no process');
  assert.deepEqual([refused.ok, refused.total, refused.passed], [false, 1, 0], "total counts a predicate IN SCOPE — runPredicates' contract, untouched by v60");
  assert.equal(refused.failures[0].name, NEVER_RAN, "the field the dock shows a human is no longer the predicate's own name");
  assert.match(refused.failures[0].message, /^never ran: no allowlist rule matches/);
  assert.match(refused.detail, /counts a predicate that was IN SCOPE, not a test that ran and failed/);

  const noGate = await execTestRunner(h, noGateArgv).run();
  assert.equal(noGate.failures[0].name, NEVER_RAN, '§28 absence is the same species: nothing ran');
  assert.match(noGate.failures[0].message, /^never ran: checkpoint required for exec \(§28\)/, 'an ALLOWED argv, refused for want of a human');

  // The trap this file exists to document: `registerTestTools` answers `total 0` for an asked-for
  // `only` by THROWING "no test predicate named X". Zeroing a refusal to make the numbers look honest
  // would therefore have denied that the predicate exists. Pinned here so the number is not "fixed".
  const registry = registerTestTools(new ToolRegistry(), execTestRunner(h, ['curl', 'http://evil.test'], { preApproved: true }));
  const res = await registry.invoke({ callId: 'r1', tool: 'test.run', args: { only: 'exit-zero' } }, { checkpoint: () => true });
  assert.equal(res.ok, true, 'the tool ANSWERED rather than throwing "no test predicate named exit-zero"');
  assert.match(res.output.detail, /never ran:/);
  assert.equal(spawns.length, 0, 'and all of §6 cost zero processes');
  console.log('[bridge-report-proof] §6 refusals: filed under "never-ran" · total stays 1 so an asked-for `only` is answered, not denied · 0 spawns for 3 refusals');
}

// ---------- §7: §9 — nothing here touched this repo ----------
{
  rmSync(workRoot, { recursive: true, force: true });
  assert.equal(existsSync(workRoot), false, 'the throwaway is gone');
  assert.equal((await gitText('rev-parse', 'HEAD')).trim(), homeHead, '§9: home repo HEAD byte-identical');
  console.log('[bridge-report-proof] §9 throwaway removed · this repo untouched');
}

console.log('[bridge-report-proof] ALL ASSERTIONS PASSED (a report is a summary of two pipes and an exit, not a pick-and-mix of them)');
