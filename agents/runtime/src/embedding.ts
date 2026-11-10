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

/**
 * The SAME hybrid score, with the query's vector and tokens already in hand.
 *
 * <p>`hybridScore` re-embeds the query for every candidate it scores, and re-embeds the candidate too.
 * A caller that ranks many candidates against ONE query pays for that embedding once per candidate —
 * and a caller that already holds the candidate's stored vector pays for it again. This is the rule
 * itself, factored so that the fast path and the plain path are the SAME arithmetic: there is one
 * score, not two that drift apart.
 *
 * <p>The arithmetic is identical to {@link hybridScore}, given that `docVector` is
 * `embedTokens(docText)`: a text sharing zero query tokens scores exactly 0 (cosine noise alone never
 * ranks, §60), otherwise `0.6 * cosine + 0.4 * coverage`.
 */
export function hybridScoreFrom(
  queryVector: number[],
  queryTokens: ReadonlySet<string>,
  docVector: number[],
  docText: string,
): number {
  const dt = new Set(tokenize(docText));
  let shared = 0;
  for (const t of queryTokens) if (dt.has(t)) shared++;
  if (shared === 0) return 0;
  const coverage = queryTokens.size === 0 ? 0 : shared / queryTokens.size;
  return 0.6 * cosine(queryVector, docVector) + 0.4 * coverage;
}

/** Hybrid score used by both index queries and memory recall: embedding pull + token coverage.
 * A text sharing zero query tokens scores exactly 0 — cosine noise alone never ranks (§60). */
export function hybridScore(query: string, text: string): number {
  return hybridScoreFrom(embedTokens(query), new Set(tokenize(query)), embedTokens(text), text);
}
