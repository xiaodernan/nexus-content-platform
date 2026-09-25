import { NextResponse } from 'next/server';
import { listPendingApprovals } from '@/server/domain/agent-tasks';
import { requireUser } from '@/server/domain/session';
import { failure, jsonError } from '@/server/http';

/**
 * 这个项目里还等人裁决的 AI 结果（§74）。Studio 挂载时读一次，把审批卡片找回来。
 *
 * 读侧不需要 CSRF，也不需要限流到很小：它返回的是**这个人自己项目里**的行，
 * 而且不含被扣下的补丁内容——真正需要门槛的是那一条 POST。
 */
export async function GET(req: Request): Promise<NextResponse> {
  const projectId = new URL(req.url).searchParams.get('projectId');
  if (!projectId) return jsonError(400, 'project_required', { message: '要带 projectId' });
  try {
    const user = await requireUser();
    const pending = await listPendingApprovals(projectId, user.id);
    return NextResponse.json({ pending }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, 'GET /api/ai/pending-approvals');
  }
}
