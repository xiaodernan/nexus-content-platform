import { describe, expect, it } from 'vitest';
import { buildIndex, queryIndex } from '../src/codeIndex.js';
import { InMemoryWorkspace, registerWorkspaceTools } from '../src/workspace.js';
import { ToolRegistry } from '../src/registry.js';
import {
  createIndexProvider,
  deserializeIndex,
  fingerprintFiles,
  loadIndex,
  rescanIndex,
  saveIndex,
  serializeIndex,
} from '../src/indexStore.js';
import type { FsWriteLike } from '../src/durability.js';
import type { FsDirentLike } from '../src/realfs.js';

class FakeDisk implements FsWriteLike {
  files = new Map<string, string>();
  readdirSync(dir: string): FsDirentLike[] {
    return [...this.files.keys()].filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/')).map((p) => ({
      name: p.slice(dir.length + 1),
      isDirectory: () => false,
      isFile: () => true,
    }));
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
  mkdirSync(): void {}
  writeFileSync(p: string, data: string): void {
    this.files.set(p, data);
  }
}

const FILES: Record<string, string> = {
  'src/a.ts': 'export function alpha() {\n  return 1;\n}\n',
  'src/b.ts': 'export const BETA = 2;\n',
  'docs/guide.md': '# Guide\n\nhow to rotate widgets\n\n## Setup\n\nnpm test\n',
};

describe('indexStore: snapshot round-trip', () => {
  it('serialize→deserialize reproduces the index verbatim', () => {
    const index = buildIndex(FILES);
    const fp = fingerprintFiles(FILES);
    const back = deserializeIndex(serializeIndex(index, fp));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.index).toEqual(index);
      expect(back.fingerprints).toEqual(fp);
    }
  });

  it('rejects corrupt JSON, wrong version and malformed chunks', () => {
    expect(deserializeIndex('{bad')).toEqual({ ok: false, reason: 'not valid JSON' });
    expect(deserializeIndex('{"schemaVersion":7}').ok).toBe(false);
    expect(deserializeIndex('{"schemaVersion":1,"fingerprints":{},"files":[],"chunks":[{"path":"a"}]}').ok).toBe(false);
  });

  it('save/load through the injected writable fs; missing file fails honestly', () => {
    const disk = new FakeDisk();
    const index = buildIndex(FILES);
    saveIndex(disk, 'state/index.json', index, fingerprintFiles(FILES));
    const loaded = loadIndex(disk, 'state/index.json');
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.index.chunks).toEqual(index.chunks);
    expect(loadIndex(disk, 'nope.json')).toEqual({ ok: false, reason: 'no such file: nope.json' });
  });
});

describe('indexStore: incremental rescan', () => {
  it('cold rescan equals buildIndex exactly (snapshot never changes ranking)', () => {
    const cold = rescanIndex(null, {}, FILES);
    expect(cold.index).toEqual(buildIndex(FILES));
    expect(cold.rechunked.sort()).toEqual(Object.keys(FILES).sort());
  });

  it('unchanged files are reused; only edited/new files rechunk; removals drop out', () => {
    const v1 = rescanIndex(null, {}, FILES);
    const v2Files = { ...FILES, 'src/b.ts': 'export const BETA = 3;\n', 'src/c.ts': 'export const GAMMA = 4;\n' };
    const v2 = rescanIndex(v1.index, v1.fingerprints, v2Files);
    expect(v2.rechunked).toEqual(['src/b.ts', 'src/c.ts']);
    const fresh = buildIndex(v2Files);
    expect(v2.index).toEqual(fresh); // rescan output must be identical to a cold build

    const v3 = rescanIndex(v2.index, v2.fingerprints, { 'src/a.ts': FILES['src/a.ts']! });
    expect(v3.rechunked).toEqual([]);
    expect(v3.index.files.map((f) => f.path)).toEqual(['src/a.ts']);
    expect(v3.index.chunks.every((c) => c.path === 'src/a.ts')).toBe(true);
  });

  it('query ranking is snapshot-independent', () => {
    const v1 = rescanIndex(null, {}, FILES);
    const edited = { ...FILES, 'src/c.ts': 'export function gamma() { return rotate(); }\n' };
    const v2 = rescanIndex(v1.index, v1.fingerprints, edited);
    expect(queryIndex(v2.index, 'rotate widgets', 2)).toEqual(queryIndex(buildIndex(edited), 'rotate widgets', 2));
  });
});

