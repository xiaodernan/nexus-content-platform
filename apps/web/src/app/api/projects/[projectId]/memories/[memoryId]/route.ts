import { NextResponse } from 'next/server';
import { csrfOk } from '@/server/security/csrf';
import { requireUser } from '@/server/domain/session';
import { projectWriteAccess } from '@/server/domain/team';
import { deleteMemory } from '@/server/domain/memories';
import { failure, jsonError, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string; memoryId: string }>;
}

/** 删一条。归属在域层按 ownerId 过滤：别人的记忆删不掉，也确认不了它存在（默认拒绝）。 */
export async function DELETE(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId, memoryId } = await ctx.params;
  try {
    const user = await requireUser();
    const writeAccess = await projectWriteAccess(projectId, user.id);
    if (writeAccess === 'not_found') return notFound();
    if (writeAccess === 'read_only') return jsonError(403, 'read_only_role', { message: '查看者（viewer）角色对这个项目只读；写入权限在 owner 与 editor 手里' });
    const removed = await deleteMemory(memoryId, user.id);
    if (!removed) return notFound();
    return NextResponse.json({ ok: true, removed: true });
  } catch (error) {
    return failure(error, `DELETE /api/projects/${projectId}/memories/${memoryId}`);
  }
}
