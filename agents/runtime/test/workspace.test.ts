import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/registry.js';
import { InMemoryWorkspace, registerWorkspaceTools } from '../src/workspace.js';

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
