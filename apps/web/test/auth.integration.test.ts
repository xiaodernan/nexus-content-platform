import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { eq, sql as rawSql } from 'drizzle-orm';
import { login, register, type AuthError, type Authenticated } from '../src/server/domain/auth';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, sessions, users } from '../src/server/db/schema';
import { toCurrentUser } from '../src/server/domain/session';

/**
 * 认证打真库（docs/TESTING.md 禁止 mock 数据库）。先 `npm run infra:up && npm run db:migrate`。
 * 覆盖：注册就地升级 guest（从而认领其项目）、邮箱唯一 / 重复注册拒绝、
 * 登录口令校验与时序兜底、提权时轮换会话（旧 token 被吊销）。
 */

const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const emailBox: string[] = [];
const userIds: string[] = [];

function unwrap<T>(r: T | AuthError): T {
  if (r && typeof r === 'object' && 'code' in r) throw new Error(`unexpected ${JSON.stringify(r)}`);
  return r as T;
}

async function makeGuest(withProject: boolean) {
  const db = getDb();
  const [row] = await db
    .insert(users)
    .values({ displayName: 'Guest Creator', guest: true })
    .returning();
  const user = row!;
  userIds.push(user.id);
  let projectId = '';
  if (withProject) {
    const doc = await createProject(user.id, { name: `Guest Work ${uniq()}`, kind: 'website' });
    projectId = doc.id;
  }
  return { user, projectId };
}

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
});

afterAll(async () => {
  const db = getDb();
  // projects.ownerId 是 onDelete:'restrict'，必须先删项目（其 pages/nodes 会 cascade），再删用户。
  for (const id of userIds) {
    await db.delete(projects).where(eq(projects.ownerId, id));
    await db.delete(users).where(eq(users.id, id));
  }
});

  it('并发拿同一个邮箱注册：后到的那发答 409 email_taken，而不是 23505 500（#174）', async () => {
    const db = getDb();
    const a = await makeGuest(false);
    const b = await makeGuest(false);
    const email = `race-${uniq()}@nexus.test`;
    emailBox.push(email);

    // 真实竞态：另一个会话已经把同一个邮箱写进 users、还没提交——emailTaken 看不见
    // 未提交行，于是照样往下走。后到的那发阻塞在 users_email_key 上，等那个事务落地后
    // 才发现撞车。（直接 Promise.all 两发 register 复现不了：口令哈希把窗口拉得足够宽，
    // 实测两发会串成"一发成功、一发 email_taken"，竞态根本没发生。）
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let landed!: () => void;
    const inserted = new Promise<void>((resolve) => {
      landed = resolve;
    });
    const other = db.transaction(async (tx) => {
      await tx.update(users).set({ email }).where(eq(users.id, a.user.id));
      landed();
      await gate;
    });
    await inserted;
    const pending = register(toCurrentUser(b.user), { email, password: 'whatever-123' });
    // 等到这一发真的阻塞在 users_email_key 上（wait_event_type='Lock'）再放开那个事务：
    // 口令哈希有几十毫秒，轮询等得起；窗口由此钉死，不靠时序碰运气。
    let blocked = false;
    for (let i = 0; i < 600 && !blocked; i += 1) {
      const rows = await db.execute(
        rawSql`select 1 as hit from pg_stat_activity
               where pid <> pg_backend_pid() and wait_event_type = 'Lock'
                 and query like '%update "users"%' limit 1`,
      );
      blocked = rows.length > 0;
      if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(blocked, 'register 没能阻塞在 users_email_key 上——竞态窗口没造出来').toBe(true);
    release();
    const result = await pending;
    await other;

    expect('code' in result && result.code, '并发注册同一个邮箱该答 email_taken').toBe('email_taken');
  });

describe('register（§137 认领 guest 项目）', () => {
  it('就地升级：同一 user id 换成真实账号，名下项目原封不动被认领', async () => {
    const db = getDb();
    const { user, projectId } = await makeGuest(true);
    const email = `claim-${uniq()}@nexus.test`;
    emailBox.push(email);
    const oldToken = uniq() + uniq();
    await db.insert(sessions).values({ userId: user.id, tokenHash: sha(oldToken), expiresAt: new Date(Date.now() + 60_000) });

    const result = unwrap(
      await register(toCurrentUser(user), { email, password: 'super-secret-1' }, { currentToken: oldToken }),
    ) as Authenticated & { claimedProjects: number };

    expect(result.user.guest).toBe(false);
    expect(result.user.email).toBe(email);
    expect(result.claimedProjects).toBe(1);

    // 同一行被改写，而不是新建账号
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after!.guest).toBe(false);
    expect(after!.email).toBe(email);
    expect(after!.claimedAt).not.toBeNull();
    expect(after!.passwordHash).toMatch(/^\$2/);
    expect(after!.passwordHash).not.toContain('super-secret-1');

    // 项目归属没搬动，ownerId 仍是同一 user
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(project!.ownerId).toBe(user.id);

    // 旧会话被吊销（防会话固定），换发的是新 token
    const stale = await db.select().from(sessions).where(eq(sessions.tokenHash, sha(oldToken)));
    expect(stale.length).toBe(0);
    const fresh = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(fresh.length).toBeGreaterThanOrEqual(1);
    expect(fresh.some((s) => s.tokenHash === sha(result.sessionToken))).toBe(true);
  });

  it('当前已是真实账号时拒绝重复注册', async () => {
    const db = getDb();
    const email = `dup-${uniq()}@nexus.test`;
    emailBox.push(email);
    const [row] = await db
      .insert(users)
      .values({ displayName: 'Real', email, guest: false, passwordHash: 'x' })
      .returning();
    userIds.push(row!.id);
    const r = await register(toCurrentUser(row!), { email: `another-${uniq()}@nexus.test`, password: 'whatever-123' });
    expect(r).toEqual({ code: 'already_registered', status: 409 });
  });

  it('邮箱已被占用时拒绝，且不会把已存在账号改坏', async () => {
    const db = getDb();
    const email = `taken-${uniq()}@nexus.test`;
    emailBox.push(email);
    const [existing] = await db
      .insert(users)
      .values({ displayName: 'Holder', email, guest: false, passwordHash: 'keepme' })
      .returning();
    userIds.push(existing!.id);
    const { user } = await makeGuest(false);
    const r = await register(toCurrentUser(user), { email, password: 'whatever-123' });
    expect(r).toEqual({ code: 'email_taken', status: 409 });
    const [unchanged] = await db.select().from(users).where(eq(users.id, existing!.id));
    expect(unchanged!.passwordHash).toBe('keepme');
  });
});

