import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { switchBranch } from '@/server/domain/branches';
import { badRequest, failure, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string; branchId: string }>;
}

/**
 * 切换分支（§28）：与恢复一样是"先存再切"，所以切来切去不会丢东西。
 * 返回目标分支的工作区文档，客户端用它重置工作台（本地撤销栈清空是如实结果）。
 */
export async function POST(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId, branchId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const result = await switchBranch(projectId, branchId, { createdById: user.id });
    if (!result) return badRequest(['分支不存在或还没有可切换的快照']);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/branches/${branchId}/switch`);
  }
}
