import { NextResponse } from 'next/server';
import { csrfOk } from '@/server/security/csrf';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { renderQuotaFor } from '@/server/domain/credit-ledger';
import { listStoryboardRenders, renderStoryboardDemo } from '@/server/domain/storyboard-render';
import { failure, jsonError, notFound } from '@/server/http';

/**
 * 这个项目渲染出过的分镜成片，新的在前（§101 资产清单的"分镜产物"那一格）。
 *
 * GET 不写库、不过 CSRF（只读入口与 /assets 同一口径）。判据是 `genMeta.storyboardId`：
 * 没有那一格的 video 资产不算分镜的产物，列进来只会让面板指着一条来路不明的片子。
 *
 * 同时带回 `quota`（#196）：§133 generation 那一格的呈现——本档每月发几点 Video credits、
 * 一次扣几点、本月还可渲几版。与 POST 的额度门读同一组数（`renderQuotaFor` 与
 * `refusalForRun` 同源），展示与门对不上比不展示更糟（§159）。
 */
export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectVisibleTo(projectId, user.id))) return notFound();
    const [renders, quota] = await Promise.all([listStoryboardRenders(projectId), renderQuotaFor(user.id)]);
    return NextResponse.json({ ok: true, renders, quota });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/storyboard/render`);
  }
}

/**
 * §40 最后一格的入口：把这条分镜**真的渲染出来**。
 *
 * 与 /images 同一套口径：DEMO 像素（本机没有视频 provider，§160），但走真链路——
 * 额度门在 startTask 之前、参考帧按 id 取字节（带归属校验）、字节过视频摄入门、
 * 真 ffmpeg 落真 mp4、只有成功才扣点。响应里 `warnings`/`notes` 原样带回，
 * 界面必须显示：没有字体时字幕没烧进画面，这件事不许静默（§159）。
 *
 * 状态码与 /images 对齐：额度用尽 429、存储放不下 413、其余 400。
 */

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();

    const result = await renderStoryboardDemo({ projectId, userId: user.id });
    if (!result.ok) {
      // 429 与 400 分开：额度用尽要让用户知道"这个月没了"，而不是"你请求写错了"
      const status =
        result.code === 'credits_exhausted' ? 429 : result.code === 'storage_exhausted' ? 413 : 400;
      return jsonError(status, result.code, { message: result.message, issues: result.issues ?? [] });
    }
    return NextResponse.json(
      {
        ok: true,
        asset: result.asset,
        taskId: result.taskId,
        warnings: result.warnings,
        notes: result.notes,
        renderMs: result.renderMs,
      },
      { status: 201 },
    );
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/storyboard/render`);
  }
}
