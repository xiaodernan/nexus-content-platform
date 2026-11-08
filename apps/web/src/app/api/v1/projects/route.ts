import { NextResponse } from 'next/server';
import { ApiProjectCreateRequestSchema, ApiProjectDetailSchema, ApiProjectListSchema } from '@nexus/schemas';
import { apiProjectDetail, apiProjectList, authorizeApiRequest, recordApiAccess } from '@/server/domain/api-tokens';
import { PROJECT_KINDS, createProject, kindToProjectType } from '@/server/domain/projects';
import { apiJson, failure, jsonError } from '@/server/http';

/**
 * §188 公开 API v1 的第一条：`GET /api/v1/projects`。
 *
 * 鉴权、scope、限流三件事只有 `authorizeApiRequest` 这一个入口——这一格再加端点时
 * 不许自己解析 Bearer（§74 的教训：一条路管一条路，就等于每条路各有一套规矩）。
 *
 * 这一格原来**只有读**（"创建项目不对外，v1 的写只有 `/projects/<id>/design` 的 PATCH"）。
 * 2026-10-08 加上了 `POST`——外部 Agent 的流程第一步就是建一个项目，不建的话它拿到凭据也没处落东西。
 * 仍然没有的：`PUT` / `PATCH`（改名改类型走 `DELETE` 之后重建，或等真有需求再加），
 * 以及删除与发布（那两条在 `/projects/<id>` 那条路上）。
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
    return apiJson(checked.data, req, {
      // 回一句 hint（不是凭据）：调用方拿 401 来问"是哪一枚配错了"时，界面与日志对得上同一把
      headers: { 'cache-control': 'no-store', 'x-nexus-token-hint': authed.token.hint },
    });
  } catch (error) {
    return failure(error, 'GET /api/v1/projects');
  }
}

/**
 * 建一个项目（§188 M8「项目的创建不对外」那一格，2026-10-08 补）。
 *
 * 回 **201 + `ApiProjectDetail`**，与 `GET /projects/<id>` 同一份形状——调用方建完的下一件事
 * 就是拿这份详情去 PATCH 设计，两处形状不同只会逼它写两次解析。
 *
 * 两处与界面那条路**故意不一样**的地方：
 * 1. **`kind` 不认识就 400，不悄悄给 `website`**。界面那个是 `<select>`，送不出坏值，
 *    所以 `kindToProjectType()` 静默兜底在那边没问题；但外部 Agent 写 `"roguelike"` 时
 *    它需要知道"这个类型不存在、可选的是这些"，而不是拿到一个类型不对的项目、
 *    三天后才发现玩法全都不对（§159：不许把做了别的事说成做成了）。
 * 2. **不传 `seedDesign`**：首屏 seed 是界面为了"新建就有东西看"做的，外部调用方要的是空白文档。
 */
export async function POST(req: Request): Promise<NextResponse> {
  const authed = await authorizeApiRequest(req, 'projects:write');
  if (!authed.ok) return jsonError(authed.status, authed.error, { message: authed.message });
  try {
    const parsed = ApiProjectCreateRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(400, 'validation_failed', {
        message: parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('；'),
      });
    }
    const { name, kind } = parsed.data;
    if (kind !== undefined && !(PROJECT_KINDS as string[]).includes(kind)) {
      return jsonError(400, 'unknown_kind', {
        message: `没有 ${kind} 这个项目类型`,
        allowed: [...PROJECT_KINDS],
      });
    }
    const document = await createProject(authed.userId, { name, kind: kindToProjectType(kind ?? 'website') });
    const detail = await apiProjectDetail(authed.userId, document.id);
    if (!detail) return failure(new Error('刚建好的项目读不回来'), 'POST /api/v1/projects');
    const checked = ApiProjectDetailSchema.safeParse(detail);
    if (!checked.success) return failure(new Error('项目详情不符合契约'), 'POST /api/v1/projects');
    await recordApiAccess({ tokenId: authed.token.id, endpoint: 'POST /api/v1/projects', projectId: document.id });
    return apiJson(checked.data, req, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, 'POST /api/v1/projects');
  }
}
