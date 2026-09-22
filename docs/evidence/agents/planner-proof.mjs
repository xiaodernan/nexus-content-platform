// NEXUS M2 v17 — planner backend seam proof (ADR 0016 amendment 17).
// Headless, offline, key-free. A fake async 'provider' stands in for a future model: its
// plan is adopted ONLY after total validation against the registered tools; anything else
// falls back to the deterministic demo planner and RECORDS the reason in RunOutcome.planner.
// Nothing is ever silently substituted (§60). Run after `npm run build`:
//   node docs/evidence/agents/planner-proof.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const { ToolRegistry, InMemoryWorkspace, registerWorkspaceTools, routerPlanner, demoPlanner, runTask } = rt;

function host() {
  const ws = new InMemoryWorkspace({ 'docs/a.md': '# A\n\nwidget notes\n' });
  const registry = registerWorkspaceTools(new ToolRegistry(), ws);
  registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => ({
    ok: ws.read('docs/a.md').includes('NOTE (DEMO MODE'),
    detail: 'annotated',
  }));
  return { ws, registry };
}
const task = { id: 'pl-17', goal: 'add widget docs' };

// 1) Valid provider plan: adopted, marked, executed end-to-end.
const good = {
  goal: task.goal, seed: 3,
  steps: [
    { stepId: 'search', tool: 'fs.search', args: { term: 'widget' }, rationale: 'find' },
    { stepId: 'annotate', tool: 'fs.append', args: { path: '@search.hits.0.path', text: 'NOTE (DEMO MODE · provider)' }, rationale: 'write' },
    { stepId: 'verify', tool: 'test.run', args: {}, rationale: 'gate' },
  ],
};
const h1 = host();
const o1 = await runTask(task, { registry: h1.registry, checkpoint: () => true, planner: routerPlanner({ completePlan: async () => good }) });
assert.equal(o1.status, 'completed');
assert.deepEqual(o1.planner, { backend: 'provider' });
assert.equal(o1.plan.seed, 3);
console.log('[planner] valid plan adopted:', o1.plan.steps.map((s) => s.stepId).join('→'), '· outcome stamped provider');

// 2) Invalid plan (unknown tool): demo takes over, the WHY is in the outcome.
const h2 = host();
const o2 = await runTask(task, { registry: h2.registry, checkpoint: () => true, planner: routerPlanner({ completePlan: async () => ({ steps: [{ stepId: 'a', tool: 'exec:rm', args: {}, rationale: '' }] }) }) });
assert.equal(o2.status, 'completed', 'fallback plan still achieves the goal');
assert.equal(o2.planner.backend, 'demo');
assert.match(o2.planner.fellBack.reason, /unknown tool exec:rm/);
console.log('[planner] invalid plan rejected with stated reason:', o2.planner.fellBack.reason);

// 3) Default stays default: no planner option ⇒ demo backend, no fallback field.
const h3 = host();
const o3 = await runTask(task, { registry: h3.registry, checkpoint: () => true });
assert.deepEqual(o3.planner, { backend: 'demo' });
assert.equal(demoPlanner.name, 'demo');

console.log('[planner] default path untouched (backend=demo, determinism preserved) ✓');
console.log('[planner] ALL ASSERTIONS PASSED (planning is a seam, not a claimed capability §60)');
