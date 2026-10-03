import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserOrNull } from '@/server/domain/session';
import { buildProjectExport, notifyBuildComplete, publishBuildStatus } from '@/server/domain/export';
import type { ExportPart } from '@/server/domain/export';
import { loadProjectIdentity, projectBelongsTo } from '@/server/domain/projects';
import { jsonError } from '@/server/http';

/**
 * §144 NO LOCK-IN：把项目**交还到作者手里**的那一格。
 *
 * `GET /api/projects/<id>/export?parts=design,code,assets`
 *
 * 三条与别处同源的判法：
 * - **没登录 401**（下载端点不"探测一下就白手造一个 guest 用户"，与 `/api/account` 同一口径）；
 * - **不是自己的项目 404 而不是 403**（403 会泄露"这个 id 存在"，与资产取字节那一格同一口径）；
 * - **写请求一律不支持**：导出是读，改成 POST 就会引出一堆 CSRF 与幂等的讨论，而这里没有要写的东西。
 *
 * 归属判定在 `domain/export.ts` 里（先判归属再动字节），这一格只做入参解析与状态码翻译。
 */

const QuerySchema = z.object({
  parts: z
    .string()
    .optional()
    .transform((raw) => (raw ?? 'design,code,assets').split(',').map((p) => p.trim()).filter(Boolean))
    .pipe(z.array(z.enum(['design', 'code', 'assets'])).min(1)),
});

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  // requireUser 在没有 cookie 时是**抛错**（翻成 500），而这里承诺的是 401，所以用 nullable 的那一个显式判空
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  const { projectId } = await ctx.params;

  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return jsonError(400, 'validation_failed', {
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    });
  }
  const parts = parsed.data.parts as ExportPart[];
  const label = parts.join('+');

  const identity = await loadProjectIdentity(projectId);
  // 归属与"这个项目还在不在"先问一遍，再推 building：不是自己的项目、不存在的项目
  // 都连这一步都没到，不该留下"导出跑了一次"的刻度（domain 里那道检查是给直接调用方的，两道各管各的入口）
  if (!identity || !(await projectBelongsTo(projectId, user.id))) {
    return jsonError(404, 'not_found', { message: '没有这个项目' });
  }
  const projectName = identity.name;
  publishBuildStatus(projectId, 'building', `导出 ${label}`);

  let outcome: Awaited<ReturnType<typeof buildProjectExport>> = null;
  let failure: string | null = null;
  try {
    outcome = await buildProjectExport(projectId, user.id, parts);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  if (failure) {
    publishBuildStatus(projectId, 'failed', failure);
    await notifyBuildComplete({
      projectId,
      projectName,
      actorId: user.id,
      ok: false,
      counts: { design: 0, code: 0, assets: 0 },
      missingAssets: 0,
      durationMs: 0,
      detail: failure,
    });
    return jsonError(500, 'internal', { message: `导出失败：${failure}` });
  }

  // 能走到这里说明项目行在、归属也对，null 只剩一种可能：文档读不出来（页一行都没有）。
  // 照旧 404 且**不推 failed**——那不是"导出跑了一次然后失败"，是"没有东西可导"（与发布那一格同一口径）
  if (!outcome) return jsonError(404, 'not_found', { message: '没有这个项目' });

  // 说明那一份 README 也在包里，但它不是"导出的内容"，所以数完内容再明说还附带一份说明
  const detail = `内容 ${outcome.counts.design + outcome.counts.code + outcome.counts.assets} 个文件，外加一份说明` +
    (outcome.missingAssets.length ? `，缺了 ${outcome.missingAssets.length} 个资产` : '');
  publishBuildStatus(projectId, 'ok', `导出完成 · ${detail}`);
  await notifyBuildComplete({
    projectId,
    projectName,
    actorId: user.id,
    ok: true,
    counts: outcome.counts,
    missingAssets: outcome.missingAssets.length,
    durationMs: outcome.durationMs,
    detail,
  });

  // HTTP 头的编码比 zip 内部挑剔：filename 留 ASCII 兜底，真名走 RFC 5987 的 filename*
  const ascii = outcome.filename.replace(/[^\x20-\x7e]/g, '') || 'nexus-export.zip';
  // 回执上的数字来自服务端自己数的那几遍，界面不重新数一遍（§159）：
  // 客户端解析 zip 才能知道包里有几个文件，而"导出成功"这句话不该等到那时才敢说
  const receipt = JSON.stringify({
    counts: outcome.counts,
    missing: outcome.missingAssets.length,
    durationMs: outcome.durationMs,
  });
  return new NextResponse(Buffer.from(outcome.bytes), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(outcome.filename)}`,
      'content-length': String(outcome.bytes.length),
      'x-nexus-export-receipt': receipt,
      'cache-control': 'no-store',
    },
  });
}
