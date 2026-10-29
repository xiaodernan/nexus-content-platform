import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { and, eq, inArray, sql as rawSql } from 'drizzle-orm';
import { raisePlan } from './support/test-plan';
import { createProject } from '../src/server/domain/projects';
import { publishProject } from '../src/server/domain/publish';
import { sessionOwnerByToken } from '../src/server/domain/session';
import { getDb } from '../src/server/db/client';
import { apiTokens, auditEvents, projects, publishedProjects, sessions, users } from '../src/server/db/schema';
import {
  GUEST_RECLAIM_GRACE_DAYS,
  guestReclaimCutoff,
  reclaimExpiredGuests,
  scanGuestReclaimCandidates,
} from '../src/server/domain/guest-reclaim';

/**
 * ADR-0072：过期访客身份的回收。要还的是第二十六片写在 ROADMAP 上的那句
 * "库里现存的 guest 行——**谁来扫、留多久、怎么不误伤正在用的浏览器会话**，今天没有答案"。
 *
 * 这一片全程用**自己造的钟**（`NOW`，整秒对齐）：谓词判的是"最后一条会话比 `now - grace` 还早"，
 * 用 `Date.now()` 的话，边界用例（差一秒的两个形状）会随真实时间漂成同一个答案——
 * 那类断言看着在钉东西，实际钉的是"跑测试那一刻的墙钟"。
 *
 * 四组断言，每组都是"少了它就会漏的那种错"：
 * 1. **谓词的每一条边都有正反两个形状**：会话活着 / 刚过期一天 / 过期到线 / 从没会话 / 出生一小时；
 * 2. **注册与发布是两条护身符**：认领过的账号（`guest=false`）与名下有已发布作品的人，都不该被清扫碰；
 * 3. **收走一个人就是 ADR-0025 那六件事**，一件都要在库里看到自己那一行，其中"旧 cookie 进不来"
 *    要拿原来那枚 token 再解析一次，光数会话行数证明不了吊销；
 * 4. **一次点击的爆炸半径是 batch**：数到的比 batch 多时，界面上那句"还有剩下的"必须是真的。
 *
 * 第二十七片的纪律在这儿同样生效：所有断言只数**本文件自己造的 id**。库里若躺着别人的历史 stale 行，
 * 那条前提断言会先红，而不是把那几个人一起收走。
 */

const DAY = 86_400_000;
const NOW = new Date(Math.floor(Date.now() / 1000) * 1000);
const CUTOFF = guestReclaimCutoff(NOW, GUEST_RECLAIM_GRACE_DAYS);
const RUN = `s29${Date.now().toString(36)}`;

const userIds: string[] = [];
const projectIds: string[] = [];
/** 造会话时用的明文 token：后面要拿它验证"旧 cookie 真的进不来了" */
const tokenByUser = new Map<string, string[]>();

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface GuestSpec {
  name: string;
  /** 账龄：`NOW` 往前几天 */
  createdDaysAgo: number;
  /** 会话的到期时刻，相对 `NOW` 的天数（负数＝已经过期） */
  expiresInDays?: number[];
  role?: 'creator' | 'admin';
  /** 已经注册认领过（`guest=false` + `claimedAt`）——那就是"别再当他是访客"的那个信号 */
  claimed?: boolean;
  /** 建几个还活着的私有草稿 */
  drafts?: number;
  /** 其中第一个发布到公网：这条形状是"回收不该碰他"的唯一理由 */
  publishFirst?: boolean;
  /** API 令牌的形状：live＝还在有效期；revoked＝已经吊销；none＝不建 */
  token?: 'live' | 'revoked';
}

