import { describe, expect, it } from 'vitest';
import { NO_RECEIPTS_NOTE, type CheckpointDecision } from './checkpointPolicy.js';
import { ToolRegistry, type Checkpoint, type CheckpointRequest } from './registry.js';
import type { ToolCall } from './types.js';
import {
  BUILD_TOOL_SPECS,
  BUILD_VERIFY_TOOL,
  planBuildArc,
  registerBuildTools,
  runBuildArc,
  type BuildArcSpec,
  type BuildVerifyRequest,
} from './buildArc.js';

const SPEC: BuildArcSpec = {
  arcId: 'arc-1',
  goal: 'prove the arc walks',
  steps: [
    { stepId: 's1', argv: ['node', '--version'], rationale: 'runtime answers' },
    { stepId: 's2', argv: ['node', '-e', 'process.exit(0)'], rationale: 'green by construction' },
  ],
};

/** A recording verifier: green unless the command says otherwise, and it COUNTS its calls. */
function fakeVerifier(answer?: Partial<{ ok: boolean; detail: string; engine: string }>) {
  const calls: BuildVerifyRequest[] = [];
  const verifier = async (request: BuildVerifyRequest) => {
    calls.push(request);
    return { ok: answer?.ok ?? true, detail: answer?.detail ?? `ran ${request.argv.join(' ')}`, engine: answer?.engine ?? 'fake' };
  };
  return { calls, verifier };
}

/** A checkpoint that records its own decisions, the way policyCheckpoint does. */
function recordingCheckpoint(allow: boolean): Checkpoint & { decisions: CheckpointDecision[] } {
  const decisions: CheckpointDecision[] = [];
  const cp = ((req: CheckpointRequest) => {
    decisions.push({ call: req.call, granted: allow, matched: 'default', reason: 'test rule' });
    return allow;
  }) as Checkpoint & { decisions: CheckpointDecision[] };
  cp.decisions = decisions;
  return cp;
}

function wired(verifier: ReturnType<typeof fakeVerifier>['verifier']): ToolRegistry {
  return registerBuildTools(new ToolRegistry(), verifier);
}

describe('planBuildArc — the arc as data', () => {
  it('plans inert stages and Step-shaped doors, executing nothing', () => {
    const decided = planBuildArc(SPEC);
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.plan.executes).toBe(false);
    expect(decided.plan.stages[0]).toMatchObject({ stage: 'blueprint' });
    expect(decided.plan.stages[decided.plan.stages.length - 1]).toMatchObject({ stage: 'record' });
    expect(decided.plan.stages.filter((s) => s.stage === 'verify')).toHaveLength(2);
    for (const step of decided.plan.steps) {
      expect(step.tool).toBe(BUILD_VERIFY_TOOL);
      expect(step.args.arcId).toBe('arc-1');
      expect(Array.isArray(step.args.argv)).toBe(true);
    }
  });

  it('refuses a malformed spec with a stated reason, never a half-plan', () => {
    expect(planBuildArc({ ...SPEC, arcId: '' }).ok).toBe(false);
    expect(planBuildArc({ ...SPEC, goal: '  ' }).ok).toBe(false);
    expect(planBuildArc({ ...SPEC, steps: [] }).ok).toBe(false);
    const dup = planBuildArc({ ...SPEC, steps: [{ stepId: 'x', argv: ['node'], rationale: '' }, { stepId: 'x', argv: ['node'], rationale: '' }] });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.reason).toContain('duplicate stepId');
    const emptyArgv = planBuildArc({ ...SPEC, steps: [{ stepId: 'x', argv: [], rationale: '' }] });
    expect(emptyArgv.ok).toBe(false);
  });
});

describe('registerBuildTools — the injected door', () => {
  it('passes the answer through and names the engine', async () => {
    const fake = fakeVerifier({ detail: 'container node → exit 0', engine: 'container:node:22-alpine' });
    const registry = wired(fake.verifier);
    const res = await registry.invoke({ callId: 'c1', tool: BUILD_VERIFY_TOOL, args: { arcId: 'a', stepId: 's', argv: ['node'] } }, { checkpoint: () => true });
    expect(res.ok).toBe(true);
    expect((res.output as { detail: string }).detail).toBe('container node → exit 0');
    expect((res.output as { engine: string }).engine).toBe('container:node:22-alpine');
    expect(fake.calls[0]).toMatchObject({ arcId: 'a', stepId: 's' });
  });

  it('is a dangerous door: no checkpoint, no run — and the verifier never hears of it', async () => {
    const fake = fakeVerifier();
    const registry = wired(fake.verifier);
    const res = await registry.invoke({ callId: 'c2', tool: BUILD_VERIFY_TOOL, args: { arcId: 'a', stepId: 's', argv: ['node'] } }, {});
    expect(res.ok).toBe(false);
    expect(res.error).toContain('checkpoint');
    expect(fake.calls).toHaveLength(0);
  });

  it('declares exec permissions and typed args in its spec', () => {
    expect(BUILD_TOOL_SPECS[0]!.permissions).toEqual(['exec']);
    const names = BUILD_TOOL_SPECS[0]!.args.map((a) => a.name);
    expect(names).toEqual(['arcId', 'stepId', 'argv', 'cwd']);
  });
});

