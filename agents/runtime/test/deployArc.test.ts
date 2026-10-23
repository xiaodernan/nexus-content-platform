/**
 * Direct coverage for `planDeployArc` + `runDeployArc` (agents/runtime/src/deployArc.ts).
 *
 * The deploy arc — what a COMPLETED build arc does next — was only reached indirectly, so its
 * rules were never asserted directly: only a green arc plans; only steps whose verdict carries
 * non-empty stdout become facts (green-but-unmeasured steps are NAMED, not summarised); a
 * green arc that measured nothing refuses; and the walk's status machine
 * (recorded / not-green / nothing-measured / no-sink / denied / failed) was never exercised.
 * Per house discipline an untested pure branch *is* the next increment.
 */
import { describe, expect, it } from 'vitest';
import { DEPLOY_RECORD_TOOL, planDeployArc, registerDeployTools, runDeployArc, type DeploySink } from '../src/deployArc.js';
import type { BuildArcOutcome } from '../src/buildArc.js';
import { ToolRegistry } from '../src/registry.js';
import type { Step, ToolResult } from '../src/types.js';

function completed(steps: { stepId: string; argv: string[]; stdout?: string }[]): BuildArcOutcome {
  const planSteps: Step[] = steps.map((s) => ({ stepId: s.stepId, tool: 'build.verify', args: { arcId: 'a1', stepId: s.stepId, argv: s.argv }, rationale: 'r' }));
  const results: ToolResult[] = steps.map((s) => ({
    callId: `a1:${s.stepId}`,
    tool: 'build.verify',
    ok: true,
    output: { ok: true, detail: 'ok', engine: 'e', ...(s.stdout === undefined ? {} : { stdout: s.stdout }) },
  }));
  return { arcId: 'a1', goal: 'g', plan: { goal: 'g', stages: [], steps: planSteps, executes: false }, steps: planSteps, results, status: 'completed', notes: [] };
}

const registryWith = (sink: DeploySink): ToolRegistry => registerDeployTools(new ToolRegistry(), sink);

describe('planDeployArc', () => {
  it('refuses a build arc that did not complete', () => {
    const r = planDeployArc({ ...completed([{ stepId: 's', argv: ['x'], stdout: 'o' }]), status: 'failed' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('did not complete');
  });

  it('turns each stdout-bearing step into a fact and freezes inert deploy.record steps', () => {
    const r = planDeployArc(completed([{ stepId: 's1', argv: ['x'], stdout: 'PASS 1' }, { stepId: 's2', argv: ['y'], stdout: 'PASS 2' }]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.facts.map((f) => f.stepId)).toEqual(['s1', 's2']);
    expect(r.plan.facts[0]!.stdout).toBe('PASS 1');
    expect(r.plan.unmeasured).toEqual([]);
    expect(r.plan.steps.every((s) => s.tool === DEPLOY_RECORD_TOOL)).toBe(true);
    expect(r.plan.steps[0]!.args).toEqual({ arcId: 'a1', stepId: 's1', fact: 'PASS 1' });
    expect(r.plan.executes).toBe(false);
  });

  it('names green-but-unmeasured steps rather than summarising them', () => {
    const r = planDeployArc(completed([{ stepId: 's1', argv: ['x'], stdout: 'PASS' }, { stepId: 's2', argv: ['y'] }, { stepId: 's3', argv: ['z'], stdout: '   ' }]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.facts.map((f) => f.stepId)).toEqual(['s1']); // s2 (no stdout) and s3 (whitespace-only) are excluded
    expect(r.plan.unmeasured).toEqual(['s2', 's3']);
  });

  it('refuses a green arc where every step measured nothing', () => {
    const r = planDeployArc(completed([{ stepId: 's1', argv: ['x'] }, { stepId: 's2', argv: ['y'] }]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('measured nothing');
  });
});

describe('runDeployArc', () => {
  it('records when the sink accepts every fact', async () => {
    const out = await runDeployArc(completed([{ stepId: 's1', argv: ['x'], stdout: 'PASS 1' }]), {
      registry: registryWith(async () => ({ ok: true, detail: 'recorded' })),
      checkpoint: () => true,
    });
    expect(out.status).toBe('recorded');
    expect(out.results).toHaveLength(1);
  });

  it('reports not-green for an uncompleted arc', async () => {
    const out = await runDeployArc({ ...completed([{ stepId: 's1', argv: ['x'], stdout: 'o' }]), status: 'denied' }, { registry: registryWith(async () => ({ ok: true, detail: 'x' })) });
    expect(out.status).toBe('not-green');
  });

  it('reports nothing-measured when no fact exists', async () => {
    const out = await runDeployArc(completed([{ stepId: 's1', argv: ['x'] }]), { registry: registryWith(async () => ({ ok: true, detail: 'x' })) });
    expect(out.status).toBe('nothing-measured');
  });

  it('reports no-sink when the registry has no deploy.record door', async () => {
    const out = await runDeployArc(completed([{ stepId: 's1', argv: ['x'], stdout: 'PASS' }]), { registry: new ToolRegistry() });
    expect(out.status).toBe('no-sink');
    expect(out.reason).toContain(DEPLOY_RECORD_TOOL);
  });

  it('reports denied when the §28 checkpoint refuses the fact', async () => {
    const out = await runDeployArc(completed([{ stepId: 's1', argv: ['x'], stdout: 'PASS' }]), {
      registry: registryWith(async () => ({ ok: true, detail: 'x' })),
      checkpoint: () => false,
    });
    expect(out.status).toBe('denied');
    expect(out.stoppedAt).toBe('s1');
  });

  it('reports failed when the sink rejects a fact', async () => {
    const out = await runDeployArc(completed([{ stepId: 's1', argv: ['x'], stdout: 'PASS' }]), {
      registry: registryWith(async () => ({ ok: false, detail: 'sink refused' })),
      checkpoint: () => true,
    });
    expect(out.status).toBe('failed');
    expect(out.reason).toContain('was not recorded');
  });

  it('carries §28 receipts on a durable walk', async () => {
    const out = await runDeployArc(completed([{ stepId: 's1', argv: ['x'], stdout: 'PASS' }]), {
      registry: registryWith(async () => ({ ok: true, detail: 'ok' })),
      checkpoint: () => true,
      recordReceipts: true,
    });
    expect(out.status).toBe('recorded');
    expect(Array.isArray(out.decisions)).toBe(true);
  });
});
