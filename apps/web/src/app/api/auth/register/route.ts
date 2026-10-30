import { z } from 'zod';
import { NextResponse } from 'next/server';
import { requireUser, currentSessionToken } from '@/server/domain/session';
import { register, type AuthError } from '@/server/domain/auth';
import { csrfOk } from '@/server/security/csrf';
import { recordAudit } from '@/server/domain/audit';
import { applySessionCookie } from '@/server/security/authCookies';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { badRequest, jsonError, readJson, failure } from '@/server/http';

const Schema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(60).optional(),
});

function fromError(error: AuthError): NextResponse {
  const message =
    error.code === 'email_taken'
      ? '该邮箱已被注册'
      : error.code === 'already_registered'
        ? '当前会话已是注册账号'
        : error.code === 'no_identity'
          ? '会话无效'
          : '认证失败';
  return jsonError(error.status, error.code, { message });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });

  const ip = clientIp(req);
  // 注册按 IP 限流：挡住批量建号，正常用户几乎碰不到。
  const rl = await getRateLimiter().hit(rateKey('auth/register', ip), 10, 60 * 60 * 1000);
  if (!rl.allowed) return jsonError(429, 'rate_limited', { message: '注册过于频繁，请稍后再试' });

  const body = await readJson(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));

  try {
    const current = await requireUser();
    const result = await register(current, parsed.data, {
      currentToken: await currentSessionToken(),
      userAgent: req.headers.get('user-agent'),
      ip,
    });
    if ('code' in result) {
      // 与登录失败同一条口径：记原因码，不记邮箱（审计页会被更多人看到）
      await recordAudit({ actorId: null, action: 'auth.register', targetType: 'account', allowed: false, detail: { reason: result.code }, ip });
      return fromError(result);
    }
    // 注册是 guest → 真实账号的提权时刻，还会把名下 guest 项目就地认领——两件都该留痕
    await recordAudit({
      actorId: result.user.id,
      action: 'auth.register',
      targetType: 'account',
      targetId: result.user.id,
      allowed: true,
      detail: { claimedProjects: result.claimedProjects },
      ip,
    });
    return applySessionCookie(NextResponse.json({ user: result.user, claimedProjects: result.claimedProjects }), result.sessionToken);
  } catch (error) {
    return failure(error, 'POST /api/auth/register');
  }
}
