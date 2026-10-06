import { describe, expect, it } from 'vitest';
import { NO_RECEIPTS_NOTE, type CheckpointDecision } from './checkpointPolicy.js';
import { ToolRegistry, type Checkpoint, type CheckpointRequest } from './registry.js';
import { runBuildArc, registerBuildTools, type BuildArcOutcome, type BuildVerifyRequest } from './buildArc.js';
import {
  DEPLOY_RECORD_TOOL,
  DEPLOY_TOOL_SPECS,
  planDeployArc,
  registerDeployTools,
  runDeployArc,
  type DeployRecordRequest,
} from './deployArc.js';

const ARC = { arcId: 'arc-1', goal: 'prove the arc walks', steps: [
  { stepId: 's1', argv: ['node', '--version'], rationale: 'runtime answers' },
  { stepId: 's2', argv: ['node', '-e', 'console.log("arc ok:5")'], rationale: 'container computes' },
] };

/** A verifier that answers green WITH the engine's own stdout (or red on demand). */
function factVerifier(stdoutByStep: Record<string, string>, red?: string) {
  const calls: BuildVerifyRequest[] = [];
  const verifier = async (request: BuildVerifyRequest) => {
    calls.push(request);
    if (red === request.stepId) return { ok: false, detail: `${request.stepId} verified red`, engine: 'fake' };
    const stdout = stdoutByStep[request.stepId];
    return { ok: true, detail: `ran ${request.argv.join(' ')}`, engine: 'fake', ...(stdout === undefined ? {} : { stdout }) };
  };
  return { calls, verifier };
}

/** A recording sink: accepts every fact, and it COUNTS what it was handed. */
function fakeSink(refuse?: string) {
  const calls: DeployRecordRequest[] = [];
  const sink = async (request: DeployRecordRequest) => {
    calls.push(request);
    if (refuse === request.stepId) return { ok: false, detail: `${request.stepId} refused by the sink` };
    return { ok: true, detail: `recorded ${request.stepId}` };
  };
  return { calls, sink };
}

function recordingCheckpoint(allow: boolean): Checkpoint & { decisions: CheckpointDecision[] } {
  const decisions: CheckpointDecision[] = [];
  const cp = ((req: CheckpointRequest) => {
    decisions.push({ call: req.call, granted: allow, matched: 'default', reason: 'test rule' });
    return allow;
  }) as Checkpoint & { decisions: CheckpointDecision[] };
  cp.decisions = decisions;
  return cp;
}

/** Walk a REAL build arc first — the deploy arc is only ever planned over a real outcome. */
async function walked(stdoutByStep: Record<string, string>, red?: string): Promise<BuildArcOutcome> {
  const registry = registerBuildTools(new ToolRegistry(), factVerifier(stdoutByStep, red).verifier);
  return runBuildArc(ARC, { registry, checkpoint: () => true });
}

describe('planDeployArc — only a green arc with measured facts plans', () => {
  it('refuses every non-completed arc by status, naming the rule', async () => {
    const red = await walked({ s1: 'v22', s2: 'arc ok:5' }, 's2');
    expect(red.status).toBe('failed');
    const refused = planDeployArc(red);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.reason).toContain('did not complete');
      expect(refused.reason).toContain('failed');
    }
  });

  it('plans inert stages over the measured stdout, and names the green-but-silent steps', async () => {
    const green = await walked({ s1: 'v22.11.0', s2: 'arc ok:5' });
    const decided = planDeployArc(green);
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.plan.executes).toBe(false);
    expect(decided.plan.facts).toEqual([
      { stepId: 's1', argv: ['node', '--version'], stdout: 'v22.11.0' },
      { stepId: 's2', argv: ['node', '-e', 'console.log("arc ok:5")'], stdout: 'arc ok:5' },
    ]);
    expect(decided.plan.unmeasured).toEqual([]);
    expect(decided.plan.steps.every((s) => s.tool === DEPLOY_RECORD_TOOL)).toBe(true);
    expect(decided.plan.stages[0]).toMatchObject({ stage: 'blueprint' });
    expect(decided.plan.stages.filter((s) => s.stage === 'record')).toHaveLength(2);
  });

  it('refuses a green arc that measured nothing — a record of nothing is a §60 lie', async () => {
    const green = await walked({});
    expect(green.status).toBe('completed');
    const refused = planDeployArc(green);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toContain('measured nothing');
  });

  it('names unmeasured steps instead of summarising them', async () => {
    const green = await walked({ s1: 'v22.11.0' });
    const decided = planDeployArc(green);
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.plan.facts).toHaveLength(1);
    expect(decided.plan.unmeasured).toEqual(['s2']);
  });
});

