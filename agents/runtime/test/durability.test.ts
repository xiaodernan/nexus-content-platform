import { describe, expect, it } from 'vitest';
import {
  deserializeMemory,
  guardedJoin,
  loadMemoryStore,
  registerDiskTools,
  saveMemory,
  serializeMemory,
  type FsWriteLike,
} from '../src/durability.js';
import { MemoryStore } from '../src/memory.js';
import { ToolRegistry } from '../src/registry.js';
import type { FsDirentLike } from '../src/realfs.js';

/** Writable fake disk so every v3 code path is proven without touching the host fs. */
class FakeDisk implements FsWriteLike {
  files = new Map<string, string>();
  dirs = new Set<string>();

  constructor(seed: Record<string, string> = {}) {
    for (const [p, c] of Object.entries(seed)) {
      this.files.set(p, c);
      const parts = p.split('/');
      for (let i = 1; i < parts.length; i++) this.dirs.add(parts.slice(0, i).join('/'));
    }
  }

  readdirSync(dir: string, _opts: { withFileTypes: true }): FsDirentLike[] {
    const prefix = dir === '' ? '' : `${dir}/`;
    const names = new Map<string, FsDirentLike>();
    for (const p of [...this.dirs, ...this.files.keys()]) {
      if (!p.startsWith(prefix) || p === prefix) continue;
      const rest = p.slice(prefix.length);
      if (rest.includes('/')) continue;
      names.set(rest, {
        name: rest,
        isDirectory: () => this.dirs.has(`${prefix}${rest}`),
        isFile: () => this.files.has(`${prefix}${rest}`),
      });
    }
    return [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  statSync(p: string): { size: number } {
    const c = this.files.get(p);
    if (c === undefined) throw new Error(`no such file: ${p}`);
    return { size: c.length };
  }

  readFileSync(p: string): string {
    const c = this.files.get(p);
    if (c === undefined) throw new Error(`no such file: ${p}`);
    return c;
  }

  mkdirSync(dir: string): void {
    const parts = dir.split('/');
    for (let i = 1; i <= parts.length; i++) this.dirs.add(parts.slice(0, i).join('/'));
  }

  writeFileSync(p: string, data: string): void {
    this.files.set(p, data);
  }
}

function sampleStore(): MemoryStore {
  const m = new MemoryStore();
  m.save({ scope: 'atlas', runId: 'r1', query: 'embed tokens', summary: 'hit codeIndex.ts:121', refs: [{ path: 'a/codeIndex.ts', startLine: 121 }] });
  m.save({ scope: 'other', runId: 'r2', query: 'cooking', summary: 'soup', refs: [{ path: 'cook.md' }] });
  return m;
}

describe('memory serialize/deserialize', () => {
  it('round-trips every record verbatim, ids included', () => {
    const src = sampleStore();
    const loaded = new MemoryStore();
    const result = deserializeMemory(serializeMemory(src));
    expect(result.ok).toBe(true);
    if (result.ok) for (const r of result.records) loaded.restore(r);
    expect(loaded.list()).toEqual(src.list());
  });

  it('rejects bad JSON, wrong version and malformed records with reasons', () => {
    expect(deserializeMemory('{oops')).toEqual({ ok: false, reason: 'not valid JSON' });
    expect(deserializeMemory('{"schemaVersion":99,"records":[]}').ok).toBe(false);
    const bad = deserializeMemory('{"schemaVersion":1,"records":[{"id":"mem-1","scope":"s","runId":"r","query":"q","summary":"x","refs":[{"path":42}]}]}');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('malformed record');
  });

  it('restore keeps the high-water id so later saves never collide', () => {
    const loaded = new MemoryStore();
    loaded.restore({ id: 'mem-7', scope: 's', runId: 'r', query: 'q', summary: 'x', refs: [] });
    const fresh = loaded.save({ scope: 's', runId: 'r', query: 'q2', summary: 'y', refs: [] });
    expect(fresh.id).toBe('mem-8');
  });
});

describe('saveMemory / loadMemoryStore through the injected fs', () => {
  it('writes under a fresh directory and reloads into a cold store', () => {
    const disk = new FakeDisk();
    saveMemory(sampleStore(), disk, 'state/nexus/memory.json');
    expect(disk.files.get('state/nexus/memory.json')).toContain('"schemaVersion": 1');
    const cold = new MemoryStore();
    const res = loadMemoryStore(cold, disk, 'state/nexus/memory.json');
    expect(res.ok).toBe(true);
    expect(cold.list('atlas')).toHaveLength(1);
    expect(cold.recall('embed tokens')[0]?.path).toBe('a/codeIndex.ts');
  });

  it('missing file reports honestly instead of throwing', () => {
    const res = loadMemoryStore(new MemoryStore(), new FakeDisk(), 'nope.json');
    expect(res).toEqual({ ok: false, reason: 'no such file: nope.json' });
  });
});

describe('guardedJoin + disk tools (allowlisted root, §28)', () => {
  it('jails paths: relative-only, dots folded, escapes rejected', () => {
    expect(guardedJoin('root/', 'a/b.txt')).toEqual({ root: 'root', path: 'root/a/b.txt' });
    expect(guardedJoin('C:/out', '.\\x\\y.txt').path).toBe('C:/out/x/y.txt');
    expect(() => guardedJoin('root', '../etc/passwd')).toThrow('escapes');
    expect(() => guardedJoin('root', '/etc/passwd')).toThrow('absolute');
    expect(() => guardedJoin('root', 'C:/windows/x')).toThrow('absolute');
    expect(() => guardedJoin('root', 'a/../b')).toThrow('escapes');
  });

  const allow = () => true;

  it('disk.write is checkpoint-gated; approved write lands inside the root only', async () => {
    const disk = new FakeDisk();
    const registry = registerDiskTools(new ToolRegistry(), { root: 'out', fsLike: disk });
    const denied = await registry.invoke({ callId: 'c1', tool: 'disk.write', args: { path: 'notes.md', content: 'hi' } }, {});
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain('checkpoint required');
    const ok = await registry.invoke({ callId: 'c2', tool: 'disk.write', args: { path: 'sub/notes.md', content: 'hi' } }, { checkpoint: allow });
    expect(ok.output).toEqual({ path: 'sub/notes.md', bytes: 2 });
    expect(disk.files.get('out/sub/notes.md')).toBe('hi');
    const escape = await registry.invoke({ callId: 'c3', tool: 'disk.write', args: { path: '../../evil', content: 'x' } }, { checkpoint: allow });
    expect(escape.ok).toBe(false);
    expect(escape.error).toContain('escapes');
    expect([...disk.files.keys()]).toEqual(['out/sub/notes.md']);
  });

  it('disk.read returns jailed content, disk.list enumerates ingestible paths', async () => {
    const disk = new FakeDisk({ 'out/a/x.md': '# hi\n', 'out/a/y.bin': 'zz' });
    const registry = registerDiskTools(new ToolRegistry(), { root: 'out', fsLike: disk });
    const read = await registry.invoke({ callId: 'c1', tool: 'disk.read', args: { path: 'a/x.md' } }, {});
    expect(read.output).toEqual({ content: '# hi\n' });
    const miss = await registry.invoke({ callId: 'c2', tool: 'disk.read', args: { path: 'a/nope.md' } }, {});
    expect(miss.ok).toBe(false);
    const listed = await registry.invoke({ callId: 'c3', tool: 'disk.list', args: {} }, {});
    expect((listed.output as { paths: string[] }).paths).toEqual(['a/x.md', 'a/y.bin']);
    const filtered = await registry.invoke({ callId: 'c4', tool: 'disk.list', args: { prefix: 'a/y' } }, {});
    expect((filtered.output as { paths: string[] }).paths).toEqual(['a/y.bin']);
  });
});
