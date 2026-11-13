import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectWriteAccess } from '@/server/domain/team';
import { checkPublishPreflight } from '@/server/domain/publishPreflight';
import { failure, jsonError, notFound } from '@/server/http';
import type { Visibility } from '@/server/domain/publish';

/**
 * 发布预检（§56）：把"按下发布会发生什么"只读地算一遍——与真的 publishProject 共用
 * 同一批判定函数（名额 / 门禁 / 机检），绝不做另一套算法。每一次 GET 都是现场重算，
 * 所以响应带 no-store，不缓存、不推断。
 */

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    const access = await projectWriteAccess(projectId, user.id);
    if (access === 'not_found') return notFound();
    if (access === 'read_only') {
      return jsonError(403, 'read_only_role', { message: '查看者（viewer）角色只读；预检与发布权属于 owner 与 editor' });
    }

    const raw = new URL(req.url).searchParams.get('visibility');
    const visibility: Visibility = raw === 'unlisted' || raw === 'private' ? raw : 'public';

    const report = await checkPublishPreflight(projectId, visibility);
    if (!report) return notFound();

    return NextResponse.json(report, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/publish-preflight`);
  }
}
