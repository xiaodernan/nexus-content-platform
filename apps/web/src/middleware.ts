import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, CSRF_COOKIE } from '@/server/security/cookieNames';

function randomHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 免注册首次体验（§137）：会话 cookie 只在这里签发；Server Component 渲染期不能改 cookie。
 * 新签发的 token 通过 request header 透传给同一次渲染，避免 requireUser 看不到它而反复建 guest。
 * 同时签发 CSRF 双提交 token —— 它必须能被前端 JS 读到（所以不 HttpOnly），
 * 由请求头原样带回与 cookie 比对；不需要本次渲染可见，故不塞进 request header。
 */
export function middleware(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const hasCsrf = Boolean(request.cookies.get(CSRF_COOKIE)?.value);

  const requestHeaders = new Headers(request.headers);
  if (!hasSession) {
    const addition = `${SESSION_COOKIE}=${randomHex()}`;
    const existing = requestHeaders.get('cookie');
    requestHeaders.set('cookie', existing ? `${existing}; ${addition}` : addition);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  const sessionValue = requestHeaders.get('cookie')?.match(new RegExp(`${SESSION_COOKIE}=([a-f0-9]+)`))?.[1];
  if (!hasSession && sessionValue) {
    response.cookies.set(SESSION_COOKIE, sessionValue, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 86_400,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  if (!hasCsrf) {
    response.cookies.set(CSRF_COOKIE, randomHex(), {
      // 故意不加 httpOnly：前端要读它放进 x-csrf-token 头。
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 86_400,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return response;
}

export const config = {
  /**
   * **`/api/projects/import` 不进中间件**（2026-10-21 实测出来的）：
   * Next 16 的中间件会**先把请求正文读进来才运行**（默认上限 10MB，
   * `middlewareClientMaxBodySize`）→ 于是
   * ① 路由处理器拿到的正文**被截断到 10MB** → **合法的 >10MB 导入今天就是坏的**；
   * ② 路由里那道"按 Content-Length 先拒"也来不及跑（要等中间件把正文读完）。
   * 让它绕开中间件之后：路由自己管鉴权（它本来就在管），
   * 头一到手就能判"这个包太大了" → **正文一个字都不用读**。
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/projects/import).*)'],
};
