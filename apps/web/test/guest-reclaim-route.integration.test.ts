import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { and, eq, inArray, sql as rawSql } from 'drizzle-orm';
import { POST } from '../src/app/api/admin/guests/reclaim/route';
import { getDb } from '../src/server/db/client';
import { auditEvents, sessions, users } from '../src/server/db/schema';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { scanGuestReclaimCandidates } from '../src/server/domain/guest-reclaim';

/**
 * 回收入口 `POST /api/admin/guests/reclaim` 的**路由层**，打真库。
 *
 * 域那一份（`guest-reclaim.integration.test.ts`）钉的是谓词与六件事；这一份只钉路由自己的四件事，
 * 加上两条只有在这一层才看得见的约定：
 *
 * 1. **默认值是"只数一遍"**。`dryRun` 缺省为 true：一条不带 body 的 `POST` 不该等于批量删除。
 *    这一条必须在这一层证，因为它是报文默认值的事，域里拿到的是已经填好的值。
 * 2. **探测不白造身份**。`requireUser()` 会替无会话的请求现造 guest，而这个端点正是拿 guest 开刀的——
 *    用 `currentUserOrNull()` 之后，未登录的那一次应当让 `users` 的行数一个都不多。
 *    这条断言数的是**行数增量**，不是状态码：状态码 401 与"造了一个人再 401"看起来一模一样。
 *
 * 限流那一条按现成的额度跑满 7 次（6 次/10 分钟）才见红，**不为测试放宽闸**；
 * 它用的是另一个审核员，免得把上面几条的额度先吃掉——桶的键里有人。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'a1b2c3d4e5f60718';
const RUN = `s29r${Date.now().toString(36)}`;
const DAY = 86_400_000;
const NOW = new Date(Math.floor(Date.now() / 1000) * 1000);

const userIds: string[] = [];
const tokenByUser = new Map<string, string>();

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function makeAccount(input: { name: string; role: 'creator' | 'admin'; guest: boolean; staleGuest?: boolean }): Promise<string> {
  const createdAt = input.staleGuest ? new Date(NOW.getTime() - 100 * DAY) : new Date(NOW.getTime() - 200 * DAY);
  const [row] = await getDb()
    .insert(users)
    .values({ displayName: input.name, email: input.guest ? null : `${input.name}@nexus.test`, role: input.role, guest: input.guest, createdAt })
    .returning({ id: users.id });
  const id = row!.id;
  userIds.push(id);
  const token = `${RUN}-${id}`;
  tokenByUser.set(id, token);
  await getDb()
    .insert(sessions)
    .values({
      userId: id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(NOW.getTime() + (input.staleGuest ? -60 * DAY : DAY)),
    });
  return id;
}

function as(actorId: string | null, withCsrf = true, body: unknown = { dryRun: true }): Promise<Response> {
  jar.clear();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (actorId) {
    const token = tokenByUser.get(actorId)!;
    jar.set(SESSION_COOKIE, token);
    headers.cookie = `${SESSION_COOKIE}=${token}`;
  }
  if (withCsrf) {
    jar.set(CSRF_COOKIE, CSRF_TOKEN);
    headers[CSRF_HEADER] = CSRF_TOKEN;
  }
  return POST(new Request('http://localhost:3100/api/admin/guests/reclaim', { method: 'POST', headers, body: JSON.stringify(body) }));
}

async function userRowCount(): Promise<number> {
  const [row] = await getDb().select({ n: rawSql<number>`count(*)::int` }).from(users);
  return row!.n;
}

async function deniedRows(actorId: string) {
  return getDb()
    .select({ allowed: auditEvents.allowed, detail: auditEvents.detail })
    .from(auditEvents)
    .where(and(eq(auditEvents.action, 'user.reclaim'), eq(auditEvents.actorId, actorId), eq(auditEvents.allowed, false)));
}

let admin: string;
let adminForLimit: string;
let creator: string;
let staleGuest: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  admin = await makeAccount({ name: `回收审核员${RUN}`, role: 'admin', guest: false });
  adminForLimit = await makeAccount({ name: `另一个审核员${RUN}`, role: 'admin', guest: false });
  creator = await makeAccount({ name: `普通创建者${RUN}`, role: 'creator', guest: false });
  staleGuest = await makeAccount({ name: `该被收的访客${RUN}`, role: 'creator', guest: true, staleGuest: true });
});

afterAll(async () => {
  const db = getDb();
  for (const id of userIds) {
    await db.delete(sessions).where(eq(sessions.userId, id));
    await db.delete(auditEvents).where(eq(auditEvents.targetId, id));
  }
  await db.delete(users).where(inArray(users.id, userIds));
});

describe('门的顺序', () => {
  it('没有 CSRF：403，而且库里一个候选都没少', async () => {
    const before = await scanGuestReclaimCandidates({ now: NOW });
    const res = await as(admin, false);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('csrf_failed');
    const after = await scanGuestReclaimCandidates({ now: NOW });
    expect(after.candidates.map((c) => c.id).sort()).toEqual(before.candidates.map((c) => c.id).sort());
    expect((await deniedRows(admin)).length).toBe(0);
  });

  it('没有会话：401，且不替探测的人白造一个 guest 身份', async () => {
    const before = await userRowCount();
    const res = await as(null);
    expect(res.status).toBe(401);
    expect(await userRowCount()).toBe(before);
  });

  it('报文形状不对：400，而且连闸都不碰（限流的桶不该被畸形请求吃掉）', async () => {
    for (const body of [{ dryRun: 'yes' }, { batch: 0 }, { batch: 99999 }, { graceDays: 0 }]) {
      const res = await as(admin, true, body);
      expect(res.status).toBe(400);
    }
  });

  it('不是审核员：403、一条不写、被拒的那一次进审计', async () => {
    const before = await scanGuestReclaimCandidates({ now: NOW });
    const res = await as(creator);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
    const denied = await deniedRows(creator);
    expect(denied.length).toBe(1);
    expect(denied[0]!.detail).toMatchObject({ reason: 'not_admin' });
    const after = await scanGuestReclaimCandidates({ now: NOW });
    expect(after.candidates.map((c) => c.id).sort()).toEqual(before.candidates.map((c) => c.id).sort());
  });

  it('同一个审核员连点第七次：429（额度按现成的 6 次/10 分钟跑满，没有为测试放宽）', async () => {
    const codes: number[] = [];
    for (let n = 0; n < 7; n += 1) codes.push((await as(adminForLimit)).status);
    expect(codes.slice(0, 6)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(codes[6]).toBe(429);
    const body = await (await as(adminForLimit)).json();
    expect(body.error).toBe('rate_limited');
    expect(typeof body.retryAfterMs).toBe('number');
  });
});

describe('缺省值与两种答案', () => {
  it('不带 body 的 POST 是"只数一遍"：200、dryRun 为真、那个访客还在', async () => {
    const res = await as(admin, true, {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dryRun).toBe(true);
    expect(body.reclaimed).toEqual([]);
    expect(body.candidates.map((c: { id: string }) => c.id)).toContain(staleGuest);
    const [row] = await getDb().select({ deletedAt: users.deletedAt }).from(users).where(eq(users.id, staleGuest)).limit(1);
    expect(row!.deletedAt).toBeNull();
  });

  it('真执行那一次：说的是同一批人，库里也真的少了他们', async () => {
    const counted = await as(admin, true, { dryRun: true });
    const dryBody = await counted.json();
    expect(dryBody.message).toContain('只数了一遍');

    const run = await as(admin, true, { dryRun: false, batch: 200 });
    expect(run.status).toBe(200);
    const body = await run.json();
    expect(body.dryRun).toBe(false);
    const taken = new Set<string>((body.reclaimed as { id: string }[]).map((r) => r.id));
    // 报上来的就是刚才数到的那批（可能少几个：锁上重判时有人回来了）
    for (const id of taken) expect((dryBody.candidates as { id: string }[]).some((c) => c.id === id)).toBe(true);
    expect(taken.has(staleGuest)).toBe(true);
    expect(body.message).toContain(`收走了 ${taken.size} 个`);

    const [row] = await getDb()
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, staleGuest))
      .limit(1);
    expect(row!.deletedAt).not.toBeNull();
    const audit = await getDb()
      .select({ actorId: auditEvents.actorId })
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'user.reclaim'), eq(auditEvents.targetId, staleGuest)));
    expect(audit.length).toBe(1);
    expect(audit[0]!.actorId).toBe(admin);
  });
});

/**
 * 第三十片：`ids` 在报文层的样子。域那一片钉的是"点名只收点名的"，这一片钉的是只有这一层才有的两件事：
 * **畸形报文进不来**（非 UUID、超上界——都该 400 且不吃限流的额度），以及**回执那句数由服务端说**
 * （`点名的 N 个里收走了 M 个`），界面只负责把它原样贴出来。
 *
 * 这一段自持两个审核员，不是随手多造的人：闸是 6 次/10 分钟**按人**算的，上面那两段已经吃掉 `admin`
 * 三次额度，这里"两条 400 之后还能连点 6 次"的见证必须用没被用过的桶。
 * 不为了让门好过而放宽它——要么换主语，要么等窗口过去，没有第三条。
 */
