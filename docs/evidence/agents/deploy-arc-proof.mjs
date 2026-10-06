// NEXUS M6 v176 — deploy-arc proof (ADR 0016 amendment 176, DEVELOPMENT_PLAN item 8, the deploy leg).
// What a COMPLETED build arc does next: `planDeployArc` (the deploy as ONE piece of inert data —
// only a green arc plans, only MEASURED facts — the engine's own stdout — become records) and
// `runDeployArc` (the walk — whose ONE write door, `deploy.record`, is an INJECTED `DeploySink`
// seam, gated by §28 one gate per fact). The runtime holds no sink: the host injects one. §4 is
// measured against the REAL docker daemon — the facts the sink receives are the container's own
// words, byte for byte. Run after `npm run build` (docker daemon required for §4):
//   node docs/evidence/agents/deploy-arc-proof.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const hostPkg = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { DEPLOY_RECORD_TOOL, ToolRegistry, planBuildArc, planDeployArc, registerBuildTools, registerDeployTools, runBuildArc, runDeployArc } = rt;
const { createContainerExecHost, probeContainerRuntime } = hostPkg;

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

/** A verifier whose green answers carry (or omit) the engine's own stdout. */
function factVerifier(stdoutByStep, redStep) {
  return async (request) => {
    if (request.stepId === redStep) return { ok: false, detail: `${request.stepId} verified red`, engine: 'fake' };
    const stdout = stdoutByStep[request.stepId];
    return { ok: true, detail: `ran ${request.argv.join(' ')}`, engine: 'fake', ...(stdout === undefined ? {} : { stdout }) };
  };
}

/** A recording sink: accepts every fact, and it COUNTS what it was handed. */
function fakeSink(refuseStep) {
  const calls = [];
  const sink = async (request) => {
    calls.push(request);
    if (request.stepId === refuseStep) return { ok: false, detail: `${request.stepId} refused by the sink` };
    return { ok: true, detail: `recorded ${request.stepId}` };
  };
  return { calls, sink };
}

const SPEC = {
  arcId: 'proof-1',
  goal: 'verify two steps, then record what they measured',
  steps: [
    { stepId: 's1', argv: ['node', '--version'], rationale: 'runtime answers' },
    { stepId: 's2', argv: ['node', '-e', 'console.log("arc-ok:"+(2+3))'], rationale: 'computed inside the wall' },
  ],
};

// ── §1 the deploy is DATA before it is anything else — and only a green arc can plan one ─────
{
  // A red arc first: the deploy plan refuses it by name.
  const redRegistry = registerBuildTools(new ToolRegistry(), factVerifier({}, 's2'));
  const red = await runBuildArc(SPEC, { registry: redRegistry, checkpoint: () => true });
  assert.equal(red.status, 'failed');
  const refused = planDeployArc(red);
  assert.equal(refused.ok, false);
  assert.ok(refused.reason.includes('did not complete'), refused.reason);
  // A green arc with measured stdout plans inert facts.
  const greenRegistry = registerBuildTools(new ToolRegistry(), factVerifier({ s1: 'v22.11.0', s2: 'arc-ok:5' }));
  const green = await runBuildArc(SPEC, { registry: greenRegistry, checkpoint: () => true });
  assert.equal(green.status, 'completed');
  const decided = planDeployArc(green);
  assert.equal(decided.ok, true);
  assert.equal(decided.plan.executes, false, 'a deploy plan records nothing — in its very type');
  assert.deepEqual(decided.plan.facts, [
    { stepId: 's1', argv: ['node', '--version'], stdout: 'v22.11.0' },
    { stepId: 's2', argv: ['node', '-e', 'console.log("arc-ok:"+(2+3))'], stdout: 'arc-ok:5' },
  ], 'the facts are the engine\'s own words, joined to the argv that produced them');
  assert.equal(decided.plan.steps.every((s) => s.tool === DEPLOY_RECORD_TOOL), true);
  assert.equal(decided.plan.unmeasured.length, 0);
  // A green arc that measured nothing refuses — a record of nothing would be a §60 lie.
  const silentRegistry = registerBuildTools(new ToolRegistry(), factVerifier({}));
  const silent = await runBuildArc(SPEC, { registry: silentRegistry, checkpoint: () => true });
  assert.equal(silent.status, 'completed');
  const nothing = planDeployArc(silent);
  assert.equal(nothing.ok, false);
  assert.ok(nothing.reason.includes('measured nothing'), nothing.reason);
  console.log('[deploy-arc-proof] §1 planDeployArc: green-only, measured-facts-only, inert data, silent steps named');
}

// ── §2 no sink wired → the walk states its own absence (§24 by absence, §60 by prose) ─────────
{
  const registry = registerBuildTools(new ToolRegistry(), factVerifier({ s1: 'v22.11.0', s2: undefined }));
  const green = await runBuildArc(SPEC, { registry, checkpoint: () => true });
  const outcome = await runDeployArc(green, { registry: new ToolRegistry(), checkpoint: () => true, recordReceipts: true });
  assert.equal(outcome.status, 'no-sink');
  assert.ok(outcome.reason.includes('nowhere to record'), `the honest sentence: ${outcome.reason}`);
  assert.ok(outcome.notes.some((n) => n.includes('measured nothing')), 'the silent step is named in the notes');
  assert.equal(outcome.results.length, 0);
  console.log('[deploy-arc-proof] §2 runDeployArc: a registry without the door records nowhere — and says why');
}

