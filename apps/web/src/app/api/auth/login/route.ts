import { z } from 'zod';
import { NextResponse } from 'next/server';
import { currentSessionToken } from '@/server/domain/session';
import { login, type AuthError } from '@/server/domain/auth';
import { csrfOk } from '@/server/security/csrf';
import { recordAudit } from '@/server/domain/audit';
import { applySessionCookie } from '@/server/security/authCookies';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { badRequest, jsonError, readJson, failure } from '@/server/http';

const Schema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

async function fromError(error: AuthError): Promise<NextResponse> {
  // invalid_credentials 统一文案：不区分「邮箱没注册」还是「口令错」，避免账号枚举。
  const message = error.code === 'invalid_credentials' ? '邮箱或口令不正确' : '认证失败';
  return await jsonError(error.status, error.code, { message });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return await jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });

  const body = await readJson(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return await badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));

  const ip = clientIp(req);
  // 登录按 IP + 邮箱限流：挡住对单个账号的口令爆破。
  const rl = await getRateLimiter().hit(rateKey('auth/login', ip, parsed.data.email.toLowerCase()), 10, 15 * 60 * 1000);
  if (!rl.allowed) {
    // §STRESS-4：撞库压测量到这道闸只回 HTTP `retry-after` 头，报文里没有 retryAfterMs。
    // 同仓其它限流点（角色对话 / AI 按钮 / 建项目）都在 body 里给这个数，界面据此说"还要等 N 分钟"；
    // 登录这一处不给，等于把"还要等多久"只写给会读响应头的人——客户端与本仓的判据都读不到。
    // 两个都留：头给标准客户端，body 给本仓自己的界面与判据。
    const res = await jsonError(429, 'rate_limited', {
      message: '尝试次数过多，请稍后再试',
      retryAfterMs: rl.retryAfterMs,
    });
    res.headers.set('retry-after', String(Math.ceil(rl.retryAfterMs / 1000)));
    return res;
  }

  try {
    const result = await login(parsed.data, {
      currentToken: await currentSessionToken(),
      userAgent: req.headers.get('user-agent'),
      ip,
    });
    if ('code' in result) {
      // 失败的登录也记，但**不记是哪个邮箱**：这张表迟早会被更多人看到，
      // 把尝试过的账号写进去，等于自己造了一份可枚举的用户清单（§129 的隐私边界同样适用）
      await recordAudit({ actorId: null, action: 'auth.login', targetType: 'account', allowed: false, detail: { reason: result.code }, ip });
      return fromError(result);
    }
    await recordAudit({ actorId: result.user.id, action: 'auth.login', targetType: 'account', targetId: result.user.id, allowed: true, ip });
    return applySessionCookie(NextResponse.json({ user: result.user }), result.sessionToken);
  } catch (error) {
    return await failure(error, 'POST /api/auth/login');
  }
}
