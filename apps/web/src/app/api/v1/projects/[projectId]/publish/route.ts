import { NextResponse } from 'next/server';
import { ApiPublishRequestSchema, ApiPublicationSchema } from '@nexus/schemas';
import { apiProjectDetail, authorizeApiRequest, recordApiAccess } from '@/server/domain/api-tokens';
import { publishProject } from '@/server/domain/publish';
import { apiJson, failure, jsonError } from '@/server/http';

/**
 * §188 M8 第八片：发布/下架对外（`publish:write`，2026-10-09 加）。
 *
 * 这一格_ONLY_ 是 `publishProject()` 的转发，一行发布语义都不在这里重写：
 * 门禁（§179 健康度里参与 gating 的那几行）→ 机检（§129 红线 / §130 资产出处）→
 * 钉快照 → publication 行换版本 → 审计，全在那一份里。在路由里另起一套
 * "先跑门禁再落行"的顺序，就是 §74 那条教训在发布上重演。
 *
 * 三处与界面那条路（`POST /api/projects/<id>/publish`）故意不同：
 * 1. **不收 public**：§131 的机检与人工裁决队列在人的路径上，一枚 Bearer 凭据
 *    背后没有可点"批准"的人。写 public 的调用方拿到的是 400 + 一句"回界面"的话，
 *    不是一个悄悄建出来的公网 URL。
 * 2. **没有 CSRF 与 session**：鉴权是 Bearer token（`authorizeApiRequest` 一个入口包了
 *    鉴权 / scope / 限流三件事），浏览器那条路才需要 CSRF（攻击模型是"已登录的浏览器
 *    被诱骗发请求"，对一串 token 不存在）。
 * 3. **private 也走 publishProject 而不是 unpublishProject**：界面 DELETE 是删行
 *    （URL 立刻失效、行没了），这一格返回的永远是一份 `ApiPublication`——
 *    同一份响应契约管两种状态，调用方不必为"发布"和"下架"写两套解析。
 *    private 的行留着：URL 一样解析不出来（`resolvePublishedPath` 对 private 一律 null），
 *    历史与版本跟着行一起留着。
 *
 * 归属与不存在给同一个 404：别人的项目、已软删的项目，对调用方是同一个答案
 * （"不在这一枚凭据所属的人名下"），不告诉他"这个 id 存在但不是你的"。
 */
export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  const authed = await authorizeApiRequest(req, 'publish:write');
  if (!authed.ok) return jsonError(authed.status, authed.error, { message: authed.message });
  const { projectId } = await ctx.params;
  try {
    // clone 要在读之前：正文被读掉之后再 clone 只剩一句 "Body is unusable"（第一版 500 在这）
    const spare = req.clone();
    const parsed = ApiPublishRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      // safeParse 已经把正文读掉了；"是不是 public"只能从先前克隆出来的那一份上问，
      // 顺便给出这一格独有的拒绝话（而不是 zod 那句模板话）
      const body = (await spare.json().catch(() => null)) as { visibility?: unknown } | null;
      if (body?.visibility === 'public') {
        return jsonError(400, 'public_requires_human', {
          message:
            '公网发布（public）不在 v1 的能力里：机检与人工裁决在平台界面那条路上，' +
            '凭据背后没有可点批准的人。v1 收 unlisted（链接可达）与 private（收回发布）；' +
            '要 public 回平台「发布」面板走完那一趟。',
        });
      }
      return jsonError(400, 'validation_failed', {
        message: `visibility 必须是 unlisted 或 private（${parsed.error.issues.map((i) => i.message).join('；')}）`,
      });
    }
    // 归属判定复用 v1 详情那一份：同一个谓词（ownerId + 未软删），多写一份就对不齐
    if (!(await apiProjectDetail(authed.userId, projectId))) {
      return jsonError(404, 'project_not_found', {
        message: `项目 ${projectId} 不在这一枚凭据所属的人名下，或已被删除`,
      });
    }
    const result = await publishProject(projectId, {
      visibility: parsed.data.visibility,
      createdById: authed.userId,
    });
    if (!result) return jsonError(404, 'project_not_found', { message: '项目读不到了：发布前它刚被删掉的巧合也存在' });
    if (!result.ok) {
      // 门禁 / 机检挡下：只给 reason 与 blockers，不把整份 scan 面板结构倒出来——
      // 外面人能做的只有把 health 修好再来，而那些数字在 Studio 里看得到
      return jsonError(400, 'publish_blocked', { message: result.reason });
    }
    const checked = ApiPublicationSchema.safeParse(result.publication);
    if (!checked.success) return failure(new Error('发布回执不符合契约'), 'POST /api/v1/projects/[projectId]/publish');
    await recordApiAccess({
      tokenId: authed.token.id,
      endpoint: 'POST /api/v1/projects/[projectId]/publish',
      projectId,
    });
    return apiJson(checked.data, req, { status: 200, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, 'POST /api/v1/projects/[projectId]/publish');
  }
}
