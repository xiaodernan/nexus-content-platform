import type { MemoryRecord, MemoryStore } from './memory.js';
import type { FsLike } from './realfs.js';
import { collectTextFiles } from './realfs.js';
import type { ToolRegistry } from './registry.js';
import type { ToolSpec } from './types.js';

/**
 * M2 v3 durability: cross-process persistence for §26 memory and the first allowlisted
 * real-disk tools. All host I/O flows through the injected fs adapter (the package imports
 * no node:fs), and disk access is jailed to one explicit root — everything else stays §60-honest
 * demo machinery behind the checkpoint gate (§28/ADR 0013).
 */
export interface FsWriteLike extends FsLike {
  mkdirSync(dir: string, options?: { recursive?: boolean }): unknown;
  writeFileSync(file: string, data: string, encoding: 'utf8'): void;
}

export const MEMORY_SCHEMA_VERSION = 1;

export function serializeMemory(store: MemoryStore): string {
  return JSON.stringify({ schemaVersion: MEMORY_SCHEMA_VERSION, records: store.list() }, null, 2);
}

export type LoadResult = { ok: true; records: MemoryRecord[] } | { ok: false; reason: string };

export function deserializeMemory(json: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'not valid JSON' };
  }
  const obj = raw as { schemaVersion?: unknown; records?: unknown };
  if (obj.schemaVersion !== MEMORY_SCHEMA_VERSION) {
    return { ok: false, reason: `unsupported schemaVersion ${String(obj.schemaVersion)}` };
  }
  if (!Array.isArray(obj.records)) return { ok: false, reason: 'records must be an array' };
  const records: MemoryRecord[] = [];
  for (const r of obj.records) {
    const rec = r as Partial<MemoryRecord>;
    const bad =
      typeof rec.id !== 'string' ||
      typeof rec.scope !== 'string' ||
      typeof rec.runId !== 'string' ||
      typeof rec.query !== 'string' ||
      typeof rec.summary !== 'string' ||
      !Array.isArray(rec.refs) ||
      rec.refs.some((f) => typeof f.path !== 'string' || (f.startLine !== undefined && typeof f.startLine !== 'number'));
    if (bad) return { ok: false, reason: 'malformed record' };
    records.push(rec as MemoryRecord);
  }
  return { ok: true, records };
}

export function saveMemory(store: MemoryStore, fsLike: FsWriteLike, file: string): void {
  const dir = file.slice(0, file.lastIndexOf('/'));
  if (dir) fsLike.mkdirSync(dir, { recursive: true });
  fsLike.writeFileSync(file, serializeMemory(store), 'utf8');
}

export function loadMemoryStore(store: MemoryStore, fsLike: FsLike, file: string): LoadResult {
  let json: string;
  try {
    json = fsLike.readFileSync(file, 'utf8');
  } catch {
    return { ok: false, reason: `no such file: ${file}` };
  }
  const parsed = deserializeMemory(json);
  if (parsed.ok) for (const rec of parsed.records) store.restore(rec);
  return parsed;
}

/** Normalize and jail a relative path: no absolutes, no `..`, backslashes folded. */
export function guardedJoin(root: string, rel: string): { root: string; path: string } {
  const relNorm = rel.replace(/\\/g, '/');
  if (relNorm.startsWith('/') || /^[A-Za-z]:/.test(relNorm)) throw new Error('absolute paths are not allowed');
  const parts = relNorm.split('/').filter((p) => p.length > 0 && p !== '.');
  if (parts.some((p) => p === '..')) throw new Error('path escapes the allowed root');
  const base = root.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  return { root: base, path: [base, ...parts].join('/') };
}

export interface DiskToolOptions {
  root: string;
  fsLike: FsWriteLike;
  extensions?: RegExp;
  maxFiles?: number;
}

export const DISK_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'disk.read',
    description: 'Read a file from the allowed disk root (relative path).',
    permissions: ['read'],
    args: [{ name: 'path', type: 'string', required: true }],
  },
  {
    name: 'disk.write',
    description: 'Write a file under the allowed disk root (relative path). Host checkpoint required.',
    permissions: ['write'],
    args: [
      { name: 'path', type: 'string', required: true },
      { name: 'content', type: 'string', required: true },
    ],
  },
  {
    name: 'disk.list',
    description: 'List ingestible files under the allowed disk root.',
    permissions: ['read'],
    args: [{ name: 'prefix', type: 'string' }],
  },
];

export function registerDiskTools(registry: ToolRegistry, opts: DiskToolOptions): ToolRegistry {
  for (const spec of DISK_TOOL_SPECS) {
    registry.register(spec, (args) => {
      switch (spec.name) {
        case 'disk.read': {
          const loc = guardedJoin(opts.root, String(args.path));
          return { content: opts.fsLike.readFileSync(loc.path, 'utf8') };
        }
        case 'disk.write': {
          const loc = guardedJoin(opts.root, String(args.path));
          const dir = loc.path.slice(0, loc.path.lastIndexOf('/'));
          if (dir && dir !== loc.root) opts.fsLike.mkdirSync(dir, { recursive: true });
          opts.fsLike.writeFileSync(loc.path, String(args.content), 'utf8');
          return { path: loc.path.slice(loc.root.length + 1), bytes: String(args.content).length };
        }
        case 'disk.list': {
          const files = collectTextFiles(opts.root, opts.fsLike, {
            extensions: opts.extensions ?? /.*/,
            maxFiles: opts.maxFiles ?? 2000,
          });
          const prefix = String(args.prefix ?? '');
          return { paths: Object.keys(files).filter((p) => p.startsWith(prefix)) };
        }
        default:
          throw new Error(`unrouted tool ${spec.name}`);
      }
    });
  }
  return registry;
}
