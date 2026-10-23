import { NextResponse } from 'next/server';
import { csrfOk } from '@/server/security/csrf';
import { requireUser } from '@/server/domain/session';
import { revokeInvite } from '@/server/domain/team';
import { failure, jsonError, notFound } from '@/server/http';

/**
 * §133 teamCollaboration（#201）：撤回一封邀请。owner only；已 accepted / 已 revoked
 * 的如实 404——没有新事情发生就不报成功（与 unpublishProject 同一口径）。
 * 撤回立刻释放名额：邀请没兑现也占位，收回就不占。
 */
export async function POST(req: Request, ctx: { params: Promise<{ projectId: string; inviteId: string }> }): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId, inviteId } = await ctx.params;
  try {
    const user = await requireUser();
    const revoked = await revokeInvite(projectId, inviteId, user.id);
    if (!revoked) return notFound();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/invites/${inviteId}/revoke`);
  }
}
