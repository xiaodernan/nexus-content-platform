import { NextResponse } from 'next/server';
import { csrfOk } from '@/server/security/csrf';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { addAnnotation, listAnnotations } from '@/server/domain/annotations';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §111 画布批注：点击元素 → 写一条评论。
 *
 * POST 只收 nodeId 与正文：批注挂在哪个页面、那个节点叫什么，由服务端在文档里查出来，
 * 客户端传来的 pageId 一律不信（和 §68 那套"现场由服务端回答"是同一条纪律）。
 */
export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectVisibleTo(projectId, user.id))) return notFound();
    return NextResponse.json({ ok: true, items: await listAnnotations(projectId) });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/annotations`);
  }
}

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (!body || typeof body !== 'object') return badRequest(['请求体必须是 JSON 对象']);
  const { nodeId, text } = body as { nodeId?: unknown; text?: unknown };
  if (typeof nodeId !== 'string' || !nodeId) return badRequest(['nodeId 必填：批注要钉在某个元素上']);
  if (typeof text !== 'string') return badRequest(['text 必须是字符串']);
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const result = await addAnnotation(user.id, projectId, nodeId, text);
    if (!result.ok) return badRequest([result.reason]);
    return NextResponse.json({ ok: true, annotation: result.annotation });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/annotations`);
  }
}
