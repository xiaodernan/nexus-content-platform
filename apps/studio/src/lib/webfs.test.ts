import { describe, expect, it } from 'vitest';
import { MemoryStore, loadMemoryStore, saveMemory } from '@nexus/agent-runtime';
import { WEBFS_NS, clearWebFs, createWebFs } from './webfs';

class MapKv {
  map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

function sampleStore(): MemoryStore {
  const m = new MemoryStore();
  m.save({ scope: 'studio', runId: 'r1', query: 'hero highlight', summary: 'handoff from researcher: h1', refs: [{ path: 'h1', startLine: 1 }] });
  m.save({ scope: 'studio', runId: 'r2', query: 'cta copy', summary: 'handoff from researcher: c9', refs: [{ path: 'c9' }] });
  return m;
}

describe('webfs (v13: localStorage FsWriteLike)', () => {
  it('saveMemory → cold reload works through the browser seam', () => {
    const kv = new MapKv();
    const webFs = createWebFs(kv);
    saveMemory(sampleStore(), webFs, 'agent/memory-studio.json');
    expect(kv.map.has(WEBFS_NS + 'agent/memory-studio.json')).toBe(true);
    const cold = new MemoryStore();
    const res = loadMemoryStore(cold, webFs, 'agent/memory-studio.json');
    expect(res.ok).toBe(true);
    expect(cold.recall('hero highlight')[0]?.path).toBe('h1');
  });

  it('readdir folds nested files under implicit dirs; stat/read agree', () => {
    const kv = new MapKv();
    const webFs = createWebFs(kv);
    webFs.writeFileSync('a/b.txt', 'hi', 'utf8');
    webFs.writeFileSync('a/c/d.txt', 'deep', 'utf8');
    const kids = webFs.readdirSync('a', { withFileTypes: true });
    expect(kids.map((k) => [k.name, k.isDirectory()])).toEqual([
      ['b.txt', false],
      ['c', true],
    ]);
    expect(webFs.statSync('a/b.txt').size).toBe(2);
    expect(() => webFs.readFileSync('missing.txt', 'utf8')).toThrow('no such file');
  });

  it('keys stay sorted and unique; clearWebFs removes everything', () => {
    const kv = new MapKv();
    const webFs = createWebFs(kv);
    webFs.writeFileSync('z.json', '{}', 'utf8');
    webFs.writeFileSync('a.json', 'x', 'utf8');
    webFs.writeFileSync('z.json', '{}2', 'utf8');
    expect(webFs.readFileSync('z.json', 'utf8')).toBe('{}2');
    expect(kv.getItem(WEBFS_NS + '__keys')!.split('\n')).toEqual(['a.json', 'z.json']);
    expect(clearWebFs(kv)).toBe(2);
    expect(kv.getItem(WEBFS_NS + '__keys')).toBeNull();
  });
});
