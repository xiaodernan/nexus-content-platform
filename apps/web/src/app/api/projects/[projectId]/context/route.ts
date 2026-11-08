import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectVisibleTo } from '@/server/domain/team';
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
 * `?corpusQuery=` 用来试 §49 的语料取回：AI 请求里这一栏就是本轮提示词，
 * 面板要能看见"这一轮到底取回了哪几块、裁掉几条"，否则界面上的上下文与发出去的那份不是同一件事。
 */
export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  // 查询参数只能从 req.url 拿：route handler 的 ctx.searchParams 在 Next 16 里不存在，
  // 读它会永远得到 undefined，于是预算被静默忽略（这个坑由 §66-71 的 smoke 测出的）
  const params = new URL(req.url).searchParams;
  const raw = params.get('indexChars');
  const requested = raw === null ? undefined : Number(raw);
  if (requested !== undefined && (!Number.isFinite(requested) || requested < 0)) {
    return jsonError(400, 'bad_index_chars', { message: 'indexChars 要是一个非负整数' });
  }
  const corpusQuery = params.get('corpusQuery')?.trim() ?? '';
  if (corpusQuery.length > 200) {
    return jsonError(400, 'bad_corpus_query', { message: 'corpusQuery 最多 200 字：这是查询词，不是整份文档' });
  }
  try {
    const user = await requireUser();
    if (!(await projectVisibleTo(projectId, user.id))) return notFound();
    const result = await buildProjectContext(projectId, user.id, {
      maxIndexChars: requested,
      corpusQuery: corpusQuery || undefined,
    });
    if (!result.ok) return jsonError(409, 'context_unavailable', { message: result.reason });
    return NextResponse.json({ ok: true, context: result.context });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/context`);
  }
}
