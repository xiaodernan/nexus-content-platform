import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { loadDocument, projectBelongsTo, saveDocument, updateProjectDescription } from '@/server/domain/projects';
import { scanTextForRedlines } from '@/server/domain/moderation';
import { parseDocument } from '@/server/validation';
import { ProjectPatchRequestSchema } from '@nexus/schemas';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const document = await loadDocument(projectId);
    if (!document) return notFound();
    return NextResponse.json({ projectId, document });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}`);
  }
}

export async function PUT(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = parseDocument(body);
  if (!parsed.ok) return badRequest(parsed.issues);
  if (parsed.document.id !== projectId) {
    return jsonError(409, 'id_mismatch', { message: '文档 id 与项目 id 不一致' });
  }
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    await saveDocument(projectId, parsed.document);
    const stored = await loadDocument(projectId);
    return NextResponse.json({ ok: true, document: stored, savedAt: new Date().toISOString() });
  } catch (error) {
    return failure(error, `PUT /api/projects/${projectId}`);
  }
}

/**
 * §49 项目简介。名字不在这里改（见 ProjectPatchRequestSchema 的注释），
 * PUT 那条链是设计文档的自动保存，每改一个像素都会跑一次——把简介挂在 PUT 上
 * 就等于让"改圆角"顺手覆盖简介，两边都会莫名其妙。
 *
 * 简介会经 `og:description` 出现在公网（§166），所以它和主页 bio 走同一份红线词表（§129）：
 * 命中就不保存，不"先存下来以后再清"。
 */
export async function PATCH(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = ProjectPatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  const description = parsed.data.description;
  if (description && scanTextForRedlines(description).length) {
    return jsonError(400, 'description_rejected', { message: '这段简介被机检挡下，没有保存' });
  }
  try {
    const user = await requireUser();
    const rl = getRateLimiter().hit(rateKey('projects/patch', clientIp(req), user.id), 120, 10 * 60_000);
    if (!rl.allowed) {
      return jsonError(429, 'rate_limited', { message: '修改太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });
    }
    const updated = await updateProjectDescription(user.id, projectId, description ?? null);
    if (!updated) return notFound();
    return NextResponse.json({ ok: true, project: updated });
  } catch (error) {
    return failure(error, `PATCH /api/projects/${projectId}`);
  }
}
