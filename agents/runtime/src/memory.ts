import { hybridScore } from './embedding.js';
import { buildVectorDb, loadVectors, queryVectors, type VectorDb } from './vectordb.js';
import type { ToolRegistry } from './registry.js';
import type { ToolSpec } from './types.js';

/**
 * Agent memory, §26 first slice: records are scoped, inspectable and deletable, and every
 * access goes through the permission-gated registry — memory here is exactly what the host
 * chose to persist, nothing ghost-written (§60).
 */
export interface MemoryRef {
  path: string;
  startLine?: number;
}

export interface MemoryRecord {
  id: string;
  scope: string;
  runId: string;
  query: string;
  summary: string;
  refs: MemoryRef[];
}

export interface RecallHit {
  memId: string;
  path: string;
  score: number;
  summary: string;
}

function pathOverlap(a: MemoryRef[], b: MemoryRef[]): number {
  const sa = new Set(a.map((r) => r.path));
  const sb = new Set(b.map((r) => r.path));
  let inter = 0;
  for (const p of sa) if (sb.has(p)) inter++;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

export class MemoryStore {
  private recs: MemoryRecord[] = [];
  private seq = 0;

  save(input: { scope: string; runId: string; query: string; summary: string; refs: MemoryRef[] }): MemoryRecord {
    const rec: MemoryRecord = { id: `mem-${++this.seq}`, ...input, refs: [...input.refs] };
    this.recs.push(rec);
    return structuredClone(rec);
  }

  list(scope?: string): MemoryRecord[] {
    return this.recs.filter((r) => scope === undefined || r.scope === scope).map((r) => structuredClone(r));
  }

  /** v3 persistence re-import: restores a previously saved record verbatim (id preserved). */
  restore(rec: MemoryRecord): void {
    this.recs.push(structuredClone(rec));
    const n = Number(/^mem-(\d+)$/.exec(rec.id)?.[1] ?? 0);
    if (Number.isFinite(n) && n > this.seq) this.seq = n;
  }

  /** v6 hybrid: same token-bag score the index uses (zero shared tokens ⇒ never recalled).
   * Deterministic: score desc, then memId (asc; `newestFirst` flips it for role chains,
   * §25). Refs keep insertion order — Array.sort is stable, so a record's first ref stays first. */
  recall(query: string, opts: { scope?: string; k?: number; newestFirst?: boolean } = {}): RecallHit[] {
    const k = opts.k ?? 5;
    const scored = this.recs
      .filter((r) => opts.scope === undefined || r.scope === opts.scope)
      .map((r) => ({ r, score: hybridScore(query, `${r.query} ${r.summary}`) }))
      .filter((s) => s.score > 0);
    const hits: RecallHit[] = scored.flatMap(({ r, score }) =>
      r.refs.map((ref) => ({ memId: r.id, path: ref.path, score, summary: r.summary })),
    );
    hits.sort((a, b) => b.score - a.score || (opts.newestFirst ? b.memId.localeCompare(a.memId) : a.memId.localeCompare(b.memId)));
    return hits.slice(0, k);
  }

  /** v19: export this store's records as a persistable vector db (ids = record ids). */
  toVectorDb(): VectorDb {
    return buildVectorDb(
      this.recs.map((r) => ({ id: r.id, text: `${r.query} ${r.summary}`, meta: { scope: r.scope, paths: r.refs.map((f) => f.path).join(','), lines: r.refs.length } })),
    );
  }

  /**
   * v19 vector-backed recall: ranking comes from `queryVectors` over stored vectors
   * (identical score function, so parity with inline `recall` is total — asserted in tests).
   */
  recallVectors(db: VectorDb, query: string, opts: { scope?: string; k?: number } = {}): RecallHit[] {
    const scoped = new Set(this.recs.filter((r) => opts.scope === undefined || r.scope === opts.scope).map((r) => r.id));
    const hits: RecallHit[] = [];
    for (const vh of queryVectors(db, query, { k: this.recs.length + 1 })) {
      if (!scoped.has(vh.id)) continue;
      const rec = this.recs.find((r) => r.id === vh.id);
      if (!rec) continue;
      for (const ref of rec.refs) hits.push({ memId: rec.id, path: ref.path, score: vh.score, summary: rec.summary });
    }
    return hits.slice(0, opts.k ?? 5);
  }

  forget(id: string): boolean {
    const before = this.recs.length;
    this.recs = this.recs.filter((r) => r.id !== id);
    return this.recs.length !== before;
  }

  /**
   * v6 consolidation: greedily merge same-scope records whose ref path sets overlap ≥50%
   * (Jaccard). The survivor keeps the oldest id; merges are listed, never silent (§26).
   */
  compact(): { merged: { into: string; from: string[] }[] } {
    const merged: { into: string; from: string[] }[] = [];
    const out: MemoryRecord[] = [];
    for (const rec of this.recs) {
      const target = out.find((o) => o.scope === rec.scope && pathOverlap(o.refs, rec.refs) >= 0.5);
      if (target) {
        const paths = new Set([...target.refs.map((r) => r.path), ...rec.refs.map((r) => r.path)]);
        target.refs = [...paths].sort().map((path) => {
          const withLine = [...target.refs, ...rec.refs].find((r) => r.path === path && r.startLine !== undefined);
          return withLine ? { path, startLine: withLine.startLine } : { path };
        });
        target.summary = `${target.summary} | ${rec.summary}`;
        let entry = merged.find((m) => m.into === target.id);
        if (!entry) {
          entry = { into: target.id, from: [] };
          merged.push(entry);
        }
        entry.from.push(rec.id);
      } else {
        out.push(structuredClone(rec));
      }
    }
    if (merged.length > 0) this.recs = out;
    return { merged };
  }

  clear(scope?: string): number {
    const before = this.recs.length;
    this.recs = scope === undefined ? [] : this.recs.filter((r) => r.scope !== scope);
    return before - this.recs.length;
  }
}

export const MEMORY_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'memory.save',
    description: 'Persist findings (refs accept "path" or "path:startLine") for later runs.',
    permissions: ['write'],
    args: [
      { name: 'runId', type: 'string', required: true },
      { name: 'query', type: 'string', required: true },
      { name: 'summary', type: 'string', required: true },
      { name: 'refs', type: 'string[]', required: true },
    ],
  },
  {
    name: 'memory.recall',
    description: 'Recall stored findings relevant to a query (no workspace needed).',
    permissions: ['read'],
    args: [
      { name: 'query', type: 'string', required: true },
      { name: 'k', type: 'number' },
    ],
  },
  {
    name: 'memory.list',
    description: 'Inspect all memory records in scope.',
    permissions: ['read'],
    args: [],
  },
  {
    name: 'memory.forget',
    description: 'Delete one memory record by id (§26 deletable).',
    permissions: ['write'],
    args: [{ name: 'id', type: 'string', required: true }],
  },
];

