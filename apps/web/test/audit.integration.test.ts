import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, gte, inArray, isNull, sql as rawSql } from 'drizzle-orm';
import { listAudit, recordAudit } from '../src/server/domain/audit';
import { countAdmins, listAccounts, setUserRole } from '../src/server/domain/roles';
import { getDb } from '../src/server/db/client';
import { auditEvents, users } from '../src/server/db/schema';

/**
 * §80 / §84 的审计与 §131 的提权判定。
 *
 * 这一片全部是"权限"上的判断，所以每条负面断言都配一个同一次运行里的正向对照：
 * 一个永远返回 ok 的 setUserRole 会让"非 admin 被拒"和"admin 能提权"两条一起通过吗？不会——
 * 后者要求角色真的变了，前者要求真的没变。两条都要读到库里的行才算过。
 */

let adminId: string;
let creatorId: string;
let secondAdminId: string;
const stamp = Date.now().toString(36);

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  // 清掉上一次运行留下的同名 handle：这一套用 handle 定位账号
  await db.delete(users).where(rawSql`handle like ${'aud%'}`);
  const rows = await db
    .insert(users)
    .values([
      { displayName: 'Admin One', email: `aud-a+${Date.now()}@nexus.test`, handle: `auda${stamp}`, role: 'admin' },
      { displayName: 'Admin Two', email: `aud-b+${Date.now()}@nexus.test`, handle: `audb${stamp}`, role: 'admin' },
      { displayName: 'Creator', email: `aud-c+${Date.now()}@nexus.test`, handle: `audc${stamp}`, role: 'creator' },
    ])
    .returning({ id: users.id });
  adminId = rows[0]!.id;
  secondAdminId = rows[1]!.id;
  creatorId = rows[2]!.id;
});

afterAll(async () => {
  const db = getDb();
  const ids = [adminId, secondAdminId, creatorId];
  await db.delete(auditEvents).where(inArray(auditEvents.actorId, ids));
  await db.delete(users).where(inArray(users.id, ids));
});

const mine = async () =>
  (
    await getDb()
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(and(inArray(auditEvents.actorId, [adminId, secondAdminId, creatorId]), gte(auditEvents.createdAt, new Date(Date.now() - 60_000))))
  ).map((r) => r.id);

describe('审计的写入方', () => {
  it('写一行读得回来，最新的在前面；actor 为空读成"没有身份"', async () => {
    expect(await recordAudit({ actorId: adminId, action: 'test.first', targetType: 'probe', targetId: 'x', allowed: true })).toBe(true);
    expect(await recordAudit({ actorId: null, action: 'test.second', targetType: 'probe', allowed: false, detail: { reason: 'no_creds' } })).toBe(true);

    const events = await listAudit(50);
    const first = events.find((event) => event.action === 'test.first');
    const second = events.find((event) => event.action === 'test.second');
    expect(first?.actorName).toBe('Admin One');
    expect(second).toBeDefined();
    // actorId 为空时左边是 null；`?? 'none'` 会把它换成字符串，断言就永远不成立（这条自己坑过一次）
    expect(second!.actorName).toBe(null);
    expect(second?.allowed).toBe(false);
    expect(JSON.stringify(second?.detail)).toContain('no_creds');
    // 最新在前：第二条一定排在第一条之后写入，因此索引更小
    expect(events.indexOf(second!)).toBeLessThan(events.indexOf(first!));
    await getDb().delete(auditEvents).where(inArray(auditEvents.id, await mine()));
  });

  it('写不进去时返回 false 而不是把这次请求带崩', async () => {
    // actorId 指向一个不存在的账号：外键会拒绝。审计是旁证，它失败不该让业务动作失败
    await expect(
      recordAudit({ actorId: '00000000-0000-4000-8000-0000000000ff', action: 'test.bad-actor', allowed: true }),
    ).resolves.toBe(false);
  });
});

