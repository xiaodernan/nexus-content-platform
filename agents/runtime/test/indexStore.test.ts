import { describe, expect, it } from 'vitest';
import { buildIndex, queryIndex } from '../src/codeIndex.js';
import {
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
