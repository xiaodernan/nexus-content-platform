import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { creditLedger } from '../db/schema';
import { zeroFill, type DailyBurn } from '@/lib/burn-projection';

/**
 * 近 N 天每日 AI 点数燃烧（delta<0），UTC 日，补零后返回窗口序列。
 *
 * 只读；失败/脏数据一律返回补零的平直序列（上层 projectBurn 看 activeDays=0 → 'no-burn' 侧，
 * 页面渲染"无法判断"而不是 500——与本仓其他读侧同一条纪律）。
 *
 * 与 balances 同口径：AI 这一类是今天唯一有消耗方的 AI 燃烧口径（§133：image/compute 没有消耗方）。
 */
export async function readAiBurnHistory(userId: string, days = 30): Promise<number[]> {
  const daysSafe = Number.isInteger(days) && days > 0 ? Math.min(days, 365) : 30;
  const todayMs = Date.now();
  try {
    const since = new Date(todayMs - daysSafe * 86_400_000);
    const rows = await getDb()
      .select({
        day: sql<string>`to_char((${creditLedger.createdAt} at time zone 'utc'), 'YYYY-MM-DD')`,
        burned: sql<string>`sum(-${creditLedger.delta})::text`,
      })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.userId, userId),
          eq(creditLedger.kind, 'ai'),
          gt(creditLedger.createdAt, since),
          lt(creditLedger.delta, 0),
        ),
      )
      .groupBy(sql`to_char((${creditLedger.createdAt} at time zone 'utc'), 'YYYY-MM-DD')`)
      .orderBy(sql`to_char((${creditLedger.createdAt} at time zone 'utc'), 'YYYY-MM-DD')`);

    const parsed: DailyBurn[] = rows.map((r) => ({ day: r.day, burned: Number(r.burned) || 0 }));
    return zeroFill(parsed, daysSafe, todayMs);
  } catch {
    return zeroFill([], daysSafe, todayMs);
  }
}
