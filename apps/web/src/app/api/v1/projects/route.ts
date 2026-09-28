import { NextResponse } from 'next/server';
import { ApiProjectListSchema } from '@nexus/schemas';
import { apiProjectList, authorizeApiRequest, recordApiAccess } from '@/server/domain/api-tokens';
import { failure, jsonError } from '@/server/http';

/**
 * §188 公开 API v1 的第一条：`GET /api/v1/projects`。
 *
 * 鉴权、scope、限流三件事只有 `authorizeApiRequest` 这一个入口——这一格再加端点时
 * 不许自己解析 Bearer（§74 的教训：一条路管一条路，就等于每条路各有一套规矩）。
 *
 * 这一格**只有读**：项目清单是集合，创建项目不对外（v1 的写只有 `/projects/<id>/design` 的 PATCH），
 * 所以 POST/PUT/PATCH/DELETE 在这里连处理器都没有，框架回的 405 说的是"这条路没有这个动作"，
 * 而不是"写被禁用了"。
 *
 * 只给这一枚凭据所属那个人名下的项目；公开作品走 `/api/public/*`，不在这条路上混两套可见性。
 */
export async function GET(req: Request): Promise<NextResponse> {
  const authed = await authorizeApiRequest(req, 'projects:read');
  if (!authed.ok) return jsonError(authed.status, authed.error, { message: authed.message });
  try {
    const list = await apiProjectList(authed.userId);
    const checked = ApiProjectListSchema.safeParse({ projects: list });
    if (!checked.success) return failure(new Error('项目清单不符合契约'), 'GET /api/v1/projects');
    await recordApiAccess({ tokenId: authed.token.id, endpoint: 'GET /api/v1/projects' });
    return NextResponse.json(checked.data, {
      // 回一句 hint（不是凭据）：调用方拿 401 来问"是哪一枚配错了"时，界面与日志对得上同一把
      headers: { 'cache-control': 'no-store', 'x-nexus-token-hint': authed.token.hint },
    });
  } catch (error) {
    return failure(error, 'GET /api/v1/projects');
  }
}
