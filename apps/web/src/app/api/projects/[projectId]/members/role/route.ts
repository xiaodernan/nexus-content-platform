import { NextResponse } from 'next/server';
import { ApiMemberRoleRequestSchema } from '@nexus/schemas';
import { csrfOk } from '@/server/security/csrf';
import { requireUser } from '@/server/domain/session';
import { changeMemberRole } from '@/server/domain/team';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

/**
 * §133 teamCollaboration：变更一个协作者的角色（editor ↔ viewer）。owner only。
 *
 * 与 invite / remove 同一条转发纪律：归属、目标是否存在都在 team.ts 里判，路由不重写。
 * `not_owner` 与项目不存在给同一个 404（不泄露存在性）；`not_member` 是另一个 404 码，
 * 因为它只会在 owner 已经过门之后发生，说清"名册上没有这个人"不泄露任何东西。
 */
export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  const parsed = ApiMemberRoleRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  try {
    const user = await requireUser();
    const result = await changeMemberRole(projectId, parsed.data.userId, user.id, parsed.data.role);
    if (result === 'not_owner') return notFound();
    if (result === 'not_member') {
      return jsonError(404, 'member_not_found', { message: '这个人不在项目名册上' });
    }
    return NextResponse.json({ ok: true, userId: parsed.data.userId, role: parsed.data.role });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/members/role`);
  }
}
