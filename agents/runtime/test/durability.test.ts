import { describe, expect, it } from 'vitest';
import {
  deserializeMemory,
  DISK_TOOL_SPECS,
  MEMORY_SCHEMA_VERSION,
  guardedJoin,
  loadMemoryStore,
  registerDiskTools,
  saveMemory,
  serializeMemory,
} from '../src/durability.js';
import { MemoryStore } from '../src/memory.js';
import { ToolRegistry } from '../src/registry.js';
import { createMemDisk } from './memDisk.js';

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
    const disk = createMemDisk({ listing: 'real' });
    saveMemory(sampleStore(), disk, 'state/nexus/memory.json');
    expect(disk.files.get('state/nexus/memory.json')).toContain('"schemaVersion": 1');
    const cold = new MemoryStore();
    const res = loadMemoryStore(cold, disk, 'state/nexus/memory.json');
    expect(res.ok).toBe(true);
    expect(cold.list('atlas')).toHaveLength(1);
    expect(cold.recall('embed tokens')[0]?.path).toBe('a/codeIndex.ts');
  });

  it('missing file reports honestly instead of throwing', () => {
    const res = loadMemoryStore(new MemoryStore(), createMemDisk({ listing: 'real' }), 'nope.json');
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
    const disk = createMemDisk({ listing: 'real' });
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
    const disk = createMemDisk({ listing: 'real', seed: { 'out/a/x.md': '# hi\n', 'out/a/y.bin': 'zz' } });
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

/**
 * v460 — the durability CONSTANTS, graded directly.
 *
 * `MEMORY_SCHEMA_VERSION` is the one number both halves of the file agree on: the writer stamps it and
 * the reader refuses anything else, and the round-trip cases above only ever prove the two halves
 * agree with EACH OTHER — a bump that moved one and not the other would still round-trip. `DISK_TOOL_SPECS`
 * is the declared surface an agent is shown when it asks what disk tools exist, and until now it was
 * reachable only through the behaviour the loop over it produces.
 */
describe('the durability constants, graded directly (v460)', () => {
  it('the writer stamps the CURRENT version and the reader accepts exactly that one — a bump moves both together', () => {
    const stamped = JSON.parse(serializeMemory(sampleStore())) as { schemaVersion: number };
    expect(stamped.schemaVersion).toBe(MEMORY_SCHEMA_VERSION);
    const future = deserializeMemory(JSON.stringify({ schemaVersion: MEMORY_SCHEMA_VERSION + 1, records: [] }));
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.reason).toContain(String(MEMORY_SCHEMA_VERSION + 1));
    const present = deserializeMemory(JSON.stringify({ schemaVersion: MEMORY_SCHEMA_VERSION, records: [] }));
    expect(present.ok).toBe(true);
  });

  it('the schema version is a positive integer — a version that is not a count is not a version', () => {
    expect(Number.isInteger(MEMORY_SCHEMA_VERSION)).toBe(true);
    expect(MEMORY_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('DISK_TOOL_SPECS is the three allowlisted disk tools, in this order', () => {
    expect(DISK_TOOL_SPECS.map((s) => s.name)).toEqual(['disk.read', 'disk.write', 'disk.list']);
  });

  it('only disk.write carries the write permission — the read paths cannot mutate the disk', () => {
    const writers = DISK_TOOL_SPECS.filter((s) => s.permissions.includes('write')).map((s) => s.name);
    expect(writers).toEqual(['disk.write']);
    for (const spec of DISK_TOOL_SPECS) {
      if (spec.name === 'disk.write') continue;
      expect(spec.permissions, spec.name).toEqual(['read']);
    }
  });

  it('every spec declares its args honestly — the required ones named, the optional one not claimed', () => {
    const byName = new Map(DISK_TOOL_SPECS.map((s) => [s.name, s]));
    expect(byName.get('disk.read')!.args).toEqual([{ name: 'path', type: 'string', required: true }]);
    const write = byName.get('disk.write')!;
    expect(write.args.map((a) => a.name)).toEqual(['path', 'content']);
    expect(write.args.every((a) => a.required === true)).toBe(true);
    const list = byName.get('disk.list')!;
    expect(list.args).toHaveLength(1);
    expect(list.args[0]!.name).toBe('prefix');
    expect(list.args[0]!.required).not.toBe(true);
    for (const spec of DISK_TOOL_SPECS) expect(spec.description.length, spec.name).toBeGreaterThan(0);
  });

  it('registerDiskTools registers exactly the specs in the list — nothing more, nothing fewer', () => {
    const registry = registerDiskTools(new ToolRegistry(), { root: 'out', fsLike: createMemDisk({ listing: 'real' }) });
    expect(registry.list()).toEqual(DISK_TOOL_SPECS);
    for (const spec of DISK_TOOL_SPECS) expect(registry.has(spec.name), spec.name).toBe(true);
    expect(registry.has('disk.delete')).toBe(false);
  });
});
