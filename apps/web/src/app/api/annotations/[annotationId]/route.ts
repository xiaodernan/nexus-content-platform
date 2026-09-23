import { NextResponse } from 'next/server';
import { csrfOk } from '@/server/security/csrf';
import { requireUser } from '@/server/domain/session';
import { deleteAnnotation } from '@/server/domain/annotations';
import { failure, jsonError, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ annotationId: string }>;
}

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
