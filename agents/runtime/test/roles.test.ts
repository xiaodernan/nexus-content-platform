import { describe, expect, it } from 'vitest';
import { matchesTool, ToolRegistry } from '../src/registry.js';
import { DEMO_ROLES, RoleRegistry } from '../src/roles.js';
import { InMemoryWorkspace, registerWorkspaceTools } from '../src/workspace.js';
import { planTask } from '../src/planner.js';
import { runTask } from '../src/orchestrator.js';

function hostRegistry(): ToolRegistry {
  const ws = new InMemoryWorkspace({ 'docs/a.md': '# A\n\nwidget notes\n' });
  const reg = registerWorkspaceTools(new ToolRegistry(), ws);
  reg.register({ name: 'memory.recall', description: '', permissions: ['read'], args: [{ name: 'query', type: 'string', required: true }] }, () => ({ hits: [] }));
  reg.register({ name: 'memory.list', description: '', permissions: ['read'], args: [] }, () => ({ records: [] }));
  return reg;
}

describe('matchesTool + registry.scope (v8)', () => {
  it('glob semantics: *, trailing .*, exact', () => {
    expect(matchesTool('*', 'anything')).toBe(true);
    expect(matchesTool('fs.*', 'fs.read')).toBe(true);
    expect(matchesTool('fs.*', 'memory.read')).toBe(false);
    expect(matchesTool('fs.read', 'fs.read')).toBe(true);
    expect(matchesTool('fs.read', 'fs.readx')).toBe(false);
  });

  it('projection only exposes allowed tools; excluded ones are unknown, not denied', async () => {
    const scoped = hostRegistry().scope(['fs.read', 'memory.*']);
    expect(scoped.list().map((s) => s.name)).toEqual(['fs.read', 'memory.recall', 'memory.list']);
    const miss = await scoped.invoke({ callId: 'c', tool: 'fs.append', args: { path: 'x', text: 'y' } }, { checkpoint: () => true });
    expect(miss.ok).toBe(false);
    expect(miss.error).toContain('unknown tool');
  });

  it('scope is a copy: registering later on the child never mutates the parent', () => {
    const host = hostRegistry();
    const child = host.scope(['fs.read']);
    child.register({ name: 'extra', description: '', permissions: ['read'], args: [] }, () => 1);
    expect(host.has('extra')).toBe(false);
    expect(child.has('fs.append')).toBe(false);
  });
});

describe('RoleRegistry (§24 slice)', () => {
  it('registers uniquely, lists sorted, unknown role ⇒ empty capabilities', () => {
    const roles = new RoleRegistry();
    DEMO_ROLES.forEach((r) => roles.register(r));
    expect(() => roles.register(DEMO_ROLES[0]!)).toThrow('already registered');
    expect(roles.list().map((r) => r.id)).toEqual(['archivist', 'designer', 'editor', 'qa', 'researcher']);
    const scoped = roles.scopedRegistry('ghost', hostRegistry());
    expect(scoped.list()).toEqual([]);
  });

  it('researcher cannot write even WITH a checkpoint; editor can (same gate)', async () => {
    const roles = new RoleRegistry();
    DEMO_ROLES.forEach((r) => roles.register(r));
    const host = hostRegistry();
    const ws = new InMemoryWorkspace({ 'docs/a.md': '# A\n' });
    const writer = roles.scopedRegistry('editor', registerWorkspaceTools(new ToolRegistry(), ws));
    const denied = await roles.scopedRegistry('researcher', writer).invoke(
      { callId: 'c1', tool: 'fs.append', args: { path: 'docs/a.md', text: 'x' } },
      { checkpoint: () => true },
    );
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain('unknown tool');
    const allowed = await writer.invoke({ callId: 'c2', tool: 'fs.append', args: { path: 'docs/a.md', text: 'x' } }, { checkpoint: () => true });
    expect(allowed.ok).toBe(true);
  });

  it('capability gaps change the plan honestly (researcher has no memory.save ⇒ no recall-first? has recall; archivist ⇒ fs absent)', () => {
    const roles = new RoleRegistry();
    DEMO_ROLES.forEach((r) => roles.register(r));
    const host = hostRegistry();
    const editorPlan = planTask({ id: 'p1', goal: 'widget docs' }, { hasVerify: false, hasIndex: host.has('fs.index'), hasMemory: roles.scopedRegistry('editor', host).has('memory.recall') });
    expect(editorPlan.steps[0]!.tool).toBe('memory.recall');
    const archivist = roles.scopedRegistry('archivist', host);
    const coldPlan = planTask({ id: 'p2', goal: 'widget docs' }, { hasVerify: false, hasIndex: archivist.has('fs.index'), hasMemory: archivist.has('memory.recall') });
    expect(coldPlan.steps[0]!.tool).toBe('memory.recall');
    const noMemory = host.scope(['fs.list', 'fs.read', 'fs.search']);
    const searchPlan = planTask({ id: 'p3', goal: 'widget docs' }, { hasVerify: false, hasIndex: noMemory.has('fs.index'), hasMemory: noMemory.has('memory.recall') });
    expect(searchPlan.steps[0]!.tool).toBe('fs.search');
  });

  it('a scoped researcher run fails honestly when its plan needs an absent write step', async () => {
    const roles = new RoleRegistry();
    DEMO_ROLES.forEach((r) => roles.register(r));
    const ws = new InMemoryWorkspace({ 'docs/a.md': '# A\n\nwidget notes\n' });
    const host = registerWorkspaceTools(new ToolRegistry(), ws);
    const researcher = roles.scopedRegistry('researcher', host);
    const out = await runTask({ id: 'r-run', goal: 'add widget docs', targetPath: 'docs/a.md' }, { registry: researcher, checkpoint: () => true });
    expect(out.status).toBe('failed_verification');
    const failed = out.results.find((r) => !r.ok)!;
    expect(failed.error).toContain('unknown tool');
    expect(ws.read('docs/a.md')).not.toContain('NOTE');
  });
});
