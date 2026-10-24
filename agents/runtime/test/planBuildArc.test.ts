/**
 * Direct coverage for `planBuildArc` (agents/runtime/src/buildArc.ts).
 *
 * The build-arc's ONE pure decision function — validates, orders and freezes steps into the
 * shared `Step` shape — is reached only indirectly (by templateBuildPlanner / runBuildArc), so
 * its refusal reasons and the frozen Step mapping were never asserted directly. Per house
 * discipline an untested pure branch *is* the next increment.
 */
import { describe, expect, it } from 'vitest';
import { BUILD_VERIFY_TOOL, planBuildArc, type BuildArcSpec } from '../src/buildArc.js';

const valid: BuildArcSpec = {
  arcId: 'a1',
  goal: 'g',
  steps: [
    { stepId: 's1', argv: ['x'], rationale: 'r1' },
    { stepId: 's2', argv: ['y', 'z'], rationale: 'r2' },
  ],
};

describe('planBuildArc — refusal reasons', () => {
  it('refuses a blank/whitespace arcId', () => {
    expect(planBuildArc({ ...valid, arcId: '  ' }).ok).toBe(false);
    expect(planBuildArc({ ...valid, arcId: '' })).toEqual({ ok: false, reason: 'arcId must be a non-empty string' });
  });

  it('refuses a blank/whitespace goal', () => {
    expect(planBuildArc({ ...valid, goal: '' })).toEqual({ ok: false, reason: 'goal must be a non-empty string' });
  });

  it('refuses an arc with no steps', () => {
    expect(planBuildArc({ ...valid, steps: [] })).toEqual({ ok: false, reason: 'a build arc without steps is not an arc' });
  });

  it('refuses a step with an empty stepId', () => {
    expect(planBuildArc({ ...valid, steps: [{ stepId: '', argv: ['x'], rationale: 'r' }] })).toEqual({
      ok: false,
      reason: 'every step needs a non-empty stepId',
    });
  });

  it('refuses duplicate stepIds', () => {
    expect(planBuildArc({ ...valid, steps: [{ stepId: 's', argv: ['x'], rationale: 'r' }, { stepId: 's', argv: ['y'], rationale: 'r' }] })).toEqual({
      ok: false,
      reason: 'duplicate stepId "s"',
    });
  });

  it('refuses an argv that is empty or contains an empty string', () => {
    expect(planBuildArc({ ...valid, steps: [{ stepId: 's', argv: [], rationale: 'r' }] }).ok).toBe(false);
    const bad = planBuildArc({ ...valid, steps: [{ stepId: 's', argv: ['x', ''], rationale: 'r' }] });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.reason).toContain('argv');
  });
});

describe('planBuildArc — freezing into Steps', () => {
  it('maps each step to a single build.verify Step with threaded args', () => {
    const r = planBuildArc(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.steps).toHaveLength(2);
    expect(r.plan.executes).toBe(false);
    expect(r.plan.steps[0]).toMatchObject({
      stepId: 's1',
      tool: BUILD_VERIFY_TOOL,
      args: { arcId: 'a1', stepId: 's1', argv: ['x'] },
    });
    expect(r.plan.steps[1]!.args).toEqual({ arcId: 'a1', stepId: 's2', argv: ['y', 'z'] });
  });

  it('threads an optional cwd into the step args', () => {
    const r = planBuildArc({ ...valid, steps: [{ stepId: 's', argv: ['x'], rationale: 'r', cwd: '/w' }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.steps[0]!.args).toEqual({ arcId: 'a1', stepId: 's', argv: ['x'], cwd: '/w' });
  });

  it('builds blueprint → verify×N → record stages', () => {
    const r = planBuildArc(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.stages[0]!.stage).toBe('blueprint');
    expect(r.plan.stages.filter((s) => s.stage === 'verify')).toHaveLength(2);
    expect(r.plan.stages.at(-1)!.stage).toBe('record');
  });

  it('copies argv so the caller cannot mutate the frozen plan', () => {
    const spec: BuildArcSpec = { arcId: 'a', goal: 'g', steps: [{ stepId: 's', argv: ['x'], rationale: 'r' }] };
    const r = planBuildArc(spec);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    spec.steps[0]!.argv.push('mutated');
    expect(r.plan.steps[0]!.args.argv).toEqual(['x']);
  });
});
