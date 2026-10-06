import { NextResponse } from 'next/server';
import { incrementDownloadCount, getMarketplaceItem } from '@/server/domain/marketplace';

/**
 * §127-128 Marketplace 下载追踪。
 *
 * POST：增加下载次数并返回当前计数。
 * 不要求登录（公开物品谁都能下），但会检查物品是否存在且未下架。
 */

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const item = await getMarketplaceItem(id);

  if (!item) {
    return NextResponse.json({ error: 'Item not found or has been removed' }, { status: 404 });
  }

  // 只允许公开或免费的物品被下载
  if (item.visibility !== 'public' && item.visibility !== 'free') {
    return NextResponse.json({ error: 'This item is not available for download' }, { status: 403 });
  }

  const newCount = await incrementDownloadCount(id);

  return NextResponse.json({ downloadCount: newCount });
}
