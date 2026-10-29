import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { POST as postProjects } from '../src/app/api/projects/route';
import { POST as postReport } from '../src/app/api/published/report/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { getRateLimiter } from '../src/server/security/rateLimit';
import { getDb } from '../src/server/db/client';
import { abuseReports, projects, sessions, users } from '../src/server/db/schema';

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
 *   ⑤ 读数与清扫都只算自己：guest 的个数按**本次探针的 token** 关联会话来数，`afterAll` 也只删
 *      这批 token 换到的身份。原来两处都是"全库 guest"——差量会读到同机另一条会话建的行
 *      （2026-10-30 实测红在 `expected 23 to be 20`），那句 `delete ... where guest = true`
 *      更会把她们的 guest 身份连着项目一起删掉。
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

/**
 * 探针用的 token 全部登记下来：读数按 token 收，清扫也按 token 收。
 *
 * 原来这两处都是"全库 guest 行数"：`guestCount()` 的前后差量在别的会话同时建 guest 时会读到
 * 别人的行（2026-10-30 实测红在 `expected 23 to be 20`），`afterAll` 那句 `delete from users
 * where guest = true` 更糟——它把同机另一条会话正在用的 guest 身份连着它的项目一起删掉。
 */
const probeTokens = new Set<string>();

function newProbeToken(): string {
  const token = randomHex();
  probeTokens.add(token);
  return token;
}

/** 会话 token 在库里只存 sha256，读法与 `domain/session.ts` 保持一致。 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function probeTokenHashes(): string[] {
  return [...probeTokens].map(hashToken);
}

/** 这批 token 里有几个真的换到了一个 guest 身份——别人的行一条也算不进来。 */
async function guestsForTokens(tokens: readonly string[]): Promise<number> {
  if (tokens.length === 0) return 0;
  const [row] = await getDb()
    .select({ n: sql<number>`count(distinct ${users.id})::int` })
    .from(users)
    .innerJoin(sessions, eq(sessions.userId, users.id))
    .where(and(inArray(sessions.tokenHash, tokens.map(hashToken)), eq(users.guest, true)));
  return row?.n ?? 0;
}