describe('runBuildArc — the walk', () => {
  it('walks green to the end, feeding every step through the ONE door', async () => {
    const fake = fakeVerifier();
    const outcome = await runBuildArc(SPEC, { registry: wired(fake.verifier), checkpoint: () => true });
    expect(outcome.status).toBe('completed');
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[0]).toMatchObject({ arcId: 'arc-1', stepId: 's1' });
    expect(fake.calls[1]).toMatchObject({ arcId: 'arc-1', stepId: 's2', argv: ['node', '-e', 'process.exit(0)'] });
    expect(outcome.results).toHaveLength(2);
  });

  it('stops at no-verifier when the registry holds no door — planning alone builds nothing', async () => {
    const fake = fakeVerifier();
    const outcome = await runBuildArc(SPEC, { registry: new ToolRegistry(), checkpoint: () => true });
    expect(outcome.status).toBe('no-verifier');
    expect(outcome.reason).toContain('planning alone builds nothing');
    expect(outcome.results).toHaveLength(0);
    expect(fake.calls).toHaveLength(0);
    expect(outcome.plan.executes).toBe(false);
  });

  it('a §28 denial ends the walk before the door, and the receipt says who refused', async () => {
    const fake = fakeVerifier();
    const cp = recordingCheckpoint(false);
    const outcome = await runBuildArc(SPEC, { registry: wired(fake.verifier), checkpoint: cp, recordReceipts: true });
    expect(outcome.status).toBe('denied');
    expect(outcome.stoppedAt).toBe('s1');
    expect(outcome.reason).toContain('denied at s1');
    expect(fake.calls).toHaveLength(0);
    expect(outcome.decisions).toHaveLength(1);
    expect(outcome.decisions![0]).toMatchObject({ granted: false, matched: 'default' });
    expect(outcome.decisions![0]?.call.callId).toBe('arc-1:s1');
  });

  it('a red verdict is a failed verification carrying the engine’s own detail', async () => {
    const fake = fakeVerifier({ ok: false, detail: 'container node → exit 3' });
    const outcome = await runBuildArc(SPEC, { registry: wired(fake.verifier), checkpoint: () => true });
    expect(outcome.status).toBe('failed');
    expect(outcome.stoppedAt).toBe('s1');
    expect(outcome.reason).toContain('verified red');
    expect(outcome.reason).toContain('exit 3');
  });

  it('walks step by step: the first red step stops it, later steps never run', async () => {
    const fake = fakeVerifier();
    const calls = fake.calls;
    const verifier = async (request: BuildVerifyRequest) => {
      calls.push(request);
      return request.stepId === 's2' ? { ok: false, detail: 'boom', engine: 'fake' } : { ok: true, detail: 'fine', engine: 'fake' };
    };
    const outcome = await runBuildArc(SPEC, { registry: wired(verifier), checkpoint: () => true });
    expect(outcome.status).toBe('failed');
    expect(outcome.stoppedAt).toBe('s2');
    expect(calls).toHaveLength(2);
  });

  it('an invalid spec is refused before any door, receipts empty and owned', async () => {
    const fake = fakeVerifier();
    const outcome = await runBuildArc({ ...SPEC, steps: [] }, { registry: wired(fake.verifier), checkpoint: () => true, recordReceipts: true });
    expect(outcome.status).toBe('invalid-spec');
    expect(fake.calls).toHaveLength(0);
    expect(outcome.decisions).toEqual([]);
  });

  it('a plain (non-policy) checkpoint owes the receipt note, not a silent empty', async () => {
    const fake = fakeVerifier();
    const outcome = await runBuildArc(SPEC, { registry: wired(fake.verifier), checkpoint: () => true, recordReceipts: true });
    expect(outcome.status).toBe('completed');
    expect(outcome.decisions).toEqual([]);
    expect(outcome.notes).toContain(NO_RECEIPTS_NOTE);
  });

  it('carries the caller’s ToolCall through the checkpoint so receipts join to steps', async () => {
    const fake = fakeVerifier();
    const seen: ToolCall[] = [];
    const cp: Checkpoint = (req) => {
      seen.push(req.call);
      return true;
    };
    await runBuildArc(SPEC, { registry: wired(fake.verifier), checkpoint: cp });
    expect(seen.map((c) => c.callId)).toEqual(['arc-1:s1', 'arc-1:s2']);
    expect(seen.every((c) => c.tool === BUILD_VERIFY_TOOL)).toBe(true);
  });
});
