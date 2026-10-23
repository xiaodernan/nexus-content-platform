import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { POST, DELETE } from '../src/app/api/blocks/route';
import { canInteract, listBlocks, relationOf } from '../src/server/domain/blocks';
import { toggleFollow } from '../src/server/domain/social';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { getDb } from '../src/server/db/client';
import { follows, sessions, userBlocks, users } from '../src/server/db/schema';

/**
 * §132 block / mute 的入口（`/api/blocks`）。这一格此前只有域层被间接调到，
 * 路由本身没有见证——而路由上有三件只有它才说得清的事：
 *
 * 1. **按 handle 寻址**：界面上给的是 @name，"知道某个人的 uuid"不该是能做这件事的前提；
 * 2. **CSRF 双提交**：这是写请求，没有它就是跨站就能替人拉黑；
 * 3. **解除是 no-op 不是错误**：界面上"取消"点两次不该变红。
 *
 * 另外两条语义钉在域层断言里（block 拆关注、mute 不动关注），因为那是这一片
 * 最需要说清的边界——把 mute 当禁言用会以为自己在处理骚扰，其实没有。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'e5f7a9c1b3d52086';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

let me: string;
let meHandle: string;
let meToken: string;
let they: string;
let theyHandle: string;

async function makeUser(label: string, handle: string): Promise<{ id: string; token: string }> {
  const db = getDb();
  const [row] = await db
    .insert(users)
    .values({ displayName: label, email: `blocks+${handle}+${Date.now()}@nexus.test`, handle })
    .returning({ id: users.id });
  const token = `tok-${handle}`;
  await db.insert(sessions).values({ userId: row!.id, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return { id: row!.id, token };
}

beforeAll(async () => {
  const a = await makeUser('拉黑发起人', 'blocker-a');
  const b = await makeUser('被拉黑的人', 'blocked-b');
  me = a.id;
  meToken = a.token;
  meHandle = 'blocker-a';
  they = b.id;
  theyHandle = 'blocked-b';
});

afterAll(async () => {
  const db = getDb();
  await db.delete(userBlocks).where(eq(userBlocks.blockerId, me));
  await db.delete(follows).where(eq(follows.followerId, me));
  await db.delete(follows).where(eq(follows.followeeId, me));
  await db.delete(sessions).where(eq(sessions.userId, me));
  await db.delete(sessions).where(eq(sessions.userId, they));
  await db.delete(users).where(eq(users.id, me));
  await db.delete(users).where(eq(users.id, they));
});

function call(method: 'POST' | 'DELETE', body: unknown, withAuth = true, withCsrf = true): Promise<Response> {
  jar.clear();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cookies: string[] = [];
  if (withAuth) {
    jar.set(SESSION_COOKIE, meToken);
    cookies.push(`${SESSION_COOKIE}=${meToken}`);
  }
  if (withCsrf) {
    jar.set(CSRF_COOKIE, CSRF_TOKEN);
    cookies.push(`${CSRF_COOKIE}=${CSRF_TOKEN}`);
    headers[CSRF_HEADER] = CSRF_TOKEN;
  }
  if (cookies.length) headers.cookie = cookies.join('; ');
  const handler = method === 'POST' ? POST : DELETE;
  return handler(
    new Request('http://localhost:3100/api/blocks', {
      method,
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

const sqlCount = sql<number>`count(*)::int`;

async function followCount(): Promise<number> {
  const db = getDb();
  const [row] = await db.select({ n: sqlCount }).from(follows).where(eq(follows.followerId, me));
  return row?.n ?? 0;
}

describe('§132 /api/blocks 的入口形状', () => {
  it('写请求先过 CSRF：没有双提交令牌就是 403，一个关系都不写', async () => {
    const res = await call('POST', { handle: theyHandle, kind: 'block' }, true, false);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('csrf_failed');
    expect(await relationOf(me, they)).toBeNull();
  });

  it('坏正文 / 坏 kind / 不存在的 handle 各自给各自的答案', async () => {
    const broken = await call('POST', '{ 不是 JSON');
    expect(broken.status).toBe(400);

    const badKind = await call('POST', { handle: theyHandle, kind: 'ignore' });
    expect(badKind.status).toBe(400);

    const noHandle = await call('POST', { kind: 'block' });
    expect(noHandle.status).toBe(400);

    const nobody = await call('POST', { handle: '没有这个人', kind: 'block' });
    expect(nobody.status).toBe(404);
    expect((await nobody.json()).error).toBe('not_found');
  });

  it('不能把自己拉黑或屏蔽——这句话由服务端说，不是界面拦一下', async () => {
    const res = await call('POST', { handle: meHandle, kind: 'block' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('cannot_block');
    expect(body.message).toContain('不能把自己');
    expect(await relationOf(me, me)).toBeNull();
  });

  it('block 把两个方向的关注一起拆掉——留一条"我关注了我拉黑的人"，关注流里就还会冒出他的内容', async () => {
    await toggleFollow(me, they);
    await toggleFollow(they, me);
    const db = getDb();
    const before = await db.select().from(follows).where(eq(follows.followerId, me));
    expect(before.length).toBe(1);

    const res = await call('POST', { handle: theyHandle, kind: 'block' });
    const text = await res.text();
    expect(res.status, text).toBe(200);
    const body = JSON.parse(text) as { ok: boolean; kind: string; created: boolean; unfollowed: number };
    expect(body.ok).toBe(true);
    expect(body.kind).toBe('block');
    expect(body.created).toBe(true);
    expect(body.unfollowed).toBe(2);

    expect(await followCount()).toBe(0);
    const db2 = getDb();
    expect((await db2.select().from(follows).where(eq(follows.followerId, they))).length).toBe(0);
  });

  it('mute 不动关注——"还想知道他在做什么，但不想被他找到"是合法用法', async () => {
    const db = getDb();
    await db.delete(userBlocks).where(eq(userBlocks.blockerId, me));
    await toggleFollow(me, they);

    const res = await call('POST', { handle: theyHandle, kind: 'mute' });
    const text = await res.text();
    expect(res.status, text).toBe(200);
    expect((JSON.parse(text) as { unfollowed: number }).unfollowed).toBe(0);
    expect(await followCount()).toBe(1);
  });

  it('mute 不挡互动，block 双向都挡——把 mute 当禁言用会以为自己在处理骚扰，其实没有', async () => {
    expect(await canInteract(me, they)).toEqual({ allowed: true });
    expect((await canInteract(they, me)).allowed).toBe(true);

    await call('POST', { handle: theyHandle, kind: 'block' });
    const mine = await canInteract(me, they);
    expect(mine.allowed).toBe(false);
    expect(mine.allowed === false && mine.blockedBy).toBe('me');
    const theirs = await canInteract(they, me);
    expect(theirs.allowed).toBe(false);
    expect(theirs.allowed === false && theirs.blockedBy).toBe('them');
  });

  it('同一对反复提交只有一行，kind 以最后一次为准', async () => {
    await call('POST', { handle: theyHandle, kind: 'block' });
    const again = await call('POST', { handle: theyHandle, kind: 'mute' });
    const body = (await again.json()) as { created: boolean; kind: string };
    expect(again.status).toBe(200);
    expect(body.created).toBe(false);
    expect(body.kind).toBe('mute');

    const rows = await listBlocks(me);
    expect(rows.length).toBe(1);
    expect(rows[0]!.kind).toBe('mute');
  });

  it('解除是 no-op 不是错误：点两次"取消"，第二次回 removed=false 而不是红', async () => {
    const first = await call('DELETE', { handle: theyHandle });
    expect(first.status).toBe(200);
    expect(((await first.json()) as { removed: boolean }).removed).toBe(true);

    const second = await call('DELETE', { handle: theyHandle });
    expect(second.status).toBe(200);
    expect(((await second.json()) as { removed: boolean }).removed).toBe(false);

    expect(await relationOf(me, they)).toBeNull();
  });

  it('解除一个从没有过关系的 handle：同样 no-op', async () => {
    const res = await call('DELETE', { handle: theyHandle });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { removed: boolean }).removed).toBe(false);
  });
});