async function makeGuest(spec: GuestSpec): Promise<string> {
  const createdAt = new Date(NOW.getTime() - spec.createdDaysAgo * DAY);
  const [row] = await getDb()
    .insert(users)
    .values({
      displayName: spec.name,
      email: spec.claimed ? `${spec.name}@nexus.test` : null,
      guest: !spec.claimed,
      claimedAt: spec.claimed ? createdAt : null,
      role: spec.role ?? 'creator',
      createdAt,
      updatedAt: createdAt,
    })
    .returning({ id: users.id });
  const id = row!.id;
  userIds.push(id);

  const tokens: string[] = [];
  for (const [n, days] of (spec.expiresInDays ?? []).entries()) {
    const plaintext = `${RUN}-${id}-${n}`;
    tokens.push(plaintext);
    await getDb()
      .insert(sessions)
      .values({ userId: id, tokenHash: tokenHash(plaintext), expiresAt: new Date(NOW.getTime() + days * DAY) });
  }
  tokenByUser.set(id, tokens);

  for (let n = 0; n < (spec.drafts ?? 0); n += 1) {
    const doc = await createProject(id, { name: `${spec.name}草稿${n}`, kind: 'website' });
    projectIds.push(doc.id);
    if (n === 0 && spec.publishFirst) {
      await raisePlan(id);
      const result = await publishProject(doc.id, { visibility: 'public', createdById: id });
      if (!result || !result.ok) throw new Error(result && !result.ok ? result.reason : '发布失败');
    }
  }

  if (spec.token) {
    await getDb()
      .insert(apiTokens)
      .values({
        userId: id,
        name: `${spec.name}的令牌`,
        tokenHash: tokenHash(`${RUN}-tok-${id}`),
        hint: 's29',
        scopes: ['projects:read'],
        expiresAt: spec.token === 'live' ? new Date(NOW.getTime() + 30 * DAY) : null,
        revokedAt: spec.token === 'revoked' ? new Date(NOW.getTime() - 5 * DAY) : null,
      });
  }
  return id;
}

async function stateOf(userId: string) {
  const db = getDb();
  const [person] = await db
    .select({ deletedAt: users.deletedAt, guest: users.guest, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [live] = await db
    .select({ n: rawSql<number>`count(*) filter (where deleted_at is null)::int` })
    .from(projects)
    .where(eq(projects.ownerId, userId));
  const [gone] = await db
    .select({ n: rawSql<number>`count(*) filter (where deleted_at is not null)::int` })
    .from(projects)
    .where(eq(projects.ownerId, userId));
  const [pub] = await db
    .select({ n: rawSql<number>`count(*)::int` })
    .from(publishedProjects)
    .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
    .where(eq(projects.ownerId, userId));
  const sessionRows = await db.select({ id: sessions.id, expiresAt: sessions.expiresAt }).from(sessions).where(eq(sessions.userId, userId));
  const tokenRows = await db
    .select({ revokedAt: apiTokens.revokedAt, expiresAt: apiTokens.expiresAt })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId));
  return {
    deletedAt: person?.deletedAt ?? null,
    guest: person?.guest ?? false,
    liveProjects: live?.n ?? 0,
    deletedProjects: gone?.n ?? 0,
    publishedRows: pub?.n ?? 0,
    sessionRows,
    liveTokens: tokenRows.filter((t) => !t.revokedAt && (!t.expiresAt || t.expiresAt.getTime() > NOW.getTime())).length,
    revokedTokens: tokenRows.filter((t) => Boolean(t.revokedAt)).length,
  };
}

function candidateIds(scan: Awaited<ReturnType<typeof scanGuestReclaimCandidates>>): Set<string> {
  return new Set(scan.candidates.map((c) => c.id));
}

/** 本文件造出来的所有 id。任何一条断言只在**这个集合**里数数 */
const MINE = new Set<string>();
function mine(...ids: string[]): void {
  for (const id of ids) MINE.add(id);
}