// ── §3 a §28 denial ends the walk BEFORE the door: the sink is never even asked ───────────────
{
  const buildRegistry = registerBuildTools(new ToolRegistry(), factVerifier({ s1: 'v22.11.0' }));
  const green = await runBuildArc({ ...SPEC, steps: [SPEC.steps[0]] }, { registry: buildRegistry, checkpoint: () => true });
  const fake = fakeSink();
  const deployRegistry = registerDeployTools(new ToolRegistry(), fake.sink);
  const cp = recordingCheckpoint(false);
  const outcome = await runDeployArc(green, { registry: deployRegistry, checkpoint: cp, recordReceipts: true });
  assert.equal(outcome.status, 'denied');
  assert.equal(outcome.stoppedAt, 's1');
  assert.ok(outcome.reason.includes('denied at s1'));
  assert.equal(fake.calls.length, 0, 'denial at the registry: the sink heard nothing');
  assert.equal(outcome.decisions.length, 1);
  assert.equal(outcome.decisions[0].granted, false);
  assert.equal(outcome.decisions[0].call.callId, 'proof-1:deploy:s1', 'the receipt names the exact door that was refused');
  console.log('[deploy-arc-proof] §3 runDeployArc: §28 denial stops the walk, receipt granted:false, sink never asked');
}

// ── §4 the REAL deployment: a green container arc's own stdout becomes the record, byte for byte ──
const probe = await probeContainerRuntime();
assert.equal(probe.available, true, `docker daemon required for §4 (probe says: ${probe.reason})`);
{
  const host = createContainerExecHost(POLICY, {});
  const buildRegistry = registerBuildTools(new ToolRegistry(), hostPkg.containerVerifyRunner(host));
  const cp = recordingCheckpoint(true);
  const green = await runBuildArc(SPEC, { registry: buildRegistry, checkpoint: cp, recordReceipts: true });
  assert.equal(green.status, 'completed');
  const measured = green.results.map((r) => r.output.stdout);
  assert.ok(measured[0].includes('v22.'), `the pinned runtime's own version, measured: ${JSON.stringify(measured[0])}`);
  assert.ok(measured[1].includes('arc-ok:5'), `the container COMPUTED the answer, measured: ${JSON.stringify(measured[1])}`);

  const fake = fakeSink();
  const deployRegistry = registerDeployTools(new ToolRegistry(), fake.sink);
  const dcp = recordingCheckpoint(true);
  const outcome = await runDeployArc(green, { registry: deployRegistry, checkpoint: dcp, recordReceipts: true });
  assert.equal(outcome.status, 'recorded');
  assert.deepEqual(fake.calls.map((c) => c.fact), measured, 'the sink received the container\'s own words, byte for byte');
  assert.deepEqual(fake.calls.map((c) => c.stepId), ['s1', 's2']);
  assert.equal(outcome.decisions.length, 2, 'both doors left receipts');
  assert.ok(outcome.decisions.every((d) => d.granted === true));
  assert.deepEqual(outcome.decisions.map((d) => d.call.callId), ['proof-1:deploy:s1', 'proof-1:deploy:s2']);
  console.log(`[deploy-arc-proof] §4 real deployment (daemon ${probe.serverVersion}): facts = the engine's stdout, receipts join to doors`);
}

// ── §5 a sink refusal is a FAILED record — the walk stops and names what did not land ─────────
{
  const buildRegistry = registerBuildTools(new ToolRegistry(), factVerifier({ s1: 'v22.11.0', s2: 'arc-ok:5' }));
  const green = await runBuildArc(SPEC, { registry: buildRegistry, checkpoint: () => true });
  const fake = fakeSink('s2');
  const deployRegistry = registerDeployTools(new ToolRegistry(), fake.sink);
  const outcome = await runDeployArc(green, { registry: deployRegistry, checkpoint: () => true });
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.stoppedAt, 's2');
  assert.ok(outcome.reason.includes('was not recorded'), outcome.reason);
  assert.equal(fake.calls.length, 2, 'the refused fact was still DELIVERED — the sink, not the walker, refused it');
  console.log('[deploy-arc-proof] §5 runDeployArc: the sink\'s own refusal ends the walk, the fact named');
}

// ── §6 the dependency audit keeps its teeth over the NEW module too ───────────────────────────
{
  const IMPORT = (pkg) => new RegExp(`from\\s+['"]${pkg.replace('/', '\\/')}['"]`);
  const deployDist = readFileSync('agents/runtime/dist/deployArc.js', 'utf8');
  assert.ok(!IMPORT('@nexus/exec-host').test(deployDist), 'deployArc never reaches exec-host (am.167)');
  const SPAWN_IMPORT = /from\s+['"](node:)?child_process['"]|require\(['"](node:)?child_process['"]\)/;
  assert.ok(!SPAWN_IMPORT.test(deployDist), 'deployArc holds no spawn capability — the runtime keeps the v29 audit');
  assert.ok(deployDist.includes('DeploySink'), 'the deployed module is the one this proof grades');
  for (const f of readdirSync('agents/runtime/dist').filter((n) => n.endsWith('.js'))) {
    const text = readFileSync(`agents/runtime/dist/${f}`, 'utf8');
    assert.ok(!IMPORT('@nexus/exec-host').test(text), `${f}: no module of the runtime reaches exec-host`);
  }
  console.log('[deploy-arc-proof] §6 dist audit: deployArc is seam-only — no exec-host, no child_process');
}

console.log('[deploy-arc-proof] ALL ASSERTIONS PASSED (M6 deploy leg: only green arcs deploy, only measured facts deploy, the human gates every door)');
