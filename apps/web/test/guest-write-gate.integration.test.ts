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
 * 这一份钉四件事：
 *   ① 换 token 绕不过去：第 N+1 个新 token 拿 429，且**一个 guest 都没多建**；
 *   ② 正对照：稳定身份（真浏览器存 cookie）照旧放行，第 N+1 次仍由原有那道
 *      按身份的闸去管——IP 闸是兜底，不是替代；
 *   ③ 闸只认**能标识出来**的 IP：两行头都不在场时这道闸让路
 *      （给标识不出的请求一个共享桶会把正常用户一起挡掉，那是用一种故障换另一种故障）；
 *   ④ 标识的方式不能是"谁写的头就信谁"：`x-forwarded-for` 是追加出来的链条，
 *      取最左端＝取客户端随手写的那一段，换一行头就换一个桶，①②③ 全部空转。
 *      现在取可信链的**右端**（`NEXUS_TRUSTED_PROXY_COUNT`），读不出的垃圾头归进一个
 *      共享桶而不是豁免。读法、限度与判决见 `docs/adr/0070-forwarded-ip-take-rightmost-trusted-hop.md`。
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

/** `forwarded` 是这一行头**照原样**写进去的值——链条形状（一段 / 左端轮换右端固定 / 垃圾）就是被测的东西。 */
function createProject(token: string, forwarded: string | null): Promise<Response> {
  jar.clear();
  jar.set(CSRF_COOKIE, CSRF_TOKEN);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    cookie: `${CSRF_COOKIE}=${CSRF_TOKEN}`,
    [CSRF_HEADER]: CSRF_TOKEN,
  };
  if (forwarded !== null) headers['x-forwarded-for'] = forwarded;
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

function report(token: string, forwarded: string | null): Promise<Response> {
  jar.clear();
  jar.set(CSRF_COOKIE, CSRF_TOKEN);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    cookie: `${CSRF_COOKIE}=${CSRF_TOKEN}`,
    [CSRF_HEADER]: CSRF_TOKEN,
  };
  if (forwarded !== null) headers['x-forwarded-for'] = forwarded;
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
      statuses.push((await createProject(randomHex(), IP)).status);
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
    for (let i = 0; i < 3; i += 1) statuses.push((await createProject(stable, IP)).status);
    expect(statuses).toEqual([201, 201, 201]);
    expect((await guestCount()) - before).toBe(1);
  });

  it('公开举报入口同样被兜住：换 token 也绕不过', async () => {
    getRateLimiter().reset();
    const before = await guestCount();
    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) statuses.push((await report(randomHex(), IP)).status);
    // 前 20 个走到"没有这个公开页面"（404），后 5 个被闸挡下（429）
    expect(statuses.slice(0, 20).every((s) => s === 404)).toBe(true);
    expect(statuses.slice(20).every((s) => s === 429)).toBe(true);
    expect((await guestCount()) - before).toBe(20);
  });

  it('标识不出 IP 时这道闸让路——不拿共享桶把正常用户一起挡掉', async () => {
    getRateLimiter().reset();
    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) statuses.push((await createProject(randomHex(), null)).status);
    expect(statuses.every((s) => s === 201)).toBe(true);
  });

  /**
   * 下面两条是这一片的存在理由，也是上面那四条**前提**被推翻时的证人。
   *
   * 上面四条都只写一段 `x-forwarded-for`，于是"取最左端"与"取最右端"在它们眼里是同一件事——
   * 四道闸跑绿了，闸却挡不住一个会写头的客户端：`clientIp()` 原来读的是 `split(',')[0]`，
   * 那一段是**客户端自己写的**（`base-server.js:612` 用的是 `??=`：头在场时 Next 原样透传，
   * 不追加也不校验；真实反代是**追加**，右端才是它亲眼看到的对端）。
   * 所以每请求换一个左端值就是换一个桶，`projects/create` 那道 20/h 当场空转。
   *
   * 这里的形状是真部署的形状：左端轮换、右端由前置反代补上（固定）。修完之后 25 次全落进
   * 同一个桶——前 20 放行、后 5 个 429，且被挡住的那 5 个一个 guest 都没建。
   */
  it('换着写链条左端（反代在右边补上真对端）也绕不过这道闸', async () => {
    getRateLimiter().reset();
    const before = await guestCount();
    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      // 左端每请求换一个 `192.0.2.x`（TEST-NET-1），右端固定＝反代亲眼看到的对端
      statuses.push((await createProject(randomHex(), `192.0.2.${(i % 250) + 1}, ${IP}`)).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(20).every((s) => s === 429)).toBe(true);
    expect((await guestCount()) - before).toBe(20);
  });

  /**
   * 头在场却读不出地址 ≠ 标识不出。旧读法把 `evil-n` 直接当身份拼进桶键，于是
   * "写一行垃圾"与"写一行真 IP"一样能轮换换桶；现在这批全归进 `invalid-xff` 一个桶，
   * 到 20 就挡。上面那句"标识不出时让路"继续成立——两件事的差别就在这儿。
   */
  it('写一行读不出的垃圾头换不来免限流：25 次里第 21 次起 429', async () => {
    getRateLimiter().reset();
    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) statuses.push((await createProject(randomHex(), `evil-${i}`)).status);
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(20).every((s) => s === 429)).toBe(true);
  });
});
