import { describe, expect, it } from 'vitest';
import { EMBED_DIM } from '@nexus/ai-providers';
import { buildIndex, queryIndex } from '../src/codeIndex.js';
import {
  indexHay,
  indexToVectorDb,
  indexVectorId,
  mergeIndexVectors,
  queryIndexWithVectors,
} from '../src/indexVectors.js';
import { createIndexProvider, type IndexProvider } from '../src/indexStore.js';
import { loadVectors } from '../src/vectordb.js';
import { InMemoryWorkspace, registerWorkspaceTools } from '../src/workspace.js';
import { ToolRegistry } from '../src/registry.js';
import { createMemDisk, type MemDisk } from './memDisk.js';

const FILES: Record<string, string> = {
  'src/a.ts': 'export function alpha() {\n  return 1;\n}\n',
  'src/b.ts': 'export const BETA = 2;\n',
  'docs/guide.md': '# Guide\n\nhow to rotate widgets\n\n## Setup\n\nnpm test\n',
};

const QUERIES = ['rotate widgets', 'alpha', 'npm test setup', 'BETA rotate', 'nothing matches here zzz'];

describe('indexVectors: cold build and parity (v23)', () => {
  it('indexToVectorDb mirrors the index: one entry per chunk, id path#startLine, real vectors', () => {
    const index = buildIndex(FILES);
    const db = indexToVectorDb(index);
    expect(db.schemaVersion).toBe(1);
    expect(db.dim).toBe(EMBED_DIM);
    expect(db.entries.length).toBe(index.chunks.length);
    const ids = index.chunks.map(indexVectorId).sort();
    expect(db.entries.map((e) => e.id)).toEqual(ids); // sorted by id
    for (const e of db.entries) {
      expect(e.vector.length).toBe(EMBED_DIM);
      expect(e.meta).toEqual({ path: e.id.slice(0, e.id.lastIndexOf('#')), startLine: Number(e.id.slice(e.id.lastIndexOf('#') + 1)) });
    }
    expect(db.entries.every((e) => e.text === indexHay(index.chunks.find((c) => indexVectorId(c) === e.id)!))).toBe(true);
  });

  it('vector-backed queries equal inline queryIndex hit-for-hit and state engine "vectors"', () => {
    for (const query of QUERIES) {
      const index = buildIndex(FILES);
      const db = indexToVectorDb(index);
      const v = queryIndexWithVectors(index, db, query, 3);
      expect(v.engine).toBe('vectors');
      expect(v.hits).toEqual(queryIndex(index, query, 3));
    }
  });

  it('null db ⇒ honest inline engine (same hits, different label)', () => {
    const index = buildIndex(FILES);
    const fallback = queryIndexWithVectors(index, null, 'rotate widgets', 2);
    expect(fallback.engine).toBe('inline');
    expect(fallback.hits).toEqual(queryIndex(index, 'rotate widgets', 2));
  });
});

describe('indexVectors: incremental merge', () => {
  it('cold merge equals indexToVectorDb and re-embeds everything', () => {
    const index = buildIndex(FILES);
    const { db, reembedded } = mergeIndexVectors(null, index);
    expect(db).toEqual(indexToVectorDb(index));
    expect(reembedded.sort()).toEqual(index.chunks.map(indexVectorId).sort());
  });

  it('unchanged chunks reuse vectors verbatim; only changed/new ids re-embed; removals drop out', () => {
    const index = buildIndex(FILES);
    const previous = indexToVectorDb(index);
    const edited = { ...FILES, 'src/b.ts': 'export const BETA = 3;\nexport function gamma() { return 4; }\n', 'src/c.ts': 'export const delta = 5;\n' };
    const next = buildIndex(edited);
    const { db, reembedded } = mergeIndexVectors(previous, next);
    // only the edited file's chunk and the new file's chunk re-embedded; docs and src/a untouched
    expect(reembedded).toEqual(['src/b.ts#1', 'src/c.ts#1']);
    const prevB = previous.entries.find((e) => e.id === 'src/b.ts#1')!;
    expect(db.entries.find((e) => e.id === 'src/b.ts#1')!.vector).not.toBe(prevB.vector);
    expect(db.entries.find((e) => e.id === 'docs/guide.md#1')!.vector).toBe(previous.entries.find((e) => e.id === 'docs/guide.md#1')!.vector);
    expect(db).toEqual(indexToVectorDb(next)); // incremental path ≡ cold build, exactly
  });
});

