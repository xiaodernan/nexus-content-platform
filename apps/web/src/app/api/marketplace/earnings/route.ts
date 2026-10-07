import { NextResponse } from 'next/server';
import { getCreatorEarnings } from '@/server/domain/marketplace';
import { requireUser } from '@/server/domain/session';
import { jsonError } from '@/server/http';

/**
 * §128 Marketplace 创作者收入明细：查分账记录与 ledger，按天聚合。
 *
 * 需要登录。可选 startDate/endDate 参数过滤时间范围。
 */
export async function GET(req: Request): Promise<NextResponse> {
  const user = await requireUser();

  const url = new URL(req.url);
  const startDateParam = url.searchParams.get('startDate');
  const endDateParam = url.searchParams.get('endDate');

  const startDate = startDateParam ? new Date(startDateParam) : undefined;
  const endDate = endDateParam ? new Date(endDateParam) : undefined;

  try {
    const earnings = await getCreatorEarnings({
      creatorId: user.id,
      startDate,
      endDate,
    });

    return NextResponse.json(earnings);
  } catch (error) {
    console.error('Failed to fetch earnings:', error);
    return jsonError(500, 'fetch_failed', { message: '获取收入明细失败，请稍后重试' });
  }
}
