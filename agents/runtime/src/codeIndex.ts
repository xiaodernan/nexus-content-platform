import { hybridScore } from './embedding.js';

export type FileKind = 'markdown' | 'typescript' | 'json' | 'css' | 'other';

export interface FileEntry {
  path: string;
  kind: FileKind;
  lines: number;
  symbols: string[];
}

export interface IndexChunk {
  path: string;
  startLine: number; // 1-based, inclusive
  endLine: number; // inclusive
  heading?: string;
  text: string;
}

export interface CodeIndex {
  files: FileEntry[];
  chunks: IndexChunk[];
}

export interface QueryHit {
  path: string;
  startLine: number;
  heading?: string;
  score: number;
  snippet: string;
}

export function fileKind(path: string): FileKind {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') return 'typescript';
  if (ext === 'json') return 'json';
  if (ext === 'css') return 'css';
  return 'other';
}

/** Light, deterministic symbol-ish extraction — no parser deps, honest about limits. */
export function extractSymbols(kind: FileKind, content: string): string[] {
  const out: string[] = [];
  const lines = content.split('\n');
  if (kind === 'markdown') {
    for (const line of lines) {
      const m = /^#{1,4}\s+(.+)/.exec(line);
      if (m) out.push(m[1]!.trim());
    }
  } else if (kind === 'typescript') {
    for (const line of lines) {
      const m = /^\s*(?:export\s+)?(?:async\s+)?(?:function|class|const|let|interface|type|enum)\s+([A-Za-z_$][\w$]*)/.exec(line);
      if (m) out.push(m[1]!);
    }
  } else if (kind === 'json') {
    for (const line of lines) {
      const m = /^\s{2}"([^"]+)"\s*:/.exec(line);
      if (m) out.push(m[1]!);
    }
  } else if (kind === 'css') {
    for (const line of lines) {
      const m = /^([.#]?[A-Za-z][\w.-]*)\s*\{/.exec(line.trim());
      if (m) out.push(m[1]!);
    }
  }
  return out;
}

const WINDOW = 40; // lines per chunk for non-markdown files

export function chunkFile(path: string, content: string): IndexChunk[] {
  const kind = fileKind(path);
  const lines = content.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop(); // trailing newline, not a blank line
  const chunks: IndexChunk[] = [];
  if (kind === 'markdown') {
    let start = 1;
    let heading: string | undefined;
    const flush = (end: number): void => {
      const body = lines.slice(start - 1, end).join('\n');
      if (body.trim().length > 0) chunks.push({ path, startLine: start, endLine: end, heading, text: body });
    };
    for (let i = 0; i < lines.length; i++) {
      const m = /^#{1,4}\s+(.+)/.exec(lines[i]!);
      if (m && i + 1 !== start) {
        flush(i);
        start = i + 1;
        heading = m[1]!.trim();
      } else if (i + 1 === start) {
        heading = m ? m[1]!.trim() : undefined;
      }
    }
    flush(lines.length);
    return chunks;
  }
  for (let start = 1; start <= lines.length; start += WINDOW) {
    const end = Math.min(start + WINDOW - 1, lines.length);
    const body = lines.slice(start - 1, end).join('\n');
    if (body.trim().length > 0) chunks.push({ path, startLine: start, endLine: end, text: body });
  }
  return chunks;
}

/** Build a deterministic index over `path → content` snapshots (repo understanding, §63). */
export function buildIndex(files: Record<string, string>): CodeIndex {
  const entries: FileEntry[] = [];
  const chunks: IndexChunk[] = [];
  for (const path of Object.keys(files).sort()) {
    const content = files[path]!;
    const kind = fileKind(path);
    entries.push({ path, kind, lines: content.split('\n').length, symbols: extractSymbols(kind, content) });
    chunks.push(...chunkFile(path, content));
  }
  return { files: entries, chunks };
}

/**
 * Hybrid retrieval via the shared `hybridScore` seam (embedding pull + query-token coverage,
 * zero-overlap texts score 0). Fully deterministic (ADR 0010); ties break by path then line,
 * never by insertion order.
 */
export function queryIndex(index: CodeIndex, query: string, k = 5): QueryHit[] {
  const hits: QueryHit[] = index.chunks.map((c) => {
    const hay = `${c.heading ?? ''} ${c.text}`;
    const hybrid = hybridScore(query, hay);
    return { path: c.path, startLine: c.startLine, heading: c.heading, score: hybrid, snippet: c.text.replace(/\s+/g, ' ').trim().slice(0, 120) };
  });
  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.startLine - b.startLine);
  return hits.slice(0, k);
}
