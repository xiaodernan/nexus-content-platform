import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectVisibleTo } from '@/server/domain/team';
import { readSnapshot } from '@/server/domain/snapshots';
import { failure, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string; snapshotId: string }>;
}

/** Compare（§27）：取某一份快照的完整文档，与当前文档并排比较 */
export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId, snapshotId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectVisibleTo(projectId, user.id))) return notFound();
    const snapshot = await readSnapshot(projectId, snapshotId);
    if (!snapshot) return notFound();
    return NextResponse.json({ snapshot });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/snapshots/${snapshotId}`);
  }
}