function parseRef(raw: string): MemoryRef {
  const m = /^(.*?):(\d+)$/.exec(raw);
  return m ? { path: m[1]!, startLine: Number(m[2]) } : { path: raw };
}

export interface MemoryToolOptions { scope?: string; vectorsFile?: string; fsLike?: { readFileSync(p: string, e: 'utf8'): string } }

export function registerMemoryTools(registry: ToolRegistry, store: MemoryStore, scopeOrOpts: string | MemoryToolOptions = 'default'): ToolRegistry {
  const o: MemoryToolOptions = typeof scopeOrOpts === 'string' ? { scope: scopeOrOpts } : scopeOrOpts;
  const scope = o.scope ?? 'default';
  for (const spec of MEMORY_TOOL_SPECS) {
    registry.register(spec, (args) => {
      switch (spec.name) {
        case 'memory.save':
          return store.save({
            scope,
            runId: String(args.runId),
            query: String(args.query),
            summary: String(args.summary),
            refs: (args.refs as unknown[]).map((r) => parseRef(String(r))),
          });
        case 'memory.recall': {
          const k = args.k === undefined ? 5 : Number(args.k);
          if (o.vectorsFile && o.fsLike) {
            const loaded = loadVectors(o.fsLike, o.vectorsFile);
            if (loaded.ok) return { engine: 'vectors', hits: store.recallVectors(loaded.db, String(args.query), { scope, k }) };
          }
          return { engine: 'inline', hits: store.recall(String(args.query), { scope, k }) };
        }
        case 'memory.list':
          return { records: store.list(scope) };
        case 'memory.forget':
          return { forgotten: store.forget(String(args.id)) };
        default:
          throw new Error(`unrouted tool ${spec.name}`);
      }
    });
  }
  return registry;
}
