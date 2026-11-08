import { NextResponse } from 'next/server';
import { listBuyerPurchases } from '@/server/domain/marketplace';
import { currentUserOrNull } from '@/server/domain/session';
import { failure, jsonError } from '@/server/http';

/**
 * §127-128 买家侧：「我买过什么」。
 *
 * 店面只显示在售 / 免费的条目，交付门按条目 id 走——买家花完点后没有第二个入口
 * 能再找到买过的东西（下架或转私密之后就更容易丢）。这条读路按购买行出发，
 * **包括已下架的条目**：记录不随软删除消失，界面按 `delistedAt` 如实说"不再交付"。
 *
 * 只看得到自己的：buyerId 来自会话，不接受查询参数（别人的购买记录不泄露）。
 */
export async function GET(): Promise<NextResponse> {
  const user = await currentUserOrNull();
  if (!user) {
    return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  }

  try {
    const purchases = await listBuyerPurchases(user.id);
    return NextResponse.json({ purchases }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, 'GET /api/marketplace/purchases');
  }
}
