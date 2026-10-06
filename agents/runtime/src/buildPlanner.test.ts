import { describe, expect, it } from 'vitest';
import { planBuildArc } from './buildArc.js';
import { templateBuildPlanner, type BuildStepTemplate } from './buildPlanner.js';

const CATALOG: BuildStepTemplate[] = [
  { id: 'runtime', argv: ['node', '--version'], rationale: 'the runtime answers with its own version' },
  { id: 'compute', argv: ['node', '-e', 'console.log("ok")'], rationale: 'the runtime computes and prints', keywords: ['compute', 'verify', 'check'] },
  { id: 'other', argv: ['node', '-e', 'console.log("other")'], rationale: 'an unrelated template', keywords: ['unrelated'] },
];

describe('templateBuildPlanner catalog validation (v175)', () => {
  it('throws on catalogs that could never plan', () => {
    expect(() => templateBuildPlanner([])).toThrow(/without templates/);
    expect(() => templateBuildPlanner([{ id: '', argv: ['x'], rationale: 'r' }, { id: 'b', argv: ['y'], rationale: 'r' }])).toThrow(/non-empty id/);
    expect(() => templateBuildPlanner([{ id: 'a', argv: ['x'], rationale: 'r' }, { id: 'a', argv: ['y'], rationale: 'r' }])).toThrow(/duplicate template id "a"/);
    expect(() => templateBuildPlanner([{ id: 'a', argv: [], rationale: 'r' }])).toThrow(/non-empty array/);
    expect(() => templateBuildPlanner([{ id: 'a', argv: ['node', ''], rationale: 'r' }])).toThrow(/non-empty array/);
  });
});

describe('templateBuildPlanner selection (v175)', () => {
  it('summons keyword templates plus the always-on baseline, in catalog order', () => {
    const planner = templateBuildPlanner(CATALOG, 'studio-build-arc');
    const d = planner({ goal: 'Verify the dock build lane end to end' });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.draft.provenance.picked).toEqual(['runtime', 'compute']);
    expect(d.draft.spec.arcId).toBe('studio-build-arc');
    expect(d.draft.spec.steps.map((s) => s.stepId)).toEqual(['runtime', 'compute']);
    expect(d.draft.spec.steps.every((s) => s.rationale.includes('template "'))).toBe(true);
    expect(d.draft.provenance.backend).toBe('template');
  });

  it('a goal that summons nothing is a refusal — the planner invents nothing', () => {
    const planner = templateBuildPlanner(CATALOG.filter((t) => t.keywords !== undefined), 'x');
    const d = planner({ goal: 'zzz qqq nonsense' });
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.reason).toContain('invents nothing');
  });

  it('is deterministic per (arcId, goal) and stamps the seed as provenance', () => {
    const planner = templateBuildPlanner(CATALOG, 'studio-build-arc');
    const a = planner({ goal: 'check the numbers' });
    const b = planner({ goal: 'check the numbers' });
    const c = planner({ goal: 'a different goal entirely for compute' });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.draft.provenance.seed).toBe(a.draft.provenance.seed);
    expect(b.draft.provenance.picked).toEqual(a.draft.provenance.picked);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.draft.provenance.seed).not.toBe(a.draft.provenance.seed);
    expect(c.draft.provenance.goal).toBe('a different goal entirely for compute');
  });

  it('derives the arcId from the seed when the host does not pin one', () => {
    const planner = templateBuildPlanner(CATALOG);
    const d = planner({ goal: 'verify things' });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.draft.spec.arcId.startsWith('build-arc-')).toBe(true);
    expect(d.draft.spec.arcId).toBe(`build-arc-${d.draft.provenance.seed.toString(36)}`);
  });

  it('hands out copies: mutating a draft can never reach back into the catalog', () => {
    const planner = templateBuildPlanner(CATALOG, 'studio-build-arc');
    const d = planner({ goal: 'verify things' });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    const step = d.draft.spec.steps[0]!;
    (step.argv as string[]).push('INJECTED');
    const again = planner({ goal: 'verify things' });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.draft.spec.steps[0]!.argv).toEqual(['node', '--version']);
  });

  it('the draft self-checks through the arc decision function the walk will use', () => {
    const planner = templateBuildPlanner(CATALOG, 'studio-build-arc');
    const d = planner({ goal: 'verify things' });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(planBuildArc(d.draft.spec).ok).toBe(true);
  });

  it('refuses an empty goal before touching the catalog', () => {
    const planner = templateBuildPlanner(CATALOG, 'x');
    for (const goal of ['', '   ']) {
      const d = planner({ goal });
      expect(d.ok).toBe(false);
      if (!d.ok) expect(d.reason).toContain('non-empty');
    }
  });
});
