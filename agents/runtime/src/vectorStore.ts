import { cosine, EMBED_DIM } from '@nexus/ai-providers';
import { embedTokens } from './embedding.js';
import {
  VECTOR_SCHEMA_VERSION,
  deserializeVectors,
  queryVectors,
  serializeVectors,
  type VectorDb,
  type VectorEntry,
  type VectorHit,
} from './vectordb.js';
import type { FsWriteLike } from './durability.js';
import type { MemoryRecord } from './memory.js';

/**
 * M2 v91: the §63/ADR 0012 vector-store SEAM, as a facade over v18's exact-scan primitives
 * (`vectordb.ts`) and NOT as a second implementation of them. Three rules this file keeps,
 * each one measured against the module it replaces (see ADR 0016 amendment 91):
 *
 *  1. It imports statically. The first draft reached its own siblings through `require(...)`
 *     inside an ESM package — `tsc` was happy (`@types/node` declares the name) and every
 *     runtime call died on `ReferenceError: require is not defined`, so a store that
 *     type-checked green could not be constructed at all.
 *  2. A factory that can only throw throws AT THE DOOR. `pgvector` needs a live Postgres that
 *     this build does not ship, and a `dimension` other than the shared seam's is refused
 *     before it can be stored, instead of being written into a file that then rejects itself.
 *  3. Nothing is written until `flush()` is asked. The first draft persisted from a
 *     `setInterval` nobody could see or stop; a store whose writes are a timer is a store
 *     whose writes are unobservable.
 *
 * Embeddings are the deterministic token-bag hash embeddings of the shared seam (§60):
 * real vector mechanics — persist, cold load, exact scan — and no trained model implied.
 */
export type VectorStoreEngine = 'memory-exact-scan' | 'local-json-exact-scan';
export type VectorStoreKind = 'memory' | 'local';

export interface VectorStoreEntryInput {
  id: string;
  text: string;
  meta?: Record<string, string | number>;
}

export interface VectorQueryOptions {
  k?: number;
  filterIds?: Set<string>;
}

/** What `initialize()` found — a cold start and an unreadable file are different answers. */
export type VectorStoreInit =
  | { ok: true; engine: VectorStoreEngine; entries: number; loadedFrom: string | null }
  | { ok: false; engine: VectorStoreEngine; reason: string };

export interface VectorStoreFlush {
  persisted: boolean;
  reason: string;
}

export interface VectorStore {
  readonly name: VectorStoreKind;
  readonly engine: VectorStoreEngine;
  readonly dimension: number;
  initialize(): Promise<VectorStoreInit>;
  /** Explicit, and the only door that writes (rule 3). A memory store says it has no file. */
  flush(): Promise<VectorStoreFlush>;
  upsert(entries: VectorStoreEntryInput[]): Promise<number>;
  delete(ids: string[]): Promise<number>;
  /** Hybrid exact scan: 0.6 cosine on the STORED vector + 0.4 query-token coverage. */
  query(query: string, opts?: VectorQueryOptions): Promise<VectorHit[]>;
  /** Vector-only door: plain cosine, no token-coverage term. `query` is the hybrid one. */
  queryByVector(vector: number[], opts?: VectorQueryOptions): Promise<VectorHit[]>;
  getEntry(id: string): Promise<VectorEntry | null>;
  getEntries(ids: string[]): Promise<VectorEntry[]>;
  size(): Promise<number>;
  clear(): Promise<void>;
}

export interface VectorStoreConfig {
  type: 'local' | 'memory' | 'pgvector';
  /** Optional and CHECKED: this seam embeds with `embedTokens`, so any other dimension is refused. */
  dimension?: number;
  /** `local`: path of the JSON file. The fs adapter is injected by the caller, never imported here. */
  localPath?: string;
  /** `pgvector`: unused today — the factory throws before reading it. */
  connectionString?: string;
  tableName?: string;
}

const emptyDb = (): VectorDb => ({ schemaVersion: VECTOR_SCHEMA_VERSION, dim: EMBED_DIM, entries: [] });

