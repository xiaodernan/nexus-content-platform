/**
 * Direct coverage for `templateBuildPlanner` (agents/runtime/src/buildPlanner.ts).
 *
 * The FIRST build-arc planner — deterministic template instantiation that only ever SELECTS among a
 * host-declared catalog, never invents argv — was only reached indirectly, so its catalog validation,
 * keyword selection, baseline-always-runs rule, empty/no-match refusals and determinism were never
 * asserted. Per house discipline an untested pure branch *is* the next increment.
 */
import { describe, expect, it } from 'vitest';
import { templateBuildPlanner, type BuildStepTemplate } from '../src/buildPlanner.js';

const catalog: BuildStepTemplate[] = [
  { id: 'lint', argv: ['npm', 'run', 'lint'], rationale: 'lint', keywords: ['lint', 'check'] },
  { id: 'test', argv: ['npm', 'test'], rationale: 'test', keywords: ['test', 'verify'] },
  // no keywords ⇒ baseline step, summoned by every goal
  { id: 'build', argv: ['npm', 'run', 'build'], rationale: 'build' },
];

describe('templateBuildPlanner — catalog validation (throws, does not return)', () => {
  it('throws on an empty catalog', () => {
    expect(() => templateBuildPlanner([])).toThrow('a step catalog without templates plans nothing');
  });

  it('throws on a duplicate template id', () => {
    expect(() => templateBuildPlanner([{ id: 'x', argv: ['a'], rationale: 'r' }, { id: 'x', argv: ['b'], rationale: 'r' }])).toThrow('duplicate template id "x"');
  });

  it('throws when a template argv is empty or holds an empty string', () => {
    expect(() => templateBuildPlanner([{ id: 'x', argv: [], rationale: 'r' }])).toThrow('argv must be a non-empty array of non-empty strings');
    expect(() => templateBuildPlanner([{ id: 'x', argv: ['a', ''], rationale: 'r' }])).toThrow('argv must be a non-empty array of non-empty strings');
  });
});

describe('templateBuildPlanner — goal selection', () => {
  it('selects keyword-matched steps plus the always-on baseline', () => {
    const p = templateBuildPlanner(catalog);
    const r = p({ goal: 'run a test' }); // token "test" exactly matches the 'test' keyword
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.spec.steps.map((s) => s.stepId)).toEqual(['test', 'build']); // 'lint' not summoned
  });

  it('summons the lint step for a lint goal and keeps the baseline', () => {
    const p = templateBuildPlanner(catalog);
    const r = p({ goal: 'lint the code' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.spec.steps.map((s) => s.stepId)).toEqual(['lint', 'build']);
  });

  it('keeps only the baseline when no keyword matches', () => {
    const p = templateBuildPlanner(catalog);
    const r = p({ goal: 'build the app' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.spec.steps.map((s) => s.stepId)).toEqual(['build']);
  });

  it('a goal of only sub-length words still yields the baseline (tokens are length ≥ 3)', () => {
    const p = templateBuildPlanner(catalog);
    const r = p({ goal: 'a b' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.spec.steps.map((s) => s.stepId)).toEqual(['build']);
  });

  it('refuses when no template matches and there is no baseline', () => {
    const onlyLint: BuildStepTemplate[] = [{ id: 'lint', argv: ['npm', 'run', 'lint'], rationale: 'lint', keywords: ['lint'] }];
    const r = templateBuildPlanner(onlyLint)({ goal: 'beta gamma' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('no step template matches');
    expect(r.reason).toContain('§60'); // the planner invents nothing
  });

  it('refuses a blank goal', () => {
    const r = templateBuildPlanner(catalog)({ goal: '   ' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('goal must be a non-empty string');
  });
});

describe('templateBuildPlanner — provenance & determinism', () => {
  it('stamps backend=template and the picked ids in catalog order on the provenance', () => {
    const p = templateBuildPlanner(catalog);
    const r = p({ goal: 'run a test' }); // token "test" exactly matches the 'test' keyword
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.provenance.backend).toBe('template');
    expect(r.draft.provenance.picked).toEqual(['test', 'build']);
  });

  it('is deterministic for identical (catalog, goal) — same arcId, same picks', () => {
    const p = templateBuildPlanner(catalog);
    const a = p({ goal: 'run a test' });
    const b = p({ goal: 'run a test' });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.draft.spec.arcId).toBe(b.draft.spec.arcId);
    expect(a.draft.provenance.picked).toEqual(b.draft.provenance.picked);
  });

  it('honors a fixed arcId instead of hashing the goal', () => {
    const r = templateBuildPlanner(catalog, 'my-arc')({ goal: 'build the app' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.spec.arcId).toBe('my-arc');
  });

  it('threads an optional cwd through to the drafted step', () => {
    const cwdCatalog: BuildStepTemplate[] = [{ id: 'x', argv: ['y'], rationale: 'r', cwd: '/work' }];
    const r = templateBuildPlanner(cwdCatalog)({ goal: 'anything' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.spec.steps[0]!.cwd).toBe('/work');
  });
});
