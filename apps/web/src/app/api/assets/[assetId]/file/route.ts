import { NextResponse } from 'next/server';
import { openAssetForOwner } from '@/server/domain/assets';
import { requireUser } from '@/server/domain/session';
import { bytesResponse, failure, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ assetId: string }>;
}

/**
 * 画布 / 预览取图（§38）。Studio 与 Preview 是鉴权场景，所以走这条路由；
 * 已发布站点是匿名场景，走 /api/public/... ——两条路的可见性规则不同，不能合并。
 *
 * 缓存：URL 里带资产 id，字节随 id 固定（换图是新 id），因此可以 immutable；
 * 但这是私有内容，必须 `private`，否则共享缓存会把作者素材吐给别人。
 */
export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { assetId } = await ctx.params;
  try {
    const user = await requireUser();
    const file = await openAssetForOwner(assetId, user.id);
    if (!file) return notFound();
    return bytesResponse(file.bytes, file.mime, 'private, max-age=31536000, immutable');
  } catch (error) {
    return failure(error, `GET /api/assets/${assetId}/file`);
  }
}
