import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { and, eq, inArray, isNull, sql as rawSql } from 'drizzle-orm';
import type { CurrentUser } from '../src/server/domain/session';
import { rotateSession, sessionOwnerByToken } from '../src/server/domain/session';
import { hashPassword } from '../src/server/domain/password';
import { createProject, listDeletedProjects, listProjects } from '../src/server/domain/projects';
import { publishProject, resolvePublishedPath } from '../src/server/domain/publish';
import { profileOf, publicWorksOf } from '../src/server/domain/profile';
import { discover } from '../src/server/domain/social';
import { login, register } from '../src/server/domain/auth';
import { authenticateApiToken, issueApiToken, revokeApiToken } from '../src/server/domain/api-tokens';
import { accountDeletionSummary, deleteAccount, DRAFT_PREVIEW_LIMIT } from '../src/server/domain/account';
import { DELETED_USER_LABEL } from '../src/server/domain/audit';
import { getDb } from '../src/server/db/client';
import { apiTokens, auditEvents, projects, sessions, users } from '../src/server/db/schema';
import { channels, getRealtimeBus } from '../src/server/realtime/bus';

/**
 * §144 / ADR-0025：注销账号那六件事。
 *
 * 这个文件钉的是"六件事是一个整体"那一句（ADR 第三节最后一条）。最容易做半截的是这样：
 * 打上 `deletedAt`、界面上说一句"已注销"，但会话行还在——那个人退出后又用旧 cookie 进得来。
 * 所以每一件事都要在库里看它自己的那一行，而不是只看返回值里的一个数字：
 * - 私有草稿的 `deleted_at` 与已发布作品的**继续可达**是同一件事的两面，两边都要读；
 * - 会话与 API 凭据要**拿原来的凭据再试一次**，光数行数证明不了"吊销"这件事；
 * - join 上那句 `isNull(users.deletedAt)` 要有唯一见证（先注销、再补一行会话），
 *   否则它会被"会话行已经删了"这件事吞掉，变成一条永远为真的装饰；
 * - 预览的那几个数必须等于真正执行的数，不然界面上"会收起 3 个"是一句可以错的话。
 *
 * 每条否定断言都配一个换个状态就成立的对照。
 */

const RUN = `s144${Date.now().toString(36)}`;

interface Fixture {
  id: string;
  email: string;
  displayName: string;
  handle: string | null;
}

const projectIds: string[] = [];
const userIds: string[] = [];

async function insertUser(input: {
  displayName: string;
  email: string | null;
  handle?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  guest?: boolean;
  password?: string;
}): Promise<Fixture> {
  const [row] = await getDb()
    .insert(users)
    .values({
      displayName: input.displayName,
      email: input.email,
      handle: input.handle ?? null,
      bio: input.bio ?? null,
      avatarUrl: input.avatarUrl ?? null,
      guest: input.guest ?? false,
      passwordHash: input.password ? await hashPassword(input.password) : null,
    })
    .returning({ id: users.id, displayName: users.displayName, email: users.email, handle: users.handle });
  const created = row!;
  userIds.push(created.id);
  return { id: created.id, email: created.email ?? '', displayName: created.displayName, handle: created.handle };
}

async function newProject(ownerId: string, name: string): Promise<string> {
  const doc = await createProject(ownerId, { name, kind: 'website' });
  projectIds.push(doc.id);
  return doc.id;
}

