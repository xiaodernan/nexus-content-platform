import { NextResponse } from 'next/server';
import { VisualDnaRequestSchema } from '@nexus/schemas';
import { requireUser } from '@/server/domain/session';
import { projectVisibleTo } from '@/server/domain/team';
import { assetProjectId, openAssetFile } from '@/server/domain/assets';
import { extractVisualDna } from '@/server/domain/visualDna';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §30 参考图 → Visual DNA：服务端只做**计算**，不写业务库。
 *
 * 结果回到客户端，由 Studio 以一个 `setVisualDna` 事务写进模型（§150/§149），
 * 所以这一步是可撤销的，且和"AI 服务不写业务库"的边界纪律同构（§76）。
 * 提取失败一律带原因返回：不支持的编码就是不支持，不返回空 DNA 冒充成功（§159）。
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  const parsed = VisualDnaRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  try {
    const user = await requireUser();
    if (!(await projectVisibleTo(projectId, user.id))) return notFound();
    // 图必须属于这个项目：否则"A 项目提 B 项目的图"会绕过项目边界做身份判断
    if ((await assetProjectId(parsed.data.assetId)) !== projectId) return notFound();
    const file = await openAssetFile(parsed.data.assetId);
    if (!file) return jsonError(404, 'asset_bytes_missing', { message: '清单里有这条资产，但存储里的字节不见了' });
    if (file.mime !== 'image/png') {
      return jsonError(415, 'unsupported_for_dna', {
        message: `本地像素统计目前只支持 PNG，这张是 ${file.mime}`,
      });
    }
    const result = extractVisualDna(file.bytes, { assetId: parsed.data.assetId });
    if (!result.ok) return jsonError(422, 'dna_extraction_failed', { message: result.reason });
    return NextResponse.json({ ok: true, assetId: parsed.data.assetId, dna: result.dna, stats: result.stats });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/visual-dna`);
  }
}
