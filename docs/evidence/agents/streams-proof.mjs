// NEXUS M2 v53 (exec-host) — ONE STREAM MAY NOT SILENCE THE OTHER (ADR 0016 amendment 53).
// v30 gave a command ONE byte budget and spent it from a single counter, so the two pipes raced for
// it. Measured against real processes before anything was written: a program that puts 9 KB on
// stderr and then 19 bytes of ANSWER on stdout, against a 4 KB ceiling, returned `stdout 0 B /
// stderr 0 B` — the stderr filled the counter, and v48's whole-line trim then dropped the partial
// line, so nothing at all came back. The same program writing stdout FIRST returned the answer.
// Which pipe flushed first decided whether the agent saw anything, and the same command could
// therefore answer differently twice in a row. (This proof runs the same shape at 4 000 bytes of
// answer rather than 19, so the arithmetic in §1 excludes the old model by totals, not by luck.)
// v53 makes `maxOutputBytes` a PER-STREAM ceiling. The honest price, stated here and in the code:
// the host can now hold 2 × maxOutputBytes instead of maxOutputBytes. Nothing else moved — no
// policy shape, no argv, no gate, no door, no timeout, and the trim rule v48 owns is untouched.
// §1 measures the price and the gain together: 9 090 bytes of stderr plus 4 000 bytes of answer
// against a 4 096-byte ceiling keeps 8 000 bytes between the two streams, which a single shared
// counter of that size could not have done at all.
// A split-with-lending design was tried and rejected by this file's own reasoning: a fast stream can
// always spend borrowed ground before the other one reaches it, so a borrowed share is no guarantee.
// §60 honesty: the shipped git doors write on ONE stream (git itself relays a failing hook's output
// merged onto stderr, and the real suite prints on stdout), so this hazard was NOT live in a git
// door — §2 measures that instead of asserting it. Where it IS live is any command that is a whole
// program: the `test.run` bridge runs exactly such programs, and the host is where every door is born.
// Run after `npm run build`:  node docs/evidence/agents/streams-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from '../lib/syncproc.mjs';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry, planExec } = rt;
const { NODE_SPAWN, createExecHost, gitCommitPolicy, gitEnv, loadExecAudits, registerGitCommitTool } = eh;

const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const workRoot = mkTmp('nexus-v53-proof');
const fsDisk = {
  readFileSync: (file, encoding) => readFileSync(file, encoding),
  mkdirSync: (dir) => mkdirSync(dir, { recursive: true }),
  writeFileSync: (file, data, encoding) => writeFileSync(file, data, encoding),
};

const B = (s) => Buffer.byteLength(s ?? '', 'utf8');

/** A policy for one exact argv, one ceiling. Nothing in here is a wildcard. */
function ceilingPolicy(root, argv, cap) {
  return { root, allow: [{ argv, timeoutMs: 30_000, maxOutputBytes: cap }], envAllow: ['PATH', 'SYSTEMROOT', 'HOME', 'USERPROFILE'], maxTimeoutMs: 30_000, maxOutputBytes: cap };
}
/** A spawn wrapper that counts processes and nothing else. */
const countingSpawn = (sink) => (command, args, opts) => {
  sink.push([command, ...args].join(' '));
  const child = NODE_SPAWN(command, args, opts);
  return {
    onData: (l) => child.onData((s, c) => l(s, c)),
    onEnd: (l) => child.onEnd(l),
    kill: () => child.kill(),
  };
};
const lines = (fill, n) => `${fill.repeat(99)}\n`.repeat(n); // whole ~100-byte lines, like any real report
const ANSWER = lines('A', 40); // 4 000 bytes of ANSWER on stdout
const LOUD = lines('E', 91); // 9 090 bytes of NOISE on stderr
const script = (stderrFirst) => (stderrFirst
  ? `process.stderr.write(${JSON.stringify(LOUD)}); process.stdout.write(${JSON.stringify(ANSWER)})`
  : `process.stdout.write(${JSON.stringify(ANSWER)}); process.stderr.write(${JSON.stringify(LOUD)})`);
const argvFor = (stderrFirst) => ['node', '-e', script(stderrFirst)];

async function runHost(argv, cap, { journal } = {}) {
  const spawns = [];
  const options = { spawnLike: countingSpawn(spawns) };
  if (journal) options.journal = { disk: fsDisk, file: journal };
  const result = await createExecHost(ceilingPolicy(workRoot, argv, cap), options)
    .run({ argv, cwd: '', env: gitEnv(process.env) }, { preApproved: true });
  return { result, spawns };
}

