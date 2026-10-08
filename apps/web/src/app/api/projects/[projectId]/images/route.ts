import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { generateDemoImage } from '@/server/domain/image-studio';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, failure, jsonError, notFound } from '@/server/http';

/**
 * §38 的两条箭头共用这一格：Text → Image，以及带上 `referenceAssetId` 的 Reference → Variation。
 * 这一格给的是 **DEMO 本地合成**（本机没有图像 provider，§160），
 * 但走的是真链路：额度门 → 任务行 → 与上传同一道摄取门 → 真资产行 → 真扣点。
 * 响应里的 `asset.genMeta`/`generatedBy` 会带着 `demoMode: true`，面板据此显示角标。
 */

const RequestBody = z.object({
  prompt: z.string(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  seed: z.number().int().optional(),
  // 参考图按 id 给，字节由服务端自己取（带归属校验）——不接受客户端塞进来的 base64，
  // 那等于绕过摄取门喂一张没被审过的图
  referenceAssetId: z.string().min(1).optional(),
  // §38 Sketch → Image：与 referenceAssetId 互斥（服务端那一侧拒同时给）；
  // 草图同样是按 id 取字节走归属校验，不接受客户端直接塞 base64
  sketchAssetId: z.string().min(1).optional(),
  // §39/§40 Character → Scene：与 referenceAssetId 互斥，服务端那一侧会拒掉同时给的情况
  characterId: z.string().min(1).optional(),
  // §39 角色一致性生成：生成角色自己的参考图（portrait）。需与 characterId 搭配，
  // prompt 将被忽略，改用角色档案的 visualIdentity + profile 组装描述。
  generateCharacterPortrait: z.boolean().optional(),
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
      referenceAssetId: parsed.data.referenceAssetId,
      sketchAssetId: parsed.data.sketchAssetId,
      characterId: parsed.data.characterId,
      generateCharacterPortrait: parsed.data.generateCharacterPortrait,
    });
    if (!result.ok) {
      // 429 与 400 分开：额度用尽要让用户知道"这个月没了"，而不是"你请求写错了"
      // 三种拒法各给一个状态码：额度用尽 429、存储放不下 413、其余是请求写错了 400
      const status =
        result.code === 'credits_exhausted' ? 429 : result.code === 'storage_exhausted' ? 413 : 400;
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
