import { NextResponse } from 'next/server';
import { csrfOk } from '@/server/security/csrf';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { loadStoryboard, saveStoryboard } from '@/server/domain/storyboards';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §40-42 分镜的读写入口。GET 不写库：没有分镜就返回 null，
 * 由面板上的「切一版分镜」明确发起一次 PUT——"还没有"和"有一份空的"是两件事，
 * 而 GET 顺手建数据会让每次刷新都可能在库里留痕。
 *
 * 顺带把 `updatedAt` 给出去：客户端下一次 PUT 要拿它当并发基准（baseUpdatedAt），
 * 否则两个标签页各改各的，后到的那个会把先到的整份盖掉。
 */

export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const result = await loadStoryboard(projectId);
    if (result && !result.ok) return jsonError(500, 'storyboard_unreadable', { message: result.reason });
    return NextResponse.json({ ok: true, storyboard: result?.document ?? null, updatedAt: result?.updatedAt ?? null });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/storyboard`);
  }
}

export async function PUT(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (!body || typeof body !== 'object') return badRequest(['请求体必须是 JSON 对象']);
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const result = await saveStoryboard(projectId, user.id, body);
    if (!result.ok) return jsonError(400, 'storyboard_rejected', { message: result.reason });
    return NextResponse.json({ ok: true, storyboard: result.document, updatedAt: result.updatedAt });
  } catch (error) {
    return failure(error, `PUT /api/projects/${projectId}/storyboard`);
  }
}
