import { cosine, EMBED_DIM } from '@nexus/ai-providers';
import { embedTokens, tokenize } from './embedding.js';
import { queryIndex, sourcePrior, type CodeIndex, type IndexChunk, type QueryHit } from './codeIndex.js';
import { VECTOR_SCHEMA_VERSION, type VectorDb, type VectorEntry } from './vectordb.js';

/**
 * M2 v23: persisted chunk vectors as the scoring source for `fs.index` (ADR 0016
 * amendment 23). The stored vectors ARE the same token-bag embeddings `hybridScore`
 * computes inline — this reuses them (exact scan, mechanics not magic, §60) — and any
 * drift between the db and the index falls back to inline scoring, STATED in the output.
 */

export function indexHay(c: IndexChunk): string {
  return `${c.heading ?? ''} ${c.text}`;
}

export function indexVectorId(c: IndexChunk): string {
  return `${c.path}#${c.startLine}`;
}

/** Full cold build of an index's chunk vectors (ids `path#startLine`, hay as scored text). */
export function indexToVectorDb(index: CodeIndex): VectorDb {
  return {
    schemaVersion: VECTOR_SCHEMA_VERSION,
    dim: EMBED_DIM,
    entries: index.chunks
      .map((c) => ({ id: indexVectorId(c), text: indexHay(c), meta: { path: c.path, startLine: c.startLine }, vector: embedTokens(indexHay(c)) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/**
 * Incremental vector refresh: entries whose (id, text) are unchanged reuse their stored
 * vector verbatim; only new/changed chunks are re-embedded; removed chunks drop out.
 * `reembedded` is observable (§60) — pure reuse is 0, provably equal to a cold build.
 */
export function mergeIndexVectors(previous: VectorDb | null, index: CodeIndex): { db: VectorDb; reembedded: string[] } {
  const prevById = new Map((previous?.entries ?? []).map((e) => [e.id, e]));
  const entries: VectorEntry[] = [];
  const reembedded: string[] = [];
  for (const c of index.chunks) {
    const id = indexVectorId(c);
    const text = indexHay(c);
    const meta = { path: c.path, startLine: c.startLine };
    const prev = prevById.get(id);
    if (prev && prev.text === text) entries.push({ ...prev, meta });
    else {
      entries.push({ id, text, meta, vector: embedTokens(text) });
      reembedded.push(id);
    }
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return { db: { schemaVersion: VECTOR_SCHEMA_VERSION, dim: EMBED_DIM, entries }, reembedded };
}

export interface IndexedQuery {
  engine: 'inline' | 'vectors';
  hits: QueryHit[];
}

/**
 * Vector-backed equivalent of `queryIndex`: same formula (zero shared tokens ⇒ exactly 0;
 * 0.6·cosine + 0.4·coverage, times `sourcePrior`), same tiebreaks, same snippets. If ANY
 * chunk lacks a matching vector (drifted/corrupt db) the whole query falls back to inline
 * scoring and says so — never a silently half-vector ranking.
 */
export function queryIndexWithVectors(index: CodeIndex, db: VectorDb | null, query: string, k = 5): IndexedQuery {
  if (!db) return { engine: 'inline', hits: queryIndex(index, query, k) };
  const byId = new Map(db.entries.map((e) => [e.id, e]));
  const qv = embedTokens(query);
  const qt = new Set(tokenize(query));
  const hits: QueryHit[] = [];
  for (const c of index.chunks) {
    const e = byId.get(indexVectorId(c));
    const hay = indexHay(c);
    if (!e || e.text !== hay || e.vector.length !== EMBED_DIM) return { engine: 'inline', hits: queryIndex(index, query, k) };
    const dt = new Set(tokenize(hay));
    let shared = 0;
    for (const t of qt) if (dt.has(t)) shared++;
    const score = shared === 0 ? 0 : (0.6 * cosine(qv, e.vector) + 0.4 * (qt.size ? shared / qt.size : 0)) * sourcePrior(c.path);
    hits.push({ path: c.path, startLine: c.startLine, heading: c.heading, score, snippet: c.text.replace(/\s+/g, ' ').trim().slice(0, 120) });
  }
  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.startLine - b.startLine);
  return { engine: 'vectors', hits: hits.slice(0, k) };
}
