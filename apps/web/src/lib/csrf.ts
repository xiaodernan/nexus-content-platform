/**
 * 客户端 CSRF 双提交工具：读取 `middleware.ts` 签发的非 HttpOnly `nexus_csrf` cookie，
 * 随状态变更请求放进 `x-csrf-token` 头，与服务端 `csrfOk` 比对（§SECURITY / ADR-0002）。
 *
 * 只在浏览器里跑：SSR 阶段没有 document，返回空头即可，服务端会因头缺失而拒绝——
 * 这也正是我们想要的：任何非浏览器上下文的写入都不该悄悄放行。
 */
export function csrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)nexus_csrf=([a-f0-9]+)/);
  return match?.[1] ?? '';
}

/** 展开进 fetch 的 headers，携带双提交 token。 */
export function csrfHeaders(): Record<string, string> {
  return { 'x-csrf-token': csrfToken() };
}