let admin: string;
let staleExpired: string;
let staleOrphan: string;
let freshOrphan: string;
let justPastGrace: string;
let exactlyOnGrace: string;
let liveSession: string;
let claimedStale: string;
let adminStale: string;
let publishedStale: string;
let tokenedStale: string;
let revokedTokenStale: string;
let draftOwner: string;
let secondStale: string;
let thirdStale: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);

  const [actor] = await db
    .insert(users)
    .values({ displayName: `回收操作员${RUN}`, email: `s29admin+${RUN}@nexus.test`, role: 'admin', createdAt: new Date(NOW.getTime() - 200 * DAY) })
    .returning({ id: users.id });
  admin = actor!.id;
  userIds.push(admin);

  staleExpired = await makeGuest({ name: `沉默的访客甲${RUN}`, createdDaysAgo: 100, expiresInDays: [-40] });
  staleOrphan = await makeGuest({ name: `没有会话的访客${RUN}`, createdDaysAgo: 100 });
  freshOrphan = await makeGuest({ name: `刚出生的访客${RUN}`, createdDaysAgo: 0 });
  justPastGrace = await makeGuest({ name: `过期二十五天${RUN}`, createdDaysAgo: 100, expiresInDays: [-25] });
  // 边界那一秒：`NOW - 30d - 1s`，正好比线早一点（谓词是严格小于）
  exactlyOnGrace = await makeGuest({
    name: `过期差一秒${RUN}`,
    createdDaysAgo: 100,
    expiresInDays: [-(GUEST_RECLAIM_GRACE_DAYS + 1_000 / DAY)],
  });
  liveSession = await makeGuest({ name: `还在用的访客${RUN}`, createdDaysAgo: 100, expiresInDays: [5] });
  claimedStale = await makeGuest({ name: `已注册的前访客${RUN}`, createdDaysAgo: 100, expiresInDays: [-60], claimed: true });
  adminStale = await makeGuest({ name: `被提成审核员的访客${RUN}`, createdDaysAgo: 100, expiresInDays: [-60], role: 'admin' });
  publishedStale = await makeGuest({ name: `发过作品的访客${RUN}`, createdDaysAgo: 100, expiresInDays: [-60], drafts: 1, publishFirst: true });
  tokenedStale = await makeGuest({ name: `带令牌的访客${RUN}`, createdDaysAgo: 100, expiresInDays: [-60], token: 'live' });
  revokedTokenStale = await makeGuest({ name: `令牌吊销过的访客${RUN}`, createdDaysAgo: 100, expiresInDays: [-60], token: 'revoked' });
  draftOwner = await makeGuest({ name: `有两个草稿的访客${RUN}`, createdDaysAgo: 100, expiresInDays: [-60], drafts: 2 });
  secondStale = await makeGuest({ name: `沉默的访客乙${RUN}`, createdDaysAgo: 99, expiresInDays: [-40] });
  thirdStale = await makeGuest({ name: `沉默的访客丙${RUN}`, createdDaysAgo: 98, expiresInDays: [-40] });
  mine(
    admin,
    staleExpired,
    staleOrphan,
    freshOrphan,
    justPastGrace,
    exactlyOnGrace,
    liveSession,
    claimedStale,
    adminStale,
    publishedStale,
    tokenedStale,
    revokedTokenStale,
    draftOwner,
    secondStale,
    thirdStale,
  );
});

afterAll(async () => {
  const db = getDb();
  if (projectIds.length) await db.delete(projects).where(inArray(projects.id, projectIds));
  for (const id of userIds) {
    await db.delete(projects).where(eq(projects.ownerId, id));
    await db.delete(sessions).where(eq(sessions.userId, id));
    await db.delete(apiTokens).where(eq(apiTokens.userId, id));
    await db.delete(auditEvents).where(eq(auditEvents.targetId, id));
  }
  await db.delete(users).where(inArray(users.id, userIds));
});

