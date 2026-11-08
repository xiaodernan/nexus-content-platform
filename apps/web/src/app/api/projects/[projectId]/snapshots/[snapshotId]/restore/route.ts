import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectWriteAccess } from '@/server/domain/team';
import { currentBranchId } from '@/server/domain/branches';
import { restoreSnapshot } from '@/server/domain/snapshots';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, failure, jsonError, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string; snapshotId: string }>;
}

/**
 * Restore（§27）：把当前状态先存成快照，再用目标快照覆盖项目。
 * 返回恢复后的文档，客户端用它重置工作台——本地撤销栈会清空，这是如实结果而不是丢功能。
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId, snapshotId } = await ctx.params;
  try {
    const user = await requireUser();
    const writeAccess = await projectWriteAccess(projectId, user.id);
    if (writeAccess === 'not_found') return notFound();
    if (writeAccess === 'read_only') return jsonError(403, 'read_only_role', { message: '查看者（viewer）角色对这个项目只读；写入权限在 owner 与 editor 手里' });
    const result = await restoreSnapshot(projectId, snapshotId, {
      createdById: user.id,
      branchId: await currentBranchId(projectId),
    });
    if (!result) return badRequest(['快照或项目不存在']);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/snapshots/${snapshotId}/restore`);
  }
}