describe('indexVectors: drift falls back honestly', () => {
  it('tampered text, missing id or wrong-dim vector ⇒ the WHOLE query runs inline, stated', () => {
    const index = buildIndex(FILES);
    const good = indexToVectorDb(index);
    const tampered = structuredClone(good);
    tampered.entries[0]!.text = 'lies';
    const missing = structuredClone(good);
    missing.entries.splice(1, 1);
    const wrongDim = structuredClone(good);
    wrongDim.entries[0]!.vector = wrongDim.entries[0]!.vector.slice(0, EMBED_DIM - 1);
    for (const db of [tampered, missing, wrongDim]) {
      const r = queryIndexWithVectors(index, db, 'rotate widgets', 3);
      expect(r.engine).toBe('inline');
      expect(r.hits).toEqual(queryIndex(index, 'rotate widgets', 3));
    }
  });
});

describe('indexVectors: persisted provider path', () => {
  const makeProvider = (files: Record<string, string>, disk: MemDisk): IndexProvider =>
    createIndexProvider({ files, snapshotFile: 'state/index.json', vectorsFile: 'state/vectors.json', fsLike: disk });

  it('first refresh persists a loadable vectors file; vectors() exposes it', () => {
    const disk = createMemDisk({ listing: 'real' });
    const p = makeProvider(FILES, disk);
    expect(p.vectors()).not.toBeNull(); // lazy refresh through vectors()
    const loaded = loadVectors(disk, 'state/vectors.json');
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.db).toEqual(indexToVectorDb(buildIndex(FILES)));
  });

  it('a second cold provider reuses the persisted vectors byte-for-byte (0 re-embeds)', () => {
    const disk = createMemDisk({ listing: 'real' });
    makeProvider(FILES, disk).refresh();
    const written = disk.files.get('state/vectors.json')!;
    const second = makeProvider(FILES, disk);
    second.refresh();
    expect(second.lastRechunked()).toEqual([]);
    expect(disk.files.get('state/vectors.json')).toBe(written); // identical serialization ⇒ stored vectors were reused verbatim
  });

  it('corrupt vectors file rebuilds and self-repairs; queries still report engine "vectors"', () => {
    const disk = createMemDisk({ listing: 'real' });
    disk.writeFileSync('state/vectors.json', 'not json at all');
    const p = makeProvider(FILES, disk);
    const index = p.refresh();
    const r = queryIndexWithVectors(index, p.vectors(), 'alpha');
    expect(r.engine).toBe('vectors');
    expect(r.hits).toEqual(queryIndex(index, 'alpha'));
    expect(loadVectors(disk, 'state/vectors.json').ok).toBe(true); // repaired on disk
  });

  it('registered fs.index answers with engine "vectors" when the provider is vector-backed', async () => {
    const disk = createMemDisk({ listing: 'real' });
    const ws = new InMemoryWorkspace(FILES);
    const p = createIndexProvider({ files: { ...FILES }, snapshotFile: 'state/index.json', vectorsFile: 'state/vectors.json', fsLike: disk });
    const registry = registerWorkspaceTools(new ToolRegistry(), ws, { indexProvider: p });
    const res = await registry.invoke({ callId: 'x1', tool: 'fs.index', args: { query: 'rotate widgets' } }, {});
    expect(res.ok).toBe(true);
    const out = res.output as { engine: string; hits: { path: string }[] };
    expect(out.engine).toBe('vectors');
    expect(out.hits).toEqual(queryIndex(buildIndex(FILES), 'rotate widgets'));
    // provider without vectorsFile keeps the plain inline label
    const plain = registerWorkspaceTools(new ToolRegistry(), new InMemoryWorkspace(FILES), { indexProvider: createIndexProvider({ files: FILES }) });
    const res2 = await plain.invoke({ callId: 'x2', tool: 'fs.index', args: { query: 'rotate widgets' } }, {});
    expect((res2.output as { engine: string }).engine).toBe('inline');
  });

  it('vector-backed queries track file edits through the provider lifecycle', () => {
    const disk = createMemDisk({ listing: 'real' });
    const files = { ...FILES };
    const p = makeProvider(files, disk);
    p.refresh();
    files['src/b.ts'] = 'rotate widgets widgets quickly\n';
    const index = p.refresh();
    expect(p.lastRechunked()).toEqual(['src/b.ts']);
    const r = queryIndexWithVectors(index, p.vectors(), 'rotate everything widgets');
    expect(r.engine).toBe('vectors');
    expect(r.hits[0]!.path).toBe('src/b.ts');
    expect(r.hits).toEqual(queryIndex(index, 'rotate everything widgets'));
  });
});
