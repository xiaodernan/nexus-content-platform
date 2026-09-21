import { describe, expect, it } from 'vitest';
import { ToolRegistry, type Checkpoint } from '../src/registry.js';
import { InMemoryWorkspace, registerWorkspaceTools } from '../src/workspace.js';
import { goalKeyword, planTask } from '../src/planner.js';
import { runTask } from '../src/orchestrator.js';
import { MemoryStore, registerMemoryTools } from '../src/memory.js';
import type { AgentTask } from '../src/types.js';

const SEED_DOC = '# Alpha\n\nnotes about widgets here\n';

function harness(testImpl: (ws: InMemoryWorkspace) => unknown, checkpoint: Checkpoint | undefined = () => true) {
  const ws = new InMemoryWorkspace({ 'docs/a.md': SEED_DOC });
  const registry = registerWorkspaceTools(new ToolRegistry(), ws);
  registry.register({ name: 'test.run', description: 'host verification', permissions: ['exec'], args: [] }, () => testImpl(ws));
  const task: AgentTask = { id: 't1', goal: 'add widget docs' };
  return { ws, registry, checkpoint, task };
}

const noteTest = (ws: InMemoryWorkspace) => ({
  ok: ws.read('docs/a.md').includes('NOTE (DEMO'),
  detail: 'file must carry the agent note',
});

describe('planner: deterministic templates', () => {
  it('keyword extraction skips stopwords and short tokens', () => {
    expect(goalKeyword('add widget docs')).toBe('widget');
    expect(goalKeyword('go fix it')).toBe('fix');
    expect(goalKeyword('the and its')).toBe('readme');
  });
  it('same task plans identically twice; the seed stamp matches', () => {
    const a = planTask({ id: 't', goal: 'add widget docs' }, { hasVerify: true });
    const b = planTask({ id: 't', goal: 'add widget docs' }, { hasVerify: true });
    expect(a).toEqual(b);
    expect(a.steps.map((s) => s.stepId)).toEqual(['search', 'read', 'annotate', 'verify']);
    expect(JSON.stringify(a.steps[2])).toContain(`seed ${a.seed}`);
    const noVerify = planTask({ id: 't', goal: 'add widget docs' }, { hasVerify: false });
    expect(noVerify.steps.map((s) => s.tool)).toEqual(['fs.search', 'fs.read', 'fs.append']);
  });
});

describe('orchestrator: golden path', () => {
  it('plan → act → observe → verify completes with demo provenance', async () => {
    const h = harness(noteTest);
    const out = await runTask(h.task, h);
    expect(out.status).toBe('completed');
    expect(out.provenance).toEqual({ mode: 'demo', runtime: 'nexus-agent-runtime', version: '0.1.0' });
    expect(out.results.every((r) => r.ok)).toBe(true);
    // @ref dataflow resolved the read target from the live search hit
    expect(out.results[1].callId).toBe('t1:read');
    const readCall = out.plan.steps[1]!.args.path;
    expect(readCall).toBe('@search.hits.0.path');
    expect(h.ws.read('docs/a.md')).toContain(`NOTE (DEMO MODE · agent t1 · seed ${out.plan.seed})`);
    expect(out.events.map((e) => e.type)).toEqual([
      'plan',
      'step_start', 'step_result', // search
      'step_start', 'step_result', // read
      'step_start', 'step_result', // annotate
      'step_start', 'step_result', // verify
      'verify',
      'done',
    ]);
  });
});

describe('orchestrator: gates and failures are honest', () => {
  it('without a checkpoint the write step is denied and the file stays untouched', async () => {
    const h = harness(noteTest, undefined);
    const out = await runTask(h.task, { registry: h.registry });
    expect(out.status).toBe('denied');
    expect(h.ws.read('docs/a.md')).toBe(SEED_DOC);
    expect(out.events.some((e) => e.type === 'checkpoint' && !e.granted)).toBe(true);
  });
  it('a failing verify gets bounded auto-fix rounds and can pass', async () => {
    const fixTest = (ws: InMemoryWorkspace) => ({ ok: ws.read('docs/a.md').includes('FIX'), detail: 'needs a FIX line' });
    const h = harness(fixTest);
    const out = await runTask(h.task, h);
    expect(out.status).toBe('completed');
    expect(out.plan.steps.map((s) => s.stepId)).toEqual(['search', 'read', 'annotate', 'verify', 'fix-1', 'verify-2']);
    expect(h.ws.read('docs/a.md')).toContain('FIX (DEMO MODE · attempt 1)');
    expect(out.events.filter((e) => e.type === 'verify')).toHaveLength(2);
  });
  it('persistent verification failure ends failed_verification after maxFixRounds', async () => {
    const h = harness(() => ({ ok: false, detail: 'never passes' }));
    const out = await runTask(h.task, { registry: h.registry, checkpoint: h.checkpoint, maxFixRounds: 1 });
    expect(out.status).toBe('failed_verification');
    expect(out.results).toHaveLength(6); // search read annotate verify fix-1 verify-2
  });
  it('the step budget stops the loop honestly', async () => {
    const h = harness(noteTest);
    const out = await runTask(h.task, { registry: h.registry, checkpoint: h.checkpoint, maxSteps: 3 });
    expect(out.status).toBe('budget_exhausted');
    expect(out.events.at(-2)).toMatchObject({ type: 'budget_exhausted', stepsUsed: 3 });
  });

  it('plans the research step through fs.index when it is registered', async () => {
    const ws = new InMemoryWorkspace({ 'docs/a.md': SEED_DOC });
    const registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => noteTest(ws));
    const out = await runTask({ id: 't2', goal: 'add widget docs' }, { registry, checkpoint: () => true });
    expect(out.plan.steps[0]!.tool).toBe('fs.index');
    expect(out.status).toBe('completed');
    expect((out.results[0]!.output as { hits: { path: string }[] }).hits[0]!.path).toBe('docs/a.md');
    expect(ws.read('docs/a.md')).toContain('NOTE (DEMO MODE');
  });

  it('prefers memory.recall over fs.index when memory is warm', async () => {
    const ws = new InMemoryWorkspace({ 'docs/a.md': SEED_DOC });
    const store = new MemoryStore();
    store.save({
      scope: 'demo',
      runId: 'r0',
      query: 'widget docs',
      summary: 'previous run: widget docs live in docs/a.md',
      refs: [{ path: 'docs/a.md', startLine: 1 }],
    });
    const registry = registerMemoryTools(
      registerWorkspaceTools(new ToolRegistry(), ws),
      store,
      'demo',
    );
    registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => noteTest(ws));
    const out = await runTask({ id: 't3', goal: 'add widget docs' }, { registry, checkpoint: () => true });
    expect(out.plan.steps[0]!.tool).toBe('memory.recall');
    expect(out.status).toBe('completed');
    expect((out.results[0]!.output as { hits: { path: string }[] }).hits[0]!.path).toBe('docs/a.md');
    expect(ws.read('docs/a.md')).toContain('NOTE (DEMO MODE');
  });
});
