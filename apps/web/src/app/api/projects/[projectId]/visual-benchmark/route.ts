import { NextResponse } from 'next/server';
import { VisualBenchmarkRequestSchema } from '@nexus/schemas';
import { requireUser } from '@/server/domain/session';
import { projectVisibleTo } from '@/server/domain/team';
import { assetProjectId, openAssetFile } from '@/server/domain/assets';
import { compareVisuals } from '@/server/domain/visualBenchmark';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §86 视觉基准：参考图 × 生成图 → 结构化指标。只做**计算**，不写业务库。
 *
 * 与 visual-dna 同一条纪律：两张图都必须属于这个项目（跨项目借图会绕过项目边界），
 * 解不开/不是 PNG 如实拒绝；`compareVisuals` 是纯函数，同一对字节永远得到同一份指标，
 * 任何调用方都能离线复算这一页的结果。
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  const parsed = VisualBenchmarkRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  try {
    const user = await requireUser();
    if (!(await projectVisibleTo(projectId, user.id))) return notFound();
    for (const assetId of [parsed.data.referenceAssetId, parsed.data.candidateAssetId]) {
      if ((await assetProjectId(assetId)) !== projectId) return notFound();
    }
    const refFile = await openAssetFile(parsed.data.referenceAssetId);
    if (!refFile) return jsonError(404, 'asset_bytes_missing', { message: '参考图在清单里，但存储里的字节不见了' });
    const candFile = await openAssetFile(parsed.data.candidateAssetId);
    if (!candFile) return jsonError(404, 'asset_bytes_missing', { message: '生成图在清单里，但存储里的字节不见了' });
    for (const [role, file] of [
      ['参考图', refFile],
      ['生成图', candFile],
    ] as const) {
      if (file.mime !== 'image/png') {
        return jsonError(415, 'unsupported_for_benchmark', {
          message: `本地像素比较目前只支持 PNG，${role}是 ${file.mime}`,
        });
      }
    }
    const compared = compareVisuals(refFile.bytes, candFile.bytes);
    if (!compared.ok) return jsonError(422, 'visual_benchmark_failed', { message: compared.reason });
    return NextResponse.json({
      ok: true,
      referenceAssetId: parsed.data.referenceAssetId,
      candidateAssetId: parsed.data.candidateAssetId,
      ...compared.result,
    });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/visual-benchmark`);
  }
}
