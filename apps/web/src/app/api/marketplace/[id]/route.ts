import { NextResponse } from 'next/server';
import { requireUser, currentUserOrNull } from '@/server/domain/session';
import { getMarketplaceItem, updateMarketplaceItem, deleteMarketplaceItem } from '@/server/domain/marketplace';
import { MARKETPLACE_VISIBILITY } from '@/server/db/schema';
import { scanTextForRedlines } from '@/server/domain/moderation';
import { csrfOk } from '@/server/security/csrf';
import { jsonError } from '@/server/http';

/**
 * §127-128 Marketplace 单个物品的查询、更新与删除。
 *
 * GET：获取物品详情（包括已下架的，用于收藏者查看原因）。
 * PATCH：更新物品元数据（仅创作者可操作 + CSRF 门），标题/描述/标签过发布机检。
 * DELETE：软删除物品（仅创作者可操作 + CSRF 门）。
 */

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const item = await getMarketplaceItem(id);

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  // 私有草稿只有创作者本人能看：与预览路由同一口径（[id]/preview 对 private 只放创作者）。
  // 详情里带着 sourceProjectId / documentId 这些内部 id，不该随一个 UUID 外泄
  if (item.visibility === 'private') {
    const viewer = await currentUserOrNull();
    if (!viewer || viewer.id !== item.creatorId) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
  }

  return NextResponse.json({ item }, { headers: { 'cache-control': 'no-store' } });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const user = await requireUser();
  const { id } = await params;
  const body = (await req.json()) as {
    title?: string;
    description?: string;
    tags?: string[];
    previewAssetId?: string;
    priceCredits?: number;
    visibility?: 'public' | 'free' | 'private';
  };

  if (body.visibility && !MARKETPLACE_VISIBILITY.includes(body.visibility)) {
    return NextResponse.json({ error: `Invalid visibility: ${body.visibility}` }, { status: 400 });
  }

  // 内容安全：如果更新了标题/描述/标签，过发布机检同一份红线词表
  const textsToCheck = [body.title ?? '', body.description ?? '', ...(body.tags ?? [])].join(' ');

  if (textsToCheck.trim()) {
    const redlines = scanTextForRedlines(textsToCheck);
    if (redlines.length > 0) {
      return NextResponse.json({ error: 'Content contains prohibited terms', redlines }, { status: 400 });
    }
  }

  try {
    const updated = await updateMarketplaceItem(id, user.id, {
      title: body.title,
      description: body.description,
      tags: body.tags,
      previewAssetId: body.previewAssetId,
      priceCredits: body.priceCredits,
      visibility: body.visibility,
    });

    return NextResponse.json({ item: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '更新失败' }, { status: 400 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const user = await requireUser();
  const { id } = await params;

  try {
    const deleted = await deleteMarketplaceItem(id, user.id);
    return NextResponse.json({ item: deleted });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '删除失败' }, { status: 400 });
  }
}