describe('谓词的每一条边', () => {
  it('沉默到线的两种形状都在候选里：会话烂了够久的、从来就没有会话的', async () => {
    const scan = await scanGuestReclaimCandidates({ now: NOW });
    for (const c of scan.candidates) expect(MINE.has(c.id)).toBe(true);

    const found = candidateIds(scan);
    expect(found.has(staleExpired)).toBe(true);
    expect(found.has(staleOrphan)).toBe(true);

    const expired = scan.candidates.find((c) => c.id === staleExpired)!;
    expect(expired.reason).toBe('expired');
    expect(new Date(expired.lastExpiry!).getTime()).toBe(NOW.getTime() - 40 * DAY);
    const orphan = scan.candidates.find((c) => c.id === staleOrphan)!;
    expect(orphan.reason).toBe('orphan');
    expect(orphan.lastExpiry).toBeNull();
  });

  it('会话还活着的人绝不进候选——哪怕他账龄一百天', async () => {
    const scan = await scanGuestReclaimCandidates({ now: NOW });
    expect(candidateIds(scan).has(liveSession)).toBe(false);
    // 对照：同一个人把会话到期时刻推到线外，他就进候选（证明这一条真的是会话在挡，不是别的条件碰巧）
    await getDb()
      .update(sessions)
      .set({ expiresAt: new Date(NOW.getTime() - 40 * DAY) })
      .where(eq(sessions.userId, liveSession));
    expect(candidateIds(await scanGuestReclaimCandidates({ now: NOW })).has(liveSession)).toBe(true);
    await getDb()
      .update(sessions)
      .set({ expiresAt: new Date(NOW.getTime() + 5 * DAY) })
      .where(eq(sessions.userId, liveSession));
    expect(candidateIds(await scanGuestReclaimCandidates({ now: NOW })).has(liveSession)).toBe(false);
  });

  it('grace 是"再过 30 天"，不是"会话一过期就收"：差二十五天的不算，差一秒的算', async () => {
    const scan = await scanGuestReclaimCandidates({ now: NOW });
    expect(candidateIds(scan).has(justPastGrace)).toBe(false);
    // 边界本身：`max(expires_at) < cutoff`。正好压在线上（差一秒）要判进去，晚一秒要判不出来
    expect(candidateIds(scan).has(exactlyOnGrace)).toBe(true);

    const [row] = await getDb().select({ expiresAt: sessions.expiresAt }).from(sessions).where(eq(sessions.userId, exactlyOnGrace)).limit(1);
    await getDb()
      .update(sessions)
      .set({ expiresAt: new Date(CUTOFF.getTime() + 2_000) })
      .where(eq(sessions.userId, exactlyOnGrace));
    expect(candidateIds(await scanGuestReclaimCandidates({ now: NOW })).has(exactlyOnGrace)).toBe(false);
    await getDb().update(sessions).set({ expiresAt: row!.expiresAt }).where(eq(sessions.userId, exactlyOnGrace));
    expect(candidateIds(await scanGuestReclaimCandidates({ now: NOW })).has(exactlyOnGrace)).toBe(true);
  });

  it('出生没多久的零会话身份不动：`createUserSession` 那两步之间就是这形状', async () => {
    // 这条挡的是最难受的一种误伤：先插用户行、再插会话行，中间那一瞬正好是"零会话"
    const scan = await scanGuestReclaimCandidates({ now: NOW });
    expect(candidateIds(scan).has(freshOrphan)).toBe(false);
    const s = await stateOf(freshOrphan);
    expect(s.deletedAt).toBeNull();
    expect(s.sessionRows.length).toBe(0);
  });

  it('grace 可以被调用方改小，但线仍然按新的 grace 算', async () => {
    const scan = await scanGuestReclaimCandidates({ now: NOW, graceDays: 20 });
    expect(scan.graceDays).toBe(20);
    // 二十五天前过期的那个人，在 grace=20 之下就该进来了；在默认的 30 之下没有（上一条已钉）
    expect(candidateIds(scan).has(justPastGrace)).toBe(true);
  });
});

describe('两条护身符：注册与发布', () => {
  it('认领过的账号不是回收的对象，哪怕他的会话烂了六十天', async () => {
    const scan = await scanGuestReclaimCandidates({ now: NOW });
    expect(candidateIds(scan).has(claimedStale)).toBe(false);
    const s = await stateOf(claimedStale);
    expect(s.guest).toBe(false);
    expect(s.deletedAt).toBeNull();
  });

  it('被手提成审核员的 guest 也不收：清扫不该改变谁能审核', async () => {
    const scan = await scanGuestReclaimCandidates({ now: NOW });
    expect(candidateIds(scan).has(adminStale)).toBe(false);
  });

  it('名下有已发布作品的访客被**明说**地排除：数到了但不进候选，界面上有他那一格', async () => {
    const scan = await scanGuestReclaimCandidates({ now: NOW });
    expect(candidateIds(scan).has(publishedStale)).toBe(false);
    expect(scan.skippedPublished).toBeGreaterThanOrEqual(1);
    // 对照：他确实沉默到线了——挡他的只有"发布过"这一条
    const withoutThat = await getDb().select({ id: publishedProjects.id }).from(publishedProjects)
      .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
      .where(eq(projects.ownerId, publishedStale));
    expect(withoutThat.length).toBeGreaterThan(0);
  });

  it('还握着有效 API 令牌的访客同样排除；已吊销的那一枚不算护身符', async () => {
    const scan = await scanGuestReclaimCandidates({ now: NOW });
    expect(candidateIds(scan).has(tokenedStale)).toBe(false);
    expect(scan.skippedLiveToken).toBeGreaterThanOrEqual(1);
    // 对照组：令牌已吊销 → 那个身份照常算够格
    expect(candidateIds(scan).has(revokedTokenStale)).toBe(true);
  });
});

