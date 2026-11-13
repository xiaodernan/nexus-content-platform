import { gte, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { agentTasks } from '../db/schema';

/**
 * AI 成本 · §COST-1 的账本读侧。
 *
 * 前一个 handler 之所以叫 usage 而不叫 cost：那个 handler 只把 provider 真报的
 * 数字原样端出去，**不知道**怎么计价。这一份反过来只干一件事：把 §COST-1 的
 * costBasis 维度——「这个金额是从哪来的」——从数据库抄进来，让人能一眼看到
 * 多少个 `configured`（按表计价）、多少个 `unknown`（没配价目表；不是 $0）、
 * 多少个 `legacy`（老账本里没有这一维）。
 *
 * 页面只读，不写、不改、不猜。金额一律 `::double precision` 出来：
 * 这台机器上 usage 里的 costUsd 是字符串（jsonb 原样），直接 sum 会被带引号拖垮。
 */

export interface CostBasisRow {
  basis: 'configured' | 'unknown' | 'legacy';
  n: number;
  sumUsd: number;
  avgUsd: number | null;
  sumTokensIn: number;
  sumCachedTokens: number | null;
  cachedSharePct: number | null;
}

export interface CostModelRow {
  provider: string;
  model: string;
  n: number;
  sumUsd: number;
  configuredRows: number;
  unknownRows: number;
}

export interface CostLedgerRead {
  windowHours: number;
  windowStart: string;
  rows: number;
  totalUsd: number;
  totalCachedTokens: number | null;
  totalTokensIn: number;
  byBasis: CostBasisRow[];
  byModel: CostModelRow[];
}

export function clampWindowHours(hours = 24): number {
  if (!Number.isFinite(hours)) return 24;
  return Math.min(Math.max(Math.trunc(hours), 1), 24 * 30);
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function readCostLedger(hours = 24): Promise<CostLedgerRead> {
  const windowHours = clampWindowHours(hours);
  const since = new Date(Date.now() - windowHours * 3_600_000);
  const db = getDb();

  const basisRows = await db
    .select({
      basis: sql<string>`coalesce(usage->>'costBasis', 'legacy')`,
      n: sql<number>`count(*)::int`,
      sumUsd: sql<number>`coalesce(sum((usage->>'costUsd')::double precision), 0)`,
      avgUsd: sql<number | null>`avg((usage->>'costUsd')::double precision)`,
      sumTokensIn: sql<number>`coalesce(sum((usage->>'tokensIn')::bigint), 0)::double precision`,
      sumCachedTokens: sql<number | null>`sum((usage->>'cachedTokens')::bigint)`,
    })
    .from(agentTasks)
    .where(gte(agentTasks.createdAt, since))
    .groupBy(sql`coalesce(usage->>'costBasis', 'legacy')`);

  const modelRows = await db
    .select({
      provider: sql<string>`coalesce(usage->>'provider', 'unknown')`,
      model: sql<string>`coalesce(usage->>'model', 'unknown')`,
      n: sql<number>`count(*)::int`,
      sumUsd: sql<number>`coalesce(sum((usage->>'costUsd')::double precision), 0)`,
      configuredRows: sql<number>`count(*) filter (where usage->>'costBasis' = 'configured')::int`,
      unknownRows: sql<number>`count(*) filter (where usage->>'costBasis' is null or usage->>'costBasis' = 'unknown')::int`,
    })
    .from(agentTasks)
    .where(gte(agentTasks.createdAt, since))
    .groupBy(sql`coalesce(usage->>'provider', 'unknown')`, sql`coalesce(usage->>'model', 'unknown')`)
    .orderBy(sql`coalesce(sum((usage->>'costUsd')::double precision), 0) desc`);

  const byBasis: CostBasisRow[] = basisRows.map((r) => {
    const sumTokensIn = num(r.sumTokensIn);
    const sumCached = r.sumCachedTokens === null ? null : num(r.sumCachedTokens);
    return {
      basis: (r.basis === 'configured' ? 'configured' : r.basis === 'legacy' ? 'legacy' : 'unknown') as CostBasisRow['basis'],
      n: num(r.n),
      sumUsd: num(r.sumUsd),
      avgUsd: r.avgUsd === null ? null : num(r.avgUsd),
      sumTokensIn,
      sumCachedTokens: sumCached,
      cachedSharePct: sumTokensIn > 0 && sumCached !== null ? Math.round((sumCached / sumTokensIn) * 100) : null,
    };
  });

  const byModel: CostModelRow[] = modelRows.map((r) => ({
    provider: String(r.provider),
    model: String(r.model),
    n: num(r.n),
    sumUsd: num(r.sumUsd),
    configuredRows: num(r.configuredRows),
    unknownRows: num(r.unknownRows),
  }));

  const rows = byBasis.reduce((acc, r) => acc + r.n, 0);
  const totalUsd = byBasis.reduce((acc, r) => acc + r.sumUsd, 0);
  const totalTokensIn = byBasis.reduce((acc, r) => acc + r.sumTokensIn, 0);
  const totalCached = byBasis.reduce((acc, r) => acc + (r.sumCachedTokens ?? 0), 0);

  return {
    windowHours,
    windowStart: since.toISOString(),
    rows,
    totalUsd,
    totalCachedTokens: rows > 0 && byBasis.some((r) => r.sumCachedTokens !== null) ? totalCached : null,
    totalTokensIn,
    byBasis: byBasis.sort((a, b) => b.n - a.n || a.basis.localeCompare(b.basis)),
    byModel,
  };
}
