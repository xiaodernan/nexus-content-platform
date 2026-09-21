import { lexicalScore } from '@nexus/ai-providers';
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

  /** Query tokens matched against each record's query+summary; refs inherit the record score. */
  recall(query: string, opts: { scope?: string; k?: number } = {}): RecallHit[] {
    const k = opts.k ?? 5;
    const scored = this.recs
      .filter((r) => opts.scope === undefined || r.scope === opts.scope)
      .map((r) => ({ r, score: lexicalScore(query, `${r.query} ${r.summary}`) }))
      .filter((s) => s.score > 0);
    const hits: RecallHit[] = scored.flatMap(({ r, score }) =>
      r.refs.map((ref) => ({ memId: r.id, path: ref.path, score, summary: r.summary })),
    );
    hits.sort((a, b) => b.score - a.score || a.memId.localeCompare(b.memId) || a.path.localeCompare(b.path));
    return hits.slice(0, k);
  }

  forget(id: string): boolean {
    const before = this.recs.length;
    this.recs = this.recs.filter((r) => r.id !== id);
    return this.recs.length !== before;
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

export function registerMemoryTools(registry: ToolRegistry, store: MemoryStore, scope = 'default'): ToolRegistry {
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
        case 'memory.recall':
          return { hits: store.recall(String(args.query), { scope, k: args.k === undefined ? 5 : Number(args.k) }) };
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