describe('收走一个人 = ADR-0025 那六件事', () => {
  it('dry run 一个字都不写：会话还在、人还在、审计表里也没有一行', async () => {
    const before = await stateOf(draftOwner);
    const dry = await reclaimExpiredGuests({ actorId: admin, now: NOW, dryRun: true });
    expect(dry.ok).toBe(true);
    if (!dry.ok) return;
    expect(dry.dryRun).toBe(true);
    expect(dry.reclaimed).toEqual([]);
    expect(candidateIds(dry.scan).has(draftOwner)).toBe(true);

    const after = await stateOf(draftOwner);
    expect(after.deletedAt).toBeNull();
    expect(after.sessionRows.length).toBe(before.sessionRows.length);
    expect(after.liveProjects).toBe(before.liveProjects);
    const rows = await getDb()
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'user.reclaim'), eq(auditEvents.targetId, draftOwner)));
    expect(rows.length).toBe(0);
  });

  it('真执行时六件事一件不少：草稿软删、会话吊销、令牌吊销、人打上时间戳、旧 cookie 解析不出人', async () => {
    const target = draftOwner;
    const before = await stateOf(target);
    expect(before.liveProjects).toBe(2);
    expect(tokenByUser.get(target)!.length).toBe(1);

    const result = await reclaimExpiredGuests({ actorId: admin, now: NOW, batch: 50 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const mine2 = result.reclaimed.find((r) => r.id === target);
    expect(mine2?.counts).toMatchObject({ privateProjectsSoftDeleted: 2, publishedWorksKept: 0, sessionsRevoked: 1, apiTokensRevoked: 0 });

    const after = await stateOf(target);
    expect(after.deletedAt).not.toBeNull();
    expect(after.liveProjects).toBe(0);
    expect(after.deletedProjects).toBe(2);
    // 会话行是被**删掉**的（§80 只存哈希，删行即吊销），不是留着一行改状态
    expect(after.sessionRows.length).toBe(0);
    // 拿原来那枚 token 再解析一次：证明"吊销"这件事在唯一的读路径上成立
    expect(await sessionOwnerByToken(tokenByUser.get(target)![0]!)).toBeNull();
  });

  it('已发布的东西不跟着清扫走：那条排除本身就是保证，而收走的别人不该让公网 404', async () => {
    const other = await makeGuest({ name: `发过作品又被收的${RUN}`, createdDaysAgo: 120, expiresInDays: [-70], drafts: 2, publishFirst: true });
    mine(other);
    const before = await stateOf(other);
    expect(before.publishedRows).toBe(1);

    // 排除项保证他压根不在候选里；这一句钉的是"清扫不会把作者名换成已注销的用户"这件事本身
    const scan = await scanGuestReclaimCandidates({ now: NOW });
    expect(candidateIds(scan).has(other)).toBe(false);
    const run = await reclaimExpiredGuests({ actorId: admin, now: NOW });
    expect(run.ok && run.reclaimed.some((r) => r.id === other)).toBe(false);
    expect((await stateOf(other)).publishedRows).toBe(before.publishedRows);
  });

  it('每个被收走的人留下一行审计，主语是按按钮的人不是被收的人', async () => {
    const rows = await getDb()
      .select({ actorId: auditEvents.actorId, targetId: auditEvents.targetId, allowed: auditEvents.allowed, detail: auditEvents.detail })
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'user.reclaim'), inArray(auditEvents.targetId, [staleExpired, staleOrphan])));
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.actorId).toBe(admin);
      expect(row.allowed).toBe(true);
      expect(row.detail).toMatchObject({ graceDays: GUEST_RECLAIM_GRACE_DAYS, sweep: true });
    }
  });

  it('再点一次什么也不发生：收走的人不再是候选，也不会留下第二行审计', async () => {
    const again = await reclaimExpiredGuests({ actorId: admin, now: NOW });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    const ids = candidateIds(again.scan);
    for (const id of [staleExpired, staleOrphan, draftOwner]) expect(ids.has(id)).toBe(false);
    const rows = await getDb()
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'user.reclaim'), eq(auditEvents.targetId, draftOwner)));
    expect(rows.length).toBe(1);
  });
});

