import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { mergeVariants } from '@/server/domain/variants';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §29 "Combine A's layout with C's visual style"：结构取自一条分支、视觉语言取自另一条，
 * 结果作为一条新分支加入比较板——合成不是覆盖，用户随时能切回两个来源。
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return badRequest(['请求体必须是 JSON 对象']);
  const { layoutBranchId, visualBranchId, name } = body as {
    layoutBranchId?: unknown;
    visualBranchId?: unknown;
    name?: unknown;
  };
  if (typeof layoutBranchId !== 'string' || !layoutBranchId) return badRequest(['缺少 layoutBranchId']);
  if (typeof visualBranchId !== 'string' || !visualBranchId) return badRequest(['缺少 visualBranchId']);
  if (name !== undefined && name !== null && typeof name !== 'string') return badRequest(['name 必须是字符串']);
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const result = await mergeVariants(projectId, {
      layoutBranchId,
      visualBranchId,
      name: typeof name === 'string' ? name : null,
      createdById: user.id,
    });
    if (!result.ok) return jsonError(400, 'merge_rejected', { message: result.reason });
    return NextResponse.json({ ok: true, variant: result.value, notes: result.notes }, { status: 201 });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/variants/merge`);
  }
}