describe('login（口令校验 + 账号枚举兜底）', () => {
  it('注册后的账号能用同一邮箱/口令登录（大小写邮箱等价）', async () => {
    const email = `flow-${uniq()}@nexus.test`;
    emailBox.push(email);
    const { user } = await makeGuest(false);
    unwrap(await register(toCurrentUser(user), { email, password: 'flow-pass-1' }));
    const result = unwrap(await login({ email: email.toUpperCase(), password: 'flow-pass-1' }));
    expect(result.user.email).toBe(email);
    expect(result.user.guest).toBe(false);
  });

  it('口令错误与邮箱不存在都返回同一 invalid_credentials（不泄露是否存在）', async () => {
    const email = `known-${uniq()}@nexus.test`;
    emailBox.push(email);
    const { user } = await makeGuest(false);
    unwrap(await register(toCurrentUser(user), { email, password: 'known-pass-1' }));

    const wrong = await login({ email, password: 'nope-nope-nope' });
    expect(wrong).toEqual({ code: 'invalid_credentials', status: 401 });
    const unknown = await login({ email: `ghost-${uniq()}@nexus.test`, password: 'nope-nope-nope' });
    expect(unknown).toEqual({ code: 'invalid_credentials', status: 401 });
  });

  it('游客（无口令）无法被登录成真实身份', async () => {
    const { user } = await makeGuest(false);
    // 游客没有 email/passwordHash，任何口令都进不去
    const r = await login({ email: 'no-such@nexus.test', password: 'anything-at-all' });
    expect(r).toEqual({ code: 'invalid_credentials', status: 401 });
    expect(user.guest).toBe(true);
  });
});
