import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveCase } from '@/server/domain/moderation';
import { currentUserOrNull } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, jsonError } from '@/server/http';

/**
 * §131：人工裁决一个案子。这是唯一能把 published_projects.moderation 写成
 * approved / rejected 的入口——机检不行，举报也不行。
 *
 * rejected 之后公开 URL 立刻不可达（resolvePublishedPath 认这一列），
 * 所以这个端点等于"撤下内容"的权力，必须：登录 + role=admin + CSRF，三者缺一不可。
 */
const ResolveSchema = z.object({
  resolution: z.enum(['approved', 'rejected']),
  note: z.string().max(2000).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ caseId: string }> }): Promise<NextResponse> {
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  if (user.role !== 'admin') return jsonError(403, 'forbidden', { message: '只有审核员（role=admin）能下结论' });
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });

  const parsed = ResolveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  const { caseId } = await ctx.params;
  const result = await resolveCase(caseId, {
    adminId: user.id,
    resolution: parsed.data.resolution,
    note: parsed.data.note,
  });
  if (!result.ok) return jsonError(409, 'cannot_resolve', { message: result.reason });
  return NextResponse.json({
    ...result,
    // rejected 会把这一版从公网撤下来；approved 只说明"人看过了、放行"，不代表机检查过什么
    message: result.hidden ? '已拒绝：该公开页面现在不可访问' : '已放行：裁决记在案子上',
  });
}
