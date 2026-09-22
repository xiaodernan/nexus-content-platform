import { hashString } from '@nexus/ai-providers';
import type { CodeIndex, IndexChunk } from './codeIndex.js';
import { buildIndex, chunkFile, extractSymbols, fileKind } from './codeIndex.js';
import type { FsWriteLike } from './durability.js';
import { loadVectors, saveVectors, type VectorDb } from './vectordb.js';
import { mergeIndexVectors } from './indexVectors.js';

/**
 * M2 v4: serializable index snapshots + fingerprint-based incremental rescan (ADR 0016
 * amendment 4). A snapshot is just data — determinism is preserved because rebuilding from
 * the same `path → content` map yields a byte-identical index regardless of snapshot use.
 */
export const INDEX_SCHEMA_VERSION = 1;

export type Fingerprints = Record<string, string>;

/** Stable per-file fingerprint: content hash via the shared PRNG seed function. */
export function fingerprintFiles(files: Record<string, string>): Fingerprints {
  const out: Fingerprints = {};
  for (const path of Object.keys(files).sort()) out[path] = String(hashString(`${path}\u0000${files[path]!}`));
  return out;
}

export interface PersistedIndex {
  schemaVersion: number;
  fingerprints: Fingerprints;
  files: CodeIndex['files'];
  chunks: IndexChunk[];
}

export function serializeIndex(index: CodeIndex, fingerprints: Fingerprints): string {
  return JSON.stringify({ schemaVersion: INDEX_SCHEMA_VERSION, fingerprints, files: index.files, chunks: index.chunks });
}

export type IndexLoad = { ok: true; index: CodeIndex; fingerprints: Fingerprints } | { ok: false; reason: string };

export function deserializeIndex(json: string): IndexLoad {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'not valid JSON' };
  }
  const obj = raw as Partial<PersistedIndex>;
  if (obj.schemaVersion !== INDEX_SCHEMA_VERSION) {
    return { ok: false, reason: `unsupported schemaVersion ${String(obj.schemaVersion)}` };
  }
  if (typeof obj.fingerprints !== 'object' || obj.fingerprints === null) return { ok: false, reason: 'missing fingerprints' };
  if (!Array.isArray(obj.files) || !Array.isArray(obj.chunks)) return { ok: false, reason: 'files/chunks must be arrays' };
  const badFile = obj.files.some(
    (f) => typeof f?.path !== 'string' || typeof f?.kind !== 'string' || typeof f?.lines !== 'number' || !Array.isArray(f?.symbols),
  );
  if (badFile) return { ok: false, reason: 'malformed file entry' };
  const badChunk = obj.chunks.some(
    (c) => typeof c?.path !== 'string' || typeof c?.startLine !== 'number' || typeof c?.endLine !== 'number' || typeof c?.text !== 'string',
  );
  if (badChunk) return { ok: false, reason: 'malformed chunk' };
  return {
    ok: true,
    index: { files: obj.files as CodeIndex['files'], chunks: obj.chunks as IndexChunk[] },
    fingerprints: obj.fingerprints as Fingerprints,
  };
}

export function saveIndex(fsLike: FsWriteLike, file: string, index: CodeIndex, fingerprints: Fingerprints): void {
  const dir = file.slice(0, file.lastIndexOf('/'));
  if (dir) fsLike.mkdirSync(dir, { recursive: true });
  fsLike.writeFileSync(file, serializeIndex(index, fingerprints), 'utf8');
}

export function loadIndex(fsLike: { readFileSync(p: string, e: 'utf8'): string }, file: string): IndexLoad {
  try {
    return deserializeIndex(fsLike.readFileSync(file, 'utf8'));
  } catch {
    return { ok: false, reason: `no such file: ${file}` };
  }
}

export interface RescanResult {
  index: CodeIndex;
  fingerprints: Fingerprints;
  rechunked: string[]; // paths whose content changed or are new (observable, not hidden)
}

/**
 * Incremental update: files whose fingerprint is unchanged keep their stored entry+chunks
 * verbatim; changed/new files are re-chunked; removed files drop out. Output is in sorted-path
 * order exactly like buildIndex, so query ranking is snapshot-independent.
 */