/** 库里那一行，绕开所有读取谓词——"注销了没有"最终看的是 deleted_at 本身 */
async function userRow(userId: string) {
  const [row] = await getDb()
    .select({
      deletedAt: users.deletedAt,
      email: users.email,
      handle: users.handle,
      displayName: users.displayName,
      bio: users.bio,
      avatarUrl: users.avatarUrl,
      guest: users.guest,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row!;
}

async function projectDeletedAt(projectId: string): Promise<Date | null> {
  const [row] = await getDb()
    .select({ deletedAt: projects.deletedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row?.deletedAt ?? null;
}

async function sessionRowCount(userId: string): Promise<number> {
  return (await getDb().select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId))).length;
}

async function auditRows(targetId: string) {
  return getDb()
    .select({ allowed: auditEvents.allowed, detail: auditEvents.detail })
    .from(auditEvents)
    .where(and(eq(auditEvents.action, 'user.delete'), eq(auditEvents.targetId, targetId)));
}

/** 会话行的哈希就是 sha256(明文)，与 `domain/session.ts` 同一算法——这里既用它查行，也顺手钉住"库里没有明文" */
function tokenHashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

let owner: Fixture;
let other: Fixture;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  owner = await insertUser({
    displayName: `注销作者${RUN}`,
    email: `s144o+${RUN}@nexus.test`,
    handle: `s144o${RUN}`,
    bio: '这个人写过东西，后来决定离开。',
    avatarUrl: '/api/assets/decoy.png',
  });
  other = await insertUser({
    displayName: `注销路人${RUN}`,
    email: `s144a+${RUN}@nexus.test`,
    handle: `s144a${RUN}`,
  });
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

describe('确认词取哪一列', () => {
  it('发布过的人认 handle。这一臂的唯一见证：拿他的展示名去注销会被拒，而库里一个字没动', async () => {
    const preview = await accountDeletionSummary(owner.id);
    expect(preview?.confirmField).toBe('handle');
    expect(preview?.confirmWord).toBe(owner.handle);

    expect(await deleteAccount(owner.id, owner.displayName)).toEqual({
      ok: false,
      code: 'approval_required',
      confirmField: 'handle',
    });
    expect((await userRow(owner.id)).deletedAt).toBeNull();
  });

  it('没发布过的人没有 handle，那一臂改认展示名——展示名逐字输入确实注销得掉', async () => {
    const draftOnly = await insertUser({ displayName: `只有草稿的人${RUN}`, email: `s144d+${RUN}@nexus.test` });
    const preview = await accountDeletionSummary(draftOnly.id);
    expect(preview?.confirmField).toBe('display_name');
    expect(preview?.confirmWord).toBe(`只有草稿的人${RUN}`);
    expect(preview?.privateProjects).toBe(0);
    expect((await userRow(draftOnly.id)).handle).toBeNull();

    // 反面对照：handle 在这一臂上根本不存在，拿它去输也过不了
    expect(await deleteAccount(draftOnly.id, '随便一个 handle')).toEqual({
      ok: false,
      code: 'approval_required',
      confirmField: 'display_name',
    });
    expect((await userRow(draftOnly.id)).deletedAt).toBeNull();

    // 首尾空白是手滑，不算另一个标识
    expect((await deleteAccount(draftOnly.id, `  只有草稿的人${RUN}  `)).ok).toBe(true);
    expect((await userRow(draftOnly.id)).deletedAt).not.toBeNull();
  });

  it('大小写不同不是"手滑"，那是另一个标识', async () => {
    const capped = await insertUser({ displayName: `CaseSensitive${RUN}`, email: `s144c+${RUN}@nexus.test` });
    expect(await deleteAccount(capped.id, `casesensitive${RUN}`)).toEqual({
      ok: false,
      code: 'approval_required',
      confirmField: 'display_name',
    });
    expect((await userRow(capped.id)).deletedAt).toBeNull();
  });
});

describe('审批门：打错字就一个字都不写', () => {
  it('确认词不匹配时四张表全在原地，只多一行 allowed:false 的审计', async () => {
    const leaver = await insertUser({ displayName: `审批门${RUN}`, email: `s144g+${RUN}@nexus.test` });
    const draft = await newProject(leaver.id, `审批门草稿${RUN}`);
    const token = await rotateSession(leaver.id, null);
    const issued = await issueApiToken({ userId: leaver.id, name: `审批门凭据${RUN}`, scopes: ['design:read'] });

    const result = await deleteAccount(leaver.id, '错的那一串');
    expect(result).toEqual({ ok: false, code: 'approval_required', confirmField: 'display_name' });
    expect((await userRow(leaver.id)).deletedAt).toBeNull();
    expect(await projectDeletedAt(draft)).toBeNull();
    expect((await listProjects(leaver.id)).some((p) => p.id === draft)).toBe(true);
    // 凭据还是活的：这才叫"一个字都没动"，而不是"没注销但顺手吊销了"
    expect(await sessionOwnerByToken(token)).not.toBeNull();
    expect(await authenticateApiToken(issued.token)).toMatchObject({ ok: true });

    const rows = await auditRows(leaver.id);
    expect(rows.filter((r) => r.allowed)).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.detail).toMatchObject({ reason: 'confirm_mismatch', field: 'display_name' });

    // 反向对照：同一处调用换成逐字的确认词，这一次四张表全跟着动
    expect((await deleteAccount(leaver.id, `审批门${RUN}`)).ok).toBe(true);
    expect((await userRow(leaver.id)).deletedAt).not.toBeNull();
    expect(await projectDeletedAt(draft)).not.toBeNull();
    expect(await sessionOwnerByToken(token)).toBeNull();
    expect(await authenticateApiToken(issued.token)).toMatchObject({ ok: false, error: 'revoked_token' });
    const after = await auditRows(leaver.id);
    expect(after.filter((r) => r.allowed)).toHaveLength(1);
    expect(after.filter((r) => !r.allowed)).toHaveLength(1);
  });

  it('不存在的人是 not_found；已经注销过的人再来一次是 already_deleted，而且审计不再加行', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    expect(await deleteAccount(ghost, ghost)).toEqual({ ok: false, code: 'not_found' });
    expect(await accountDeletionSummary(ghost)).toBeNull();

    const leaver = await insertUser({ displayName: `注销两次${RUN}`, email: `s1442+${RUN}@nexus.test` });
    expect((await deleteAccount(leaver.id, `注销两次${RUN}`)).ok).toBe(true);
    expect(await deleteAccount(leaver.id, `注销两次${RUN}`)).toEqual({ ok: false, code: 'already_deleted' });
    expect(await accountDeletionSummary(leaver.id)).toBeNull();
    // 第二次那一句"已经注销过了"不能既写一行成功审计、又什么都不做——它一行都不该写
    expect(await auditRows(leaver.id)).toHaveLength(1);
  });
});