describe('一次点击的爆炸半径', () => {
  it('batch 只管这一轮收几个，多出来的那句"还有剩下的"必须是真的', async () => {
    const older = await makeGuest({ name: `批量甲${RUN}`, createdDaysAgo: 95, expiresInDays: [-40] });
    const middle = await makeGuest({ name: `批量乙${RUN}`, createdDaysAgo: 94, expiresInDays: [-40] });
    const younger = await makeGuest({ name: `批量丙${RUN}`, createdDaysAgo: 93, expiresInDays: [-40] });
    mine(older, middle, younger);

    // 前提：这一轮点名的候选必须全是本文件造的 id。库里若躺着别人的历史 stale 行，这条先红，
    // 而不是把别人的身份一起收走（第二十七片那条纪律在这儿的样子）
    const before = await scanGuestReclaimCandidates({ now: NOW, batch: 2 });
    for (const candidate of before.candidates) expect(MINE.has(candidate.id)).toBe(true);

    const run = await reclaimExpiredGuests({ actorId: admin, now: NOW, batch: 2 });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.reclaimed.length).toBe(2);
    expect(run.scan.batch).toBe(2);
    // 候选按账龄从老到新排，所以这一轮收走最老的两个，第三个留到下一轮——界面上那句"还有剩下的"得有据
    const taken = new Set(run.reclaimed.map((r) => r.id));
    expect([...taken].every((id) => id === older || id === middle)).toBe(true);
    expect((await stateOf(younger)).deletedAt).toBeNull();
    expect(run.scan.moreThanBatch).toBe(true);
  });

  it('batch 上界挡在入口：要 5000 个一次收完是不可能的', async () => {
    const run = await reclaimExpiredGuests({ actorId: admin, now: NOW, batch: 5000 });
    expect(run.ok && run.scan.batch).toBe(200);
  });

  it('两个人同时点：每个人最多被收一次、两次调用都不抛、审计一人一行', async () => {
    // 这一条钉的是"锁上再判一次"那一步存在的理由。两次调用同时开工：拿到锁的那次收人，
    // 后到的那次要么在锁上重判时看到人已经没了（`skippedUnderLock`），要么扫描时根本找不到候选。
    // 两种都是正确答案；**不正确的**是第二次抛 `ConcurrentlyDeleted` 变 500，或者留下第二行"收走了"。
    const crowd: string[] = [];
    for (let n = 0; n < 8; n += 1) {
      // 账龄各不相同：两次扫描都按 `created_at` 升序取，锁的取序一致才不会有死锁那种红
      crowd.push(await makeGuest({ name: `并发访客${n}号${RUN}`, createdDaysAgo: 90 - n, expiresInDays: [-45], drafts: 1 }));
    }
    mine(...crowd);

    const [a, b] = await Promise.allSettled([
      reclaimExpiredGuests({ actorId: admin, now: NOW, batch: 8 }),
      reclaimExpiredGuests({ actorId: admin, now: NOW, batch: 8 }),
    ]);
    expect(a.status).toBe('fulfilled');
    expect(b.status).toBe('fulfilled');
    const okRuns = [a, b].filter((r) => r.status === 'fulfilled' && r.value.ok) as PromiseFulfilledResult<
      Extract<Awaited<ReturnType<typeof reclaimExpiredGuests>>, { ok: true }>
    >[];
    const taken = okRuns.flatMap((r) => r.value.reclaimed.map((x) => x.id));
    // 同一个人不被收两次：两次调用报上来的 id 合起来没有重复
    expect(new Set(taken).size).toBe(taken.length);
    expect(taken.every((id) => crowd.includes(id))).toBe(true);
    // 库里的样子与报上来的数对得上：这 8 个此刻全部是软删的，而且每个人只有一行审计
    for (const id of crowd) {
      const s = await stateOf(id);
      expect(s.deletedAt).not.toBeNull();
      expect(s.liveProjects).toBe(0);
      expect(s.sessionRows.length).toBe(0);
    }
    const rows = await getDb()
      .select({ targetId: auditEvents.targetId })
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'user.reclaim'), inArray(auditEvents.targetId, crowd)));
    expect(rows.length).toBe(crowd.length);
    expect(new Set(rows.map((r) => r.targetId)).size).toBe(crowd.length);
  });

  it('不是审核员就一个字都不写，而且被拒的那一次进审计', async () => {
    const notAdmin = await makeGuest({ name: `普通创建者${RUN}`, createdDaysAgo: 1 });
    mine(notAdmin);
    const before = await scanGuestReclaimCandidates({ now: NOW });
    const run = await reclaimExpiredGuests({ actorId: notAdmin, now: NOW });
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run).toMatchObject({ ok: false, status: 403, code: 'forbidden' });

    const denied = await getDb()
      .select({ allowed: auditEvents.allowed, detail: auditEvents.detail })
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'user.reclaim'), eq(auditEvents.actorId, notAdmin)));
    expect(denied.length).toBe(1);
    expect(denied[0]!.allowed).toBe(false);
    // 库里没动：被拒的那一次连一个候选都不该少
    const after = await scanGuestReclaimCandidates({ now: NOW });
    expect(after.candidates.map((c) => c.id).sort()).toEqual(before.candidates.map((c) => c.id).sort());
  });
});
