import { NextResponse } from 'next/server';
import { csrfOk } from '@/server/security/csrf';
import { requireUser } from '@/server/domain/session';
import { acceptInvite } from '@/server/domain/team';
import { failure, jsonError } from '@/server/http';

/**
 * §133 teamCollaboration（#201）：兑现一枚邀请。
 *
 * 按**当前登录用户**接受：token 证明"这枚邀请是真的"，用户的邮箱证明"这封是发给我的"
 * （team.ts 里校）。两者缺一不可——只靠 token 的话，链接被转交到谁手里都能进项目。
 * 本机没有发信，链接由邀请人自己转交；但"谁的邮箱"这一格在库里拦着，不靠猜不到当防线。
 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { token } = await ctx.params;
  try {
    const user = await requireUser();
    const result = await acceptInvite(token, user.id);
    if (!result.ok) return jsonError(400, 'invite_not_acceptable', { message: result.reason });
    return NextResponse.json({ ok: true, projectId: result.projectId });
  } catch (error) {
    return failure(error, `POST /api/projects/invites/${token}/accept`);
  }
}
