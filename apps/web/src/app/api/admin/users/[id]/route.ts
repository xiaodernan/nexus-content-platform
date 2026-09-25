import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserOrNull } from '@/server/domain/session';
import { setUserRole } from '@/server/domain/roles';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, jsonError } from '@/server/http';

/**
 * §131 的"谁是 admin 只能改库"收口：提权 / 降权变成一个有判定的端点。
 * 判定本身在 `domain/roles.ts`（不能改自己、guest 未认领不给提权、非 admin 一律拒），
 * 这里只做输入校验、限流与把结果翻译成状态码——权限规则放在路由里，
 * 下一个入口（CLI、批量导入）就会漏掉它。
 *
 * 读会话用 `currentUserOrNull()` 而不是 `requireUser()`（docs/SECURITY.md 那条边界）：
 * 后者会替无会话的请求现造 guest 身份，而这个端点正是最不该"探测一下就白手造用户"的地方。
 */
const Schema = z.object({ role: z.enum(['creator', 'admin']) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  // 提权是最不该被脚本刷的一类动作：按人限流，一次误点不会把一堆账号换来换去
  const rl = getRateLimiter().hit(rateKey('admin/users', clientIp(req), user.id), 20, 10 * 60_000);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { message: '改角色太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });
  }

  const result = await setUserRole(user.id, id, parsed.data.role);
  if (!result.ok) return jsonError(result.status, result.code, { message: result.reason });
  return NextResponse.json({
    ok: true,
    targetId: result.targetId,
    previous: result.previous,
    role: result.role,
    admins: result.admins,
    message: `${result.previous} → ${result.role}`,
  });
}