describe('角色变更的判定（§131 的自助提权）', () => {
  it('非审核员尝试改角色：不生效，并且被拒的那一次留在审计里', async () => {
    const result = await setUserRole(creatorId, adminId, 'creator');
    expect(result).toMatchObject({ ok: false, code: 'forbidden' });
    const [target] = await getDb().select({ role: users.role }).from(users).where(eq(users.id, adminId)).limit(1);
    expect(target?.role).toBe('admin');
    const events = await listAudit(50);
    expect(events.some((event) => event.action === 'user.role.change' && event.allowed === false && event.actorId === creatorId)).toBe(true);
    await getDb().delete(auditEvents).where(inArray(auditEvents.id, await mine()));
  });

  it('审核员提一个普通账号：角色真的变了，来路记在 detail 里', async () => {
    const result = await setUserRole(adminId, creatorId, 'admin');
    expect(result).toMatchObject({ ok: true, previous: 'creator', role: 'admin' });
    const [target] = await getDb().select({ role: users.role }).from(users).where(eq(users.id, creatorId)).limit(1);
    expect(target?.role).toBe('admin');
    const events = await listAudit(50);
    const row = events.find((event) => event.action === 'user.role.change' && event.targetId === creatorId);
    expect(JSON.stringify(row?.detail)).toContain('"from":"creator"');
    expect(row?.allowed).toBe(true);
    await getDb().update(users).set({ role: 'creator' }).where(eq(users.id, creatorId));
    await getDb().delete(auditEvents).where(inArray(auditEvents.id, await mine()));
  });

  it('不能改自己；最后一个审核员不能被降下去', async () => {
    expect(await setUserRole(adminId, adminId, 'creator')).toMatchObject({ ok: false, code: 'self_change' });
    // 现在有两个 admin：降一个是允许的（反向对照，否则"永远拒绝"也能通过上一条）
    expect(await countAdmins()).toBe(2);
    const down = await setUserRole(adminId, secondAdminId, 'creator');
    expect(down).toMatchObject({ ok: true, previous: 'admin', role: 'creator' });
    expect(await countAdmins()).toBe(1);
    expect(await setUserRole(adminId, adminId, 'creator')).toMatchObject({ ok: false, code: 'self_change' });
    // 造出"只剩一个 admin 且不是自己"的局面：把它降下去必须被拒
    const [creator] = await getDb().select({ id: users.id }).from(users).where(eq(users.handle, `audc${stamp}`)).limit(1);
    await getDb().update(users).set({ role: 'admin' }).where(eq(users.id, creator!.id));
    // 现在 adminId 与 creator 都是 admin；把 creator 降下去允许，再把自己降下去仍被 self_change 挡住
    expect(await setUserRole(adminId, creator!.id, 'creator')).toMatchObject({ ok: true });
    expect(await countAdmins()).toBe(1);
    await getDb().delete(auditEvents).where(inArray(auditEvents.id, await mine()));
  });

  it('最后一个审核员降不下去：够得着这条路的只有他自己，被 self_change 挡住', async () => {
    // roles.ts 刻意没有一条 last_admin 规则——它够不着：能改别人的只有 admin，
    // 而 admin 改自己被 self_change 挡住。这条用例守的是那个**推论**（0 个 admin 不可达），
    // 不是守一条不存在的代码分支（把名字写成"last_admin 规则"会让人去源码里找它）。
    // 上一个用例结束时只剩 adminId 一个 admin
    expect(await countAdmins()).toBe(1);
    const [creator] = await getDb().select({ id: users.id }).from(users).where(eq(users.handle, `audc${stamp}`)).limit(1);
    // 反向对照：还有第二个 admin 时，降其中一个是可以的（否则"恒拒绝"也能通过下面的断言）
    expect(await setUserRole(adminId, creator!.id, 'admin')).toMatchObject({ ok: true });
    expect(await setUserRole(adminId, creator!.id, 'creator')).toMatchObject({ ok: true });
    await getDb().update(users).set({ role: 'creator' }).where(eq(users.id, secondAdminId));
    expect(await countAdmins()).toBe(1);
    // 想把最后一个降下去，从这条路只能改自己
    expect(await setUserRole(adminId, adminId, 'creator')).toMatchObject({ ok: false, code: 'self_change' });
    // 换个非 admin 来降它：403，而且角色不动
    expect(await setUserRole(creator!.id, adminId, 'creator')).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await countAdmins()).toBe(1);
    await getDb().delete(auditEvents).where(inArray(auditEvents.id, await mine()));
  });

  it('guest 身份不给提权：那种身份新开一个浏览器就有，提权等于发给匿名会话', async () => {
    const [guest] = await getDb()
      .insert(users)
      .values({ displayName: 'Guest Probe', handle: `audg${stamp}`, guest: true })
      .returning({ id: users.id });
    const result = await setUserRole(adminId, guest!.id, 'admin');
    expect(result).toMatchObject({ ok: false, code: 'guest_unclaimed' });
    const [row] = await getDb().select({ role: users.role }).from(users).where(eq(users.id, guest!.id)).limit(1);
    expect(row?.role).toBe('creator');
    // 反向对照：同一个 guest 账号走普通角色是允许的——被拒的是"提成 admin"这件事，不是这个账号
    expect(await setUserRole(adminId, guest!.id, 'creator')).toMatchObject({ ok: true });
    const events = await listAudit(50);
    const denied = events.find((event) => event.targetId === guest!.id && event.allowed === false);
    expect(JSON.stringify(denied?.detail)).toContain('guest_target');
    await getDb().delete(auditEvents).where(inArray(auditEvents.id, await mine()));
    await getDb().delete(users).where(eq(users.id, guest!.id));
  });
});

describe('账号清单', () => {
  it('列得出未注销的账号，带角色与 handle', async () => {
    const accounts = await listAccounts(500);
    const mine2 = accounts.filter((account) => account.handle?.startsWith(`aud`));
    expect(mine2.length).toBe(3);
    expect(mine2.some((account) => account.role === 'admin')).toBe(true);
    // 反向对照：软删的账号不在清单里
    await getDb().update(users).set({ deletedAt: new Date() }).where(eq(users.id, secondAdminId));
    const after = await listAccounts(500);
    expect(after.some((account) => account.id === secondAdminId)).toBe(false);
    expect(after.some((account) => account.id === adminId)).toBe(true);
    await getDb().update(users).set({ deletedAt: null }).where(eq(users.id, secondAdminId));
    const [still] = await getDb().select({ id: users.id }).from(users).where(and(eq(users.id, secondAdminId), isNull(users.deletedAt))).limit(1);
    expect(still?.id).toBe(secondAdminId);
  });
});
