import { NextResponse } from 'next/server';
import { ApiProjectDetailSchema } from '@nexus/schemas';
import { apiProjectDetail, authorizeApiRequest, recordApiAccess } from '@/server/domain/api-tokens';
import { apiJson, failure, jsonError } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §188：单个项目的详情 + 文档规模（页数 / 节点数）。
 *
 * 规模是现场从库里那份文档算的，不是库里某一列的存量数字——所以它不会漂，
 * 代价是这一条要读一次文档。它存在的理由是让调用方先决定"要不要拉整份"（§146 的顶档是几万个节点）。
 *
 * 404 的说法要说清是"不在这一枚凭据的人名下，或者已被删除"，两者都给同一个答案：
 * 这里没有"存在但不给你看"那种可分辨的差别，那种差别本身就是别人项目的存在性泄露。
 */
export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const authed = await authorizeApiRequest(req, 'projects:read');
  if (!authed.ok) return jsonError(authed.status, authed.error, { message: authed.message });
  const { projectId } = await ctx.params;
  try {
    const detail = await apiProjectDetail(authed.userId, projectId);
    if (!detail) {
      return jsonError(404, 'project_not_found', {
        message: `项目 ${projectId} 不在这一枚凭据所属的人名下，或已被删除`,
      });
    }
    const checked = ApiProjectDetailSchema.safeParse(detail);
    if (!checked.success) return failure(new Error('项目详情不符合契约'), 'GET /api/v1/projects/[projectId]');
    await recordApiAccess({ tokenId: authed.token.id, endpoint: 'GET /api/v1/projects/[projectId]', projectId });
    return apiJson(checked.data, req, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, 'GET /api/v1/projects/[projectId]');
  }
}
