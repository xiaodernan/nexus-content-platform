import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { projectVisibleTo } from '@/server/domain/team';
import { listProjectAssets, uploadImageAsset } from '@/server/domain/assets';
import { MAX_IMAGE_BYTES } from '@/server/storage/images';
import { csrfOk } from '@/server/security/csrf';
import { failure, jsonError, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** 项目资产清单（§101）。§38 的 Image Studio 生成结果也落在这里 */
export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectVisibleTo(projectId, user.id))) return notFound();
    return NextResponse.json({ ok: true, assets: await listProjectAssets(projectId) });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/assets`);
  }
}

/**
 * 上传（§80）。整条链路上只有这一处读字节，所以体积门也放在这里：
 * 先按 Content-Length 拒掉明显超量的请求，避免先把 50MB 缓冲进内存。
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();

    const declared = Number(req.headers.get('content-length') ?? '0');
    if (declared > MAX_IMAGE_BYTES + 512 * 1024) {
      return jsonError(413, 'too_large', {
        reason: `上传体积 ${Math.round(declared / 1024 / 1024)}MB 超过上限 ${MAX_IMAGE_BYTES / 1024 / 1024}MB`,
      });
    }
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return jsonError(400, 'unsupported_media_type', { reason: '上传必须使用 multipart/form-data 的 file 字段' });
    }
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return jsonError(400, 'no_file', { reason: '表单里没有找到 file 字段' });

    const result = await uploadImageAsset(projectId, {
      data: await file.arrayBuffer(),
      filename: file.name,
      createdById: user.id,
    });
    if (!result.ok) {
      // 配额与"文件不合格"要分开：413 让用户知道该删素材，400 才是"换一份文件"
      if (result.code === 'storage_exhausted') {
        return jsonError(413, 'storage_exhausted', { reason: result.reason });
      }
      return jsonError(400, 'asset_rejected', { reason: result.reason, issues: result.issues });
    }
    return NextResponse.json(
      { ok: true, asset: result.asset, reused: result.reused, removed: result.removed },
      { status: result.reused ? 200 : 201 },
    );
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/assets`);
  }
}
