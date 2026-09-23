import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { buildProjectContext } from '@/server/domain/context';
import { failure, jsonError, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §67 Context Engine：一次装配出这个项目"能被 Agent 读懂的那一份"。
 *
 * 只读、不写库（和 §44 的 GET 同一条纪律）。`?indexChars=` 用来试预算：
 * 面板上"整份文档 vs 目录"的对比要能被人亲手改一下看效果，而不是只能信一个常数。
 */
export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  // 查询参数只能从 req.url 拿：route handler 的 ctx.searchParams 在 Next 16 里不存在，
  // 读它会永远得到 undefined，于是预算被静默忽略（这个坑由 §66-71 的 smoke 测出的）
  const raw = new URL(req.url).searchParams.get('indexChars');
  const requested = raw === null ? undefined : Number(raw);
  if (requested !== undefined && (!Number.isFinite(requested) || requested < 0)) {
    return jsonError(400, 'bad_index_chars', { message: 'indexChars 要是一个非负整数' });
  }
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const result = await buildProjectContext(projectId, user.id, {
      maxIndexChars: requested,
    });
    if (!result.ok) return jsonError(409, 'context_unavailable', { message: result.reason });
    return NextResponse.json({ ok: true, context: result.context });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/context`);
  }
}
