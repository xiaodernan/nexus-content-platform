import { buildIndex, queryIndex } from './codeIndex.js';
import type { ToolRegistry } from './registry.js';
import type { ToolSpec } from './types.js';

export interface SearchHit {
  path: string;
  line: number; // 1-based
  snippet: string;
}

/**
 * Hermetic in-memory file workspace (§27 read_file/write_file/search_code without a
 * real filesystem). Paths are plain `dir/file.ext` keys; no traversal, no host fs.
 */
export class InMemoryWorkspace {
  private files = new Map<string, string>();

  constructor(seed: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(seed)) this.files.set(path, content);
  }

  list(prefix = ''): string[] {
    return [...this.files.keys()].filter((p) => p.startsWith(prefix)).sort();
  }

  has(path: string): boolean {
    return this.files.has(path);
  }

  read(path: string): string {
    const v = this.files.get(path);
    if (v === undefined) throw new Error(`no such file: ${path}`);
    return v;
  }

  write(path: string, content: string): void {
    this.files.set(path, content);
  }

  append(path: string, text: string): void {
    this.write(path, `${this.read(path)}\n${text}`);
  }

  search(term: string): SearchHit[] {
    const needle = term.toLowerCase();
    const hits: SearchHit[] = [];
    for (const path of this.list()) {
      const lines = this.read(path).split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.toLowerCase().includes(needle)) hits.push({ path, line: i + 1, snippet: line.trim() });
      }
    }
    return hits;
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.list().map((p) => [p, this.read(p)]));
  }
}

export const WORKSPACE_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'fs.list',
    description: 'List workspace file paths, optionally filtered by prefix.',
    permissions: ['read'],
    args: [{ name: 'prefix', type: 'string' }],
  },
  {
    name: 'fs.read',
    description: 'Read a whole file from the workspace.',
    permissions: ['read'],
    args: [{ name: 'path', type: 'string', required: true }],
  },
  {
    name: 'fs.search',
    description: 'Case-insensitive line search across all files.',
    permissions: ['read'],
    args: [{ name: 'term', type: 'string', required: true }],
  },
  {
    name: 'fs.index',
    description: 'Hybrid code-index query over the workspace (chunk-level top hits).',
    permissions: ['read'],
    args: [
      { name: 'query', type: 'string', required: true },
      { name: 'topK', type: 'number' },
    ],
  },
  {
    name: 'fs.write',
    description: 'Create or overwrite a file.',
    permissions: ['write'],
    args: [
      { name: 'path', type: 'string', required: true },
      { name: 'content', type: 'string', required: true },
    ],
  },
  {
    name: 'fs.append',
    description: 'Append a line block to an existing file.',
    permissions: ['write'],
    args: [
      { name: 'path', type: 'string', required: true },
      { name: 'text', type: 'string', required: true },
    ],
  },
];

export function registerWorkspaceTools(registry: ToolRegistry, ws: InMemoryWorkspace): ToolRegistry {
  for (const spec of WORKSPACE_TOOL_SPECS) {
    registry.register(spec, (args) => {
      switch (spec.name) {
        case 'fs.list':
          return ws.list(String(args.prefix ?? ''));
        case 'fs.read':
          return { content: ws.read(String(args.path)) };
        case 'fs.search':
          return { hits: ws.search(String(args.term)) };
        case 'fs.index':
          return { hits: queryIndex(buildIndex(ws.snapshot()), String(args.query), args.topK === undefined ? 5 : Number(args.topK)) };
        case 'fs.write':
          ws.write(String(args.path), String(args.content));
          return { path: String(args.path), bytes: String(args.content).length };
        case 'fs.append':
          ws.append(String(args.path), String(args.text));
          return { path: String(args.path) };
        default:
          throw new Error(`unrouted tool ${spec.name}`);
      }
    });
  }
  return registry;
}
