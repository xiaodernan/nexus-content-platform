/**
 * 速率限制：滑动窗口（SECURITY.md「认证与授权」——按 用户 + IP + 路由）。
 *
 * 后端可替换（§64）：默认用进程内内存驱动，够用且单进程 dev 正确。
 * 生产多实例时换成 Redis 驱动（ZRANGEBYSCORE + ZADD 的有序集滑动窗口），
 * 保持本接口形状不变即可——和 storage 的 resolveStorage 一个套路。
 * 内存驱动在多实例下退化为「每实例独立限流」，这是要接 Redis 的原因，
 * 但绝不是「不限量」：单实例仍能挡住暴力破解。
 */

export interface RateLimiter {
  /** 记一次命中并返回是否放行；同时回带当前窗口计数供 Retry-After 参考。 */
  hit(key: string, limit: number, windowMs: number): { allowed: boolean; count: number; retryAfterMs: number };
  reset(key?: string): void;
}

class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  hit(key: string, limit: number, windowMs: number): { allowed: boolean; count: number; retryAfterMs: number } {
    const now = Date.now();
    const cutoff = now - windowMs;
    const window = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    const allowed = window.length < limit;
    if (allowed) window.push(now);
    this.hits.set(key, window);
    // 窗口里最早那条到期的时间 = 再过多久能腾出一个名额。
    const oldest = window[0] ?? now;
    return { allowed, count: window.length, retryAfterMs: allowed ? 0 : Math.max(0, oldest + windowMs - now) };
  }

  reset(key?: string): void {
    if (key === undefined) this.hits.clear();
    else this.hits.delete(key);
  }
}

let singleton: RateLimiter | undefined;

export function getRateLimiter(): RateLimiter {
  if (!singleton) singleton = new MemoryRateLimiter();
  return singleton;
}

/** 拼限流桶的键：路由 + 身份（用户或 IP）。 */
export function rateKey(route: string, ip: string | null, userId?: string | null): string {
  return `${route}|${userId ?? 'anon'}|${ip ?? 'no-ip'}`;
}

/** 从请求头取调用方 IP（反代下用 x-forwarded-for 第一段）。 */
export function clientIp(request: Request): string | null {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return request.headers.get('x-real-ip');
}
