import { hashString, mulberry32 } from '../prng.js';

/** Stable hash embedding: same text → same vector, so RAG plumbing is real & testable (ADR 0010). */
export const EMBED_DIM = 64;

export function hashEmbed(text: string, dim = EMBED_DIM): number[] {
  const rng = mulberry32(hashString(text));
  const v = new Array<number>(dim);
  for (let i = 0; i < dim; i++) v[i] = rng() * 2 - 1;
  return normalize(v);
}

function normalize(v: number[]): number[] {
  const m = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / m);
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

/** Lexical overlap (Jaccard on lowercased tokens) — deterministic reranker stand-in. */
export function lexicalScore(query: string, doc: string): number {
  const q = new Set(tokenize(query));
  const d = new Set(tokenize(doc));
  if (q.size === 0 || d.size === 0) return 0;
  let inter = 0;
  for (const t of q) if (d.has(t)) inter++;
  const union = new Set([...q, ...d]).size;
  return inter / union;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 2);
}