/** 只清自己造的：先取到本次探针换到的用户 id，再按 id 删引用、会话、用户。 */
async function sweepProbeGuests(): Promise<void> {
  const hashes = probeTokenHashes();
  if (hashes.length === 0) return;
  const db = getDb();
  const rows = await db.select({ userId: sessions.userId }).from(sessions).where(inArray(sessions.tokenHash, hashes));
  const ids = [...new Set(rows.map((r) => r.userId))];
  if (ids.length === 0) return;
  await db.delete(abuseReports).where(inArray(abuseReports.reporterId, ids));
  await db.delete(projects).where(inArray(projects.ownerId, ids));
  await db.delete(sessions).where(inArray(sessions.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
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
  await sweepProbeGuests();
});

describe('§137 guest 自动签发：换 cookie 绕不过按 IP 的闸', () => {
  it('25 个不同 token 打 POST /api/projects——第 21 次起 429，且被挡的那些一个 guest 都没建', async () => {
    getRateLimiter().reset();
    const tokens = Array.from({ length: 25 }, newProbeToken);
    const statuses: number[] = [];
    for (const token of tokens) statuses.push((await createProject(token, IP)).status);
    // 20/h 的闸：前 20 放行，后 5 个 429
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(20).every((s) => s === 429)).toBe(true);
    // 关键判据：被挡住的请求没有付出"建一个 guest 用户"的代价——只数自己这批 token
    expect(await guestsForTokens(tokens)).toBe(20);
  });

  it('正对照：稳定身份照旧放行，第 N+1 次由原有那道按身份的闸去管', async () => {
    getRateLimiter().reset();
    const stable = newProbeToken();
    const statuses: number[] = [];
    for (let i = 0; i < 3; i += 1) statuses.push((await createProject(stable, IP)).status);
    expect(statuses).toEqual([201, 201, 201]);
    expect(await guestsForTokens([stable])).toBe(1);
  });

  it('公开举报入口同样被兜住：换 token 也绕不过', async () => {
    getRateLimiter().reset();
    const tokens = Array.from({ length: 25 }, newProbeToken);
    const statuses: number[] = [];
    for (const token of tokens) statuses.push((await report(token, IP)).status);
    // 前 20 个走到"没有这个公开页面"（404），后 5 个被闸挡下（429）
    expect(statuses.slice(0, 20).every((s) => s === 404)).toBe(true);
    expect(statuses.slice(20).every((s) => s === 429)).toBe(true);
    expect(await guestsForTokens(tokens)).toBe(20);
  });

  it('标识不出 IP 时这道闸让路——不拿共享桶把正常用户一起挡掉', async () => {
    getRateLimiter().reset();
    const tokens = Array.from({ length: 25 }, newProbeToken);
    const statuses: number[] = [];
    for (const token of tokens) statuses.push((await createProject(token, null)).status);
    expect(statuses.every((s) => s === 201)).toBe(true);
    // 让路的样子是"每个 token 都走到签发身份那一步"：25 个都建了 guest
    expect(await guestsForTokens(tokens)).toBe(25);
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
    const tokens = Array.from({ length: 25 }, newProbeToken);
    const statuses: number[] = [];
    for (const [i, token] of tokens.entries()) {
      // 左端每请求换一个 `192.0.2.x`（TEST-NET-1），右端固定＝反代亲眼看到的对端
      statuses.push((await createProject(token, `192.0.2.${(i % 250) + 1}, ${IP}`)).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(20).every((s) => s === 429)).toBe(true);
    expect(await guestsForTokens(tokens)).toBe(20);
  });

  /**
   * 头在场却读不出地址 ≠ 标识不出。旧读法把 `evil-n` 直接当身份拼进桶键，于是
   * "写一行垃圾"与"写一行真 IP"一样能轮换换桶；现在这批全归进 `invalid-xff` 一个桶，
   * 到 20 就挡。上面那句"标识不出时让路"继续成立——两件事的差别就在这儿。
   */
  it('写一行读不出的垃圾头换不来免限流：25 次里第 21 次起 429', async () => {
    getRateLimiter().reset();
    const tokens = Array.from({ length: 25 }, newProbeToken);
    const statuses: number[] = [];
    for (const [i, token] of tokens.entries()) {
      statuses.push((await createProject(token, `evil-${i}`)).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(20).every((s) => s === 429)).toBe(true);
    // 归进共享桶的那批照样付出身份：放行的是前 20 个 token，不是"垃圾头免限流"
    expect(await guestsForTokens(tokens)).toBe(20);
  });

  /**
   * 这一条守的是**读数本身**。旧写法量的是"全库 guest 行数的差量"，同机另一条会话正在建 guest
   * 时它会把别人的行算进我头上（2026-10-30 实测红在 `expected 23 to be 20`）。
   * 这里当场埋一条不属于本文件的 guest，再数自己这批 token——数不进来才算对；
   * 最后那句对照证明"没变"不是因为查不到那条行。
   */
  it('别人家的 guest 数不进来：并行会话共用同一个库时读数仍然只算自己这批 token', async () => {
    getRateLimiter().reset();
    const db = getDb();
    const [foreign] = await db
      .insert(users)
      .values({ displayName: '并行会话的 guest', guest: true })
      .returning({ id: users.id });
    const foreignId = foreign!.id;
    const foreignToken = randomHex();
    try {
      await db
        .insert(sessions)
        .values({ userId: foreignId, tokenHash: hashToken(foreignToken), expiresAt: new Date(Date.now() + 60_000) });

      const tokens = Array.from({ length: 3 }, newProbeToken);
      for (const token of tokens) expect((await createProject(token, IP)).status).toBe(201);
      expect(await guestsForTokens(tokens)).toBe(3);
      // 对照：那条外来的 guest 确实在库里且确实算 guest——读数没变是因为按 token 收，不是查不到行
      expect(await guestsForTokens([foreignToken])).toBe(1);
    } finally {
      await db.delete(users).where(eq(users.id, foreignId));
    }
  });
});
