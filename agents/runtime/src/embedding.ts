import { cosine, EMBED_DIM, hashEmbed } from '@nexus/ai-providers';

/**
 * Shared token-bag embedding seam (v6): the bag-of-tokens hash embedding that made
 * `fs.index` ranking meaningful (ADR 0016 am. 1) now also serves memory recall, so both
 * retrieval surfaces score the same deterministic way — no neural model implied (§60).
 */
export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
}

/** L2-normalised mean of per-token hash embeddings; shared tokens genuinely raise the cosine. */
export function embedTokens(text: string): number[] {
  const tokens = tokenize(text);
  const v = new Array<number>(EMBED_DIM).fill(0);
  for (const t of tokens.length > 0 ? tokens : [text]) {
    const e = hashEmbed(t);
    for (let i = 0; i < EMBED_DIM; i++) v[i]! += e[i]!;
  }
  const m = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / m);
}

/** Hybrid score used by both index queries and memory recall: embedding pull + token coverage.
 * A text sharing zero query tokens scores exactly 0 — cosine noise alone never ranks (§60). */
export function hybridScore(query: string, text: string): number {
  const qv = embedTokens(query);
  const qt = new Set(tokenize(query));
  const dt = new Set(tokenize(text));
  let shared = 0;
  for (const t of qt) if (dt.has(t)) shared++;
  if (shared === 0) return 0;
  const coverage = qt.size === 0 ? 0 : shared / qt.size;
  return 0.6 * cosine(qv, embedTokens(text)) + 0.4 * coverage;
}
