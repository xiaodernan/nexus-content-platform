import { getMarketplaceItem } from '@/server/domain/marketplace';
import { openAssetForOwner } from '@/server/domain/assets';
import { bytesResponse, notFound } from '@/server/http';
import { currentUserOrNull } from '@/server/domain/session';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 市场条目的预览图。素材本体在作者（往往是私有的）项目里，画布那条取图路是
 * owner-only 的——匿名买家看不到，所以市场要有自己的公开口（与 /api/public/*
 * 同一条纪律：鉴权场景与匿名场景的可见性规则分开，不能合并）。
 *
 * 可见性：public / free 谁都能看；private 只有创作者自己。素材字节随 id 固定，
 * 但可见性跟着条目走（可以下架/转私密），所以不能用 immutable 的长缓存——
 * 一小时是"图不会变、状态可能变"的折中。
 */
export async function GET(_req: Request, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;
  const item = await getMarketplaceItem(id);
  if (!item || !item.previewAssetId) return notFound();

  if (item.visibility !== 'public' && item.visibility !== 'free') {
    const user = await currentUserOrNull();
    if (!user || user.id !== item.creatorId) return notFound();
  }

  // 用创作者的身份打开素材：能上架这条目，就说明素材是他名下项目的（domain 在创建时验过）
  const file = await openAssetForOwner(item.previewAssetId, item.creatorId);
  if (!file) return notFound();
  return bytesResponse(file.bytes, file.mime, 'public, max-age=3600');
}
