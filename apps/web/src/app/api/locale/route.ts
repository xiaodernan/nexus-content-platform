import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, isLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * POST /api/locale { locale: 'zh' | 'en' } —— 写语言 cookie。
 * - 非法值直接 400；绝不自我降级（英文页面希望中文视图就必须明确请求中文）
 * - SameSite=Lax；path=/；https-only 在生产部署（见 ENVIRONMENT.md）
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }
  const locale = (body as { locale?: unknown } | null)?.locale;
  if (!isLocale(locale)) {
    return NextResponse.json({ error: 'unsupported-locale', supported: ['zh', 'en'] }, { status: 400 });
  }
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale as Locale, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return NextResponse.json({ locale });
}
