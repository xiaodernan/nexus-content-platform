import { NextResponse } from 'next/server';
import { csrfOk } from '@/server/security/csrf';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { loadGame, saveGame } from '@/server/domain/games';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §54 游戏设计文档的读写入口。与 /world 同一条纪律：GET 不写库——
 * 没有游戏就返回 null，由面板上的「创建游戏骨架」明确发起一次 PUT。
 */

export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const result = await loadGame(projectId);
    if (result && !result.ok) return jsonError(500, 'game_unreadable', { message: result.reason });
    return NextResponse.json({ ok: true, game: result?.document ?? null });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/game`);
  }
}

export async function PUT(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (!body || typeof body !== 'object') return badRequest(['请求体必须是 JSON 对象']);
  const { document } = body as { document?: unknown };
  if (!document) return badRequest(['缺少游戏文档 document']);
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const result = await saveGame(projectId, user.id, document);
    if (!result.ok) return jsonError(400, 'game_rejected', { message: result.reason });
    return NextResponse.json({ ok: true, game: result.document });
  } catch (error) {
    return failure(error, `PUT /api/projects/${projectId}/game`);
  }
}
