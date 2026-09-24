import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { requireUser } from '@/server/domain/session';
import { toggleFollow } from '@/server/domain/social';
import { emit } from '@/server/domain/notifications';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { jsonError } from '@/server/http';

/** §59 Follow：按 handle 关注一个创作者。关注自己直接拒，不静默变成"取消关注自己" */
export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const body = (await req.json().catch(() => null)) as { handle?: unknown } | null;
  const handle = typeof body?.handle === 'string' ? body.handle.trim() : '';
  if (!handle) return jsonError(400, 'bad_handle', { message: '缺少要关注的作者' });

  const user = await requireUser();
  const rl = getRateLimiter().hit(rateKey('follow', clientIp(req), user.id), 30, 60_000);
  if (!rl.allowed) return jsonError(429, 'rate_limited', { message: '关注太频繁了，稍后再试' });

  const [target] = await getDb().select({ id: users.id }).from(users).where(eq(users.handle, handle)).limit(1);
  if (!target) return jsonError(404, 'not_found', { message: '没有这个作者' });
  if (target.id === user.id) return jsonError(400, 'self_follow', { message: '不能关注自己' });

  const state = await toggleFollow(user.id, target.id);
  // §164：只报"开始关注"，不报"取消关注"——后者不是发生了一件事，是没发生
  if (state.following) {
    const [actor] = await getDb()
      .select({ handle: users.handle })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    await emit({
      kind: 'follow',
      recipientId: target.id,
      actorId: user.id,
      actorName: user.displayName,
      // guest 没认领前没有 handle，那就真的没有 /u/ 这一页可指
      actorHandle: actor?.handle ?? null,
    });
  }
  return NextResponse.json({ ok: true, ...state });
}
