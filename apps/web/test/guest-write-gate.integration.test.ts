import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { POST as postProjects } from '../src/app/api/projects/route';
import { POST as postReport } from '../src/app/api/published/report/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { getRateLimiter } from '../src/server/security/rateLimit';
import { getDb } from '../src/server/db/client';
import { users } from '../src/server/db/schema';

/**
 * §137 的 guest 自动签发，把"按 user.id 限流"这一族变成了空转。
 *
 * 中间件给每个没有会话 cookie 的请求签一个**随机** token，`requireUser()`
 * 拿不到会话行就就地建一个 guest 用户。于是按 user.id 拼的限流键对不存 cookie 的
 * 客户端每次都是新键。修法是在 `requireUser()` **之前**加一道按 IP 的闸
 * （`ipWriteGate`），闸必须在身份之前——被挡住的请求一个 guest 都不该建。
 *
 * 这一份钉三件事：
 *   ① 换 token 绕不过去：第 N+1 个新 token 拿 429，且**一个 guest 都没多建**；
 *   ② 正对照：稳定身份（真浏览器存 cookie）照旧放行，第 N+1 次仍由原有那道
 *      按身份的闸去管——IP 闸是兜底，不是替代；
 *   ③ 闸只认**能标识出来**的 IP：没有 x-forwarded-for / x-real-ip 时这道闸让路
 *      （给标识不出的请求一个共享桶会把正常用户一起挡掉，那是用一种故障换另一种故障）。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'e5f7a9c1b3d52086';
const IP = '203.0.113.7';

function randomHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function guestCount(): Promise<number> {
  const [row] = await getDb().select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.guest, true));
  return row?.n ?? 0;
}

function createProject(token: string, withIp: boolean): Promise<Response> {
  jar.clear();
  jar.set(CSRF_COOKIE, CSRF_TOKEN);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    cookie: `${CSRF_COOKIE}=${CSRF_TOKEN}`,
    [CSRF_HEADER]: CSRF_TOKEN,
  };
  if (withIp) headers['x-forwarded-for'] = IP;
  if (token) {
    jar.set('nexus_session', token);
    headers.cookie += `; nexus_session=${token}`;
  }
  return postProjects(
    new Request('http://localhost:3100/api/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: `闸门探针 ${randomHex().slice(0, 6)}`, kind: 'website' }),
    }),
  );
}

function report(token: string, withIp: boolean): Promise<Response> {
  jar.clear();
  jar.set(CSRF_COOKIE, CSRF_TOKEN);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    cookie: `${CSRF_COOKIE}=${CSRF_TOKEN}`,
    [CSRF_HEADER]: CSRF_TOKEN,
  };
  if (withIp) headers['x-forwarded-for'] = IP;
  if (token) {
    jar.set('nexus_session', token);
    headers.cookie += `; nexus_session=${token}`;
  }
  return postReport(
    new Request('http://localhost:3100/api/published/report', {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: '/n/probe/闸门', reason: 'spam', detail: '探针' }),
    }),
  );
}

beforeAll(() => {
  getRateLimiter().reset();
});

afterAll(async () => {
  const db = getDb();
  await db.execute(sql`delete from abuse_reports where reporter_id in (select id from users where guest = true)`);
  await db.execute(sql`delete from projects where owner_id in (select id from users where guest = true)`);
  await db.execute(sql`delete from users where guest = true`);
});

describe('§137 guest 自动签发：换 cookie 绕不过按 IP 的闸', () => {
  it('12 个不同 token 打 POST /api/projects——第 21 次起 429，且被挡的那些一个 guest 都没建', async () => {
    getRateLimiter().reset();
    const before = await guestCount();
    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      statuses.push((await createProject(randomHex(), true)).status);
    }
    const created = (await guestCount()) - before;
    // 20/h 的闸：前 20 放行，后 5 个 429
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(20).every((s) => s === 429)).toBe(true);
    // 关键判据：被挡住的请求没有付出"建一个 guest 用户"的代价
    expect(created).toBe(20);
  });

  it('正对照：稳定身份照旧放行，第 N+1 次由原有那道按身份的闸去管', async () => {
    getRateLimiter().reset();
    const before = await guestCount();
    const stable = randomHex();
    const statuses: number[] = [];
    for (let i = 0; i < 3; i += 1) statuses.push((await createProject(stable, true)).status);
    expect(statuses).toEqual([201, 201, 201]);
    expect((await guestCount()) - before).toBe(1);
  });

  it('公开举报入口同样被兜住：换 token 也绕不过', async () => {
    getRateLimiter().reset();
    const before = await guestCount();
    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) statuses.push((await report(randomHex(), true)).status);
    // 前 20 个走到"没有这个公开页面"（404），后 5 个被闸挡下（429）
    expect(statuses.slice(0, 20).every((s) => s === 404)).toBe(true);
    expect(statuses.slice(20).every((s) => s === 429)).toBe(true);
    expect((await guestCount()) - before).toBe(20);
  });

  it('标识不出 IP 时这道闸让路——不拿共享桶把正常用户一起挡掉', async () => {
    getRateLimiter().reset();
    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) statuses.push((await createProject(randomHex(), false)).status);
    expect(statuses.every((s) => s === 201)).toBe(true);
  });
});
