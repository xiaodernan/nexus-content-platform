import { describe, expect, it } from 'vitest';
import { IP_RATE_RULES, rateKey } from '../src/server/security/rateLimit';
import { MemoryRateLimiter } from '../src/server/security/rateLimitMemory';

/**
 * §STRESS-4 credential stuffing, offline and deterministic.
 *
 * No server, no provider, no clock tricks: the same in-process limiter that the login routes
 * use in dev/vitest is driven directly. Two different bucket shapes are exercised:
 *
 *   - auth/login   keyed by (IP, email)  -> stops brute force against ONE account (10/15min).
 *   - insight/login keyed by IP alone    -> stops stuffing ACROSS many accounts (30/5min).
 *
 * The point of the second gate is the hole in the first: an attacker who varies the email
 * gets a fresh per-email bucket every time. Without the IP-wide gate the attempt count is
 * effectively unbounded; with it the 31st try from the same IP is refused.
 */
describe('§STRESS-4 credential stuffing against the two login gates', () => {
  const IP = '198.51.100.23'; // TEST-NET-2, never a real host
  const otherIp = '198.51.100.24';

  it('auth/login refuses the 11th attempt against one email and reports a retry window', async () => {
    const limiter = new MemoryRateLimiter();
    const rule = IP_RATE_RULES['auth/login'];
    const email = 'victim@example.test';
    const key = rateKey('auth/login', IP, email);

    for (let i = 0; i < rule.limit; i++) {
      const decision = await limiter.hit(key, rule.limit, rule.windowMs);
      expect(decision.allowed, `attempt ${i + 1}`).toBe(true);
    }
    const denied = await limiter.hit(key, rule.limit, rule.windowMs);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(rule.windowMs);
  });

  it('a fresh email starts a fresh bucket - which is exactly why the IP-wide gate is needed', async () => {
    const limiter = new MemoryRateLimiter();
    const rule = IP_RATE_RULES['auth/login'];

    for (let i = 0; i < 40; i++) {
      const decision = await limiter.hit(rateKey('auth/login', IP, `user-${i}@example.test`), rule.limit, rule.windowMs);
      expect(decision.allowed, `distinct-email attempt ${i + 1}`).toBe(true);
    }
  });

  it('insight/login refuses the 31st attempt from one IP even when every email is different', async () => {
    const limiter = new MemoryRateLimiter();
    const rule = IP_RATE_RULES['insight/login'];
    const key = rateKey('insight/login', IP);

    for (let i = 0; i < rule.limit; i++) {
      const decision = await limiter.hit(key, rule.limit, rule.windowMs);
      expect(decision.allowed, `ip attempt ${i + 1}`).toBe(true);
    }
    const denied = await limiter.hit(key, rule.limit, rule.windowMs);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(rule.windowMs);
  });

  it('bucket keys keep IP and identity apart: a second IP gets a fresh budget', async () => {
    const limiter = new MemoryRateLimiter();
    const rule = IP_RATE_RULES['insight/login'];

    for (let i = 0; i < rule.limit; i++) await limiter.hit(rateKey('insight/login', IP), rule.limit, rule.windowMs);
    expect((await limiter.hit(rateKey('insight/login', IP), rule.limit, rule.windowMs)).allowed).toBe(false);
    expect((await limiter.hit(rateKey('insight/login', otherIp), rule.limit, rule.windowMs)).allowed).toBe(true);
  });

  it('the two rule rows are pinned to the product-disclosed numbers', () => {
    expect(IP_RATE_RULES['auth/login']).toEqual({ limit: 10, windowMs: 900_000 });
    expect(IP_RATE_RULES['insight/login']).toEqual({ limit: 30, windowMs: 300_000 });
  });
});
