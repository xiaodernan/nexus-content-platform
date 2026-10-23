import { describe, expect, it } from 'vitest';
import { EMBED_DIM } from '@nexus/ai-providers';
import { hybridScore } from '../src/embedding.js';
import {
  buildVectorDb,
  deserializeVectors,
  VECTOR_SCHEMA_VERSION,
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

/**
 * v461 — the vector store’s schema VERSION, graded directly.
 *
 * `VECTOR_SCHEMA_VERSION` is the number the builder stamps and the reader refuses to move past. The
 * rejection matrix below only ever proves the reader refuses a HARDCODED 9 — nothing asks that the
 * writer stamps THIS constant, or that a bump of the constant moves both halves together.
 */
describe('the vector store’s schema version (v461)', () => {
  it('the builder stamps the CURRENT version on every db it builds', () => {
    expect(buildVectorDb(SEED).schemaVersion).toBe(VECTOR_SCHEMA_VERSION);
    expect(buildVectorDb([]).schemaVersion).toBe(VECTOR_SCHEMA_VERSION);
  });

  it('the reader accepts exactly that version — a future one is refused with its number in the reason', () => {
    const db = buildVectorDb(SEED);
    const future = deserializeVectors(JSON.stringify({ ...db, schemaVersion: VECTOR_SCHEMA_VERSION + 1 }));
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.reason).toContain(String(VECTOR_SCHEMA_VERSION + 1));
    const present = deserializeVectors(serializeVectors(db));
    expect(present.ok).toBe(true);
  });

  it('the version is a positive integer — a version that is not a count is not a version', () => {
    expect(Number.isInteger(VECTOR_SCHEMA_VERSION)).toBe(true);
    expect(VECTOR_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('one constant feeds both halves — the stamped db round-trips at the stamped version', () => {
    const wire = JSON.parse(serializeVectors(buildVectorDb(SEED))) as { schemaVersion: number };
    expect(wire.schemaVersion).toBe(VECTOR_SCHEMA_VERSION);
    const back = deserializeVectors(serializeVectors(buildVectorDb(SEED)));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.db.schemaVersion).toBe(VECTOR_SCHEMA_VERSION);
  });
});
