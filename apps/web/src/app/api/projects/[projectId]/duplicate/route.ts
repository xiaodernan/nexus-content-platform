import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { duplicateProject } from '@/server/domain/branches';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * Duplicate（§27）：整份项目复制成一个新项目，而不是同项目里的另一条分支。
 * 什么时候用哪个：想在同一份历史里并排比较几个方向 → 分支；
 * 要拿去单独发布、分享或改造 → 副本。
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (body !== null && body !== undefined && (typeof body !== 'object' || Array.isArray(body))) {
    return badRequest(['请求体必须是 JSON 对象']);
  }
  const { name } = (body ?? {}) as { name?: unknown };
  if (name !== undefined && name !== null && typeof name !== 'string') {
    return badRequest(['name 必须是字符串']);
  }
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const document = await duplicateProject(user.id, projectId, typeof name === 'string' ? name : null);
    if (!document) return notFound();
    return NextResponse.json({ projectId: document.id, document }, { status: 201 });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/duplicate`);
  }
}
