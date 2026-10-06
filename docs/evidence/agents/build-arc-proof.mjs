// NEXUS M6 v173 — build-arc proof (ADR 0016 amendment 173, DEVELOPMENT_PLAN item 8, first slice).
// The autonomous-build milestone gains its first orchestrator: `planBuildArc` (the arc as ONE piece
// of inert data, v29's `executes: false` discipline) and `runBuildArc` (the walk — blueprint →
// verify → record — whose ONE execution door, `build.verify`, is an INJECTED `BuildVerifier` seam).
// The runtime plans and walks; it never executes. The first wired runner is the CONTAINER verifier
// in @nexus/exec-host, so every §4/§5 claim below is measured against the REAL docker daemon — the
// same v166 wall (pinned image, mount-free argv, egress denied, budgets) carries the arc's steps.
// Run after `npm run build` (docker daemon required for §4–§5; §6/§7 need none):
//   node docs/evidence/agents/build-arc-proof.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const hostPkg = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { BUILD_VERIFY_TOOL, ToolRegistry, planBuildArc, registerBuildTools, runBuildArc } = rt;
const { CONTAINER_ISOLATION_ARGS, CONTAINER_MOUNT_FLAGS, createContainerExecHost, probeContainerRuntime } = hostPkg;

const POLICY = {
  image: 'node:22-alpine',
  workdirRoot: '/workspace',
  allow: [
    { argv: ['node', '--version'], timeoutMs: 5_000, maxOutputBytes: 1_024 },
    { argv: ['node', '-e', '*'], timeoutMs: 10_000, maxOutputBytes: 4_096 },
  ],
  envAllow: [],
};

/** A checkpoint that records its own decisions, the receipts shape policyCheckpoint produces. */
function recordingCheckpoint(allow) {
  const decisions = [];
  const cp = (req) => {
    decisions.push({ call: req.call, granted: allow, matched: 'default', reason: 'proof gate' });
    return allow;
  };
  cp.decisions = decisions;
  return cp;
}

/** Fake docker client: records every spawn, answers asynchronously — used where the claim is about SPAWNING, not about the daemon. */
function fakeSpawn(exitCode) {
  const spawned = [];
  const spawnLike = (command, args) => {
    spawned.push({ command, args });
    const dataListeners = [];
    const endListeners = [];
    queueMicrotask(() => {
      for (const l of endListeners) l({ code: exitCode, signal: null });
    });
    return { onData: (l) => dataListeners.push(l), onEnd: (l) => endListeners.push(l), kill: () => {} };
  };
  return { spawned, spawnLike };
}

// ── §1 the arc is DATA before it is anything else ────────────────────────────────────────────
{
  const spec = {
    arcId: 'proof-1',
    goal: 'plan without executing',
    steps: [
      { stepId: 's1', argv: ['node', '--version'], rationale: 'runtime answers' },
      { stepId: 's2', argv: ['node', '-e', 'console.log("arc-ok:"+(2+3))'], rationale: 'computed inside the wall' },
    ],
  };
  const decided = planBuildArc(spec);
  assert.equal(decided.ok, true);
  assert.equal(decided.plan.executes, false, 'a plan executes nothing — in its very type');
  const stages = decided.plan.stages.map((s) => s.stage);
  assert.equal(stages[0], 'blueprint');
  assert.equal(stages[stages.length - 1], 'record');
  assert.equal(stages.filter((s) => s === 'verify').length, 2);
  assert.ok(decided.plan.steps.every((s) => s.tool === BUILD_VERIFY_TOOL), 'every door is the ONE build.verify door');
  const bad = planBuildArc({ ...spec, steps: [] });
  assert.equal(bad.ok, false, 'a stepless arc is refused, not half-planned');
  console.log('[build-arc-proof] §1 planBuildArc: inert data, stage-ordered, malformed specs refused with reasons');
}

// ── §2 no verifier wired → the walk states its own absence (§24 by absence, §60 by prose) ────
{
  const outcome = await runBuildArc(
    { arcId: 'proof-2', goal: 'nobody wired a runner', steps: [{ stepId: 's1', argv: ['node', '--version'], rationale: '' }] },
    { registry: new ToolRegistry(), checkpoint: () => true, recordReceipts: true },
  );
  assert.equal(outcome.status, 'no-verifier');
  assert.ok(outcome.reason.includes('planning alone builds nothing'), `the honest sentence: ${outcome.reason}`);
  assert.equal(outcome.results.length, 0);
  assert.ok(Array.isArray(outcome.decisions) && outcome.decisions.length === 0);
  console.log('[build-arc-proof] §2 runBuildArc: a registry without the door walks nowhere — and says why');
}

