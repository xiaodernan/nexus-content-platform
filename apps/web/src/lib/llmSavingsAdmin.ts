/**
 * v702「AI 节省总账」纯函数（/admin/savings 页面用；可单测）。
 * 复用 v699 SavingsCard 的口径：tokensIn ≈ prompt_tokens 含缓存部分；
 * 命中率 = cached / tin ∈ [0, 1]；tin = 0 → null（渲染 '—'，不写 0%）。
 */

/** 单行命中率；tin ≤ 0 → null。cached 超限收敛到 1。 */
export function hitRate(tokensIn: number, cachedTokens: number): number | null {
  if (!Number.isFinite(tokensIn) || tokensIn <= 0) return null;
  const cached = Number.isFinite(cachedTokens) ? Math.max(0, cachedTokens) : 0;
  return Math.min(1, cached / tokensIn);
}

export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

/** 加权命中率（全表合计）；tin ≤ 0 → null。 */
export function weightedHitRate(rows: readonly { tokensIn: number; cachedTokens: number }[]): number | null {
  const totalIn = rows.reduce((a, r) => a + (Number.isFinite(r.tokensIn) ? Math.max(0, r.tokensIn) : 0), 0);
  const totalCached = rows.reduce((a, r) => a + (Number.isFinite(r.cachedTokens) ? Math.max(0, r.cachedTokens) : 0), 0);
  return hitRate(totalIn, totalCached);
}

/** 万级 token 的紧凑展示（中英字形都安全）。 */
export function formatTokensCompact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const safe = Math.max(0, n);
  if (safe < 10_000) return String(Math.round(safe));
  if (safe < 100_000_000) {
    const wan = safe / 10_000;
    return `${wan >= 100 ? wan.toFixed(0) : wan.toFixed(1)} 万`;
  }
  return `${(safe / 100_000_000).toFixed(2)} 亿`;
}
