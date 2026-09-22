import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { generateVariants, listVariants } from '@/server/domain/variants';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §29 多方案。GET 把每条分支的 head 文档一起带回来——并排比较要的就是这几份文档，
 * 分成"列表 + N 次取文档"只会多出一处会不同步的状态。
 */
export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    return NextResponse.json({ ok: true, variants: await listVariants(projectId) });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/variants`);
  }
}

/**
 * POST 生成候选方案。当前是确定性配方（结构 × 视觉语言），所以 capability 恒为 'demo'：
 * 它给的是可读、可验证的方向，不假装是模型输出（§159/§160）。真实 provider 接入后
 * 换掉的是"往哪个方向改"，落地方式仍然是"一条分支一份 head 快照"。
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (body !== null && body !== undefined && (typeof body !== 'object' || Array.isArray(body))) {
    return badRequest(['请求体必须是 JSON 对象']);
  }
  const { count } = (body ?? {}) as { count?: unknown };
  if (count !== undefined && count !== null && typeof count !== 'number') {
    return badRequest(['count 必须是数字']);
  }
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const result = await generateVariants(projectId, {
      count: typeof count === 'number' ? count : undefined,
      createdById: user.id,
    });
    if (!result.ok) return jsonError(400, 'variants_rejected', { message: result.reason });
    return NextResponse.json(
      { ok: true, capability: 'demo', variants: result.value, notes: result.notes },
      { status: 201 },
    );
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/variants`);
  }
}