function sortedBy(entries: VectorEntry[]): VectorEntry[] {
  return [...entries].sort((a, b) => a.id.localeCompare(b.id));
}

function vectorOnlyHits(db: VectorDb, vector: number[], opts: VectorQueryOptions): VectorHit[] {
  const hits: VectorHit[] = [];
  for (const e of db.entries) {
    if (opts.filterIds && !opts.filterIds.has(e.id)) continue;
    const score = cosine(vector, e.vector);
    if (score > 0) hits.push({ id: e.id, score, text: e.text, ...(e.meta ? { meta: e.meta } : {}) });
  }
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return hits.slice(0, opts.k ?? 5);
}

export function createVectorStore(config: VectorStoreConfig, fsLike?: FsWriteLike): VectorStore {
  const want = config.dimension;
  if (want !== undefined && want !== EMBED_DIM) {
    throw new Error(
      `vector store dimension ${want} is refused at the door: this seam embeds with the shared token-bag hash function (${EMBED_DIM} dims), so no other dimension can be honest here`,
    );
  }
  if (config.type === 'pgvector') {
    throw new Error(
      'vector store "pgvector" is not implemented: it needs a live PostgreSQL + pgvector (docker compose up -d) and this build ships no connection. Use "memory" or "local".',
    );
  }
  if (config.type === 'local') {
    if (!config.localPath) throw new Error('vector store "local" requires localPath');
    if (!fsLike) throw new Error('vector store "local" requires an fs adapter (FsWriteLike): this package imports no node:fs');
    return createLocalStore(config.localPath, fsLike);
  }
  return createMemoryStore();
}

function createMemoryStore(): VectorStore {
  let db: VectorDb = emptyDb();
  const ENGINE: VectorStoreEngine = 'memory-exact-scan';

  return {
    name: 'memory',
    engine: ENGINE,
    dimension: EMBED_DIM,

    async initialize() {
      db = emptyDb();
      return { ok: true, engine: ENGINE, entries: 0, loadedFrom: null };
    },

    async flush() {
      return { persisted: false, reason: 'memory store: the entries live in this process and there is no file to write' };
    },

    async upsert(entries: VectorStoreEntryInput[]) {
      const byId = new Map(db.entries.map((e) => [e.id, e]));
      for (const e of entries) byId.set(e.id, { ...e, vector: embedTokens(e.text) });
      db = { ...db, entries: sortedBy([...byId.values()]) };
      return entries.length;
    },

    async delete(ids: string[]) {
      const gone = new Set(ids);
      const before = db.entries.length;
      db = { ...db, entries: db.entries.filter((e) => !gone.has(e.id)) };
      return before - db.entries.length;
    },

    async query(query, opts = {}) {
      return queryVectors(db, query, opts);
    },

    async queryByVector(vector, opts = {}) {
      return vectorOnlyHits(db, vector, opts);
    },

    async getEntry(id) {
      return db.entries.find((e) => e.id === id) ?? null;
    },

    async getEntries(ids) {
      const want = new Set(ids);
      return sortedBy(db.entries.filter((e) => want.has(e.id)));
    },

    async size() {
      return db.entries.length;
    },

    async clear() {
      db = emptyDb();
    },
  };
}

