import { NextResponse } from 'next/server';
import { ApiMemberRemoveRequestSchema } from '@nexus/schemas';
import { csrfOk } from '@/server/security/csrf';
import { requireUser } from '@/server/domain/session';
import { removeMember } from '@/server/domain/team';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

/** §133 teamCollaboration（#201）：移除一个协作者。owner only（team.ts 里判），移除立刻释放名额 */
export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  const parsed = ApiMemberRemoveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  try {
    const user = await requireUser();
    const removed = await removeMember(projectId, parsed.data.userId, user.id);
    if (!removed) return notFound();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/members/remove`);
  }
}