// ── §3 a §28 denial ends the walk BEFORE the door: the runner is never even asked ─────────────
{
  let doorAsked = 0;
  const verifier = async () => {
    doorAsked += 1;
    return { ok: true, detail: 'should never happen', engine: 'fake' };
  };
  const registry = registerBuildTools(new ToolRegistry(), verifier);
  const cp = recordingCheckpoint(false);
  const outcome = await runBuildArc(
    { arcId: 'proof-3', goal: 'the human says no', steps: [{ stepId: 's1', argv: ['node', '--version'], rationale: '' }] },
    { registry, checkpoint: cp, recordReceipts: true },
  );
  assert.equal(outcome.status, 'denied');
  assert.equal(outcome.stoppedAt, 's1');
  assert.ok(outcome.reason.includes('denied at s1'));
  assert.equal(doorAsked, 0, 'denial at the registry: the verifier heard nothing');
  assert.equal(outcome.decisions.length, 1);
  assert.equal(outcome.decisions[0].granted, false);
  assert.equal(outcome.decisions[0].call.callId, 'proof-3:s1', 'the receipt names the exact door that was refused');
  console.log('[build-arc-proof] §3 runBuildArc: §28 denial stops the arc, receipt granted:false, door never asked');
}

// ── §4 the REAL container verify: a green arc computed INSIDE the wall ───────────────────────
const probe = await probeContainerRuntime();
assert.equal(probe.available, true, `docker daemon required for §4/§5 (probe says: ${probe.reason})`);
{
  const host = createContainerExecHost(POLICY, {});
  const registry = registerBuildTools(new ToolRegistry(), hostPkg.containerVerifyRunner(host));
  const cp = recordingCheckpoint(true);
  const outcome = await runBuildArc(
    {
      arcId: 'proof-4',
      goal: 'verify two steps in the pinned container',
      steps: [
        { stepId: 'runtime', argv: ['node', '--version'], rationale: 'the pinned runtime answers' },
        { stepId: 'compute', argv: ['node', '-e', 'console.log("arc-ok:"+(2+3))'], rationale: 'computed inside the wall' },
      ],
    },
    { registry, checkpoint: cp, recordReceipts: true },
  );
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.results.length, 2);
  const first = outcome.results[0].output;
  assert.equal(first.ok, true);
  assert.equal(first.engine, 'container:node:22-alpine', 'the green tick names its engine');
  assert.ok(first.detail.includes('exit 0'), first.detail);
  const second = outcome.results[1].output;
  assert.equal(second.ok, true);
  assert.ok(second.stdout.includes('arc-ok:5'), `the container COMPUTED the answer, measured: ${JSON.stringify(second.stdout)}`);
  assert.equal(outcome.decisions.length, 2, 'both doors left receipts');
  assert.ok(outcome.decisions.every((d) => d.granted === true));
  assert.deepEqual(outcome.decisions.map((d) => d.call.callId), ['proof-4:runtime', 'proof-4:compute']);
  console.log(`[build-arc-proof] §4 real container arc: two steps green (daemon ${probe.serverVersion}), stdout measured, receipts join to steps`);
}

// ── §5 a red verdict is a FAILED verification — the engine's own words, not a tool error ─────
{
  const host = createContainerExecHost(POLICY, {});
  const registry = registerBuildTools(new ToolRegistry(), hostPkg.containerVerifyRunner(host));
  const outcome = await runBuildArc(
    { arcId: 'proof-5', goal: 'a step that must fail', steps: [{ stepId: 'bad', argv: ['node', '-e', 'process.exit(3)'], rationale: 'red by construction' }] },
    { registry, checkpoint: () => true },
  );
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.stoppedAt, 'bad');
  assert.ok(outcome.reason.includes('verified red'), outcome.reason);
  assert.ok(outcome.reason.includes('exit 3'), `the engine's own exit code is the reason: ${outcome.reason}`);
  console.log('[build-arc-proof] §5 real container arc: exit 3 → failed with the engine verdict quoted');
}

