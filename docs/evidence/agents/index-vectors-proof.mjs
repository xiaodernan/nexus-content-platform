// NEXUS M2 v23 — vector-backed fs.index proof (ADR 0016 amendment 23).
// Headless, offline, key-free. Builds a persisted chunk-vector store over the REAL repo
// (read-only ingestion; every write goes to a jailed temp dir), then shows: cold vectors
// equal an inline build; vector-scored queries are hit-for-hit identical to queryIndex and
// SAY engine "vectors"; a cold second provider reuses the stored vectors byte-for-byte;
// a one-file edit re-embeds exactly that file's chunks; a corrupt vectors file self-repairs;
// and any drift falls the WHOLE query back to inline scoring, stated (never a half-vector
// ranking). Run from the repo root after `npm run build`:
//   node docs/evidence/agents/index-vectors-proof.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const {
  buildIndex,
  queryIndex,
  collectTextFiles,
  createIndexProvider,
  indexToVectorDb,
  indexVectorId,
  indexHay,
  loadVectors,
  mergeIndexVectors,
  queryIndexWithVectors,
  InMemoryWorkspace,
  ToolRegistry,
  registerWorkspaceTools,
} = rt;

const JAIL = path.join(os.tmpdir(), 'nexus-index-vectors-proof').replace(/\\/g, '/');
fs.rmSync(JAIL, { recursive: true, force: true });
fs.mkdirSync(`${JAIL}/state`, { recursive: true });

const SNAP = `${JAIL}/state/index.json`;
const VECT = `${JAIL}/state/vectors.json`;
const files = collectTextFiles('.', fs);
assert.ok(Object.keys(files).length > 50);
const QUERY_SET = ['hybridScore token bag embedding', 'collectTextFiles skip directories walk', 'checkpoint jail write allowlist', 'zzz nothing matches qqq'];

// 1) Provider cold build: vectors persist and equal a direct indexToVectorDb of the same index.
const p1 = createIndexProvider({ files, snapshotFile: SNAP, vectorsFile: VECT, fsLike: fs });
const index1 = p1.refresh();
const loaded = loadVectors(fs, VECT);
assert.equal(loaded.ok, true, `vectors file must reload: ${loaded.reason}`);
assert.deepEqual(loaded.db, indexToVectorDb(index1), 'persisted vectors must equal the cold build');
console.log(`[index-vectors] cold: ${loaded.db.entries.length} chunk vectors persisted over ${Object.keys(files).length} real-repo files`);

// 2) Parity by construction: vector-scored queries are hit-for-hit identical to inline — and say so.
for (const q of QUERY_SET) {
  const v = queryIndexWithVectors(index1, p1.vectors(), q, 3);
  assert.equal(v.engine, 'vectors');
  assert.deepEqual(v.hits, queryIndex(index1, q, 3), `vector ranking must equal inline for: ${q}`);
}
console.log('[index-vectors] parity: engine "vectors" hit-for-hit equals inline on all', QUERY_SET.length, 'queries —', queryIndexWithVectors(index1, p1.vectors(), QUERY_SET[0], 1).hits[0].path);

// 3) A COLD second provider reuses stored vectors byte-for-byte (0 re-embeds, 0 re-chunks).
const before = fs.readFileSync(VECT, 'utf8');
const p2 = createIndexProvider({ files, snapshotFile: SNAP, vectorsFile: VECT, fsLike: fs });
p2.refresh();
assert.deepEqual(p2.lastRechunked(), [], 'unchanged repo must reuse every chunk');
assert.equal(fs.readFileSync(VECT, 'utf8'), before, 'reused vectors must serialize byte-identically');

