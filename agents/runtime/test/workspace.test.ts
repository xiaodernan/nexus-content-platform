import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/registry.js';
import { InMemoryWorkspace, registerWorkspaceTools, WORKSPACE_TOOL_SPECS } from '../src/workspace.js';

const seed = {
  'docs/a.md': '# Alpha\n\nnotes about widgets here\n',
  'src/b.ts': 'export const widgets = 1;\n',
  'readme.txt': 'nothing relevant\n',
};

describe('workspace: pure ops', () => {
  it('lists sorted, honours prefixes and snapshots contents', () => {
    const ws = new InMemoryWorkspace(seed);
    expect(ws.list()).toEqual(['docs/a.md', 'readme.txt', 'src/b.ts']);
    expect(ws.list('docs/')).toEqual(['docs/a.md']);
    expect(Object.keys(ws.snapshot())).toEqual(ws.list());
  });
  it('search is case-insensitive with 1-based lines and trimmed snippets', () => {
    const ws = new InMemoryWorkspace(seed);
    const hits = ws.search('WIDGETS');
    expect(hits).toEqual([
      { path: 'docs/a.md', line: 3, snippet: 'notes about widgets here' },
      { path: 'src/b.ts', line: 1, snippet: 'export const widgets = 1;' },
    ]);
  });
  it('append adds a line; read of a missing path throws', () => {
    const ws = new InMemoryWorkspace(seed);
    ws.append('readme.txt', 'added');
    expect(ws.read('readme.txt')).toBe('nothing relevant\n\nadded'); // seed file ends with a newline
    expect(() => ws.read('nope')).toThrow(/no such file/);
  });
});

describe('workspace: registry wiring', () => {
  it('read tools run freely; write tools need a checkpoint', async () => {
    const ws = new InMemoryWorkspace(seed);
    const reg = registerWorkspaceTools(new ToolRegistry(), ws);
    const search = await reg.invoke({ callId: 's', tool: 'fs.search', args: { term: 'widget' } });
    expect(search.ok && (search.output as { hits: unknown[] }).hits).toHaveLength(2);
    const denied = await reg.invoke({ callId: 'w', tool: 'fs.write', args: { path: 'x', content: 'y' } });
    expect(denied.error).toContain('checkpoint required');
    const wrote = await reg.invoke(
      { callId: 'w2', tool: 'fs.write', args: { path: 'docs/new.md', content: 'fresh' } },
      { checkpoint: () => true },
    );
    expect(wrote).toMatchObject({ ok: true, output: { path: 'docs/new.md', bytes: 5 } });
    expect(ws.read('docs/new.md')).toBe('fresh');
  });
});

/**
 * v465 — the workspace TOOL SPECS, graded directly.
 *
 * `WORKSPACE_TOOL_SPECS` is the declared surface an agent is shown when it asks what it can do to a
 * workspace. The wiring case reaches the tools through the registry, so the behaviour is graded —
 * but the DECLARATION was not: which tools exist, which may write, and what each asks for.
 */
describe('the workspace tool specs (v465)', () => {
  it('the specs are the six workspace tools, in this order, under one namespace', () => {
    expect(WORKSPACE_TOOL_SPECS.map((s) => s.name)).toEqual(['fs.list', 'fs.read', 'fs.search', 'fs.index', 'fs.write', 'fs.append']);
    for (const spec of WORKSPACE_TOOL_SPECS) expect(spec.name.startsWith('fs.'), spec.name).toBe(true);
  });

  it('only fs.write and fs.append carry the write permission — the four read tools cannot mutate the workspace', () => {
    const writers = WORKSPACE_TOOL_SPECS.filter((s) => s.permissions.includes('write')).map((s) => s.name);
    expect(writers).toEqual(['fs.write', 'fs.append']);
    for (const spec of WORKSPACE_TOOL_SPECS) {
      if (spec.name === 'fs.write' || spec.name === 'fs.append') continue;
      expect(spec.permissions, spec.name).toEqual(['read']);
    }
  });

  it('every spec declares its args honestly — required named, the optional ones not claimed', () => {
    const byName = new Map(WORKSPACE_TOOL_SPECS.map((s) => [s.name, s]));
    const list = byName.get('fs.list')!;
    expect(list.args.map((a) => a.name)).toEqual(['prefix']);
    expect(list.args[0]!.required).not.toBe(true);
    expect(byName.get('fs.read')!.args).toEqual([{ name: 'path', type: 'string', required: true }]);
    expect(byName.get('fs.search')!.args).toEqual([{ name: 'term', type: 'string', required: true }]);
    const index = byName.get('fs.index')!;
    expect(index.args.map((a) => a.name)).toEqual(['query', 'topK']);
    expect(index.args[0]!.required).toBe(true);
    expect(index.args[1]!.required).not.toBe(true);
    expect(byName.get('fs.write')!.args.map((a) => a.name)).toEqual(['path', 'content']);
    expect(byName.get('fs.append')!.args.map((a) => a.name)).toEqual(['path', 'text']);
    for (const spec of WORKSPACE_TOOL_SPECS) expect(spec.description.length, spec.name).toBeGreaterThan(0);
  });

  it('registerWorkspaceTools registers exactly the specs in the list — nothing more, nothing fewer', () => {
    const registry = registerWorkspaceTools(new ToolRegistry(), new InMemoryWorkspace(seed));
    expect(registry.list()).toEqual(WORKSPACE_TOOL_SPECS);
    for (const spec of WORKSPACE_TOOL_SPECS) expect(registry.has(spec.name), spec.name).toBe(true);
    expect(registry.has('fs.delete')).toBe(false);
  });
});
