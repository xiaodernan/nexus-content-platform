import { cosine, EMBED_DIM } from '@nexus/ai-providers';
import { embedTokens, hybridScore, tokenize } from './embedding.js';
import type { FsWriteLike } from './durability.js';

/**
 * M2 v18: a LOCAL persisted vector store. Vectors are the deterministic token-bag hash
 * embeddings from the shared seam — this is real vector search mechanics (persist, cold
 * load, cosine scan) without ever claiming trained embeddings (§60). Exact scan is used
 * and stated: correct at this scale, no ANN approximations to hide behind.
 */
export const VECTOR_SCHEMA_VERSION = 1;

export interface VectorEntry {
  id: string;
  text: string;
  vector: number[];
  meta?: Record<string, string | number>;
}

export interface VectorDb {
  schemaVersion: number;
  dim: number;
  entries: VectorEntry[];
}

export function buildVectorDb(entries: Omit<VectorEntry, 'vector'>[]): VectorDb {
  return {
    schemaVersion: VECTOR_SCHEMA_VERSION,
    dim: EMBED_DIM,
    entries: [...entries]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((e) => ({ ...e, vector: embedTokens(e.text) })),
  };
}

export function serializeVectors(db: VectorDb): string {
  return JSON.stringify(db);
}

export type VectorsLoad = { ok: true; db: VectorDb } | { ok: false; reason: string };

export function deserializeVectors(json: string): VectorsLoad {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'not valid JSON' };
  }
  const db = raw as Partial<VectorDb>;
  if (db.schemaVersion !== VECTOR_SCHEMA_VERSION) return { ok: false, reason: `unsupported schemaVersion ${String(db.schemaVersion)}` };
  if (db.dim !== EMBED_DIM) return { ok: false, reason: `dim ${String(db.dim)} ≠ ${EMBED_DIM}` };
  if (!Array.isArray(db.entries)) return { ok: false, reason: 'entries must be an array' };
  for (const e of db.entries) {
    if (typeof e?.id !== 'string' || typeof e?.text !== 'string' || !Array.isArray(e.vector) || e.vector.length !== EMBED_DIM || !e.vector.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      return { ok: false, reason: `malformed entry ${String(e?.id)}` };
    }
  }
  return { ok: true, db: db as VectorDb };
}

export function saveVectors(fsLike: FsWriteLike, file: string, db: VectorDb): void {
  const dir = file.slice(0, file.lastIndexOf('/'));
  if (dir) fsLike.mkdirSync(dir, { recursive: true });
  fsLike.writeFileSync(file, serializeVectors(db), 'utf8');
}

export function loadVectors(fsLike: { readFileSync(p: string, e: 'utf8'): string }, file: string): VectorsLoad {
  try {
    return deserializeVectors(fsLike.readFileSync(file, 'utf8'));
  } catch {
    return { ok: false, reason: `no such file: ${file}` };
  }
}

export interface VectorHit {
  id: string;
  score: number;
  text: string;
  meta?: Record<string, string | number>;
}

/**
 * Exact-scan hybrid query over stored vectors: 0.6 cosine (stored vector, no recompute)
 * + 0.4 query-token coverage. Zero shared tokens ⇒ 0, ties by id — identical ranking to
 * `hybridScore(query, text)` by construction, asserted in tests.
 */
export function queryVectors(db: VectorDb, query: string, opts: { k?: number; filterIds?: Set<string> } = {}): VectorHit[] {
  const qv = embedTokens(query);
  const qt = new Set(tokenize(query));
  const hits: VectorHit[] = [];
  for (const e of db.entries) {
    if (opts.filterIds && !opts.filterIds.has(e.id)) continue;
    const score = hybridScore(query, e.text) === 0 ? 0 : 0.6 * cosine(qv, e.vector) + 0.4 * (qt.size ? [...qt].filter((t) => new Set(tokenize(e.text)).has(t)).length / qt.size : 0);
    if (score > 0) hits.push({ id: e.id, score, text: e.text, ...(e.meta ? { meta: e.meta } : {}) });
  }
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return hits.slice(0, opts.k ?? 5);
}
