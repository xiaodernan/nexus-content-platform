import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '../domain/session';
import { CSRF_COOKIE } from './csrf';

const isProd = process.env.NODE_ENV === 'production';

/** 把轮换出的会话 token 写成 HttpOnly cookie。 */
export function applySessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 86_400,
    secure: isProd,
  });
  return response;
}

/** 清掉会话 cookie（登出）；CSRF cookie 留给 middleware 重新签发。 */
export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: isProd,
  });
  response.cookies.set(CSRF_COOKIE, '', { sameSite: 'lax', path: '/', maxAge: 0, secure: isProd });
  return response;
}
