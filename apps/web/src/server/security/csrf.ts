import { cookies } from 'next/headers';
import { CSRF_COOKIE } from './cookieNames';

/**
 * CSRF：双提交 token（SECURITY.md「认证与授权」）。
 *
 * 会话 cookie 已经是 SameSite=Lax——跨站 POST 不会带上它，这是第一道防线。
 * 双提交是纵深防御：另发一个非 HttpOnly 的 `nexus_csrf` cookie（前端 JS 能读），
 * 状态变更请求必须把它原样放进 `x-csrf-token` 头。攻击者的跨站表单能自动带上
 * cookie，却读不到受害者域下的 cookie 值，也就伪造不出匹配的头。
 * 两者都用 timingSafeEqual 比较，且要求都非空。
 */

export { CSRF_COOKIE };
export const CSRF_HEADER = 'x-csrf-token';

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  // cookie 值只含十六进制，直接逐字符比即可；长度已在上面用早退挡掉时序。
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/** Route Handler 用：请求头里的 token 必须与 cookie 里的 token 都在且相等。 */
export async function csrfOk(request: Request): Promise<boolean> {
  const store = await cookies();
  const fromCookie = store.get(CSRF_COOKIE)?.value ?? '';
  const fromHeader = request.headers.get(CSRF_HEADER) ?? '';
  if (!fromCookie || !fromHeader) return false;
  return safeEqual(fromCookie, fromHeader);
}
