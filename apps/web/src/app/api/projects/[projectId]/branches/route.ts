import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectWriteAccess } from '@/server/domain/team';
import { createBranch } from '@/server/domain/branches';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * 开分支。不写 fromSnapshotId 就从当前现场开（checkout -b）；写了就是从某份历史开
 * （checkout -b <name> <commit>），这种情况下离开前的现场会先存回原分支。
 * 列表不在这儿单开一个 GET：历史面板要同时画快照和分支，分两个请求只会多一处会不同步的状态。
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (!body || typeof body !== 'object') return badRequest(['请求体必须是 JSON 对象']);
  const { name, fromSnapshotId } = body as { name?: unknown; fromSnapshotId?: unknown };
  if (typeof name !== 'string' || !name.trim()) return badRequest(['缺少分支名 name']);
  if (fromSnapshotId !== undefined && fromSnapshotId !== null && typeof fromSnapshotId !== 'string') {
    return badRequest(['fromSnapshotId 必须是字符串或 null']);
  }
  try {
    const user = await requireUser();
    const writeAccess = await projectWriteAccess(projectId, user.id);
    if (writeAccess === 'not_found') return notFound();
    if (writeAccess === 'read_only') return jsonError(403, 'read_only_role', { message: '查看者（viewer）角色对这个项目只读；写入权限在 owner 与 editor 手里' });
    const result = await createBranch(projectId, {
      name,
      fromSnapshotId: typeof fromSnapshotId === 'string' ? fromSnapshotId : null,
      createdById: user.id,
    });
    if (!result.ok) return jsonError(400, 'branch_rejected', { message: result.reason });
    return NextResponse.json({ ok: true, branch: result.branch }, { status: 201 });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/branches`);
  }
}
