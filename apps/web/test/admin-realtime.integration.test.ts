import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET as getRealtimeStats } from '../src/app/api/admin/realtime/route';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { getRealtimeBus, setRealtimeBus, type RealtimeBus } from '../src/server/realtime/bus';
import { getDb } from '../src/server/db/client';
import { sessions, users } from '../src/server/db/schema';

/**
 * §163 诊断入口 `GET /api/admin/realtime` 的三道门，打真库。
 *
 * 这个端点交出的是"整台实例的线路怎么样"（不是"你自己的连接"），所以门与复核台
 * 同一句口径：没登录 401、不是 role=admin 一律 403。外加一条读单例的见证——
 * 诊断页读的必须是 `getRealtimeBus()` 那份现场，不是某一个类的静态属性：
 * 换掉单例（测试、将来的多驱动装配都这么干），回执要跟着换。
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
    .values({ displayName: '诊断门-普通人', email: 'dgate+plain@nexus.test' })
    .returning({ id: users.id });
  const [u2] = await db
    .insert(users)
    .values({ displayName: '诊断门-审核员', email: `dgate+admin@nexus.test`, role: 'admin' })
    .returning({ id: users.id });
  regular = u1!;
  admin = u2!;
  regularToken = await identityFor(regular);
  adminToken = await identityFor(admin);
});

afterEach(() => {
  setRealtimeBus(undefined); // 换过单例的用例（读单例那条）不能把下一条的现场污染掉
});

afterAll(async () => {
  const db = getDb();
  await db.delete(users).where(eq(users.id, regular.id));
  await db.delete(users).where(eq(users.id, admin.id));
});

describe('§163 诊断入口的门', () => {
  it('没登录 → 401', async () => {
    jar.clear();
    const res = await getRealtimeStats();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthenticated');
  });

  it('不是 role=admin → 403，连一个字段都不给', async () => {
    asUser(regularToken);
    const res = await getRealtimeStats();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
    expect(body.message).toContain('role=admin');
    expect(body.driver).toBeUndefined();
  });

  it('admin → 200，回执形状就是总线自报的那份（null 不被改成 0）', async () => {
    asUser(adminToken);
    const res = await getRealtimeStats();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.driver === 'in-process' || body.driver === 'redis').toBe(true);
    expect(typeof body.instance).toBe('string');
    expect(typeof body.subscriberCount).toBe('number');
    // 进程内驱动这两格是 null（不适用），0 是"跑着没断过帧的 Redis"——形状门钉死别被抹平
    expect(body.wireReady === null || typeof body.wireReady === 'boolean').toBe(true);
    expect(body.wireErrorCount === null || typeof body.wireErrorCount === 'number').toBe(true);
    if (body.driver === 'in-process') {
      expect(body.wireReady).toBeNull();
      expect(body.wireErrorCount).toBeNull();
    }
  });

  it('读的是单例：换掉总线，回执跟着换（诊断不是某个类的静态属性）', async () => {
    const fake: RealtimeBus = {
      publish: () => undefined,
      subscribe: () => () => undefined,
      closeChannel: () => undefined,
      subscriberCount: () => 7,
      stats: () => ({ driver: 'redis', instance: '被换上的那台', subscriberCount: 7, wireReady: true, wireErrorCount: 2 }),
    };
    setRealtimeBus(fake);
    asUser(adminToken);
    const res = await getRealtimeStats();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.instance).toBe('被换上的那台');
    expect(body.wireErrorCount).toBe(2);
    expect(body.subscriberCount).toBe(7);
    // 反向对照：页面上那份现场真的是它，而不是碰巧同形的默认驱动
    expect(getRealtimeBus()).toBe(fake);
  });
});
