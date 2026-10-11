import { describe, expect, it } from 'vitest';
import { EMBED_DIM } from '@nexus/ai-providers';
import { hybridScore } from '../src/embedding.js';
import {
  buildVectorDb,
  deserializeVectors,
  loadVectors,
  queryVectors,
  saveVectors,
  serializeVectors,
} from '../src/vectordb.js';
import { createMemDisk } from './memDisk.js';

const SEED = [
  { id: 'b', text: 'widget rotation baking explanation', meta: { path: 'docs/rotate.md' } },
  { id: 'a', text: 'cooking recipe for soup', meta: { path: 'docs/cook.md' } },
  { id: 'c', text: 'rotation guide for baking widgets' },
];

describe('vectordb (v18 local exact-scan store)', () => {
  it('builds sorted, dimension-checked entries', () => {
    const db = buildVectorDb(SEED);
    expect(db.entries.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(db.dim).toBe(EMBED_DIM);
    expect(db.entries[0]!.vector).toHaveLength(EMBED_DIM);
  });

  it('persist → cold reload ranks IDENTICALLY to inline hybridScore', () => {
    const disk = createMemDisk({ listing: 'refuse' });
    const db = buildVectorDb(SEED);
    saveVectors(disk, 'state/vectors.json', db);
    const loaded = loadVectors(disk, 'state/vectors.json');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const q = 'widget rotation baking';
    const hits = queryVectors(loaded.db, q, { k: 3 });
    expect(hits.map((h) => h.id)).toEqual(['b', 'c']);
    for (const h of hits) {
      expect(h.score).toBeCloseTo(hybridScore(q, loaded.db.entries.find((e) => e.id === h.id)!.text), 12);
    }
    expect(queryVectors(loaded.db, 'zzz nothing matches')).toEqual([]);
  });

  it('filterIds restricts the scan; determinism holds', () => {
    const db = buildVectorDb(SEED);
    const only = queryVectors(db, 'widget rotation', { filterIds: new Set(['c']) });
    expect(only.map((h) => h.id)).toEqual(['c']);
    expect(queryVectors(db, 'widget rotation', { k: 2 })).toEqual(queryVectors(db, 'widget rotation', { k: 2 }));
  });

  it('rejects wrong dim, bad version, malformed entries, missing file — with reasons', () => {
    expect(deserializeVectors('{bad')).toEqual({ ok: false, reason: 'not valid JSON' });
    expect(deserializeVectors('{"schemaVersion":9,"dim":64,"entries":[]}').ok).toBe(false);
    expect(deserializeVectors(`{"schemaVersion":1,"dim":${EMBED_DIM},"entries":[{"id":"x","text":"t","vector":[1,2]}]}`).ok).toBe(false);
    const db = buildVectorDb(SEED);
    const wrongDim = { ...db, dim: 8 };
    expect(deserializeVectors(serializeVectors(wrongDim)).ok).toBe(false);
    expect(loadVectors(createMemDisk({ listing: 'refuse' }), 'none.json')).toEqual({ ok: false, reason: 'no such file: none.json' });
  });
});