describe('注销那六件事', () => {
  it('私有草稿收进回收站，已发布作品继续可达、继续出现在主页与发现里，作者名换成「已注销的用户」', async () => {
    const author = await insertUser({
      displayName: `作品还在的人${RUN}`,
      email: `s144k+${RUN}@nexus.test`,
      handle: `s144k${RUN}`,
    });
    const draftName = `收起来的草稿${RUN}`;
    const draft = await newProject(author.id, draftName);
    const publishedName = `留在公网的${RUN}`;
    const published = await newProject(author.id, publishedName);
    const result = await publishProject(published, { visibility: 'public', createdById: author.id });
    if (!result || !result.ok) throw new Error(result && !result.ok ? result.reason : '发布失败');
    const { path } = result.publication;
    const publicationId = result.publication.id;

    const preview = await accountDeletionSummary(author.id);
    expect(preview).toMatchObject({ privateProjects: 1, publishedWorks: 1, liveSessions: 0, liveApiTokens: 0 });
    // 预览里那份草稿清单就是界面上那几个导出链接，认 id 不认名字
    expect(preview?.drafts.map((d) => d.id)).toEqual([draft]);
    expect(preview?.drafts[0]?.name).toBe(draftName);

    const executed = await deleteAccount(author.id, `s144k${RUN}`);
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    // 预览说的那四个数就是这一次真正做到的四个数
    expect(executed.counts).toEqual({
      privateProjectsSoftDeleted: preview?.privateProjects,
      publishedWorksKept: preview?.publishedWorks,
      sessionsRevoked: preview?.liveSessions,
      apiTokensRevoked: preview?.liveApiTokens,
    });

    expect(await projectDeletedAt(draft)).not.toBeNull();
    expect((await listProjects(author.id)).map((p) => p.id)).not.toContain(draft);
    // 回收站里恰好只有那条草稿：已发布的项目不跟着走，两个数的分界是 published_projects 那一行
    expect((await listDeletedProjects(author.id)).map((p) => p.id)).toEqual([draft]);
    expect(await projectDeletedAt(published)).toBeNull();

    const page = await resolvePublishedPath(path);
    expect(page).not.toBeNull();
    expect(page?.ownerName).toBe(DELETED_USER_LABEL);
    expect(page?.projectName).toBe(publishedName);
    expect((await publicWorksOf(author.id)).some((c) => c.publicationId === publicationId)).toBe(true);
    expect((await discover({ sort: 'new', viewerId: null, limit: 120 })).cards.some((c) => c.publicationId === publicationId)).toBe(true);

    const view = await profileOf(`s144k${RUN}`, null);
    expect(view?.accountDeleted).toBe(true);
    expect(view?.name).toBe(DELETED_USER_LABEL);
    expect(view?.works.map((w) => w.publicationId)).toContain(publicationId);
    // 对照：没注销的人主页上挂的是他自己的名字
    expect((await profileOf(`s144a${RUN}`, null))?.name).toBe(`注销路人${RUN}`);
  });

  it('会话全部吊销：原来的 cookie 再也换不出身份，对照是别人的会话照旧能用', async () => {
    const leaver = await insertUser({ displayName: `带走会话${RUN}`, email: `s144s+${RUN}@nexus.test` });
    const mine = await rotateSession(leaver.id, null);
    const alsoMine = await rotateSession(leaver.id, null);
    const theirs = await rotateSession(other.id, null);
    const otherBefore = await sessionRowCount(other.id);
    expect(await sessionOwnerByToken(mine)).not.toBeNull();

    expect((await deleteAccount(leaver.id, `带走会话${RUN}`)).ok).toBe(true);
    expect(await sessionRowCount(leaver.id)).toBe(0);
    expect(await sessionOwnerByToken(mine)).toBeNull();
    expect(await sessionOwnerByToken(alsoMine)).toBeNull();
    // 只吊销这个人的：别人的行数与 token 都没动
    expect(await sessionOwnerByToken(theirs)).not.toBeNull();
    expect(await sessionRowCount(other.id)).toBe(otherBefore);
  });

  it('已注销账号后来补上的会话行也进不来——这一句是 join 里那句 deletedAt 的唯一见证', async () => {
    const leaver = await insertUser({ displayName: `并发登录${RUN}`, email: `s144w+${RUN}@nexus.test` });
    expect((await deleteAccount(leaver.id, `并发登录${RUN}`)).ok).toBe(true);

    // 事务提交的同时另一个标签页刚轮换出一行会话：库里确实有这一行，而且它没有过期
    const raced = await rotateSession(leaver.id, null);
    const [raw] = await getDb()
      .select({ id: sessions.id, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(and(eq(sessions.userId, leaver.id), eq(sessions.tokenHash, tokenHashOf(raced))))
      .limit(1);
    expect(raw).toBeDefined();
    expect(raw!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    // 少了 `isNull(users.deletedAt)` 这一臂，这里就会返回一行——那扇门等于是他自己开回来的
    expect(await sessionOwnerByToken(raced)).toBeNull();

    // 对照：同一形状的行换个没注销的人就读得出来，说明挡住它的确实是 deletedAt 而不是别的
    const live = await rotateSession(other.id, null);
    expect(await sessionOwnerByToken(live)).not.toBeNull();
  });

  it('API 凭据只吊销活的那枚，先前已吊销的那枚时间戳原样留着', async () => {
    const leaver = await insertUser({ displayName: `凭据主人${RUN}`, email: `s144t+${RUN}@nexus.test` });
    const live = await issueApiToken({ userId: leaver.id, name: '还活着的', scopes: ['design:read'] });
    const stale = await issueApiToken({ userId: leaver.id, name: '早就吊销的', scopes: ['design:read'] });
    await revokeApiToken(stale.record.id, leaver.id);
    const revokedBefore = (
      await getDb().select({ revokedAt: apiTokens.revokedAt }).from(apiTokens).where(eq(apiTokens.id, stale.record.id)).limit(1)
    )[0]!.revokedAt!;
    expect(await authenticateApiToken(live.token)).toMatchObject({ ok: true });
    expect((await accountDeletionSummary(leaver.id))?.liveApiTokens).toBe(1);

    const result = await deleteAccount(leaver.id, `凭据主人${RUN}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.apiTokensRevoked).toBe(1);
    expect(await authenticateApiToken(live.token)).toMatchObject({ ok: false, error: 'revoked_token' });

    const rows = await getDb()
      .select({ id: apiTokens.id, revokedAt: apiTokens.revokedAt })
      .from(apiTokens)
      .where(eq(apiTokens.userId, leaver.id));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
    // 那一枚先前就吊销的：时间戳一个毫秒都没被改写，不是被这次注销覆盖成同一个时刻
    const untouched = rows.find((r) => r.id === stale.record.id)!;
    expect(untouched.revokedAt!.getTime()).toBe(revokedBefore.getTime());
  });

  it('审计那一行写着四个数；库里身份留着，公网投影与登录入口一起关上', async () => {
    const password = `hunter-${RUN}`;
    const leaver = await insertUser({
      displayName: `审计要看名字${RUN}`,
      email: `s144e+${RUN}@nexus.test`,
      handle: `s144e${RUN}`,
      bio: '这段简介注销之后不该再出现在公网。',
      avatarUrl: '/api/assets/leaver.png',
      password,
    });
    const draft = await newProject(leaver.id, `审计草稿${RUN}`);
    const issued = await issueApiToken({ userId: leaver.id, name: '审计凭据', scopes: ['design:read'] });

    // 对照在先：口令对、邮箱在库里，注销之前这条路是通的
    const before = await login({ email: `s144e+${RUN}@nexus.test`, password });
    expect(before).not.toHaveProperty('code');
    const sessionsBefore = await sessionRowCount(leaver.id);
    expect(sessionsBefore).toBeGreaterThan(0);

    expect((await deleteAccount(leaver.id, `s144e${RUN}`)).ok).toBe(true);
    const rows = await auditRows(leaver.id);
    expect(rows.filter((r) => !r.allowed)).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.detail).toMatchObject({
      privateProjectsSoftDeleted: 1,
      publishedWorksKept: 0,
      sessionsRevoked: sessionsBefore,
      apiTokensRevoked: 1,
      field: 'handle',
    });

    // 决定一：email 与 handle 原样留着——审计要指得到人，代价是同一个邮箱不能再有新身份
    const row = await userRow(leaver.id);
    expect(row.email).toBe(`s144e+${RUN}@nexus.test`);
    expect(row.handle).toBe(`s144e${RUN}`);
    expect(row.displayName).toBe(`审计要看名字${RUN}`);
    expect(row.deletedAt).not.toBeNull();
    // 真名与简介还在库里，但那只是库里；公网那份投影不再用它
    expect(row.bio).toBe('这段简介注销之后不该再出现在公网。');

    const view = await profileOf(`s144e${RUN}`, null);
    expect(view?.accountDeleted).toBe(true);
    expect(view?.name).toBe(DELETED_USER_LABEL);
    expect(view?.bio).toBeNull();
    expect(view?.avatarUrl).toBeNull();
    expect(await accountDeletionSummary(leaver.id)).toBeNull();

    // 登录入口关上：同一个邮箱、同一句对的口令，这一次过不去
    expect(await login({ email: `s144e+${RUN}@nexus.test`, password })).toMatchObject({ code: 'invalid_credentials' });
    expect(await authenticateApiToken(issued.token)).toMatchObject({ ok: false, error: 'revoked_token' });
    expect(await projectDeletedAt(draft)).not.toBeNull();
  });

  it('同一个邮箱不能注册成一个新身份：这是一句拒绝，不是库报错', async () => {
    const closed = `s144r+${RUN}@nexus.test`;
    const leaver = await insertUser({ displayName: `注销后要注册${RUN}`, email: closed });
    expect((await deleteAccount(leaver.id, `注销后要注册${RUN}`)).ok).toBe(true);

    const guest = await insertUser({ displayName: 'Guest For Register', email: null, guest: true });
    const current: CurrentUser = { id: guest.id, displayName: guest.displayName, email: null, guest: true, role: 'creator' };
    // 唯一索引不带 where，它算的是全部行（含 deleted_at 那一行），所以注册必须连注销的一起认：
    // 若这里沿用登录那套"排除已注销"的口径，这一步会撞在 users_email_key 上变成一句 500
    expect(await register(current, { email: closed, password: 'hunter2hunter2' })).toMatchObject({ code: 'email_taken' });
    expect(await userRow(guest.id)).toMatchObject({ email: null, guest: true });

    // 对照：换一个没被占用的邮箱就成功，说明拒它的确实是"占用"而不是别的
    const fresh = await register(current, { email: `s144fresh+${RUN}@nexus.test`, password: 'hunter2hunter2' });
    expect(fresh).toMatchObject({ user: { guest: false } });
  });

  it('第六件事走的是真调用：注销把这个人的频道关掉，别人的频道照旧收得到', () => {
    const bus = getRealtimeBus();
    const seen: string[] = [];
    const kept: string[] = [];
    const leaverId = `pending-${RUN}`;
    const otherChannel = channels.project(`keep-${RUN}`);
    bus.subscribe(channels.user(leaverId), (e) => seen.push(JSON.stringify(e)));
    bus.subscribe(otherChannel, (e) => kept.push(JSON.stringify(e)));
    expect(bus.subscriberCount(channels.user(leaverId))).toBe(1);

    bus.closeChannel(channels.user(leaverId));
    bus.publish(channels.user(leaverId), { type: 'notification', level: 'info', title: '注销之后的推送' });
    expect(seen).toEqual([]);
    bus.publish(otherChannel, { type: 'notification', level: 'info', title: '别人的频道' });
    expect(kept).toHaveLength(1);
    // 收尾：别的用例可能还在用这条总线
    bus.closeChannel(otherChannel);
  });

  it('deleteAccount 自己就把这个人的频道关了：注销之后一条也推不到他名下', async () => {
    const bus = getRealtimeBus();
    const leaver = await insertUser({ displayName: `频道要关的人${RUN}`, email: `s144n+${RUN}@nexus.test` });
    const seen: string[] = [];
    bus.subscribe(channels.user(leaver.id), (e) => seen.push(JSON.stringify(e)));
    expect(bus.subscriberCount(channels.user(leaver.id))).toBe(1);

    expect((await deleteAccount(leaver.id, `频道要关的人${RUN}`)).ok).toBe(true);
    // 不是"没人订阅所以碰巧没收到"：调用之前这里确实是 1
    expect(bus.subscriberCount(channels.user(leaver.id))).toBe(0);
    bus.publish(channels.user(leaver.id), { type: 'notification', level: 'info', title: '注销之后的通知' });
    expect(seen).toEqual([]);
  });

  it('草稿多于界面那一截时数仍是全量：清单被切过，privateProjects 与执行都没有', async () => {
    const many = await insertUser({ displayName: `很多草稿的人${RUN}`, email: `s144m+${RUN}@nexus.test` });
    const ids: string[] = [];
    for (let i = 0; i < DRAFT_PREVIEW_LIMIT + 1; i += 1) {
      ids.push(await newProject(many.id, `第${i}份草稿${RUN}`));
    }
    const preview = await accountDeletionSummary(many.id);
    expect(preview?.privateProjects).toBe(DRAFT_PREVIEW_LIMIT + 1);
    expect(preview?.drafts).toHaveLength(DRAFT_PREVIEW_LIMIT);
    expect(preview?.draftsTruncated).toBe(true);

    const executed = await deleteAccount(many.id, `很多草稿的人${RUN}`);
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect(executed.counts.privateProjectsSoftDeleted).toBe(DRAFT_PREVIEW_LIMIT + 1);
    // 库里一条不剩：执行的是全量，不是清单里那一截
    const live = await getDb()
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.ownerId, many.id), isNull(projects.deletedAt)));
    expect(live).toHaveLength(0);
    expect((await listDeletedProjects(many.id)).map((p) => p.id).sort()).toEqual([...ids].sort());
  });

  it('注销只碰这一个人名下：别人的草稿、会话与凭据原样', async () => {
    const theirs = await newProject(other.id, `别人的草稿${RUN}`);
    const token = await rotateSession(other.id, null);
    const issued = await issueApiToken({ userId: other.id, name: '别人的凭据', scopes: ['design:read'] });
    const leaver = await insertUser({ displayName: `只走自己${RUN}`, email: `s144z+${RUN}@nexus.test` });

    expect((await deleteAccount(leaver.id, `只走自己${RUN}`)).ok).toBe(true);
    expect(await projectDeletedAt(theirs)).toBeNull();
    expect((await listProjects(other.id)).some((p) => p.id === theirs)).toBe(true);
    expect(await sessionOwnerByToken(token)).not.toBeNull();
    expect(await authenticateApiToken(issued.token)).toMatchObject({ ok: true });
    expect((await userRow(other.id)).deletedAt).toBeNull();
  });
});
