import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { generateDemoImage } from '@/server/domain/image-studio';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, failure, jsonError, notFound } from '@/server/http';

/**
 * §38 Text → Image 的入口。这一格给的是 **DEMO 本地合成**（本机没有图像 provider，§160），
 * 但走的是真链路：额度门 → 任务行 → 与上传同一道摄取门 → 真资产行 → 真扣点。
 * 响应里的 `asset.genMeta`/`generatedBy` 会带着 `demoMode: true`，面板据此显示角标。
 */

const RequestBody = z.object({
  prompt: z.string(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  seed: z.number().int().optional(),
});

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();

    const parsed = RequestBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'}：${issue.message}`));
    }

    const result = await generateDemoImage({
      projectId,
      userId: user.id,
      prompt: parsed.data.prompt,
      width: parsed.data.width,
      height: parsed.data.height,
      seed: parsed.data.seed,
    });
    if (!result.ok) {
      // 429 与 400 分开：额度用尽要让用户知道"这个月没了"，而不是"你请求写错了"
      const status = result.code === 'credits_exhausted' ? 429 : 400;
      return jsonError(status, result.code, { message: result.message, issues: result.issues ?? [] });
    }
    return NextResponse.json(
      { ok: true, asset: result.asset, taskId: result.taskId, reused: result.reused, removed: result.removed },
      { status: result.reused ? 200 : 201 },
    );
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/images`);
  }
}