export function rescanIndex(previous: CodeIndex | null, previousFp: Fingerprints, files: Record<string, string>): RescanResult {
  const fp = fingerprintFiles(files);
  if (!previous || !previousFp) {
    return { index: buildIndex(files), fingerprints: fp, rechunked: Object.keys(fp) };
  }
  const prevByPath = new Map(previous.files.map((f) => [f.path, f]));
  const prevChunks = new Map<string, IndexChunk[]>();
  for (const c of previous.chunks) {
    const list = prevChunks.get(c.path) ?? [];
    list.push(c);
    prevChunks.set(c.path, list);
  }
  const entries: CodeIndex['files'] = [];
  const chunks: IndexChunk[] = [];
  const rechunked: string[] = [];
  for (const path of Object.keys(fp).sort()) {
    const content = files[path]!;
    if (previousFp[path] === fp[path] && prevByPath.has(path)) {
      entries.push(prevByPath.get(path)!);
      chunks.push(...(prevChunks.get(path) ?? []));
    } else {
      rechunked.push(path);
      entries.push({ path, kind: fileKind(path), lines: content.split('\n').length, symbols: extractSymbols(fileKind(path), content) });
      chunks.push(...chunkFile(path, content));
    }
  }
  return { index: { files: entries, chunks }, fingerprints: fp, rechunked };
}

export interface IndexProviderOptions {
  /** The file set to index (the host keeps it in sync with the workspace it registers). */
  files: Record<string, string>;
  /** Optional snapshot JSON path, loaded on first use and persisted after every refresh. */
  snapshotFile?: string;
  /** v23: chunk-vectors JSON path, refreshed incrementally with every snapshot persist. */
  vectorsFile?: string;
  /** Required with snapshotFile/vectorsFile: the writable fs used to persist them. */
  fsLike?: FsWriteLike;
}

export interface IndexProvider {
  /** Re-reads (fingerprints only) on demand; returns the current index. */
  refresh(): CodeIndex;
  index(): CodeIndex;
  /** Files re-chunked by the most recent refresh — 0 means pure reuse (§60 observability). */
  lastRechunked(): string[];
  /** v23: chunk vectors when `vectorsFile` backs the provider; null ⇒ callers score inline. */
  vectors(): VectorDb | null;
}

/**
 * v5: the snapshot layer behind `fs.index`. First refresh prefers the persisted snapshot
 * (cold-verifying it against current fingerprints); later refreshes are incremental rescans,
 * so an unchanged file set costs ~0 re-chunking instead of a full rebuild.
 */
export function createIndexProvider(opts: IndexProviderOptions): IndexProvider {
  let current: CodeIndex | null = null;
  let fps: Fingerprints = {};
  let rechunked: string[] = [];
  let vdb: VectorDb | null = null;

  const persist = (index: CodeIndex): void => {
    if (opts.snapshotFile && opts.fsLike) saveIndex(opts.fsLike, opts.snapshotFile, index, fps);
  };

  // v23: vectors ride the snapshot lifecycle — cold-load once, then only re-embed chunks
  // whose (id, text) changed; a corrupt vectors file rebuilds fully and repairs the file.
  const syncVectors = (index: CodeIndex): void => {
    if (!opts.vectorsFile || !opts.fsLike) return;
    if (!vdb) {
      const loaded = loadVectors(opts.fsLike, opts.vectorsFile);
      if (loaded.ok) vdb = loaded.db;
    }
    const merged = mergeIndexVectors(vdb, index);
    vdb = merged.db;
    saveVectors(opts.fsLike, opts.vectorsFile, vdb);
  };

  return {
    refresh() {
      const want = fingerprintFiles(opts.files);
      if (!current && opts.snapshotFile && opts.fsLike) {
        const loaded = loadIndex(opts.fsLike, opts.snapshotFile);
        if (loaded.ok) {
          const r = rescanIndex(loaded.index, loaded.fingerprints, opts.files);
          current = r.index;
          fps = r.fingerprints;
          rechunked = r.rechunked;
          persist(current);
          syncVectors(current);
          return current;
        }
      }
      const r: RescanResult = current
        ? rescanIndex(current, fps, opts.files)
        : { index: buildIndex(opts.files), fingerprints: want, rechunked: Object.keys(want).sort() };
      current = r.index;
      fps = r.fingerprints;
      rechunked = r.rechunked;
      persist(current);
      syncVectors(current);
      return current;
    },
    index() {
      return current ?? this.refresh();
    },
    lastRechunked() {
      return [...rechunked];
    },
    vectors() {
      if (!current) this.refresh();
      return opts.vectorsFile && opts.fsLike ? vdb : null;
    },
  };
}
