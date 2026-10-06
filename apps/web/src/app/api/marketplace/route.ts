import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import {
  listMarketplaceItems,
  createMarketplaceItem,
  type CreateMarketplaceItemInput,
} from '@/server/domain/marketplace';
import { MARKETPLACE_ITEM_TYPES, MARKETPLACE_VISIBILITY, type MarketplaceItemType } from '@/server/db/schema';
import { scanTextForRedlines } from '@/server/domain/moderation';
import { csrfOk } from '@/server/security/csrf';
import { jsonError } from '@/server/http';

/**
 * §127-128 Marketplace 列表与创建。
 *
 * GET：列出公开物品，支持按类型/价格/创作者过滤与搜索。
 * POST：创建新物品（需要登录 + CSRF 门），标题/描述/标签过发布机检同一份红线词表。
 */

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const itemType = url.searchParams.get('itemType');
  const minPrice = url.searchParams.get('minPrice');
  const maxPrice = url.searchParams.get('maxPrice');
  const creatorId = url.searchParams.get('creatorId');
  const search = url.searchParams.get('search');
  const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  if (itemType && !(MARKETPLACE_ITEM_TYPES as readonly string[]).includes(itemType)) {
    return NextResponse.json({ error: `Invalid item type: ${itemType}` }, { status: 400 });
  }

  const items = await listMarketplaceItems({
    itemType: (itemType as MarketplaceItemType) || undefined,
    minPrice: minPrice ? parseInt(minPrice, 10) : undefined,
    maxPrice: maxPrice ? parseInt(maxPrice, 10) : undefined,
    creatorId: creatorId || undefined,
    search: search || undefined,
    limit: Math.min(limit, 100),
    offset: Math.max(offset, 0),
  });

  return NextResponse.json({ items }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const user = await requireUser();
  const body = (await req.json()) as Partial<CreateMarketplaceItemInput>;

  if (!body.itemType || !body.title) {
    return NextResponse.json({ error: 'itemType and title are required' }, { status: 400 });
  }

  if (!MARKETPLACE_ITEM_TYPES.includes(body.itemType)) {
    return NextResponse.json({ error: `Invalid item type: ${body.itemType}` }, { status: 400 });
  }

  if (body.visibility && !MARKETPLACE_VISIBILITY.includes(body.visibility)) {
    return NextResponse.json({ error: `Invalid visibility: ${body.visibility}` }, { status: 400 });
  }

  // 内容安全：标题、描述、标签过发布机检同一份红线词表
  const textsToCheck = [body.title, body.description ?? '', ...(body.tags ?? [])].join(' ');

  if (textsToCheck.trim()) {
    const redlines = scanTextForRedlines(textsToCheck);
    if (redlines.length > 0) {
      return NextResponse.json({ error: 'Content contains prohibited terms', redlines }, { status: 400 });
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
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '创建失败' }, { status: 400 });
  }
}
