import { NextResponse } from 'next/server';
import { ApiProjectDetailSchema } from '@nexus/schemas';
import { apiProjectDetail, authorizeApiRequest, recordApiAccess } from '@/server/domain/api-tokens';
import { softDeleteProject } from '@/server/domain/projects';
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

/**
 * 软删一个项目（§188 M8「项目的删除不对外」那一格，2026-10-08 补）。
 *
 * **复用界面那条路的 `softDeleteProject()`**，不另写一套删除：那一份里"归属与未删写在同一个谓词里"
 * （不给"存在但看不到"留侧信道）、"确认词不一致时记一条 `allowed: false` 的审计"、
 * "CAS UPDATE 拿 0 行就说 not_found 而不是'成功删了一个已经删掉的'"这几件事，重写一遍必然漏一两件。
 *
 * 确认词走**查询串** `?confirm=<项目名>` 而不是请求体：DELETE 带体这件事在代理与客户端之间
 * 有被丢掉的历史，而这一格要的是"传不传得过来"不能成为不确定性的一部分。
 * 逐字比对项目名不是形式——外部 Agent 拿一串 id 批量删的时候，那一步是唯一挡在
 * "删错一个"前面的东西（删错的项目要恢复得手写 SQL 或走界面，见下）。
 *
 * **限度写在成功回执里**，不指望调用方读过文档：这是软删，快照与发布行都还在，
 * 但**恢复今天只有界面入口与手写 SQL，v1 没有 `POST /restore`**——
 * 不说这一句的话，调用方会以为"删了还能用同一个凭据装回来"。
 */
export async function DELETE(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const authed = await authorizeApiRequest(req, 'projects:write');
  if (!authed.ok) return jsonError(authed.status, authed.error, { message: authed.message });
  const { projectId } = await ctx.params;
  const confirm = new URL(req.url).searchParams.get('confirm') ?? '';
  try {
    const result = await softDeleteProject(authed.userId, projectId, confirm);
    if (!result.ok) {
      if (result.code === 'approval_required') {
        return jsonError(400, 'approval_required', {
          message: '确认词与项目名不一致，没有删除这个项目',
          hint: '把 ?confirm= 写成这个项目的名字，逐字一致；不知道名字先 GET /api/v1/projects',
        });
      }
      return jsonError(404, 'project_not_found', {
        message: `项目 ${projectId} 不在这一枚凭据所属的人名下，或已被删除`,
      });
    }
    await recordApiAccess({ tokenId: authed.token.id, endpoint: 'DELETE /api/v1/projects/[projectId]', projectId });
    return apiJson(
      {
        deleted: true,
        id: projectId,
        name: result.name,
        // 这一句是给调用方的限度声明，不是装饰
        recoverable: '软删：快照与发布行都还在，公开页从这一刻起 404。v1 没有恢复端点，恢复要回界面。',
      },
      req,
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return failure(error, 'DELETE /api/v1/projects/[projectId]');
  }
}
