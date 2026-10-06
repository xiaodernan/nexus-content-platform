import { NextResponse } from 'next/server';
import { requireAuth } from '@/server/domain/session';
import { getMarketplaceItem, updateMarketplaceItem, deleteMarketplaceItem } from '@/server/domain/marketplace';
import { MARKETPLACE_VISIBILITY } from '@/server/db/schema';
import { scanTextForRedlines } from '@/server/domain/moderation';

/**
 * §127-128 Marketplace 单个物品的查询、更新与删除。
 *
 * GET：获取物品详情（包括已下架的，用于收藏者查看原因）。
 * PATCH：更新物品元数据（仅创作者可操作），标题/描述/标签过发布机检。
 * DELETE：软删除物品（仅创作者可操作）。
 */

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const item = await getMarketplaceItem(params.id);

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const user = await requireAuth();
  const body = (await req.json()) as any;

  // 验证 visibility
  if (body.visibility && !MARKETPLACE_VISIBILITY.includes(body.visibility)) {
    return NextResponse.json({ error: `Invalid visibility: ${body.visibility}` }, { status: 400 });
  }

  // 内容安全：如果更新了标题/描述/标签，过发布机检同一份红线词表
  const textsToCheck = [
    body.title ?? '',
    body.description ?? '',
    ...(body.tags ?? []),
  ].join(' ');

  if (textsToCheck.trim()) {
    const redlines = await scanTextForRedlines(textsToCheck);
    if (redlines.length > 0) {
      return NextResponse.json(
        { error: 'Content contains prohibited terms', redlines },
        { status: 400 },
      );
    }
  }

  try {
    const updated = await updateMarketplaceItem(params.id, user.id, {
      title: body.title,
      description: body.description,
      tags: body.tags,
      previewAssetId: body.previewAssetId,
      priceCredits: body.priceCredits,
      visibility: body.visibility,
    });

    return NextResponse.json({ item: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const user = await requireAuth();

  try {
    const deleted = await deleteMarketplaceItem(params.id, user.id);
    return NextResponse.json({ item: deleted });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
