import { NextResponse } from 'next/server';
import { currentUserOrNull, requireAuth } from '@/server/domain/session';
import {
  listMarketplaceItems,
  createMarketplaceItem,
  type CreateMarketplaceItemInput,
} from '@/server/domain/marketplace';
import { MARKETPLACE_ITEM_TYPES, MARKETPLACE_VISIBILITY } from '@/server/db/schema';
import { scanTextForRedlines } from '@/server/domain/moderation';

/**
 * §127-128 Marketplace 列表与创建。
 *
 * GET：列出公开物品，支持按类型/价格/创作者过滤与搜索。
 * POST：创建新物品（需要登录），标题/描述/标签过发布机检同一份红线词表。
 */

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const itemType = url.searchParams.get('itemType') as any;
  const minPrice = url.searchParams.get('minPrice');
  const maxPrice = url.searchParams.get('maxPrice');
  const creatorId = url.searchParams.get('creatorId');
  const search = url.searchParams.get('search');
  const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  // 验证 itemType
  if (itemType && !MARKETPLACE_ITEM_TYPES.includes(itemType)) {
    return NextResponse.json({ error: `Invalid item type: ${itemType}` }, { status: 400 });
  }

  const items = await listMarketplaceItems({
    itemType: itemType || undefined,
    minPrice: minPrice ? parseInt(minPrice, 10) : undefined,
    maxPrice: maxPrice ? parseInt(maxPrice, 10) : undefined,
    creatorId: creatorId || undefined,
    search: search || undefined,
    limit: Math.min(limit, 100),
    offset: Math.max(offset, 0),
  });

  return NextResponse.json({ items });
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await requireAuth();
  const body = (await req.json()) as Partial<CreateMarketplaceItemInput>;

  // 必填字段检查
  if (!body.itemType || !body.title) {
    return NextResponse.json({ error: 'itemType and title are required' }, { status: 400 });
  }

  // 验证 itemType
  if (!MARKETPLACE_ITEM_TYPES.includes(body.itemType)) {
    return NextResponse.json({ error: `Invalid item type: ${body.itemType}` }, { status: 400 });
  }

  // 验证 visibility
  if (body.visibility && !MARKETPLACE_VISIBILITY.includes(body.visibility)) {
    return NextResponse.json({ error: `Invalid visibility: ${body.visibility}` }, { status: 400 });
  }

  // 内容安全：标题、描述、标签过发布机检同一份红线词表
  const textsToCheck = [
    body.title,
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
    const item = await createMarketplaceItem({
      creatorId: user.id,
      itemType: body.itemType,
      title: body.title,
      description: body.description,
      tags: body.tags,
      previewAssetId: body.previewAssetId,
      sourceProjectId: body.sourceProjectId,
      snapshotId: body.snapshotId,
      documentId: body.documentId,
      priceCredits: body.priceCredits ?? 0,
      visibility: body.visibility ?? 'private',
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
