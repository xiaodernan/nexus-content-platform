import { NextResponse } from 'next/server';
import { ApiMemberInviteRequestSchema } from '@nexus/schemas';
import { csrfOk } from '@/server/security/csrf';
import { requireUser } from '@/server/domain/session';
import { inviteMember } from '@/server/domain/team';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

/**
 * §133 teamCollaboration（#201）：拉一个人进项目。
 *
 * 转发的全是 team.ts 的 inviteMember——归属（owner only）、名额门（#201）、
 * 同邮箱 pending 去重都在那一份里，路由不重写第二遍（§74 那条教训的通用形式）。
 * 被拒只给 reason：调用方能做的只有改邮箱、撤旧邀请，或升级档位。
 */
export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  const parsed = ApiMemberInviteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  try {
    const user = await requireUser();
    const result = await inviteMember(projectId, user.id, parsed.data);
    if (!result.ok) {
      // 项目不在名下与项目不存在给同一个 404 口径的答案，不泄露存在性（与 characters 路由一致）
      return (result.reason ?? '').includes('不在你名下')
        ? notFound()
        : jsonError(400, 'invite_rejected', { message: result.reason });
    }
    // token 只在创建这一下随响应回去：roster 永远不给它，撤回再邀才有新的一枚
    return NextResponse.json({ ok: true, invite: result.invite, token: result.token }, { status: 201 });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/members/invite`);
  }
}
