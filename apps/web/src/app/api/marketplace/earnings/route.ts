import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { marketplaceSplits } from '@/server/db/schema';
import { currentUserOrNull } from '@/server/domain/session';
import { NextResponse } from 'next/server';

interface DailyEarnings {
  date: string;
  totalAmount: number;
  salesCount: number;
}

interface CreatorEarningsSummary {
  totalEarned: number;
  totalSales: number;
  dailyBreakdown: DailyEarnings[];
}

export async function GET() {
  const user = await currentUserOrNull();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  // 获取该创作者的所有分成记录
  const splits = await db
    .select({
      amount: marketplaceSplits.amount,
      splitAt: marketplaceSplits.splitAt,
    })
    .from(marketplaceSplits)
    .where(eq(marketplaceSplits.creatorId, user.id))
    .orderBy(desc(marketplaceSplits.splitAt));

  // 按日期聚合
  const dailyMap = new Map<string, DailyEarnings>();
  let totalEarned = 0;
  let totalSales = 0;

  for (const split of splits) {
    const date = split.splitAt.toISOString().slice(0, 10); // YYYY-MM-DD
    const existing = dailyMap.get(date) || { date, totalAmount: 0, salesCount: 0 };
    existing.totalAmount += split.amount;
    existing.salesCount += 1;
    dailyMap.set(date, existing);

    totalEarned += split.amount;
    totalSales += 1;
  }

  // 转为数组并按日期降序排列
  const dailyBreakdown = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date));

  const summary: CreatorEarningsSummary = {
    totalEarned,
    totalSales,
    dailyBreakdown,
  };

  return NextResponse.json(summary);
}
