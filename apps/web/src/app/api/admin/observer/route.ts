import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * 口令 123 · 只读观察站守门（2026-11-17 / §ADMIN-13）
 *
 * 为什么明文 123：这是**刻意公开**的共享口令——用户（项目负责人）明确要求
 * 「密码输入 123 就能进，所有用户都知道密码也都能进管理员页面」。它不是鉴权秘密，
 * 只是一道「你知道你在做什么」的摩擦。它不换任何权限：
 * - 成功只发 `nx_observer` 只读 cookie（path=/admin/observe），不能写、不能删、
 *   不能改角色、不能访问 role=admin 的控制面；
 * - 失败只给 401，不记账、不引导攻击者枚举（口令本来公开，无可枚举）。
 *
 * 防刷：同一 IP 每小时 30 次尝试（进程内计数，尽力而为；跨实例不合并）。
 */

export const OBSERVER_COOKIE = 'nx_observer';
export const OBSERVER_COOKIE_VALUE = 'observer-123';

/** 与 /admin 读数同源——口令公开，但刷子不能把这页打成 DoS。 */
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 30;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function ipOf(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return request.headers.get('x-real-ip')?.trim() ?? 'local';
}

export async function POST(request: Request) {
  const ip = ipOf(request);
  const now = Date.now();
  const bucket = ipHits.get(ip);
  if (bucket && now < bucket.resetAt && bucket.count >= RATE_LIMIT) {
    return NextResponse.json({ error: 'rate-limited', retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) }, { status: 429 });
  }
  if (!bucket || now >= bucket.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
  } else {
    bucket.count += 1;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }
  const password = (body as { password?: unknown } | null)?.password;
  if (typeof password !== 'string' || password !== '123') {
    const store = await cookies();
    store.delete(OBSERVER_COOKIE);
    return NextResponse.json({ error: 'wrong-password' }, { status: 401 });
  }
  const store = await cookies();
  store.set(OBSERVER_COOKIE, OBSERVER_COOKIE_VALUE, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/admin/observe',
    maxAge: 60 * 60 * 24 * 30,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(OBSERVER_COOKIE);
  return NextResponse.json({ ok: true });
}
