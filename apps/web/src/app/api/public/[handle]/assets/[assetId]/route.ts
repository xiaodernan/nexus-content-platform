import { NextResponse } from 'next/server';
import { openAssetForPublicPath } from '@/server/domain/assets';
import { bytesResponse, failure, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ handle: string; assetId: string }>;
}

/**
 * 已发布页面上的图片（§56/§57）。匿名访客没有会话，所以可见性只能由
 * "这条资产确实被某个 public/unlisted 发布版本引用"来判定——见 domain/assets。
 *
 * 与作者路由的区别就在这里：那条认所有权，这条认发布态。
 * 取消发布后这条 URL 立刻 404（unpublish 删行，判定不再成立）。
 */
export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { handle, assetId } = await ctx.params;
  try {
    const file = await openAssetForPublicPath(handle, assetId);
    if (!file) return notFound();
    return bytesResponse(file.bytes, file.mime, 'public, max-age=31536000, immutable');
  } catch (error) {
    return failure(error, `GET /api/public/${handle}/assets/${assetId}`);
  }
}
