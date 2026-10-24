import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET as getSettings, PUT as putSettings } from '../src/app/api/notifications/settings/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { getNotificationSettings } from '../src/server/domain/notifications';
import { getDb } from '../src/server/db/client';
import { sessions, users } from '../src/server/db/schema';

/**
 * §164 通知偏好那条写端点（`PUT /api/notifications/settings`）的门，打真库。
 *
 * 这一片钉的是**一个曾经两边一起漏的洞**：客户端不带 CSRF 头、服务端也不校验 CSRF，
 * 功能照用、测试照绿，因为两边是自洽的——跑测试发现不了，只有横向对比
 * （拿 `notifications/read` 那条同族端点做参照）才看得见。所以这里把三道门各钉一条：
 * CSRF、登录身份、以及"过了门真的改到东西"。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'a1b2c3d4e5f60718';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 会话 cookie 由这里的罐子给；`currentUserOrNull` 拿 token 查会话行，所以身份由测试说了算 */
async function identityFor(userId: string): Promise<string> {
  const token = `tok-${userId}`;
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

function asUser(token: string, withCsrf = true): Record<string, string> {
  jar.clear();
  jar.set(SESSION_COOKIE, token);
  if (withCsrf) jar.set(CSRF_COOKIE, CSRF_TOKEN);
  const headers: Record<string, string> = { 'content-type': 'application/json', cookie: `${SESSION_COOKIE}=${token}` };
  if (withCsrf) headers[CSRF_HEADER] = CSRF_TOKEN;
  return headers;
}

function put(body: unknown, headers: Record<string, string>): Promise<Response> {
  return putSettings(
    new Request('http://localhost:3100/api/notifications/settings', {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    }),
  );
}

let owner: string;
let ownerToken: string;

beforeAll(async () => {
  const db = getDb();
  const [me] = await db
    .insert(users)
    .values({ displayName: '通知偏好房主', email: `nset+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  owner = me!.id;
  ownerToken = await identityFor(owner);
});

afterAll(async () => {
  const db = getDb();
  await db.delete(users).where(eq(users.id, owner));
});

describe('§164 通知偏好写端点的门', () => {
  it('缺 CSRF → 403，且设置一个字没改（库里那条 kind 仍是原值）', async () => {
    const before = await getNotificationSettings(owner);
    jar.clear();
    jar.set(SESSION_COOKIE, ownerToken);
    const res = await put(
      { kind: 'like', enabled: !before.like },
      { 'content-type': 'application/json', cookie: `${SESSION_COOKIE}=${ownerToken}` },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('csrf_failed');
    // 反向对照：没有 CSRF 的那次一个字都不该改到库里
    expect((await getNotificationSettings(owner)).like).toBe(before.like);
  });

  it('过了 CSRF 但没登录 → 401', async () => {
    jar.clear();
    jar.set(CSRF_COOKIE, CSRF_TOKEN);
    const res = await put(
      { kind: 'like', enabled: false },
      { 'content-type': 'application/json', [CSRF_HEADER]: CSRF_TOKEN },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthenticated');
  });

  it('CSRF + 登录 → 200，回执里的 settings 就是库里那一份，GET 读得回来', async () => {
    const before = await getNotificationSettings(owner);
    const target = !before.like;
    const res = await put({ kind: 'like', enabled: target }, asUser(ownerToken));
    const text = await res.text();
    expect(res.status, text).toBe(200);
    const body = JSON.parse(text) as { settings: { like: boolean } };
    expect(body.settings.like).toBe(target);
    // 库是权威：GET 与 PUT 的回执说同一件事
    const getRes = await getSettings();
    expect(getRes.status).toBe(200);
    expect(((await getRes.json()) as { settings: { like: boolean } }).settings.like).toBe(target);
  });

  it('批量格式也走同一道门：缺 CSRF 不改，过了就整批落库', async () => {
    const before = await getNotificationSettings(owner);
    const noCsrf = await put(
      { settings: { comment: !before.comment } },
      { 'content-type': 'application/json', cookie: `${SESSION_COOKIE}=${ownerToken}` },
    );
    expect(noCsrf.status).toBe(403);
    expect((await getNotificationSettings(owner)).comment).toBe(before.comment);

    const ok = await put({ settings: { comment: !before.comment } }, asUser(ownerToken));
    expect(ok.status).toBe(200);
    expect((await getNotificationSettings(owner)).comment).toBe(!before.comment);
  });

  it('第十二类 team 的开关能落库：迁移 0042 的 CHECK 与登记表一起长', async () => {
    const off = await put({ kind: 'team', enabled: false }, asUser(ownerToken));
    expect(off.status).toBe(200);
    // 关掉之后 emit 那一侧也会压住这一类（shouldSendNotification 读的就是这张表）
    expect((await getNotificationSettings(owner)).team).toBe(false);

    const back = await put({ kind: 'team', enabled: true }, asUser(ownerToken));
    expect(back.status).toBe(200);
    expect((await getNotificationSettings(owner)).team).toBe(true);
  });
});
