/**
 * 速率限制：滑动窗口（SECURITY.md「认证与授权」——按 用户 + IP + 路由）。
 *
 * 后端可替换（§64）：默认用进程内内存驱动，够用且单进程 dev 正确。
 * 生产多实例时换成 Redis 驱动（ZRANGEBYSCORE + ZADD 的有序集滑动窗口），
 * 保持本接口形状不变即可——和 storage 的 resolveStorage 一个套路。
 * 内存驱动在多实例下退化为「每实例独立限流」，这是要接 Redis 的原因，
 * 但绝不是「不限量」：单实例仍能挡住暴力破解。
 */

import { increment } from '../observability';

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
    /**
     * 只取键的第一段（路由字面量）当标签，不看后面两段。
     * 限流键的形状是 `路由|身份|IP`，而 `auth/login` 那一格的"身份"传的是**邮箱**
     * （`rateKey('auth/login', ip, parsed.data.email.toLowerCase())`）——整串键进指标标签，
     * 等于把账号名单与 IP 抄进一个内存里长住、访问面还可能更宽的地方。
     * 闸的判定次数不需要知道是谁；要查具体人时去审计表，那张表有访问门与保留期。
     */
    increment('nexus_rate_limit_decisions_total', { gate: key.split('|')[0] ?? 'unknown', allowed: String(allowed) });
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

/**
 * 身份之前的闸：§137 的 guest 自动签发把"按 user.id 限流"这一族变成了空转。
 *
 * 中间件给每个没有会话 cookie 的请求签一个**随机** token 并写回 cookie，
 * `requireUser()` 拿不到会话行就**就地建一个 guest 用户**。于是按 `user.id`
 * 拼的限流键对"不存 cookie 的客户端"每次都是新键——实测（`.scratch` 探针，
 * 打 `/api/published/report`）：
 *   12 个不同 token → 建 12 个 guest 用户、**0 次 429**；
 *   同一个 token 打 12 次 → 只建 1 个 guest，第 11 次起 429（按身份的那道闸本身是生效的）。
 * 更糟的是 `POST /api/projects`、`POST /api/ai/run`、`POST /api/account/api-tokens`
 * 这几条**本来就没有任何限流**：于是一个绕开 cookie 的客户端可以无上限地
 * 建用户 + 项目 + 文档 + 任务行，把"首次体验"变成一条免成本的写入口。
 *
 * 所以在拿到身份**之前**先按 IP 挡一道，且闸门必须放在 `requireUser()` 之前——
 * 被挡住的请求一个 guest 都不该建（建了就是"限流了但还是付了代价"）。
 * 与 `auth/register` 同一形状（那一格早就这么做了：`rateKey('auth/register', ip)`）。
 *
 * 两条限度，说清而不是绕过去：
 * 1. **标识不出来的请求不进这个桶**（没有 `x-forwarded-for` / `x-real-ip`）。
 *    限流只能限住能标识的对象；给标识不出的请求一个共享桶，会把同部署下的
 *    正常用户一起挡掉——那是用一种故障换另一种故障。生产前面总有反代，会带上 XFF。
 * 2. IP 是粗粒度身份：同一 NAT 后的多人共用一个桶。所以限额取宽，
 *    真正的"这个人"仍由各路由原有的按身份闸去管——这里是兜底，不是替代。
 */
export function ipWriteGate(
  route: string,
  req: Request,
  limit: number,
  windowMs: number,
): { limited: false } | { limited: true; retryAfterMs: number } {
  const ip = clientIp(req);
  if (!ip) return { limited: false };
  const rl = getRateLimiter().hit(rateKey(route, ip), limit, windowMs);
  return rl.allowed ? { limited: false } : { limited: true, retryAfterMs: rl.retryAfterMs };
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
