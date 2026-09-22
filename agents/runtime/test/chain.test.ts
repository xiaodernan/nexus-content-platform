import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/registry.js';
import { InMemoryWorkspace, registerWorkspaceTools } from '../src/workspace.js';
import { MemoryStore, registerMemoryTools } from '../src/memory.js';
import { RoleRegistry, DEMO_ROLES } from '../src/roles.js';
import { runRoleChain } from '../src/pipeline.js';

const SEED = {
  'docs/widget.md': '# Widget\n\nwidget rotation notes\n',
  'docs/extra.md': '# Extra\n\nother stuff\n',
};

function host() {
  const ws = new InMemoryWorkspace(SEED);
  const store = new MemoryStore();
  const registry = registerMemoryTools(registerWorkspaceTools(new ToolRegistry(), ws), store, 'chain');
  registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => ({
    ok: ws.read('docs/widget.md').includes('NOTE (DEMO MODE'),
    detail: 'annotated',
  }));
  const roles = new RoleRegistry();
  DEMO_ROLES.forEach((r) => roles.register(r));
  return { ws, store, registry, roles };
}

const task = { id: 'chain-1', goal: 'annotate widget rotation docs' };

describe('runRoleChain (v14 §24 four-stage pipeline)', () => {
  it('all four stages run in order; every transition is a handoff record', async () => {
    const h = host();
    const res = await runRoleChain(task, {
      roles: h.roles, registry: h.registry, store: h.store, scope: 'chain', checkpoint: () => true, snapshot: () => h.ws.snapshot(),
      qaInput: { page: { x: 0, y: 0, width: 100, height: 100 }, rects: { a: { x: 0, y: 0, width: 50, height: 50 }, b: { x: 10, y: 10, width: 40, height: 40 } } },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.handoffs.map((x) => `${x.from}→${x.to}`)).toEqual(['researcher→designer', 'designer→qa', 'qa→editor']);
    expect(res.qa.flags.some((f) => f.code === 'overlap')).toBe(true);
    expect(res.editorOutcome.status).toBe('completed');
    expect(res.editorOutcome.plan.steps[0]!.tool).toBe('memory.recall');
    expect(res.evaluation.score).toBe(1);
    expect(h.ws.read('docs/widget.md')).toContain('DESIGN (DEMO MODE · chain-1)');
    expect(h.store.list('chain').length).toBeGreaterThanOrEqual(3);
  });

  it('no qa input: QA honestly checked nothing, chain still completes', async () => {
    const h = host();
    const res = await runRoleChain(task, { roles: h.roles, registry: h.registry, store: h.store, scope: 'chain', checkpoint: () => true });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.qa).toEqual({ verdict: 'ok', checked: 0, flags: [] });
  });

  it('checkpoint denial at the designer stage stops the chain, naming the stage', async () => {
    const h = host();
    const res = await runRoleChain(task, { roles: h.roles, registry: h.registry, store: h.store, scope: 'chain', checkpoint: ({ call }) => call.tool !== 'fs.append' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.stage).toBe('designer');
    expect(res.handoffs).toHaveLength(1);
    expect(h.ws.read('docs/widget.md')).not.toContain('DESIGN');
  });

  it('deterministic: identical chains produce identical transcripts', async () => {
    const a = await runRoleChain(task, { ...hostShim(host()) });
    const b = await runRoleChain(task, { ...hostShim(host()) });
    expect(JSON.stringify(b)).toEqual(JSON.stringify(a));
  });
});

function hostShim(h: ReturnType<typeof host>) {
  return { roles: h.roles, registry: h.registry, store: h.store, scope: 'chain', checkpoint: () => true };
}
