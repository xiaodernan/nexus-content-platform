import { increment } from '../observability';
import type { RateLimitDecision, RateLimiter } from './rateLimit';

/**
 * 进程内驱动：滑动窗口存在**这台进程**的内存里。
 *
 * 默认就是它（`rateLimit.ts` 的驱动选择：不设 `NEXUS_REDIS_URL` 用它）。单进程 dev、
 * vitest、e2e 都只有一个 web 进程，这里是对的，而且不必为了限流去依赖一个外部服务。
 *
 * 它在多实例下的退化方式要写明白：**每实例独立限流**，不是"不限量"。
 * 两个实例下 `10 次/15 分钟/邮箱` 实际是"每台 10 次"，攻击者只要把请求分摊到两台
 * 前端就能拿到 20 次。那正是 `rateLimitRedis.ts` 存在的理由，而换驱动不换调用方——
 * `RateLimiter` 那两个方法两边一模一样。
 *
 * 与 Redis 驱动必须逐条对齐的三条语义（谁改了另一条没跟，多实例与单实例就会给出
 * 两个不同的答案，而那是最难查的一种不一致）：
 * 1. 被挡下的那一次**不计入窗口**（否则"一直撞上限"比"一直干活"涨得更快，限流成了加速自锁）；
 * 2. 窗口边界是**严格大于** cutoff 的留下来（`t > now - windowMs`）；
 * 3. `retryAfterMs` 从窗口里**最早那一条**到期的时刻算，不是从窗口长度算。
 * 见证在 `apps/web/test/rate-limit.redis.integration.test.ts` 的 parity 一组：同一串请求分别
 * 打到两个驱动，每格的 `allowed / count` 必须相同，`retryAfterMs` 在 50ms 容差内（两边的时钟
 * 本来就是两套：这一版用主机 `Date.now()`，那一版用 Redis 服务端 `TIME`）。
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
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

  async reset(key?: string): Promise<void> {
    if (key === undefined) this.hits.clear();
    else this.hits.delete(key);
  }
}
