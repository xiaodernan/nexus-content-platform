import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, currentUserOrNull } from '@/server/domain/session';
import { getMarketplaceItem, updateMarketplaceItem, deleteMarketplaceItem } from '@/server/domain/marketplace';
import { MARKETPLACE_VISIBILITY } from '@/server/db/schema';
import { scanTextForRedlines } from '@/server/domain/moderation';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, failure, jsonError } from '@/server/http';

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

/**
 * PATCH 的正文：与创建入口同一份口径（eb068ec 那片）——正文过 zod，
 * priceCredits 非负+上限、tags 是字符串数组、previewAssetId 是 UUID、可见性在名单内。
 * 此前这里是裸 cast（`as { ... }`）：`priceCredits: -100` 能直写负价（与 POST 同一个洞）、
 * tags 非数组撞 TEXT[]、previewAssetId 非 UUID 在域层的 eq() 撞 22P02 变 500，
 * 而 Postgres 的报错原文还会被 catch 成 400 回给客户端（§26）。
 */
const UpdateItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  previewAssetId: z.string().uuid().optional(),
  priceCredits: z.number().int().nonnegative().max(1_000_000).optional(),
  visibility: z.enum(MARKETPLACE_VISIBILITY).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const user = await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateItemSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`));
  }

  // 内容安全：如果更新了标题/描述/标签，过发布机检同一份红线词表
  const textsToCheck = [parsed.data.title ?? '', parsed.data.description ?? '', ...(parsed.data.tags ?? [])].join(' ');

  if (textsToCheck.trim()) {
    const redlines = scanTextForRedlines(textsToCheck);
    if (redlines.length > 0) {
      return NextResponse.json({ error: 'Content contains prohibited terms', redlines }, { status: 400 });
    }
  }

  try {
    const result = await updateMarketplaceItem(id, user.id, parsed.data);
    if (!result.ok) {
      if (result.reason === 'not_found') {
        // 不存在、已下架、形状不对、别人的私有条目：同一个 404。403 会告诉陌生人"这个 id 存在"
        return jsonError(404, 'not_found', { message: '没有这个物品，或它已经下架' });
      }
      if (result.reason === 'forbidden') {
        return jsonError(403, 'forbidden', { message: '只有创作者本人能修改这个物品' });
      }
      return badRequest(['previewAssetId: 这个素材不存在']);
    }

    return NextResponse.json({ item: result.item });
  } catch (error) {
    return failure(error, 'marketplace patch');
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
    const result = await deleteMarketplaceItem(id, user.id);
    if (!result.ok) {
      // 与 PATCH 同一口径：不存在/已下架/私有别人的 → 404；可见但不是你的 → 403
      return result.reason === 'not_found'
        ? jsonError(404, 'not_found', { message: '没有这个物品，或它已经下架' })
        : jsonError(403, 'forbidden', { message: '只有创作者本人能下架这个物品' });
    }
    return NextResponse.json({ item: result.item });
  } catch (error) {
    return failure(error, 'marketplace delete');
  }
}
