import { describe, expect, it } from 'vitest';
import { MemoryStore, registerMemoryTools } from '../src/memory.js';
import { ToolRegistry } from '../src/registry.js';

describe('MemoryStore (§26: scoped, inspectable, deletable)', () => {
  it('saves, lists per scope, and recalls relevant records only', () => {
    const m = new MemoryStore();
    m.save({ scope: 'a1', runId: 'r1', query: 'widget rotation docs', summary: 'found rotate guide in docs/rotate.md', refs: [{ path: 'docs/rotate.md', startLine: 9 }] });
    m.save({ scope: 'a2', runId: 'r2', query: 'cooking recipe', summary: 'soup notes for kitchen prep', refs: [{ path: 'docs/cook.md' }] });
    expect(m.list()).toHaveLength(2);
    expect(m.list('a1').map((r) => r.id)).toEqual(['mem-1']);
    const hits = m.recall('where are the widget rotation docs?');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.path).toBe('docs/rotate.md');
    expect(hits[0]!.memId).toBe('mem-1');
  });

  it('recall is deterministic, scope-filtered and bounded by k', () => {
    const m = new MemoryStore();
    for (let i = 0; i < 7; i++) {
      m.save({ scope: 'a', runId: 'r', query: 'rotation guide', summary: `entry ${i} rotation`, refs: [{ path: `f${i}.ts` }] });
    }
    const hits = m.recall('rotation guide', { k: 3 });
    expect(hits.map((h) => h.path)).toEqual(['f0.ts', 'f1.ts', 'f2.ts']);
    expect(m.recall('rotation guide', { k: 3 })).toEqual(hits);
    expect(m.recall('rotation guide', { scope: 'b' })).toEqual([]);
    expect(m.recall('zzz nothing matches qqq')).toEqual([]);
  });

  it('forget removes one record, clear removes a scope and returns the count', () => {
    const m = new MemoryStore();
    m.save({ scope: 'a', runId: 'r', query: 'alpha', summary: 'x', refs: [{ path: 'a.ts' }] });
    m.save({ scope: 'b', runId: 'r', query: 'beta', summary: 'x', refs: [{ path: 'b.ts' }] });
    expect(m.forget('mem-1')).toBe(true);
    expect(m.forget('mem-1')).toBe(false);
    expect(m.list().map((r) => r.scope)).toEqual(['b']);
    expect(m.clear()).toBe(1);
    expect(m.list()).toEqual([]);
  });

  it('records are cloned in and out so callers cannot mutate stored memory', () => {
    const m = new MemoryStore();
    const refs = [{ path: 'a.ts' }];
    const rec = m.save({ scope: 'a', runId: 'r', query: 'alpha', summary: 'x', refs });
    refs.push({ path: 'evil.ts' });
    rec.summary = 'tampered';
    expect(m.list()[0]!.refs).toHaveLength(1);
    expect(m.list()[0]!.summary).toBe('x');
  });
});

describe('memory tools through the registry (permissions enforced)', () => {
  const allow = () => true;

  it('memory.save needs a checkpoint; recall/list/forget round-trip refs with line suffixes', async () => {
    const store = new MemoryStore();
    const registry = registerMemoryTools(new ToolRegistry(), store, 'design');
    const save = await registry.invoke(
      { callId: 'c1', tool: 'memory.save', args: { runId: 'r1', query: 'rotate widget', summary: 'rotation lives in docs/rotate.md', refs: ['docs/rotate.md:9', 'src/geom.ts'] } },
      {},
    );
    expect(save.ok).toBe(false);
    expect(save.error).toContain('checkpoint required');
    const approved = await registry.invoke(
      { callId: 'c2', tool: 'memory.save', args: { runId: 'r1', query: 'rotate widget', summary: 'rotation lives in docs/rotate.md', refs: ['docs/rotate.md:9', 'src/geom.ts'] } },
      { checkpoint: allow },
    );
    expect(approved.ok).toBe(true);
    expect((approved.output as { id: string }).id).toBe('mem-1');

    const recall = await registry.invoke({ callId: 'c3', tool: 'memory.recall', args: { query: 'rotate widget' } }, {});
    const hits = (recall.output as { hits: { path: string; memId: string }[] }).hits;
    expect(hits[0]).toMatchObject({ memId: 'mem-1', path: 'docs/rotate.md' });

    const listed = await registry.invoke({ callId: 'c4', tool: 'memory.list', args: {} }, {});
    const records = (listed.output as { records: { scope: string; refs: { path: string; startLine?: number }[] }[] }).records;
    expect(records[0]).toMatchObject({ scope: 'design' });
    expect(records[0]!.refs).toEqual([{ path: 'docs/rotate.md', startLine: 9 }, { path: 'src/geom.ts' }]);

    const forgotten = await registry.invoke({ callId: 'c5', tool: 'memory.forget', args: { id: 'mem-1' } }, { checkpoint: allow });
    expect(forgotten.output).toEqual({ forgotten: true });
    expect(store.list('design')).toEqual([]);
  });

  it('denied save leaves memory empty; write args are validated', async () => {
    const store = new MemoryStore();
    const registry = registerMemoryTools(new ToolRegistry(), store);
    const denied = await registry.invoke(
      { callId: 'c1', tool: 'memory.save', args: { runId: 'r', query: 'q', summary: 's', refs: ['a.ts'] } },
      { checkpoint: () => false },
    );
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain('denied at checkpoint');
    expect(store.list()).toEqual([]);
    const bad = await registry.invoke({ callId: 'c2', tool: 'memory.save', args: { runId: 'r', query: 'q', summary: 's', refs: 'a.ts' } }, { checkpoint: allow });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('expected string[]');
  });
});
