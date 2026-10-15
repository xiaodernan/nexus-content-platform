import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveCase } from '@/server/domain/moderation';
import { currentUserOrNull } from '@/server/domain/session';
import { recordAudit } from '@/server/domain/audit';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
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
  const { caseId } = await ctx.params;
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  /**
   * 限流放在 admin 判定**之前**：从这个版本起，被拒的越权尝试也会写一行审计，
   * 而这条路是任何登录用户都能走的——不限流的话，一个非审核员的循环请求
   * 就能把审计表刷满，真出事时反而翻不到那几行。与 `/api/admin/users` 同一口径。
   */
  const rl = getRateLimiter().hit(rateKey('admin/moderation', clientIp(req), user.id), 30, 10 * 60_000);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { message: '裁决太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });
  }
  if (user.role !== 'admin') {
    // §80 / §84：被拒绝的越权尝试正是审计表存在的理由。今天它只活在一次 HTTP 响应里，
    // 关掉窗口就没人知道有人试过改一个案子
    await recordAudit({
      actorId: user.id,
      action: 'moderation.resolve',
      targetType: 'moderation_case',
      targetId: caseId,
      allowed: false,
      detail: { reason: 'not_admin', role: user.role },
    });
    return jsonError(403, 'forbidden', { message: '只有审核员（role=admin）能下结论' });
  }
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });

  const parsed = ResolveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  const result = await resolveCase(caseId, {
    adminId: user.id,
    resolution: parsed.data.resolution,
    note: parsed.data.note,
  });
  if (!result.ok) return jsonError(409, 'cannot_resolve', { message: result.reason });
  return NextResponse.json({
    ...result,
    /**
     * 话要按**裁决**说，不是按"有没有公开页可撤"说：`hidden` 只表示这一版挂了发布行，
     * 而"被机检当场挡下、根本没有 publication 行"的案子同样可以被拒绝。
     * 早先这里用 `hidden ? 已拒绝 : 已放行`，于是拒绝一个没有公开页的案子时，
     * 界面说的是"已放行"——那一句是反的（§159：不许让界面替产品说反话）。
     */
    message:
      result.resolution === 'rejected'
        ? result.hidden
          ? '已拒绝：该公开页面现在不可访问'
          : '已拒绝：裁决记在案子上（这一版没有公开页可撤）'
        : '已放行：裁决记在案子上',
  });
}
