import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET as getRateLimitStats } from '../src/app/api/admin/rate-limit/route';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { getRateLimiter, setRateLimiter, type RateLimiter, type RateLimiterReadout } from '../src/server/security/rateLimit';
import { REDIS_URL_ENV, RedisRateLimiter } from '../src/server/security/rateLimitRedis';
import { getDb } from '../src/server/db/client';
import { sessions, users } from '../src/server/db/schema';

/**
 * §SEC 第三十五片 `GET /api/admin/rate-limit` 的门与回执，打真库。
 *
 * 这一格存在的理由是三个 ADR 挂了同久的那句"仍欠"：装的哪个驱动、名额钉在几、有没有正在退回，
 * 原来只有启动日志与 Prometheus 那两个 counter 会说。所以用例钉的全是**能被读反的地方**：
 * - 进程内那三个"不适用"（`keyPrefix` / `fallbackCount` 是 `null`，`wire` 是 `'na'`）不能被抹成 0 或 `'up'`；
 * - `deployment.redisUrlConfigured` 与 `driver` 分开交出：一句是"该装哪个"，一句是"现在在跑哪个"，
 *   合成一句就看不出"变量没设 ⇒ 每台各数各的"那句代价；
 * - 按原因的两本账来自 metrics 现读，不是驱动自报——驱动说"退过 3 次"而 counters 说 0 时，
 *   这一页必须说出 counters 那句（同一句话只有一个写入方）。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(user: { id: string }): Promise<string> {
  const token = `tok-${user.id}`;
  await getDb()
    .insert(sessions)
    .values({ userId: user.id, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

function asUser(token: string): void {
  jar.clear();
  jar.set(SESSION_COOKIE, token);
}

let regular: { id: string };
let admin: { id: string };
let regularToken: string;
let adminToken: string;

beforeAll(async () => {
  const db = getDb();
  const [u1] = await db
    .insert(users)
    .values({ displayName: '限流诊断门-普通人', email: 'rlgate+plain@nexus.test' })
    .returning({ id: users.id });
  const [u2] = await db
    .insert(users)
    .values({ displayName: '限流诊断门-审核员', email: 'rlgate+admin@nexus.test', role: 'admin' })
    .returning({ id: users.id });
  regular = u1!;
  admin = u2!;
  regularToken = await identityFor(regular);
  adminToken = await identityFor(admin);
});

afterEach(() => {
  setRateLimiter(undefined); // 换过单例的用例不能把下一条的现场污染掉
});

afterAll(async () => {
  const db = getDb();
  await db.delete(users).where(eq(users.id, regular.id));
  await db.delete(users).where(eq(users.id, admin.id));
});

async function stats(): Promise<{ status: number; body: Record<string, unknown> }> {
  asUser(adminToken);
  const res = await getRateLimitStats();
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('§SEC 第三十五片 诊断入口的门', () => {
  it('没登录 → 401', async () => {
    jar.clear();
    const res = await getRateLimitStats();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthenticated');
  });

  it('不是 role=admin → 403，连一个字段都不给', async () => {
    asUser(regularToken);
    const res = await getRateLimitStats();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
    expect(body.message).toContain('role=admin');
    expect(body.driver).toBeUndefined();
    expect(body.bucketCeiling).toBeUndefined();
  });

  it('admin → 200：回执就是驱动自报那份，三个"不适用"不被抹平', async () => {
    const { status, body } = await stats();
    expect(status).toBe(200);
    expect(body.driver === 'in-process' || body.driver === 'redis').toBe(true);
    expect(typeof body.bucketCeiling).toBe('number');
    expect(typeof body.bucketsTracked).toBe('number');
    // 这一句钉的是"windowScope 与 driver 成对"：写反过一次，页面就会把每台各数各的说成共享。
    expect(body.windowScope).toBe(body.driver === 'redis' ? 'shared-across-instances' : 'this-process');
    expect(body.keyPrefix === null || typeof body.keyPrefix === 'string').toBe(true);
    expect(['up', 'pending', 'down', 'na']).toContain(body.wire as string);
    expect(body.fallbackCount === null || typeof body.fallbackCount === 'number').toBe(true);
    if (body.driver === 'in-process') {
      expect(body.keyPrefix).toBeNull();
      expect(body.wire).toBe('na');
      expect(body.fallbackCount).toBeNull();
      expect(body.lastConnectionError).toBeNull();
    }
    expect(body.deployment).toMatchObject({ envVar: REDIS_URL_ENV });
    expect(typeof (body.deployment as { redisUrlConfigured: boolean }).redisUrlConfigured).toBe('boolean');
    expect(typeof (body.deployment as { pid: number }).pid).toBe('number');
    expect(typeof body.fallbackByReason).toBe('object');
    expect(typeof body.bucketsPrunedByReason).toBe('object');
  });

  it('部署那句与现场那句分开交：变量没设 + 单例被换成 Redis 驱动时，两格都得看得见', async () => {
    const readout: RateLimiterReadout = {
      driver: 'redis',
      windowScope: 'shared-across-instances',
      bucketCeiling: 4,
      bucketsTracked: 3,
      keyPrefix: 'gate:swap:',
      wire: 'down',
      fallbackCount: 12,
      lastConnectionError: '故意留给这一条的那一句',
    };
    const fake: RateLimiter = {
      hit: async () => ({ allowed: true, count: 1, retryAfterMs: 0 }),
      reset: async () => undefined,
      describe: () => readout,
    };
    const previous = process.env[REDIS_URL_ENV];
    delete process.env[REDIS_URL_ENV];
    setRateLimiter(fake);
    try {
      const { status, body } = await stats();
      expect(status).toBe(200);
      // 现场说 redis（被人换过），部署说没设——这一条用例钉的就是"这两句不能合成一句"：
      // 合成之后要么丢"这台装的不是按变量该装的那个"，要么丢"多实例部署没接共享窗口"。
      expect(body.driver).toBe('redis');
      expect((body.deployment as { redisUrlConfigured: boolean }).redisUrlConfigured).toBe(false);
      expect(body.keyPrefix).toBe('gate:swap:');
      expect(body.fallbackCount).toBe(12);
      expect(body.lastConnectionError).toBe('故意留给这一条的那一句');
      expect(getRateLimiter()).toBe(fake);
    } finally {
      if (previous === undefined) delete process.env[REDIS_URL_ENV];
      else process.env[REDIS_URL_ENV] = previous;
    }
  });

  it('按原因的账来自 metrics，不是驱动自述：真退一次，那一格就在回执里涨', async () => {
    // 一条连不上的线路：判定必然走 `command-failed` 那一支，于是 counters 与自报数必须同向。
    const limiter = new RedisRateLimiter({ url: 'redis://127.0.0.1:56399', keyPrefix: 'gate:reasons:' });
    setRateLimiter(limiter);
    try {
      await limiter.hit('gate/reasons|u|127.0.0.1', 2, 60_000);
      const { status, body } = await stats();
      expect(status).toBe(200);
      expect(body.driver).toBe('redis');
      const reasons = body.fallbackByReason as Record<string, number>;
      expect(reasons['command-failed'] ?? 0).toBeGreaterThan(0);
      // `over-cap` 在这一条路上不该出现：它和 `command-failed` 对调用方同形，
      // 而界面把两者分开写（"名额用完"与"Redis 坏了"是两句不同的话）。
      expect(reasons['over-cap'] ?? 0).toBe(0);
      expect(body.fallbackCount).toBe(limiter.fallbackCount);
    } finally {
      limiter.dispose();
    }
  });

  it('空格串算"没设"：与选驱动那一步读的是同一个 .trim() 后的值', async () => {
    const previous = process.env[REDIS_URL_ENV];
    process.env[REDIS_URL_ENV] = '   ';
    try {
      const { body } = await stats();
      expect((body.deployment as { redisUrlConfigured: boolean }).redisUrlConfigured).toBe(false);
    } finally {
      if (previous === undefined) delete process.env[REDIS_URL_ENV];
      else process.env[REDIS_URL_ENV] = previous;
    }
  });
});
