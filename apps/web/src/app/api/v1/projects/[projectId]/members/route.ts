import { NextResponse } from 'next/server';
import { ApiTeamRosterSchema } from '@nexus/schemas';
import { apiTeamRoster, authorizeApiRequest, recordApiAccess } from '@/server/domain/api-tokens';
import { apiJson, failure, jsonError } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §133 + §188（#207）：v1 的团队名册端点。GET only，scope `team:read`。
 *
 * 三件事与界面那条路完全一致，一件也不自己重写：
 * - **谁能看**：owner 与协作者（`projectVisibleTo`），陌生人 404——不区分"不存在"
 *   与"不是你的"（v1 各端点同一口径，0028 的注释演过四遍）；
 * - **看什么**：成员 + 邀请（pending/accepted/revoked）+ 档位名额。邀请的 token 是
 *   secret，两个视图都不回显它（§159：秘密不是安全模型，但也没必要主动递出去）；
 * - **怎么记**：一次成功的读取在 `api_access` 里留一行（端点名带 projectId），
 *   与其它 v1 端点同一只笔（`recordApiAccess`）。
 *
 * 没有 POST：邀请/撤回/移除是 owner 的管理动作，且 §133 要求"协作者之间不能互相拉人"——
 * 公网凭据背后没有人可批，这一格不给写。
 */
export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const authed = await authorizeApiRequest(req, 'team:read');
  if (!authed.ok) return jsonError(authed.status, authed.error, { message: authed.message });
  const { projectId } = await ctx.params;
  try {
    const roster = await apiTeamRoster(authed.userId, projectId);
    if (!roster) {
      return jsonError(404, 'project_not_found', {
        message: `项目 ${projectId} 不在这一枚凭据所属的人名下、已被删除，或库里还没有文档`,
      });
    }
    const checked = ApiTeamRosterSchema.safeParse(roster);
    if (!checked.success) return failure(new Error('名册报文不符合契约'), 'GET /api/v1/projects/[projectId]/members');
    await recordApiAccess({
      tokenId: authed.token.id,
      endpoint: 'GET /api/v1/projects/[projectId]/members',
      projectId,
    });
    return apiJson(checked.data, req, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, 'GET /api/v1/projects/[projectId]/members');
  }
}
