import { describe, expect, it } from 'vitest';
import { EMBED_DIM, cosine } from '@nexus/ai-providers';
import { embedTokens } from '../src/embedding.js';
import { buildVectorDb, queryVectors } from '../src/vectordb.js';
import { MemoryStore } from '../src/memory.js';
import { createVectorStore, syncMemoryToVectorStore } from '../src/vectorStore.js';
import { createMemDisk } from './memDisk.js';

const SEED = [
  { id: 'b', text: 'widget rotation baking explanation', meta: { path: 'docs/rotate.md' } },
  { id: 'a', text: 'cooking recipe for soup', meta: { path: 'docs/cook.md' } },
  { id: 'c', text: 'rotation guide for baking widgets' },
];

describe('vectorStore facade (v91 — the ESM seam)', () => {
  it('refuses at the DOOR: pgvector has no connection here, and no foreign dimension can be honest', () => {
    expect(() => createVectorStore({ type: 'pgvector', connectionString: 'postgres://x', tableName: 'v', dimension: EMBED_DIM })).toThrowError(
      /pgvector" is not implemented/,
    );
    expect(() => createVectorStore({ type: 'memory', dimension: 1536 })).toThrowError(/refused at the door/);
    expect(() => createVectorStore({ type: 'local' })).toThrowError(/requires localPath/);
    expect(() => createVectorStore({ type: 'local', localPath: 'state/v.json' })).toThrowError(/requires an fs adapter/);
    expect(() => createVectorStore({ type: 'memory', dimension: EMBED_DIM })).not.toThrow();
  });

  it('the memory store ranks hit-for-hit like vectordb.queryVectors, and names its engine', async () => {
    const store = createVectorStore({ type: 'memory' });
    expect(store.name).toBe('memory');
    expect(store.engine).toBe('memory-exact-scan');
    expect(store.dimension).toBe(EMBED_DIM);
    expect(await store.initialize()).toEqual({ ok: true, engine: 'memory-exact-scan', entries: 0, loadedFrom: null });

    expect(await store.upsert(SEED)).toBe(3);
    const q = 'widget rotation baking';
    expect(await store.query(q, { k: 3 })).toEqual(queryVectors(buildVectorDb(SEED), q, { k: 3 }));
    expect(await store.query('zzz nothing matches')).toEqual([]);

    // queryByVector is the VECTOR-ONLY door: plain cosine, no token-coverage term.
    const qv = embedTokens('soup');
    const byVec = await store.queryByVector(qv, { k: 3 });
    expect(byVec.map((h) => h.id)[0]).toBe('a');
    expect(byVec.map((h) => h.id)).toEqual(
      [...SEED]
        .map((e) => ({ id: e.id, score: cosine(qv, embedTokens(e.text)) }))
        .filter((x) => x.score > 0)
        .sort((x, y) => y.score - x.score || x.id.localeCompare(y.id))
        .map((x) => x.id),
    );

    expect(await store.size()).toBe(3);
    expect(await store.getEntry('a')).toMatchObject({ id: 'a', text: 'cooking recipe for soup' });
    expect(await store.getEntry('nope')).toBeNull();
    expect((await store.getEntries(['c', 'a'])).map((e) => e.id)).toEqual(['a', 'c']);
    expect(await store.delete(['a', 'nope'])).toBe(1);
    expect(await store.size()).toBe(2);
    await store.clear();
    expect(await store.size()).toBe(0);
    expect(await store.flush()).toEqual({
      persisted: false,
      reason: 'memory store: the entries live in this process and there is no file to write',
    });
  });

  it('two identical stores answer identically (determinism is part of the seam)', async () => {
    const a = createVectorStore({ type: 'memory' });
    const b = createVectorStore({ type: 'memory' });
    await a.upsert(SEED);
    await b.upsert(SEED);
    expect(JSON.stringify(await b.query('widget rotation', { k: 3 }))).toEqual(JSON.stringify(await a.query('widget rotation', { k: 3 })));
    expect(JSON.stringify(await b.getEntries(['a', 'b', 'c']))).toEqual(JSON.stringify(await a.getEntries(['a', 'b', 'c'])));
  });

  it('the local store writes NOTHING until flush, then a COLD second store reads the same rows', async () => {
    const disk = createMemDisk({ listing: 'refuse' });
    const first = createVectorStore({ type: 'local', localPath: 'state/vectors.json' }, disk);
    expect(first.engine).toBe('local-json-exact-scan');
    expect(await first.initialize()).toEqual({ ok: true, engine: 'local-json-exact-scan', entries: 0, loadedFrom: null });

    await first.upsert(SEED);
    expect([...disk.files.keys()]).toEqual([]); // rule 3: no timer, no write nobody asked for
    expect(await first.flush()).toEqual({ persisted: true, reason: 'wrote 3 entries to state/vectors.json' });
    expect([...disk.files.keys()]).toEqual(['state/vectors.json']);

    const second = createVectorStore({ type: 'local', localPath: 'state/vectors.json' }, disk);
    expect(await second.initialize()).toEqual({ ok: true, engine: 'local-json-exact-scan', entries: 3, loadedFrom: 'state/vectors.json' });
    const q = 'widget rotation baking';
    expect(await second.query(q, { k: 3 })).toEqual(await first.query(q, { k: 3 }));
  });

  it('a file that EXISTS but cannot be read is refused, not silently replaced by an empty store', async () => {
    const disk = createMemDisk({ listing: 'refuse' });
    disk.files.set('state/vectors.json', '{oops');
    const store = createVectorStore({ type: 'local', localPath: 'state/vectors.json' }, disk);

    const bad = await store.initialize();
    expect(bad.ok).toBe(false);
    expect(bad.ok === false && bad.reason).toBe('state/vectors.json: not valid JSON');
    await expect(store.upsert(SEED)).rejects.toThrowError(/not initialized/);
    await expect(store.size()).rejects.toThrowError(/not initialized/);
    // flush is refused too — it would otherwise overwrite a file it never read.
    await expect(store.flush()).rejects.toThrowError(/not initialized/);

    await store.clear(); // the explicit way out, and the only one
    expect(await store.initialize()).toEqual({ ok: true, engine: 'local-json-exact-scan', entries: 0, loadedFrom: null });
  });

  it('syncMemoryToVectorStore names one row per ref, stably, and is idempotent under upsert', async () => {
    const disk = createMemDisk({ listing: 'refuse' });
    const store = createVectorStore({ type: 'local', localPath: 'state/v.json' }, disk);
    await store.initialize();
    const memory = new MemoryStore();
    memory.save({
      scope: 'multi-agent:t1',
      runId: 't1',
      query: 'widget rotation',
      summary: 'found 2',
      refs: [{ path: 'docs/rotate.md', startLine: 3 }, { path: 'docs/widget.md' }],
    });
    memory.save({ scope: 'other', runId: 't9', query: 'ignored', summary: 'x', refs: [{ path: 'docs/none.md' }] });

    const synced = await syncMemoryToVectorStore({ vectorStore: store, memoryStore: memory, scope: 'multi-agent:t1' });
    expect(synced).toEqual({ entries: 2, ids: ['mem-1:0', 'mem-1:1'] });
    const again = await syncMemoryToVectorStore({ vectorStore: store, memoryStore: memory, scope: 'multi-agent:t1' });
    expect(again.ids).toEqual(synced.ids);
    expect(await store.size()).toBe(2); // ids are stable, so the second sync replaces rather than grows
    expect((await store.query('widget rotation', { k: 2 })).length).toBeGreaterThan(0);
    expect(await syncMemoryToVectorStore({ vectorStore: store, memoryStore: memory, scope: 'nobody' })).toEqual({ entries: 0, ids: [] });
  });
});
