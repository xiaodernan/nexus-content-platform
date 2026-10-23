import { NextResponse } from 'next/server';
import { z } from 'zod';
import { csrfOk } from '@/server/security/csrf';
import { requireUser } from '@/server/domain/session';
import { deleteAnnotation, setAnnotationResolved } from '@/server/domain/annotations';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ annotationId: string }>;
}

/** 「已解决」只有一个开关：要么标上，要么摘掉。没有第三种状态，所以不收别的键 */
const ResolveSchema = z.object({ resolved: z.boolean() });

/**
 * 删掉一条批注。归属判定在 domain 里做（先按这条批注所在项目查 owner），
 * 所以这里不接 projectId 参数——不然就是"客户端给哪个项目就按哪个项目算"。
 */
export async function DELETE(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { annotationId } = await ctx.params;
  try {
    const user = await requireUser();
    const removed = await deleteAnnotation(user.id, annotationId);
    if (!removed) return notFound();
    return NextResponse.json({ ok: true, removed: true });
  } catch (error) {
    return failure(error, `DELETE /api/annotations/${annotationId}`);
  }
}

/**
 * §111 批注的「已解决」：把它标成"这句话已经处理过了"。
 *
 * 与 DELETE 同一条纪律：归属判定在 domain 里做，所以这里同样不接 projectId——
 * 客户端给哪个项目就按哪个项目算，等于让请求方自己挑一个能说话的地方。
 *
 * 三个答案分得开：不存在 / 不是你的 → 404（同一个答案，不泄露存在性）；
 * 回复线程里的一句话、公开评论 → 400，并且说清是为什么——它们不是"权限不够"，
 * 是"这个对象没有已解决这一说"，拦在界面上也会是同一条提示。
 */
export async function PATCH(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { annotationId } = await ctx.params;
  const parsed = ResolveSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  try {
    const user = await requireUser();
    const result = await setAnnotationResolved(user.id, annotationId, parsed.data.resolved);
    if (!result.ok) {
      if (result.reason === 'not_found') return notFound();
      return badRequest([
        result.reason === 'not_annotation'
          ? '回复不能单独标记：要标就标它所在的那条批注'
          : '公开评论没有「已解决」这一说：它不钉在任何元素上',
      ]);
    }
    return NextResponse.json({ ok: true, annotationId: result.annotationId, resolvedAt: result.resolvedAt });
  } catch (error) {
    return failure(error, `PATCH /api/annotations/${annotationId}`);
  }
}