describe('indexStore: createIndexProvider (v5)', () => {
  it('cold first refresh equals a plain buildIndex; later refreshes re-chunk nothing', () => {
    const p = createIndexProvider({ files: FILES });
    expect(p.index()).toEqual(buildIndex(FILES));
    expect(p.lastRechunked().sort()).toEqual(Object.keys(FILES).sort());
    expect(p.refresh()).toEqual(buildIndex(FILES));
    expect(p.lastRechunked()).toEqual([]); // unchanged set: pure reuse
  });

  it('edited file is the only re-chunk on refresh, hits see the change', () => {
    const files = { ...FILES };
    const p = createIndexProvider({ files });
    p.refresh();
    files['src/b.ts'] = 'export const BETA = 99;\nexport function brandNew() { return 1; }\n';
    p.refresh();
    expect(p.lastRechunked()).toEqual(['src/b.ts']);
    expect(queryIndex(p.index(), 'brandNew', 1)[0]!.path).toBe('src/b.ts');
  });

  it('a fresh provider restores from the persisted snapshot (0 re-chunked) via injected fs', () => {
    const disk = new FakeDisk();
    const first = createIndexProvider({ files: FILES, snapshotFile: 'state/index.json', fsLike: disk });
    first.refresh();
    expect(disk.files.has('state/index.json')).toBe(true);
    expect(first.lastRechunked().length).toBe(Object.keys(FILES).length);

    const second = createIndexProvider({ files: FILES, snapshotFile: 'state/index.json', fsLike: disk });
    second.refresh();
    expect(second.lastRechunked()).toEqual([]); // snapshot hit: nothing re-chunked
    expect(second.index()).toEqual(buildIndex(FILES));
  });

  it('corrupt snapshot falls back to a cold build without crashing', () => {
    const disk = new FakeDisk();
    disk.writeFileSync('state/index.json', 'nope');
    const p = createIndexProvider({ files: FILES, snapshotFile: 'state/index.json', fsLike: disk });
    p.refresh();
    expect(p.index()).toEqual(buildIndex(FILES));
    expect(p.lastRechunked().length).toBeGreaterThan(0);
    // fallback rewrote a valid snapshot
    expect(loadIndex(disk, 'state/index.json').ok).toBe(true);
  });

  it('fs.index answers from the provider when registered (default untouched otherwise)', async () => {
    const ws = new InMemoryWorkspace(FILES);
    const p = createIndexProvider({ files: FILES });
    const registry = registerWorkspaceTools(new ToolRegistry(), ws, { indexProvider: p });
    const res = await registry.invoke({ callId: 'c1', tool: 'fs.index', args: { query: 'rotate widgets' } }, {});
    expect(res.ok).toBe(true);
    expect(p.lastRechunked().length).toBeGreaterThan(0);
    const hits = (res.output as { hits: { path: string }[] }).hits;
    expect(hits[0]!.path).toBe('docs/guide.md');

    const plain = registerWorkspaceTools(new ToolRegistry(), new InMemoryWorkspace(FILES));
    const res2 = await plain.invoke({ callId: 'c2', tool: 'fs.index', args: { query: 'rotate widgets' } }, {});
    expect(res2.output).toEqual(res.output); // identical answers either way
  });
});

// M2 v79: the persisted index is a ROUND TRIP, not a re-derivation. A key whose value is `undefined`
// exists in memory and does not exist in JSON, so `toStrictEqual` — the same comparison the proofs run
// — saw an object that differed by a key that was never a value. Reproduced here over the smallest
// input that triggers it: one markdown file whose text precedes its first `#` heading.
describe('cold build → persist → reload is identity (v79)', () => {
  it('survives a heading-less markdown chunk', () => {
    const files = { 'notes.md': ['preamble before any heading', '', '# Later', 'body'].join('\n'), 'a.ts': 'export const x = 1;\n' };
    const cold = buildIndex(files);
    expect(cold.chunks.some((c) => !('heading' in c))).toBe(true); // the shape that used to be lost
    const loaded = deserializeIndex(serializeIndex(cold, fingerprintFiles(files)));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.index).toStrictEqual(cold);
    expect(loaded.fingerprints).toStrictEqual(fingerprintFiles(files));
  });

  it('round-trips through a disk too, so the proof path is the one tested', () => {
    const disk = new FakeDisk();
    const files = { 'notes.md': 'no heading in this file at all\nsecond line\n' };
    const cold = buildIndex(files);
    saveIndex(disk, 'state/index.json', cold, fingerprintFiles(files));
    const reloaded = loadIndex(disk, 'state/index.json');
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) return;
    expect(reloaded.index).toStrictEqual(cold);
    expect(queryIndex(reloaded.index, 'second line', 1)).toStrictEqual(queryIndex(cold, 'second line', 1));
  });
});
