import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { retrieveProjectKnowledge } from '@/server/domain/knowledge';
import { badRequest, failure, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §49 的检索入口。GET 也支持，是为了让"试一句查询"不必带写权限——
 * 它只读已索引的语料，不写任何东西。
 * 返回里 `vectorAvailable: false` 是能力边界，不是错误：没有 provider 就没有语义检索。
 */
export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const query = url.searchParams.get('q') ?? '';
  const limit = Number(url.searchParams.get('limit') ?? 8);
  if (!query.trim()) return badRequest(['要先给一句查询。']);
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const result = await retrieveProjectKnowledge(projectId, query, Number.isFinite(limit) ? limit : 8);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/retrieve`);
  }
}

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (!body || typeof body !== 'object') return badRequest(['请求体必须是 JSON 对象']);
  const { query, limit } = body as { query?: unknown; limit?: unknown };
  if (typeof query !== 'string' || !query.trim()) return badRequest(['要先给一句查询。']);
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const result = await retrieveProjectKnowledge(
      projectId,
      query,
      typeof limit === 'number' ? limit : 8,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/retrieve`);
  }
}