describe('registerDeployTools — the injected door', () => {
  it('hands the engine\'s own words to the sink, verbatim', async () => {
    const fake = fakeSink();
    const registry = registerDeployTools(new ToolRegistry(), fake.sink);
    const res = await registry.invoke(
      { callId: 'c1', tool: DEPLOY_RECORD_TOOL, args: { arcId: 'a', stepId: 's', fact: 'arc ok:5' } },
      { checkpoint: () => true },
    );
    expect(res.ok).toBe(true);
    expect(fake.calls[0]).toEqual({ arcId: 'a', stepId: 's', fact: 'arc ok:5' });
    expect((res.output as { detail: string }).detail).toBe('recorded s');
  });

  it('is a dangerous door: no checkpoint, no write — and the sink never hears of it', async () => {
    const fake = fakeSink();
    const registry = registerDeployTools(new ToolRegistry(), fake.sink);
    const res = await registry.invoke({ callId: 'c2', tool: DEPLOY_RECORD_TOOL, args: { arcId: 'a', stepId: 's', fact: 'x' } }, {});
    expect(res.ok).toBe(false);
    expect(res.error).toContain('checkpoint');
    expect(fake.calls).toHaveLength(0);
  });

  it('declares write permissions and typed args in its spec', () => {
    expect(DEPLOY_TOOL_SPECS[0]!.permissions).toEqual(['write']);
    const names = DEPLOY_TOOL_SPECS[0]!.args.map((a) => a.name);
    expect(names).toEqual(['arcId', 'stepId', 'fact']);
  });
});

describe('runDeployArc — the walk records door by door', () => {
  it('records every fact through the sink and answers recorded', async () => {
    const outcome = await walked({ s1: 'v22.11.0', s2: 'arc ok:5' });
    const fake = fakeSink();
    const registry = registerDeployTools(new ToolRegistry(), fake.sink);
    const deployed = await runDeployArc(outcome, { registry, checkpoint: () => true });
    expect(deployed.status).toBe('recorded');
    expect(fake.calls.map((c) => c.stepId)).toEqual(['s1', 's2']);
    expect(fake.calls.map((c) => c.fact)).toEqual(['v22.11.0', 'arc ok:5']);
    expect(deployed.notes).toEqual([]);
  });

  it('refuses a red arc before any door opens', async () => {
    const red = await walked({ s1: 'v22' }, 's2');
    const fake = fakeSink();
    const registry = registerDeployTools(new ToolRegistry(), fake.sink);
    const deployed = await runDeployArc(red, { registry, checkpoint: () => true });
    expect(deployed.status).toBe('not-green');
    expect(fake.calls).toHaveLength(0);
    expect(deployed.results).toHaveLength(0);
  });

  it('answers no-sink when the registry has no door, stating the facts are measured', async () => {
    const outcome = await walked({ s1: 'v22.11.0' });
    const deployed = await runDeployArc(outcome, { registry: new ToolRegistry(), checkpoint: () => true });
    expect(deployed.status).toBe('no-sink');
    expect(deployed.reason).toContain('nowhere to record');
  });

  it('stops at the first sink refusal — the fact did not land and the walk says so', async () => {
    const outcome = await walked({ s1: 'v22.11.0', s2: 'arc ok:5' });
    const fake = fakeSink('s2');
    const registry = registerDeployTools(new ToolRegistry(), fake.sink);
    const deployed = await runDeployArc(outcome, { registry, checkpoint: () => true });
    expect(deployed.status).toBe('failed');
    expect(deployed.stoppedAt).toBe('s2');
    expect(deployed.reason).toContain('was not recorded');
    expect(fake.calls).toHaveLength(2);
  });

  it('one gate per fact: a denied checkpoint stops the walk with nothing recorded', async () => {
    const outcome = await walked({ s1: 'v22.11.0', s2: 'arc ok:5' });
    const fake = fakeSink();
    const registry = registerDeployTools(new ToolRegistry(), fake.sink);
    const deployed = await runDeployArc(outcome, { registry, checkpoint: () => false });
    expect(deployed.status).toBe('denied');
    expect(fake.calls).toHaveLength(0);
    expect(deployed.stoppedAt).toBe('s1');
  });

  it('recordReceipts carries one receipt per walked door and the note for none', async () => {
    const outcome = await walked({ s1: 'v22.11.0' });
    const registry = registerDeployTools(new ToolRegistry(), fakeSink().sink);
    const cpDeny = recordingCheckpoint(false);
    const denied = await runDeployArc(outcome, { registry, checkpoint: cpDeny, recordReceipts: true });
    expect(denied.decisions).toHaveLength(1);
    expect(denied.decisions![0]!.granted).toBe(false);

    const cp = recordingCheckpoint(true);
    const ok = await runDeployArc(outcome, { registry, checkpoint: cp, recordReceipts: true });
    expect(ok.decisions).toHaveLength(1);
    expect(ok.decisions![0]!.granted).toBe(true);
    expect(ok.decisions![0]!.call.callId).toBe('arc-1:deploy:s1');

    const noGate = await runDeployArc(outcome, { registry, recordReceipts: true });
    expect(noGate.decisions).toEqual([]);
    expect(noGate.notes).toContain(NO_RECEIPTS_NOTE);
  });
});
