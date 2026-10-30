import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientIp, getRateLimiter, rateKey } from '../src/server/security/rateLimit';

/** 滑动窗口限流（SECURITY.md 认证节：按 用户 + IP + 路由）。 */
describe('rateLimit（内存滑动窗口）', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T00:00:00Z'));
    await getRateLimiter().reset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('窗口内放行到上限，之后挡住', async () => {
    const rl = getRateLimiter();
    const key = rateKey('auth/login', '1.2.3.4', 'a@b.c');
    for (let i = 0; i < 5; i += 1) expect((await rl.hit(key, 5, 60_000)).allowed).toBe(true);
    const blocked = await rl.hit(key, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(5);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('被挡下的请求不计入窗口（否则限流形同加速自锁）', async () => {
    const rl = getRateLimiter();
    const key = 'route|anon|ip';
    await rl.hit(key, 2, 60_000);
    await rl.hit(key, 2, 60_000);
    expect((await rl.hit(key, 2, 60_000)).allowed).toBe(false);
    expect((await rl.hit(key, 2, 60_000)).count).toBe(2); // 仍是 2，没被拒请求顶上去
  });

  it('窗口滑过后名额重新放出', async () => {
    const rl = getRateLimiter();
    const key = 'route|user|ip';
    await rl.hit(key, 2, 60_000);
    await rl.hit(key, 2, 60_000);
    expect((await rl.hit(key, 2, 60_000)).allowed).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect((await rl.hit(key, 2, 60_000)).allowed).toBe(true);
  });

  it('不同键互不影响（按 用户+IP+路由 分桶）', async () => {
    const rl = getRateLimiter();
    expect((await rl.hit('a', 1, 60_000)).allowed).toBe(true);
    expect((await rl.hit('a', 1, 60_000)).allowed).toBe(false);
    expect((await rl.hit('b', 1, 60_000)).allowed).toBe(true);
  });

  it('reset(key) 只清一个桶', async () => {
    const rl = getRateLimiter();
    await rl.hit('x', 1, 60_000);
    await rl.hit('y', 1, 60_000);
    await rl.reset('x');
    expect((await rl.hit('x', 1, 60_000)).allowed).toBe(true);
    expect((await rl.hit('y', 1, 60_000)).allowed).toBe(false);
  });
});

describe('限流键与 IP 提取', () => {
  it('rateKey 把路由 / 身份 / IP 拼成稳定桶键', () => {
    expect(rateKey('auth/login', '9.9.9.9', 'u')).toBe('auth/login|u|9.9.9.9');
    expect(rateKey('auth/register', null)).toBe('auth/register|anon|no-ip');
  });

  /**
   * 取的是**右端**，不是第一段。这一条原来写着"取 x-forwarded-for 第一段"并且真的断到
   * `1.1.1.1`——那是链条里客户端随手写的那一段，每请求换一个值就换一个限流桶。
   * 读法与限度见 `client-ip.test.ts` 与 `docs/adr/0070-forwarded-ip-take-rightmost-trusted-hop.md`。
   */
  it('clientIp 取 x-forwarded-for 右端（反代追加的那一段），回落 x-real-ip', () => {
    expect(clientIp(new Request('http://x', { headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' } }))).toBe('2.2.2.2');
    expect(clientIp(new Request('http://x', { headers: { 'x-real-ip': '3.3.3.3' } }))).toBe('3.3.3.3');
    expect(clientIp(new Request('http://x'))).toBeNull();
  });
});
