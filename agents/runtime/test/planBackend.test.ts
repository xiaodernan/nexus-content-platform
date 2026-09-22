import { describe, expect, it } from 'vitest';
import { demoPlanner, routerPlanner, validatePlan } from '../src/planBackend.js';
import { ToolRegistry } from '../src/registry.js';
import { InMemoryWorkspace, registerWorkspaceTools } from '../src/workspace.js';
import { runTask } from '../src/orchestrator.js';

const KNOWN = new Set(['fs.search', 'fs.read', 'fs.append', 'test.run']);
const known = (n: string): boolean => KNOWN.has(n);
const task = { id: 'pb-1', goal: 'add widget docs' };
const ctx = { hasVerify: true };

const goodPlan = {
  goal: 'add widget docs',
  seed: 7,
  steps: [
    { stepId: 'search', tool: 'fs.search', args: { term: 'widget' }, rationale: 'find' },
    { stepId: 'annotate', tool: 'fs.append', args: { path: 'docs/a.md', text: 'NOTE' }, rationale: 'write' },
  ],
};

describe('validatePlan (v17 gate before adoption)', () => {
  it('accepts a well-formed plan over known tools', () => {
    const v = validatePlan(goodPlan, known);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.plan.steps.map((s) => s.stepId)).toEqual(['search', 'annotate']);
  });

  it('rejects unknown tools, duplicate step ids, object args, empties, oversize', () => {
    expect(validatePlan({ steps: [{ stepId: 'a', tool: 'rm -rf', args: {}, rationale: '' }] }, known).ok).toBe(false);
    expect(validatePlan({ steps: [goodPlan.steps[0], goodPlan.steps[0]] }, known).ok).toBe(false);
    expect(validatePlan({ steps: [{ stepId: 'a', tool: 'fs.search', args: { q: { nested: 1 } }, rationale: '' }] }, known).ok).toBe(false);
    expect(validatePlan({ steps: [] }, known)).toEqual({ ok: false, reason: 'empty plan' });
    const many = Array.from({ length: 13 }, (_, i) => ({ stepId: `s${i}`, tool: 'fs.search', args: { term: 'x' }, rationale: '' }));
    expect(validatePlan({ steps: many }, known).ok).toBe(false);
    expect(validatePlan('not an object', known).ok).toBe(false);
  });
});

describe('routerPlanner (validated adoption, never silent)', () => {
  it('adopts a valid provider plan, backend marked provider', async () => {
    const b = routerPlanner({ completePlan: async () => goodPlan });
    const r = await b.plan(task, ctx, known);
    expect(r.backend).toBe('provider');
    expect(r.fellBack).toBeUndefined();
    expect(r.plan.seed).toBe(7);
  });

  it('invalid plan falls back to demo WITH a stated reason', async () => {
    const b = routerPlanner({ completePlan: async () => ({ steps: [{ stepId: 'x', tool: 'sudo', args: {}, rationale: '' }] }) });
    const r = await b.plan(task, ctx, known);
    expect(r.backend).toBe('demo');
    expect(r.fellBack).toEqual({ from: 'provider', reason: 'unknown tool sudo' });
    expect(r.plan.steps.map((s) => s.stepId)).toEqual(['search', 'read', 'annotate', 'verify']);
  });

  it('throwing provider also falls back with the same reason path', async () => {
    const b = routerPlanner({ completePlan: async () => { throw new Error('network died'); } });
    const r = await b.plan(task, ctx, known);
    expect(r.fellBack?.reason).toBe('invalid or unparseable plan');
  });
});

describe('runTask honors the planner seam and records it', () => {
  it('provider plan executes end-to-end and outcome says backend=provider', async () => {
    const ws = new InMemoryWorkspace({ 'docs/a.md': '# A\n\nwidget\n' });
    const registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => ({ ok: ws.read('docs/a.md').includes('NOTE'), detail: 'x' }));
    const b = routerPlanner({
      completePlan: async () => ({
        goal: 'add widget docs',
        seed: 1,
        steps: [
          { stepId: 'search', tool: 'fs.search', args: { term: 'widget' }, rationale: '' },
          { stepId: 'annotate', tool: 'fs.append', args: { path: '@search.hits.0.path', text: 'NOTE (DEMO MODE · provider plan)' }, rationale: '' },
          { stepId: 'verify', tool: 'test.run', args: {}, rationale: '' },
        ],
      }),
    });
    const out = await runTask(task, { registry, checkpoint: () => true, planner: b });
    expect(out.status).toBe('completed');
    expect(out.planner).toEqual({ backend: 'provider' });
  });

  it('default remains the demo backend with no fallback field', async () => {
    const ws = new InMemoryWorkspace({ 'docs/a.md': '# A\n\nwidget\n' });
    const registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => ({ ok: true, detail: 'always' }));
    const out = await runTask(task, { registry, checkpoint: () => true });
    expect(out.planner).toEqual({ backend: 'demo' });
  });
});