// ── §6 the policy outranks the arc: a refused step spawns NOTHING; the wall flags are measured ──
{
  const { spawned, spawnLike } = fakeSpawn(0);
  const host = createContainerExecHost(POLICY, { spawnLike });
  const registry = registerBuildTools(new ToolRegistry(), hostPkg.containerVerifyRunner(host));
  const refused = await runBuildArc(
    { arcId: 'proof-6', goal: 'egress is not a build step', steps: [{ stepId: 'curl', argv: ['curl', 'http://example.invalid'], rationale: 'never allowed' }] },
    { registry, checkpoint: () => true },
  );
  assert.equal(refused.status, 'failed');
  assert.ok(refused.reason.includes('default-deny'), `policy refusal verbatim: ${refused.reason}`);
  assert.equal(spawned.length, 0, 'refused at plan time: no docker run was born');
  // And the green path, on the same fake client: the argv IS the v166 wall, measured from what would spawn.
  const green = await runBuildArc(
    { arcId: 'proof-6b', goal: 'the wall is in the argv', steps: [{ stepId: 'v', argv: ['node', '--version'], rationale: '' }] },
    { registry, checkpoint: () => true },
  );
  assert.equal(green.status, 'completed');
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].command, 'docker');
  for (const flag of CONTAINER_ISOLATION_ARGS) assert.ok(spawned[0].args.includes(flag), `isolation flag present: ${flag}`);
  for (const flag of CONTAINER_MOUNT_FLAGS) assert.ok(!spawned[0].args.includes(flag), `no mount flag ever: ${flag}`);
  assert.ok(spawned[0].args.includes('node:22-alpine'));
  console.log('[build-arc-proof] §6 policy outranks the arc: refused steps spawn nothing; green argv carries the full v166 wall');
}

// ── §7 the dependency direction, measured in the built dist ──────────────────────────────────
{
  // Import-statement shape, not any occurrence: comments naming a package are prose, imports are wiring.
  const IMPORT = (pkg) => new RegExp(`from\\s+['"]${pkg.replace('/', '\\/')}['"]`);
  const runtimeEntry = readFileSync('agents/runtime/dist/index.js', 'utf8');
  assert.ok(!IMPORT('@nexus/exec-host').test(runtimeEntry), 'the runtime never reaches exec-host (am.167)');
  for (const f of readdirSync('agents/runtime/dist').filter((n) => n.endsWith('.js'))) {
    const text = readFileSync(`agents/runtime/dist/${f}`, 'utf8');
    assert.ok(!IMPORT('@nexus/exec-host').test(text), `${f}: no module of the runtime reaches exec-host (am.167)`);
  }
  // The MANIFEST is the dependency direction (the adapter's runtime-ward import is type-only and
  // compiles away — measured: dist/containerVerifier.js carries none): the runtime's package.json
  // must NOT name exec-host; the exec-host's must name the runtime.
  const runtimeManifest = readFileSync('agents/runtime/package.json', 'utf8');
  assert.ok(!runtimeManifest.includes('@nexus/exec-host'), 'runtime package.json does not depend on exec-host');
  const hostManifest = readFileSync('agents/exec-host/package.json', 'utf8');
  assert.ok(hostManifest.includes('@nexus/agent-runtime'), 'exec-host package.json depends on the runtime — the legal direction');
  const adapterTypes = readFileSync('agents/exec-host/dist/containerVerifier.d.ts', 'utf8');
  assert.ok(IMPORT('@nexus/agent-runtime').test(adapterTypes), 'the adapter’s public surface types against the runtime seam');
  const SPAWN_IMPORT = /from\s+['"](node:)?child_process['"]|require\(['"](node:)?child_process['"]\)/;
  for (const f of readdirSync('agents/runtime/dist').filter((n) => n.endsWith('.js'))) {
    const text = readFileSync(`agents/runtime/dist/${f}`, 'utf8');
    assert.ok(!SPAWN_IMPORT.test(text), `${f}: the v29 audit keeps its teeth — zero spawn imports in the runtime dist`);
  }
  console.log('[build-arc-proof] §7 dist audit: runtime imports no exec-host and no child_process; adapter imports the runtime');
}

console.log('[build-arc-proof] ALL ASSERTIONS PASSED (M6 first slice: the arc plans and walks, the container verifies, the human gates every door)');