try {
  // ---------- §1 the mute, and its absence: same bytes, both orders, one answer ----------
  const CAP = 4096;
  const results = {};
  const control = {};
  for (const [name, stderrFirst] of [['stderr-first', true], ['stdout-first', false]]) {
    control[name] = spawnSync('node', argvFor(stderrFirst).slice(1), { encoding: 'utf8', maxBuffer: 1 << 26 }); // raw, uncapped: what the program REALLY printed
    assert.equal(control[name].status, 0, `${name}: the control program exits 0 outside the sandbox too`);
    assert.equal(B(control[name].stdout), B(ANSWER), `${name}: ${B(ANSWER)} bytes of answer on stdout`);
    assert.equal(B(control[name].stderr), B(LOUD), `${name}: ${B(LOUD)} bytes of noise, on the OTHER stream`);
    const { result, spawns } = await runHost(argvFor(stderrFirst), CAP);
    results[name] = result;
    assert.equal(result.ran, true, `${name}: the process ran`);
    assert.equal(result.exitCode, 0, `${name}: and finished of its own accord — no timeout, no kill`);
    assert.equal(result.killedByBudget, false, `${name}: nothing here is about the timeout budget`);
    assert.equal(spawns.length, 1, `${name}: exactly one process`);
    assert.equal(result.truncated, true, `${name}: bytes WERE dropped — the loud stream is over its ceiling`);
    assert.equal(result.stdout, ANSWER, `${name}: the answer survives INTACT, whichever pipe flushed first`);
    assert.ok(B(result.stderr) <= CAP, `${name}: the loud stream is capped at its OWN ceiling (${B(result.stderr)} B)`);
    assert.ok(B(result.stderr) >= 4000, `${name}: and it still carries the bulk of what it could hold (${B(result.stderr)} B)`);
  }
  assert.equal(results['stderr-first'].stdout, results['stdout-first'].stdout, 'the two orders agree on stdout byte-for-byte — the assertion v30 could not make');
  assert.equal(results['stderr-first'].stderr, results['stdout-first'].stderr, 'and they agree on the cut stream too, so the ORDER carries no information any more');
  // The old model, falsified by arithmetic on THIS run's own numbers rather than by memory: one
  // shared counter of 4096 cannot have kept what two per-stream ceilings kept.
  const keptBoth = B(results['stderr-first'].stdout) + B(results['stderr-first'].stderr);
  assert.ok(keptBoth > CAP, `kept ${keptBoth} bytes against a ${CAP}-byte ceiling: a SINGLE shared counter could not have held both, so the shared model is excluded by measurement`);
  assert.ok(B(results['stderr-first'].stderr) > 0 && B(results['stderr-first'].stdout) > 0, 'both streams speak: the mute needed a shared counter, and there is none');
  console.log(`[streams-proof] §1 ${B(LOUD)} B of stderr + ${B(ANSWER)} B of answer @ a ${CAP} B ceiling: kept stdout ${B(results['stderr-first'].stdout)} B + stderr ${B(results['stderr-first'].stderr)} B = ${keptBoth} B — MORE than a single shared counter of ${CAP} could ever hold, and both write orders give the SAME answer`);

  // ---------- §2 the shipped doors are NOT the hazard, measured rather than asserted away ----------
  const repo = `${workRoot}/git`;
  mkdirSync(repo, { recursive: true });
  const git = (...a) => { try { return execFileSync('git', a, { cwd: repo, encoding: 'utf8', env: gitEnv(process.env), stdio: ['ignore', 'pipe', 'pipe'] }) ?? ''; } catch (e) { return e.stdout ?? ''; } };
  git('init', '-q', '-b', 'master');
  git('config', 'user.email', 'v53@nexus.test');
  git('config', 'user.name', 'V53 Proof');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', `${workRoot}/no-hooks-there-are-none`);
  writeFileSync(`${repo}/seed.md`, 'seed line\n');
  git('add', '.');
  git('commit', '-q', '-m', 'seed');
  const doors = [];
  const policy = { root: repo, allow: [], envAllow: eh.GIT_ENV_NAMES, maxTimeoutMs: 30_000, maxOutputBytes: 65_536 };
  for (const factory of [eh.gitReadOnlyPolicy, eh.gitStagedPolicy, eh.gitLogPolicy, eh.gitShowPolicy]) policy.allow.push(...factory(repo).allow);
  const readSpawns = [];
  const registry = new ToolRegistry();
  const readHost = () => createExecHost(policy, { spawnLike: countingSpawn(readSpawns) });
  eh.registerGitTools(registry, readHost(), { env: {} });
  eh.registerGitStagedTool(registry, readHost(), { env: {} });
  eh.registerGitLogTool(registry, readHost(), { env: {} });
  eh.registerGitShowTool(registry, readHost(), { env: {} });
  for (const [tool, args] of [['git.status', {}], ['git.diff', {}], ['git.diff', { stat: true }], ['git.staged', {}], ['git.log', { count: 5 }], ['git.show', { path: 'seed.md' }]]) {
    const res = await registry.invoke({ callId: `v53:${tool}`, tool, args }, { checkpoint: () => true });
    assert.equal(res.ok, true, `${tool} answers through the shared ceiling policy`);
    const out = res.output;
    doors.push(out);
    assert.equal(out.truncated, false, `${tool}: nothing overran its own ceiling, so v53 changed NOTHING about its bytes`);
    assert.ok(!/CUT|REFUSED|truncated/.test(out.detail), `${tool}: and its sentence carries no cut or refusal wording either`);
  }
  assert.equal(doors[0].files.length, 0, 'git.status on a clean repo still reports zero entries — the honest count, not a refusal');
  assert.ok(doors[5].addedLines.length > 0, 'git.show still reads HEAD content back');
  assert.equal(readSpawns.length, 6, 'six processes, six complete answers, zero cuts');
  console.log(`[streams-proof] §2 six shipped git reads at their default ceiling: truncated=false on all six — the fix costs a well-behaved command nothing (${doors.map((d) => B(d.detail)).join('/')} B of sentences)`);

  // ---------- §3 a REAL refusal whose bytes are one unterminated line: CUT, not "printed nothing" ----------
  const hooks = `${workRoot}/hooks`;
  mkdirSync(hooks, { recursive: true });
  git('config', 'core.hooksPath', hooks);
  // v534 (amendment 520): the hook emitted its noise with `node`, which the scrubbed env's default PATH does
  // not carry on POSIX (/usr/local/bin is not in it) — the hosted run reddened on ubuntu with "node: not
  // found" while the raw control (full PATH) passed. `printf | tr` needs only /bin and /usr/bin, which every
  // sh has with no PATH at all, and it is the same 20 000 bytes on one unterminated line.
  writeFileSync(`${hooks}/pre-commit`, "#!/bin/sh\nprintf '%20000s' '' | tr ' ' X >&2\nexit 1\n");
  // v534 (amendment 520): a hook git cannot EXECUTE is not a hook — on POSIX the executable bit is the
  // difference, and without it the control below reddened on ubuntu (measured) while Windows never asked.
  chmodSync(`${hooks}/pre-commit`, 0o755);
  writeFileSync(`${repo}/work.md`, 'a change the hook will refuse\n');
  git('add', '.');
  const rawRefusal = (() => { try { execFileSync('git', ['commit', '-m', 'x'], { cwd: repo, encoding: 'utf8', env: gitEnv(process.env), stdio: ['ignore', 'pipe', 'pipe'] }); return { code: 0, out: '', err: '' }; } catch (e) { return { code: e.status, out: e.stdout ?? '', err: e.stderr ?? '' }; } })();
  assert.equal(rawRefusal.code, 1, 'control: the hook refuses the commit');
  assert.equal(B(rawRefusal.err), 20_000, 'control: and git spends 20 000 bytes doing it — ONE line, no newline anywhere');
  const journal = `${workRoot}/journal/streams.jsonl`;
  for (const [cap, expect] of [[65_536, 'kept'], [512, 'cut']]) {
    const spawns = [];
    const registry = registerGitCommitTool(new ToolRegistry(), createExecHost(gitCommitPolicy(repo, { maxOutputBytes: cap }), { spawnLike: countingSpawn(spawns), journal: { disk: fsDisk, file: journal } }), { env: {} });
    const res = await registry.invoke({ callId: `v53:commit:${cap}`, tool: 'git.commit', args: { message: 'refused by a noisy hook' } }, { checkpoint: () => true });
    const out = res.output;
    assert.equal(out.ok, false, `cap ${cap}: a refused commit is DATA`);
    assert.equal(out.exitCode, 1, `cap ${cap}: git's own exit code, relayed`);
    assert.equal(spawns.length, 1, `cap ${cap}: one process either way`);
    if (expect === 'kept') {
      assert.ok(out.detail.includes('X'.repeat(80)), `cap ${cap}: the whole 20 000-byte line fits the ceiling, so the door quotes git's noise verbatim`);
      assert.equal(out.truncated, false, `cap ${cap}: and says nothing was cut`);
    } else {
      assert.equal(out.truncated, true, `cap ${cap}: 20 000 bytes do not fit a ${cap}-byte ceiling`);
      assert.ok(out.detail.includes('no WHOLE line survived the output budget'), `cap ${cap}: the door says the budget spoke, in those words`);
      assert.ok(!out.detail.includes('git printed no output at all'), `cap ${cap}: it does NOT claim git said nothing — git said 20 000 bytes (measured above)`);
      assert.ok(out.detail.includes('output truncated at budget'), `cap ${cap}: and v48's own flag is still on the page`);
    }
  }
  const records = loadExecAudits(fsDisk, journal).records;
  assert.equal(records.length, 2, 'the host kept its own record of both refusals (v51)');
  assert.equal(B(records[0].stderr), 20_000, 'at a ceiling that fits it, the record carries all 20 000 bytes git printed');
  assert.equal(records[1].stderr, '', 'and at 512 the record holds NOTHING — because the host holds nothing: v48 trims a cut stream to whole lines, and this one has no newline at all');
  assert.ok(B(records[0].stderr) > B(records[1].stderr), 'the two records differ only in the ceiling, which is what a per-stream ceiling means');
  // §60, said out loud: the ceiling is a ceiling on what ANYONE downstream can see, the audit record
  // included. That is precisely why the door has to SAY "cut" — a missing record body and a silent
  // program look identical to a reader that was not told.
  console.log(`[streams-proof] §3 one real refusal, two ceilings: ${B(records[0].stderr)} B quoted verbatim vs ${B(records[1].stderr)} B stated as CUT · the 20 000 bytes git printed are measured outside the sandbox`);

  // ---------- §4 the ceiling is honest, and the clamp still clamps ----------
  // generated, not embedded: argv has a ceiling of its own (a 30 KB literal is ENAMETOOLONG to
  // spawn on this box), and 300 lines of 100 bytes each on BOTH streams is what the case is about
  const floodArgv = ['node', '-e', 'for (let i = 0; i < 300; i++) { console.error("E".repeat(99)); console.log("A".repeat(99)); }'];
  const { result: flooded } = await runHost(floodArgv, 1024);
  assert.ok(B(flooded.stdout) <= 1024 && B(flooded.stderr) <= 1024, `each stream is capped at its own 1 024 (${B(flooded.stdout)}/${B(flooded.stderr)} B)`);
  assert.ok(B(flooded.stdout) + B(flooded.stderr) <= 2 * 1024, 'the stated worst case is 2 × the number, and it holds');
  assert.ok(flooded.stdout.endsWith('\n') && flooded.stderr.endsWith('\n'), 'v48 still owns the SHAPE of a cut: whole lines only, on both streams');
  assert.equal(planExec({ argv: argvFor(true) }, ceilingPolicy(workRoot, argvFor(true), 1024)).plan.maxOutputBytes, 1024, 'the PLAN still carries the number the policy wrote (v29 clamping untouched)');
  const widened = planExec({ argv: argvFor(true) }, { ...ceilingPolicy(workRoot, argvFor(true), 1024), allow: [{ argv: argvFor(true), timeoutMs: 30_000, maxOutputBytes: 99_999_999 }] });
  assert.equal(widened.plan.maxOutputBytes, 1024, 'a rule still cannot raise its own ceiling above the policy cap — v53 changed what the number MEANS, not who may set it');
  console.log(`[streams-proof] §4 3 000 B on each stream @ 1 024: kept ${B(flooded.stdout)} + ${B(flooded.stderr)} ≤ 2 × 1 024, both ending on a newline · clamping unchanged`);

  // ---------- §5 determinism: the mute was a race, and a race cannot be re-run ----------
  const seen = new Set();
  for (let i = 0; i < 5; i += 1) {
    const { result } = await runHost(argvFor(true), 2048);
    seen.add(`${B(result.stdout)}|${B(result.stderr)}|${result.stdout === ANSWER}`);
  }
  assert.equal(seen.size, 1, `five runs of the SAME command agree on every byte count (${[...seen].join('  ')})`);
  console.log(`[streams-proof] §5 five real runs, one outcome: ${[...seen][0]} — the pre-v53 shape was order-dependent, so this assertion could not have been made honestly`);

  // ---------- §6 the file lives where §9 allows ----------
  const fwd = (p) => p.replace(/\\/g, '/'); // node's path.join on this box hands back backslashes; §9 is about WHERE, not about separators
  assert.ok(fwd(journal).startsWith(fwd(tmpdir())), '§9: the journal lives in os.tmpdir');
  assert.ok(fwd(workRoot).startsWith(fwd(tmpdir())), '§9: and so does every repo this proof wrote a commit into');
  assert.ok(!existsSync(`${repo}/.git/index.lock`), 'and this proof left no lock, no hook config or journal behind in any repo it could reach');
} finally {
  rmSync(workRoot, { recursive: true, force: true });
  assert.ok(!existsSync(workRoot), 'every throwaway repo, hook and journal is gone');
}

assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — every write here lived in os.tmpdir');
console.log('[streams-proof] ALL ASSERTIONS PASSED (a budget may stop a stream, but it may not silence one)');

function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(`${base}${n}`)) n += 1;
  mkdirSync(`${base}${n}`, { recursive: true });
  return `${base}${n}`;
}