describe('点名（ids）在报文层', () => {
  let adminMalformed: string;
  let adminPicked: string;

  beforeAll(async () => {
    adminMalformed = await makeAccount({ name: `报文层审核员甲${RUN}`, role: 'admin', guest: false });
    adminPicked = await makeAccount({ name: `报文层审核员乙${RUN}`, role: 'admin', guest: false });
  });

  it('ids 里混进非 UUID 或超过 200 个：400，而且连闸都不碰', async () => {
    const before = await scanGuestReclaimCandidates({ now: NOW });
    const bad = await as(adminMalformed, true, { dryRun: false, ids: ['not-a-uuid'] });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('validation_failed');

    const tooMany = await as(adminMalformed, true, { dryRun: false, ids: Array.from({ length: 201 }, () => randomUUID()) });
    expect(tooMany.status).toBe(400);
    // 库里没动，而且那 6 次额度一次都没被吃掉——紧接着连点 6 次全 200 就是证据
    const after = await scanGuestReclaimCandidates({ now: NOW });
    expect(after.candidates.map((c) => c.id).sort()).toEqual(before.candidates.map((c) => c.id).sort());
    for (let n = 0; n < 6; n += 1) expect((await as(adminMalformed, true, { dryRun: true })).status).toBe(200);
    // 第 7 次才是被闸挡下的那一次：证明上面那 6 次确实走的是同一个桶，不是这条根本没接闸
    expect((await as(adminMalformed, true, { dryRun: true })).status).toBe(429);
  });

  it('带 ids 的真执行：只收点名的那一个，回执那句数说的是"点名的几个里"', async () => {
    const picked = await makeAccount({ name: `点名要收的访客${RUN}`, role: 'creator', guest: true, staleGuest: true });
    const untouched = await makeAccount({ name: `没被点名的访客${RUN}`, role: 'creator', guest: true, staleGuest: true });

    const res = await as(adminPicked, true, { dryRun: false, ids: [picked] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dryRun).toBe(false);
    expect(body.named).toBe(true);
    expect(body.requested).toBe(1);
    expect((body.reclaimed as { id: string }[]).map((r) => r.id)).toEqual([picked]);
    expect(body.message).toBe('点名的 1 个里收走了 1 个');
    // 响应里那份 scan 是**收之前**读的，所以没被点名的那个还挂在清单上——这正是面板要靠
    // `router.refresh()` 送下来的新快照清行的理由（第二十九片臂 A17 那一格）
    expect((body.candidates as { id: string }[]).some((c) => c.id === untouched)).toBe(true);

    const rows = await getDb()
      .select({ id: users.id, deletedAt: users.deletedAt })
      .from(users)
      .where(inArray(users.id, [picked, untouched]));
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.id === picked)!.deletedAt).not.toBeNull();
    expect(rows.find((r) => r.id === untouched)!.deletedAt).toBeNull();
  });

  it('ids 是空数组：一个都不收，但那一句要如实说"点名的 0 个里收走了 0 个"', async () => {
    const res = await as(adminPicked, true, { dryRun: false, ids: [] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.named).toBe(true);
    expect(body.requested).toBe(0);
    expect(body.reclaimed).toEqual([]);
    expect(body.message).toBe('点名的 0 个里收走了 0 个');
  });
});