// 4) One edited file re-embeds ONLY the chunk windows whose text actually changed; merge output ≡ cold rebuild.
const EDITED = 'agents/runtime/src/codeIndex.ts';
const editedFiles = { ...files, [EDITED]: files[EDITED] + '\nexport const MARKER_V23 = 1;\n' };
const p3 = createIndexProvider({ files: editedFiles, snapshotFile: SNAP, vectorsFile: VECT, fsLike: fs });
p3.refresh(); // loads p2's vectors from disk
const prevById = new Map(p2.vectors().entries.map((e) => [e.id, e]));
const changedIds = buildIndex(editedFiles)
  .chunks.filter((c) => {
    const e = prevById.get(indexVectorId(c));
    return !e || e.text !== indexHay(c);
  })
  .map(indexVectorId);
const merged = mergeIndexVectors(p2.vectors(), buildIndex(editedFiles));
assert.ok(changedIds.length > 0 && changedIds.length < merged.db.entries.length, 'an edit must touch some but not all chunks');
assert.deepEqual(merged.reembedded.sort(), changedIds.sort(), 'only genuinely changed chunk windows may re-embed');
assert.deepEqual(merged.db, indexToVectorDb(buildIndex(editedFiles)), 'incremental vectors must equal a cold rebuild');
const hitV23 = queryIndexWithVectors(p3.index(), p3.vectors(), 'MARKER_V23', 1);
assert.equal(hitV23.engine, 'vectors');
assert.equal(hitV23.hits[0].path, EDITED, 'new symbol is queryable through the vector path after an incremental refresh');
console.log(`[index-vectors] incremental: appended 1 line re-embedded ${changedIds.length} of ${merged.db.entries.length} chunk vectors (cold rebuild would embed all)`);

// 5) Drift fails honestly: a tampered entry sends the WHOLE query to inline, stated.
const tampered = structuredClone(p2.vectors());
tampered.entries[0].text = 'lies';
const fb = queryIndexWithVectors(index1, tampered, QUERY_SET[0], 3);
assert.equal(fb.engine, 'inline');
assert.deepEqual(fb.hits, queryIndex(index1, QUERY_SET[0], 3), 'fallback must be the real inline ranking');
console.log('[index-vectors] drift: tampered vector db ⇒ engine "inline", full inline fallback');

// 6) Corrupt vectors file self-repairs on refresh; the vector path comes back.
fs.writeFileSync(VECT, 'not json at all');
const p4 = createIndexProvider({ files, snapshotFile: SNAP, vectorsFile: VECT, fsLike: fs });
const idx4 = p4.refresh();
assert.equal(loadVectors(fs, VECT).ok, true, 'corrupt vectors file must be repaired on disk');
assert.equal(queryIndexWithVectors(idx4, p4.vectors(), QUERY_SET[0], 3).engine, 'vectors');

// 7) The actual tool surface: fs.index reports its scoring engine in the output.
const registry = registerWorkspaceTools(new ToolRegistry(), new InMemoryWorkspace(files), {
  indexProvider: createIndexProvider({ files, snapshotFile: SNAP, vectorsFile: VECT, fsLike: fs }),
});
const res = await registry.invoke({ callId: 'p1', tool: 'fs.index', args: { query: 'embedTokens token bag', topK: 3 } }, {});
assert.equal(res.ok, true);
assert.equal(res.output.engine, 'vectors', 'fs.index must state its engine');
assert.deepEqual(res.output.hits, queryIndex(buildIndex(files), 'embedTokens token bag', 3));
const plain = registerWorkspaceTools(new ToolRegistry(), new InMemoryWorkspace(files));
const res2 = await plain.invoke({ callId: 'p2', tool: 'fs.index', args: { query: 'embedTokens token bag', topK: 3 } }, {});
assert.equal(res2.output.engine, 'inline', 'provider-less fs.index says "inline" — same hits, honest label');
assert.deepEqual(res2.output.hits, res.output.hits);
console.log('[index-vectors] tool surface: fs.index {engine:"vectors"} ≡ {engine:"inline"} hits on the real repo');

fs.rmSync(JAIL, { recursive: true, force: true });
console.log('[index-vectors] ALL ASSERTIONS PASSED (persisted chunk vectors, parity, incremental reuse, honest fallback, §60 controls)');
