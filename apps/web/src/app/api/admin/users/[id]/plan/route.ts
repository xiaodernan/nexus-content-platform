import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserOrNull } from '@/server/domain/session';
import { setUserPlan } from '@/server/domain/plan-admin';
import { PLAN_KEYS } from '@/server/domain/credits';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, jsonError } from '@/server/http';

/**
 * §133 的"改档位"入口。与 `PATCH /api/admin/users/[id]`（改角色）分成两个端点，而不是合成一个
 * 带判别式的报文：动作名要分开进审计（`user.role.change` / `user.plan.change`），
 * 限流键也要分开——两件事共用一个键，会出现"改了三次档位就被挡在角色操作之外"这种解释不清的现象。
 *
 * 判定全在 `domain/plan-admin.ts`（只有 admin 能改、档位必须是五档之一、允许改自己），
 * 这里只做输入校验、限流与状态码翻译。
 * 读会话用 `currentUserOrNull()`：这个端点不该"探测一下就白手造一个 guest 用户"。
 */
const Schema = z.object({ plan: z.string() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  const { id } = await ctx.params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  // 改档位是发额度的动作，和改角色一样按人限流：一次误点不该在几个账号之间来回换档
  const rl = getRateLimiter().hit(rateKey('admin/users/plan', clientIp(req), user.id), 20, 10 * 60_000);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { message: '改档位太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });
  }

  const result = await setUserPlan(user.id, id, parsed.data.plan);
  if (!result.ok) return jsonError(result.status, result.code, { message: result.reason });
  return NextResponse.json({
    ok: true,
    targetId: result.targetId,
    previous: result.previous,
    plan: result.plan,
    plans: PLAN_KEYS,
    message: `${result.previous} → ${result.plan}`,
  });
}