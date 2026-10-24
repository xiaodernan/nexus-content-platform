import { NextResponse } from 'next/server';
import { csrfOk } from '@/server/security/csrf';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { loadWorld, saveWorld } from '@/server/domain/worlds';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §44 世界文档的读写入口。GET 不写库：没有世界就返回 null，
 * 由面板上的「创建世界骨架」明确发起一次 PUT——"还没有"和"有一份空的"是两件事，
 * 而 GET 顺手建数据会让每次刷新都可能在库里留痕。
 */

export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectVisibleTo(projectId, user.id))) return notFound();
    const result = await loadWorld(projectId);
    if (result && !result.ok) return jsonError(500, 'world_unreadable', { message: result.reason });
    return NextResponse.json({ ok: true, world: result?.document ?? null });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/world`);
  }
}

export async function PUT(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (!body || typeof body !== 'object') return badRequest(['请求体必须是 JSON 对象']);
  const { document } = body as { document?: unknown };
  if (!document) return badRequest(['缺少世界文档 document']);
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const result = await saveWorld(projectId, user.id, document);
    if (!result.ok) return jsonError(400, 'world_rejected', { message: result.reason });
    return NextResponse.json({ ok: true, world: result.document });
  } catch (error) {
    return failure(error, `PUT /api/projects/${projectId}/world`);
  }
}
