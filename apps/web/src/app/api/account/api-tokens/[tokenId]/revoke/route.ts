import { NextResponse } from 'next/server';
import { revokeApiToken } from '@/server/domain/api-tokens';
import { requireUser } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { failure, jsonError, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ tokenId: string }>;
}

/**
 * §188：吊销一枚凭据。幂等——第二次点同样返回 200，但带一句"这一次没有改变什么"，
 * 因为那行本来就是吊销状态。不说谎成"刚刚吊销成功"，也不把它当错误。
 *
 * 只按 (tokenId, 当前会话这个人) 两个条件找行：别人的 token id 在这里就是 404，
 * 而不是"存在但不给你吊销"。
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { tokenId } = await ctx.params;
  try {
    const user = await requireUser();
    const result = await revokeApiToken(tokenId, user.id);
    if (!result.ok) return notFound();
    return NextResponse.json({ record: result.record, ...(result.note ? { note: result.note } : {}) }, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return failure(error, 'POST /api/account/api-tokens/[tokenId]/revoke');
  }
}
