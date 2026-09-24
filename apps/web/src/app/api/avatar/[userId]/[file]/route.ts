import { NextResponse } from 'next/server';
import { openAvatar } from '@/server/domain/avatar';
import { bytesResponse, notFound } from '@/server/http';

/**
 * §60 头像的公开读入口。
 *
 * 头像本来就是给所有人看的（它出现在 `/u/<handle>` 上），所以这一支不认会话。
 * 但它也**不拿 URL 里的任何一段去拼存储 key**：key 只由服务端按"这个用户行里存着哪张图"算出来，
 * 文件名对不上就 404。于是 `/api/avatar/<别人的 id>/..%2f..` 这类请求既逃不出目录也读不到别人的字节，
 * 而 id 不是 uuid 时连查询都不会发（Postgres 会对非 uuid 直接报错）。
 */
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ userId: string; file: string }>;
}

export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { userId, file } = await ctx.params;
  if (!UUID.test(userId)) return notFound();
  const found = await openAvatar(userId, decodeURIComponent(file));
  if (!found) return notFound();
  // 私有素材要 private，头像本来就是给所有人看的；nosniff 与 CSP 由同一个 helper 带上
  return bytesResponse(found.bytes, found.contentType, 'public, max-age=31536000, immutable');
}
