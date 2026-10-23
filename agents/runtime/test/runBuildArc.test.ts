/**
 * Direct coverage for `runBuildArc` (agents/runtime/src/buildArc.ts).
 *
 * The build-arc WALK — one gate per step, first refusal/red verdict ends it — was only reached
 * indirectly, so its status machine (completed / failed / denied / no-verifier / invalid-spec) was
 * never asserted. Per house discipline an untested pure branch *is* the next increment. A real
 * ToolRegistry + a fake BuildVerifier exercise every branch without a container.
 */
import { describe, expect, it } from 'vitest';
import { BUILD_VERIFY_TOOL, registerBuildTools, runBuildArc, type BuildArcSpec, type BuildVerifier } from '../src/buildArc.js';
import { ToolRegistry } from '../src/registry.js';

const spec: BuildArcSpec = {
  arcId: 'a1',
  goal: 'g',
  steps: [
    { stepId: 's1', argv: ['x'], rationale: 'r' },
    { stepId: 's2', argv: ['y'], rationale: 'r' },
  ],
};

function registryWith(verifier: BuildVerifier): ToolRegistry {
  const r = new ToolRegistry();
  registerBuildTools(r, verifier);
  return r;
}

describe('runBuildArc — status machine', () => {
  it('completes when every step verifies green', async () => {
    const out = await runBuildArc(spec, {
      registry: registryWith(async () => ({ ok: true, detail: 'ok', engine: 'test' })),
      checkpoint: () => true,
    });
    expect(out.status).toBe('completed');
    expect(out.results).toHaveLength(2);
    expect(out.steps).toHaveLength(2);
  });

  it('stops at the first red verdict and reports failed', async () => {
    const out = await runBuildArc(spec, {
      registry: registryWith(async (req) => ({ ok: req.stepId !== 's2', detail: req.stepId === 's2' ? 'bad' : 'ok', engine: 'test' })),
      checkpoint: () => true,
    });
    expect(out.status).toBe('failed');
    expect(out.stoppedAt).toBe('s2');
    expect(out.reason).toContain('verified red');
  });

  it('reports no-verifier when the registry has no build.verify door', async () => {
    const out = await runBuildArc(spec, { registry: new ToolRegistry() });
    expect(out.status).toBe('no-verifier');
    expect(out.reason).toContain(BUILD_VERIFY_TOOL);
  });

  it('reports denied when the §28 checkpoint refuses the step', async () => {
    const out = await runBuildArc(spec, {
      registry: registryWith(async () => ({ ok: true, detail: 'ok', engine: 'test' })),
      checkpoint: () => false,
    });
    expect(out.status).toBe('denied');
    expect(out.stoppedAt).toBe('s1');
    expect(out.reason).toContain('checkpoint');
  });

  it('reports invalid-spec when the spec cannot plan', async () => {
    const out = await runBuildArc({ ...spec, steps: [] }, { registry: registryWith(async () => ({ ok: true, detail: 'ok', engine: 'test' })) });
    expect(out.status).toBe('invalid-spec');
    expect(out.reason).toContain('without steps');
  });

  it('records §28 receipts on a durable walk (recordReceipts)', async () => {
    const out = await runBuildArc(spec, {
      registry: registryWith(async () => ({ ok: true, detail: 'ok', engine: 'test' })),
      recordReceipts: true,
      checkpoint: () => true,
    });
    expect(out.status).toBe('completed');
    expect(Array.isArray(out.decisions)).toBe(true);
  });
});