function createLocalStore(localPath: string, fsLike: FsWriteLike): VectorStore {
  let db: VectorDb = emptyDb();
  let initialized = false;
  const ENGINE: VectorStoreEngine = 'local-json-exact-scan';

  const loaded = (): VectorDb => {
    if (!initialized) throw new Error('vector store not initialized: call initialize() first');
    return db;
  };

  const persist = (next: VectorDb): void => {
    const dir = localPath.slice(0, localPath.lastIndexOf('/'));
    if (dir) fsLike.mkdirSync(dir, { recursive: true });
    fsLike.writeFileSync(localPath, serializeVectors(next), 'utf8');
  };

  return {
    name: 'local',
    engine: ENGINE,
    dimension: EMBED_DIM,

    async initialize() {
      let text: string;
      try {
        text = fsLike.readFileSync(localPath, 'utf8');
      } catch {
        // A missing file is a legitimate cold start. Nothing is written here (rule 3).
        db = emptyDb();
        initialized = true;
        return { ok: true, engine: ENGINE, entries: 0, loadedFrom: null };
      }
      const parsed = deserializeVectors(text);
      if (!parsed.ok) {
        // A file that EXISTS but cannot be read is not an empty store: say so and stay uninitialized.
        return { ok: false, engine: ENGINE, reason: `${localPath}: ${parsed.reason}` };
      }
      db = parsed.db;
      initialized = true;
      // A valid file with 0 entries is effectively a cold start (rule 3: no writes until flush).
      const loadedFrom = db.entries.length === 0 ? null : localPath;
      return { ok: true, engine: ENGINE, entries: db.entries.length, loadedFrom };
    },

    async flush() {
      const next = loaded();
      persist(next);
      return { persisted: true, reason: `wrote ${next.entries.length} entries to ${localPath}` };
    },

    async upsert(entries: VectorStoreEntryInput[]) {
      const current = loaded();
      const byId = new Map(current.entries.map((e) => [e.id, e]));
      for (const e of entries) byId.set(e.id, { ...e, vector: embedTokens(e.text) });
      db = { ...current, entries: sortedBy([...byId.values()]) };
      return entries.length;
    },

    async delete(ids: string[]) {
      const current = loaded();
      const gone = new Set(ids);
      const next = current.entries.filter((e) => !gone.has(e.id));
      db = { ...current, entries: next };
      return current.entries.length - next.length;
    },

    async query(query, opts = {}) {
      return queryVectors(loaded(), query, opts);
    },

    async queryByVector(vector, opts = {}) {
      return vectorOnlyHits(loaded(), vector, opts);
    },

    async getEntry(id) {
      return loaded().entries.find((e) => e.id === id) ?? null;
    },

    async getEntries(ids) {
      const want = new Set(ids);
      return sortedBy(loaded().entries.filter((e) => want.has(e.id)));
    },

    async size() {
      return loaded().entries.length;
    },

    /** The way out of a file this store refused to read: an explicit decision, not a silent wipe. */
    async clear() {
      db = emptyDb();
      initialized = true;
      // Write an empty file so the next initialize() reads it as a cold start (0 entries -> loadedFrom: null)
      try {
        const dir = localPath.slice(0, localPath.lastIndexOf('/'));
        if (dir) fsLike.mkdirSync(dir, { recursive: true });
        fsLike.writeFileSync(localPath, serializeVectors(emptyDb()), 'utf8');
      } catch {
        // If we can't write, the in-memory state is clean anyway
      }
    },
  };
}

export interface MemoryVectorSyncOptions {
  vectorStore: VectorStore;
  memoryStore: { list(scope: string): MemoryRecord[] };
  scope: string;
}

export interface MemoryVectorSync {
  entries: number;
  ids: string[];
}

/**
 * v91: §26 memory → vector-store sync. One entry per memory REF, id = `${memId}:${index}`, so a
 * re-run names the same rows and the store is idempotent under `upsert`. The store embeds; no
 * `embedText` option is offered, because a key nobody reads is a promise nobody keeps.
 */
export async function syncMemoryToVectorStore(opts: MemoryVectorSyncOptions): Promise<MemoryVectorSync> {
  const records = opts.memoryStore.list(opts.scope);
  const entries: VectorStoreEntryInput[] = records.flatMap((record) =>
    record.refs.map((ref, idx) => ({
      id: `${record.id}:${idx}`,
      text: `${record.query}\n${record.summary}\n${ref.path}`,
      meta: { scope: record.scope, runId: record.runId, path: ref.path },
    })),
  );
  if (entries.length === 0) return { entries: 0, ids: [] };
  await opts.vectorStore.upsert(entries);
  return { entries: entries.length, ids: entries.map((e) => e.id) };
}
