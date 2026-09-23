import { NextResponse } from 'next/server';
import { csrfOk } from '@/server/security/csrf';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { knowledgeStats, syncProjectKnowledge } from '@/server/domain/knowledge';
import { failure, jsonError, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** §49 语料索引的总览：多少块、按来源分布、其中几块真有向量（没有 provider 时是 0）。 */
export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const stats = await knowledgeStats(projectId);
    return NextResponse.json({ ok: true, ...stats, vectorAvailable: stats.vectorized > 0 });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/knowledge`);
  }
}

/**
 * 重建索引。写路径本来就会自动同步，这里是给"导入完东西想立刻确认索引跟上了"
 * 留的一个显式按钮——自动同步 + 手动重建不矛盾：前者保证不撒谎，后者保证可核对。
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const result = await syncProjectKnowledge(projectId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/knowledge/sync`);
  }
}
