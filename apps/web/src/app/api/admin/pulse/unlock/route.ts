import { NextResponse } from 'next/server';
import { getRateLimiter, ipWriteGate, rateKey, clientIp } from '@/server/security/rateLimit';
import { jsonError } from '@/server/http';

import { PULSE_PASSWORD, PULSE_COOKIE } from '@/server/domain/pulse-gate';

export const dynamic = 'force-dynamic';

/**
 * §PULSE-1 · POST /api/admin/pulse/unlock — 「公开管理台」的口令闸。
 *
 * 项目主人明令：这个面板是**公开口径**——口令是 `123`，所有人都知道，
 * 任何人都能进，用来当场展示「平台现在长什么样」（聚合数字，零个人字段）。
 * 设计上做了三道减 harm：
 *  1) 只发 `nexus_pulse` 这个不带任何身份信息的 cookie（不是会话、不是账号）；
 *  2) 页面与接口都只出聚合值，不出任何能对回个人的字段（见 server/domain/pulse.ts）；
 *  3) IP 限流：5 分钟 10 次，防止被拿来刷（尽管口令人人知道，资源还是要护住）。
 *
 * 口令硬编码是用户本人的显式决定（ADR-0276），不是推断、不是默认值。
 */

const RATE_WINDOW_MS = 5 * 60_000;
const RATE_LIMIT = 10;

function wantsJson(req: Request): boolean {
  return (req.headers.get('content-type') ?? '').includes('application/json');
}

export async function POST(req: Request): Promise<NextResponse> {
  const ip = clientIp(req);
  const gate = await ipWriteGate('pulse/unlock', req);
  if (gate.limited) {
    return jsonError(429, 'rate_limited', { message: '试得太快了，缓一缓再进。', retryAfterMs: gate.retryAfterMs });
  }

  const rl = await getRateLimiter().hit(rateKey('pulse/unlock', ip, 'public'), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { message: '试得太快了，五分钟后再来。', retryAfterMs: rl.retryAfterMs });
  }

  let password = '';
  if (wantsJson(req)) {
    try {
      const body = (await req.json()) as { password?: unknown };
      password = typeof body.password === 'string' ? body.password : '';
    } catch {
      return jsonError(400, 'validation-failed', { message: '请求体必须是 JSON。' });
    }
  } else {
    try {
      const form = await req.formData();
      const value = form.get('password');
      password = typeof value === 'string' ? value : '';
    } catch {
      return jsonError(400, 'validation-failed', { message: '请求必须是表单或 JSON。' });
    }
  }

  if (password !== PULSE_PASSWORD) {
    if (wantsJson(req)) {
      return jsonError(403, 'wrong-password', { message: '口令不对。' });
    }
    return NextResponse.redirect(new URL('/admin/pulse?e=1', req.url), 303);
  }

  if (!wantsJson(req)) {
    const res = NextResponse.redirect(new URL('/admin/pulse', req.url), 303);
    res.cookies.set(PULSE_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 3600,
    });
    return res;
  }

  const res = NextResponse.json({ ok: true, expiresInSeconds: 8 * 3600 });
  res.cookies.set(PULSE_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 3600,
  });
  return res;
}
