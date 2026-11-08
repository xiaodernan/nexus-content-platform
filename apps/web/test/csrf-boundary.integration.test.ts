import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { POST as follow } from '../src/app/api/follow/route';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { getDb } from '../src/server/db/client';
import { follows, sessions, users } from '../src/server/db/schema';

/**
 * §159 横向审计留下的回归护栏：CSRF 这道门必须"既挡得住、又不挡只读通道"。
 *
 * 审计方法（与 `notifications/read` 那一类参照实现横向比）：把 75 条状态变更路由里
 * 没调 `csrfOk` 的那 8 条逐一过——其中 `v1/projects/*` 走 Bearer Token（CSRF 不适用）、
 * `realtime` / `knowledge/search` / `knowledge/block` / `retrieve` 是 non-cookie 或只读，
 * 真正"cookie 会话 + 改状态"的路由全部都调了 `csrfOk`。中间件只负责签发 CSRF cookie，
 * 不负责校验，所以校验纯靠路由自己——这道护栏就是把这个不变量钉死：
 *
 * 1. **改状态的 cookie 路由，缺 CSRF → 403，且一次库都没碰**（关注边没建）。
 * 2. **带 CSRF → 正常走完，关注边真的建起来**。
 *
 * 第 2 条之所以重要：有人"顺手加固"可能会在只读 POST（`knowledge/block`）上也加 CSRF 校验，
 * 那会直接打掉 Agent 上下文组装（`ef33e55` 那次把 GET 改 POST 已经酿过一次 405 事故）。
 * 只读 POST 不碰状态，本就不该要 CSRF；这条护栏让"误加 CSRF"能红。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

// 把限流从这件测试里摘掉：本测试只关心 CSRF 这道门，限流在它后面，且依赖 redis 是否在线。
vi.mock('../src/server/security/rateLimit', () => ({
  ipWriteGate: async () => ({ limited: false, retryAfterMs: 0 }),
  getRateLimiter: () => ({ hit: async () => ({ allowed: true, remaining: 99, resetMs: 0 }) }),
  rateKey: () => 'test',
  clientIp: () => '127.0.0.1',
}));

const CSRF_TOKEN = 'a1b2c3d4e5f6a7b8';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function asUser(token: string | null, withCsrf = true): Record<string, string> {
  jar.clear();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) {
    jar.set(SESSION_COOKIE, token);
    headers.cookie = `${SESSION_COOKIE}=${token}`;
  }
  if (withCsrf) {
    jar.set(CSRF_COOKIE, CSRF_TOKEN);
    headers[CSRF_HEADER] = CSRF_TOKEN;
  }
  return headers;
}

function callFollow(body: unknown, headers: Record<string, string>): Promise<Response> {
  return follow(
    new Request('http://localhost:3100/api/follow', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
}

let actorId = '';
let actorToken = '';
let targetId = '';
let targetHandle = '';

beforeAll(async () => {
  const stamp = Date.now().toString(36);
  const [actor, target] = await getDb()
    .insert(users)
    .values([
      { displayName: 'CSRF Actor', email: `csrf-actor+${stamp}@nexus.test`, handle: `csrfact${stamp}` },
      { displayName: 'CSRF Target', email: `csrf-target+${stamp}@nexus.test`, handle: `csrftgt${stamp}` },
    ])
    .returning({ id: users.id, handle: users.handle });
  actorId = actor!.id;
  targetId = target!.id;
  targetHandle = target!.handle ?? '';
  actorToken = `csrf-actor-tok-${stamp}`;
  await getDb()
    .insert(sessions)
    .values({ userId: actorId, tokenHash: await hashToken(actorToken), expiresAt: new Date(Date.now() + 86_400_000) });
});

afterAll(async () => {
  await getDb().delete(follows).where(eq(follows.followerId, actorId));
  await getDb().delete(sessions).where(eq(sessions.userId, actorId));
  await getDb().delete(users).where(eq(users.id, actorId));
  await getDb().delete(users).where(eq(users.id, targetId));
});

describe('§159 CSRF 边界：cookie 会话的改状态路由', () => {
  it('缺 CSRF → 403 csrf_failed，且一次库都没碰（关注边没建）', async () => {
    const res = await callFollow({ handle: targetHandle }, asUser(actorToken, false));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('csrf_failed');

    const rows = await getDb()
      .select({ id: follows.followerId })
      .from(follows)
      .where(and(eq(follows.followerId, actorId), eq(follows.followeeId, targetId)));
    expect(rows).toHaveLength(0);
  });

  it('带 CSRF → 正常走完，关注边真的建起来', async () => {
    const res = await callFollow({ handle: targetHandle }, asUser(actorToken, true));
    expect(res.status).toBe(200);

    const rows = await getDb()
      .select({ id: follows.followerId })
      .from(follows)
      .where(and(eq(follows.followerId, actorId), eq(follows.followeeId, targetId)));
    expect(rows).toHaveLength(1);
  });
});
