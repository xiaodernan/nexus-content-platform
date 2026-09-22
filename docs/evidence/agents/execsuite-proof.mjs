// NEXUS M2 v34 — the REAL test suite through the exec sandbox (ADR 0016 amendment 34).
// Until now the agents README honestly said: "running the repo's real test suites through
// the host remains a future policy choice, not current behavior". This proof makes that
// choice once, visibly: ONE exact argv boots @nexus/design-model's actual vitest suite
// through createExecHost + execTestRunner + the §28 registry gate — budgets capped, env
// scrubbed, cwd jailed — and the suite's real exit code becomes the TestReport verdict.
// No product code changes: this wires the machinery v29–v31 already shipped.
// Run after `npm run build`:  node docs/evidence/agents/execsuite-proof.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry, planExec, registerTestTools } = rt;
const { NODE_SPAWN, createExecHost, execTestRunner } = eh;

const SUITE_ARGV = ['node', 'node_modules/vitest/vitest.mjs', 'run', '--root', 'packages/design-model'];
const ENV_NAMES = ['PATH', 'SYSTEMROOT', 'PATHEXT', 'COMSPEC', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'];
const suiteEnv = (source = process.env) => {
  const out = {};
  for (const n of ENV_NAMES) if (typeof source[n] === 'string') out[n] = source[n];
  return out;
};
const suitePolicy = (root) => ({
  root,
  allow: [{ argv: SUITE_ARGV, timeoutMs: 180_000, maxOutputBytes: 1_048_576 }],
  envAllow: ENV_NAMES,
  maxTimeoutMs: 180_000,
  maxOutputBytes: 1_048_576,
});

// 1) Policy math first — an inert decision, before any OS is touched.
const policy = suitePolicy('X:/repo');
const planned = planExec({ argv: SUITE_ARGV, cwd: '', env: { PATH: '/bin', TOKEN: 'leak?' } }, policy);
assert.equal(planned.ok, true, 'the exact suite argv plans');
assert.equal(planned.plan.executes, false, 'plans stay inert by TYPE (§60)');
assert.deepEqual(planned.plan.droppedEnv, ['TOKEN'], 'the suite sees a scrubbed environment');
for (
  const argv of [
    ['node', 'node_modules/vitest/vitest.mjs', 'run'], // no --root = the WHOLE repo: different argv, denied
    ['node', 'node_modules/vitest/vitest.mjs', 'run', '--root', 'packages/ai-providers'], // exact string, exact trust
    ['node', 'node_modules/vitest/vitest.mjs', 'run', '--root'], // arity mismatch
    ['node', 'node_modules/typescript/bin/tsc', '-p', 'packages/design-model'], // no compilers
    ['git', 'push'],
  ]
) {
  const d = planExec({ argv }, policy);
  assert.equal(d.ok, false);
  assert.match(d.reason, /default-deny/, `${argv.join(' ')} must NEVER plan`);
}
const clampPolicy = { ...policy, maxTimeoutMs: 60_000, maxOutputBytes: 32_768, allow: [{ argv: SUITE_ARGV, timeoutMs: 600_000, maxOutputBytes: 99_999_999 }] };
const clamped = planExec({ argv: SUITE_ARGV }, clampPolicy);
assert.equal(clamped.plan.timeoutMs, 60_000);
assert.equal(clamped.plan.maxOutputBytes, 32_768, 'a request can never raise its own budgets above the policy caps');
console.log('[execsuite-proof] policy: 1 exact argv plans (inert, scrubbed, clamped) · suite-widening variants default-deny');

// 2) Gates and refusals on the REAL host — with a spawn counter wrapped around NODE_SPAWN,
//    so "zero wasted spawns" is a counted fact, not a claim.
const root = process.cwd().replace(/\\/g, '/');
const realSpawns = [];
const countingHost = createExecHost(suitePolicy(root), {
  spawnLike: (command, args, opts) => {
    realSpawns.push({ command, args, cwd: opts.cwd, envKeys: Object.keys(opts.env).sort() });
    return NODE_SPAWN(command, args, opts);
  },
});
const noGate = execTestRunner(countingHost, SUITE_ARGV, { cwd: '', env: suiteEnv() }); // preApproved omitted
{
  const t0 = Date.now();
  const rep = await noGate.run();
  assert.equal(rep.ok, false);
  assert.match(rep.detail, /checkpoint required for exec \(§28\)/);
  assert.ok(Date.now() - t0 < 2000 && realSpawns.length === 0, 'a §28 absence fails the report in milliseconds with ZERO spawns');
}
{
  // the bridge has no checkpoint slot (the registry IS the gate), so deny at the host seam:
  const deniedRun = await countingHost.run({ argv: SUITE_ARGV, cwd: '', env: suiteEnv() }, { checkpoint: () => false });
  assert.equal(deniedRun.ran, false);
  assert.equal(deniedRun.reason, 'checkpoint denied');
  assert.equal(realSpawns.length, 0, 'a human DENIAL also spawns nothing (the v31 unit tests map this exact result to a failing report)');
}
{
  const escaping = execTestRunner(countingHost, SUITE_ARGV, { preApproved: true, cwd: '../outside', env: suiteEnv() });
  const rep = await escaping.run();
  assert.equal(rep.ok, false);
  assert.match(rep.detail, /cwd refused/);
  assert.equal(realSpawns.length, 0, 'the jail holds even for an allowlisted suite command');
  const widened = execTestRunner(countingHost, ['node', 'node_modules/vitest/vitest.mjs', 'run'], { preApproved: true, cwd: '', env: suiteEnv() });
  const offList = await widened.run();
  assert.match(offList.detail, /default-deny/, 'asking to run the WHOLE repo is policy-rejected pre-spawn');
  assert.equal(realSpawns.length, 0);
  const ghost = await widened.run('not-the-suite');
  assert.equal(ghost.total, 0);
  assert.match(ghost.detail, /vacuous/);
}
console.log(`[execsuite-proof] gates: §28 absence · human denial · cwd escape · widened argv — 4 honest FAILS, ${realSpawns.length} spawns so far`);

// 3) THE REAL THING: the design-model vitest suite, one process tree, through the registry gate.
const registry = registerTestTools(new ToolRegistry(), execTestRunner(countingHost, SUITE_ARGV, { preApproved: true, cwd: '', env: suiteEnv() }));
const ungated = await registry.invoke({ callId: 's0', tool: 'test.run', args: {} });
assert.match(ungated.error, /checkpoint required for exec/);
assert.equal(realSpawns.length, 0, 'exec permission means EXEC — the ungated loop cannot boot a suite');
const rejected = await registry.invoke({ callId: 's1', tool: 'test.run', args: {} }, { checkpoint: () => false });
assert.match(rejected.error, /denied at checkpoint/);
assert.equal(realSpawns.length, 0);
const t0 = Date.now();
const granted = await registry.invoke({ callId: 's2', tool: 'test.run', args: {} }, { checkpoint: ({ call }) => call.tool === 'test.run' });
const report = granted.output.report;
assert.equal(report.ok, true, `the real suite must pass through the sandbox: ${report.detail.slice(0, 400)}`);
assert.equal(report.engine, `exec-host:${SUITE_ARGV.join(' ')}`, '§60: the label names the ACTUAL command, never masquerades as predicates');
assert.deepEqual([report.total, report.passed, report.failures.length], [1, 1, 0], 'subprocess verification = ONE named exit-zero check');
assert.match(report.detail, /exit 0/);
const plain = report.detail.replace(/\x1b\[[0-9;]*m/g, ''); // ANSI-stripped VIEW; the stored report stays verbatim
assert.match(plain, /Test Files\s+\d+ passed/, "vitest's own summary travels VERBATIM inside the report");
assert.match(plain, /Tests\s+\d+ passed \(\d+\)/, 'a passing suite reports its totals through the sandbox (counts drift; absence would mean failure)');
assert.doesNotMatch(plain, /failed/, 'a green report may not smuggle a failed file through the same pipe');
assert.doesNotMatch(report.detail, /truncated/, 'the suite output fit the budget — and truncation would have been LABELED');
assert.equal(realSpawns.length, 1, 'exactly ONE real spawn for one granted verify (the denials above cost nothing)');
assert.equal(realSpawns[0].command, 'node');
assert.equal(realSpawns[0].cwd, root, 'the planned cwd is the jail root, absolute');
assert.deepEqual(realSpawns[0].envKeys, ENV_NAMES.filter((n) => typeof process.env[n] === 'string').sort(), 'the spawn env is the policy list, nothing else');
console.log(`[execsuite-proof] REAL: @nexus/design-model vitest ran through the sandbox in ${((Date.now() - t0) / 1000).toFixed(1)}s · exit 0 · [engine: ${report.engine}]`);

console.log('[execsuite-proof] ALL ASSERTIONS PASSED (a repo test suite now really verifies through the policy gate; ADR 0013 containers/egress stay open — this is a POLICY sandbox)');
