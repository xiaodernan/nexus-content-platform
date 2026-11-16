import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { POST as login } from '../src/app/api/insight/login/route';
import { getRateLimiter, setRateLimiter } from '../src/server/security/rateLimit';
import { MemoryRateLimiter } from '../src/server/security/rateLimitMemory';

/**
 * §九 撞库场景（真实流量视角）：一个脚本拿住一个 IP，在该 5 分钟窗口里连续试 31 个错误口令，
 * 要求第 31 次被闸拒——**不是**"多试几次总比拒绝好"，而是闸本身真的挡住。
 *
 * 口令是产品决策（默认 `123`，§159 口径公开），防止的是**无限成本**而不是蓄意攻击，
 * 所以这一格测的是：限流判定管不管用（30 次放行 4xx，31 次 429），以及不同 IP 互不影响。
 * 不 mock 限流器——换掉单例，以进程内 memory 驱动（no Redis dependence in this suite）。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => { jar.set(name, value); },
    delete: (name: string) => { jar.delete(name); },
  }),
}));

function req(ip: string, password: unknown): Request {
  return new Request('http://localhost/api/insight/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ password }),
  });
}

beforeAll(() => {
  const previous = getRateLimiter();
  setRateLimiter(new MemoryRateLimiter());
  return () => setRateLimiter(previous);
});

afterAll(() => setRateLimiter(undefined));

describe('§九 /api/insight/login 撞库（IP 限流 30/5min 真门）', () => {
  it('同一 IP 连续 30 次错误口令得 401，第 31 次起得 429 与 retryAfterMs', async () => {
    let lastStatus = 0;
    for (let i = 0; i < 30; i += 1) {
      const res = await login(req('203.0.113.101', '000'));
      lastStatus = res.status;
      expect(res.status, `第 ${i + 1} 次错误口令应为 401`).toBe(401);
    }
    expect(jar.size, '没有一次成功登录，cookie 不该落地').toBe(0);

    const res = await login(req('203.0.113.101', '000'));
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error?: string; retryAfterMs?: number };
    expect(body.error).toBe('rate-limited');
    expect(typeof body.retryAfterMs).toBe('number');
    expect(body.retryAfterMs).toBeGreaterThanOrEqual(0);
    expect(body.retryAfterMs).toBeLessThanOrEqual(300_000);
  });

  it('闸开着时，-正确口令也进不去（429 ≠ 200：口令正确不豁免限流）', async () => {
    const res = await login(req('203.0.113.101', '123'));
    expect(res.status).toBe(429);
    expect(jar.has('nexus-insight')).toBe(false);
  });

  it('不同 IP 不受影响（被挡住的是那一只桶，不是整个路由）', async () => {
    const res = await login(req('203.0.113.102', '123'));
    expect(res.status).toBe(200);
    expect(jar.get('nexus-insight')).toBe('1');
    jar.clear();
  });

  it('错误口令（非字符串 / 空串）也计入预算，不会因为"不像口令"绕过去', async () => {
    // 30/5min: 已是 fresh IP
    for (let i = 0; i < 30; i += 1) {
      const res = await login(req('203.0.113.103', undefined as unknown as string));
      expect(res.status).toBe(401);
    }
    const res = await login(req('203.0.113.103', '000'));
    expect(res.status).toBe(429);
  });
});
