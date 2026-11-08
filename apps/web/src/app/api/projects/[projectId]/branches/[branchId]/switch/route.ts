import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectWriteAccess } from '@/server/domain/team';
import { switchBranch } from '@/server/domain/branches';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, failure, jsonError, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string; branchId: string }>;
}

/**
 * 切换分支（§28）：与恢复一样是"先存再切"，所以切来切去不会丢东西。
 * 返回目标分支的工作区文档，客户端用它重置工作台（本地撤销栈清空是如实结果）。
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId, branchId } = await ctx.params;
  try {
    const user = await requireUser();
    const writeAccess = await projectWriteAccess(projectId, user.id);
    if (writeAccess === 'not_found') return notFound();
    if (writeAccess === 'read_only') return jsonError(403, 'read_only_role', { message: '查看者（viewer）角色对这个项目只读；写入权限在 owner 与 editor 手里' });
    const result = await switchBranch(projectId, branchId, { createdById: user.id });
    if (!result) return badRequest(['分支不存在或还没有可切换的快照']);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/branches/${branchId}/switch`);
  }
}
