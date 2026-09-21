import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { currentBranchId } from '@/server/domain/branches';
import { restoreSnapshot } from '@/server/domain/snapshots';
import { badRequest, failure, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string; snapshotId: string }>;
}

/**
 * Restore（§27）：把当前状态先存成快照，再用目标快照覆盖项目。
 * 返回恢复后的文档，客户端用它重置工作台——本地撤销栈会清空，这是如实结果而不是丢功能。
 */
export async function POST(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId, snapshotId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
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
