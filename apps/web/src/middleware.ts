import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'nexus_session';

/**
 * 免注册首次体验（§137）：会话 cookie 只在这里签发。
 * Server Component 渲染期不能改 cookie，所以 requireUser() 只读；
 * 新签发的 token 通过 request header 透传给同一次渲染，避免为同一浏览器反复建 guest。
 */
export function middleware(request: NextRequest) {
  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  if (existing) return NextResponse.next();

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const headers = new Headers(request.headers);
  headers.set('cookie', `${SESSION_COOKIE}=${token}`);
  const response = NextResponse.next({ request: { headers } });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 86_400,
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
