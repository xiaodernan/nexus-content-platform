import { NextResponse } from 'next/server';
import { NotificationsReadRequestSchema } from '@nexus/schemas';
import { requireUser } from '@/server/domain/session';
import { markAllRead, markRead } from '@/server/domain/notifications';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, jsonError, readJson } from '@/server/http';

/**
 * §164 标已读。两个入口一份规则：给出 id 就标这些，显式说 all 就标当前全部未读。
 *
 * 状态变更照例三件套：CSRF、登录身份、限流。真正的归属判定在 domain 里
 * （每条 UPDATE 都带 `user_id = 当前用户`），所以传别人的 id 只会标掉 0 条——
 * 回话里的 marked 就是这个数，不谎报"成功"。
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const user = await requireUser();
  const rl = await getRateLimiter().hit(rateKey('notifications/read', clientIp(req), user.id), 120, 60_000);
  if (!rl.allowed) return jsonError(429, 'rate_limited', { message: '操作太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });

  const body = await readJson(req);
  const parsed = NotificationsReadRequestSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((issue) => issue.message));

  const marked = parsed.data.all ? await markAllRead(user.id) : await markRead(user.id, parsed.data.ids ?? []);
  return NextResponse.json({ ok: true, marked });
}
