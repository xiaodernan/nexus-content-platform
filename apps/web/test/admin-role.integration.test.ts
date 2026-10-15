import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { PATCH as changeRole } from '../src/app/api/admin/users/[id]/route';
import { countAdmins } from '../src/server/domain/roles';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { getDb } from '../src/server/db/client';
import { auditEvents, sessions, users } from '../src/server/db/schema';

/**
 * §131 提权/降权入口 `PATCH /api/admin/users/<id>` 的**路由层**，打真库。
 *
 * 与 `plan-admin.integration.test.ts`（档位）和 `audit.integration.test.ts`（域规则）分工不同：
 * 那一份钉的是 `domain/roles.ts` 里的判定，这一份钉的是**路由层自己的四件事**——
 * CSRF / 登录 / 报文校验 / 把结果翻译成 HTTP。这三层在域测试里是看不见的：
 *
 * 1. **报文校验在最前面**：这里用的是 `z.enum(['creator','admin'])`（不是档位那种宽松的
 *    `z.string()`），所以非法角色连域都进不去。这一点与域里"权限判在档位之前"不矛盾——
 *    域判断的是"进得来之后"的顺序，而这里根本不放它进来。用 `{role:'root'}` 打一个
 *    非 admin，拿到的是 400 而不是 403：那条断言钉的就是这条边界本身。
 * 2. **CSRF 与登录都断言"一次库都没碰"**（角色没变 + 没有审计行），不是只看状态码。
 * 3. **不能改自己**：路由要把 `self_change` 如实翻成 400 而不是 500。
 * 4. **guest 不给提权**：提权事故最可能的来源就是"随手建的未认领身份"。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'c3d4e5f607182930';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(userId: string): Promise<string> {
  const token = `role-tok-${userId}`;
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

/** 门序与档位那条一样是 CSRF → 登录 → 报文，所以"没登录"要带 CSRF 才看得到 401 */
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

function call(targetId: string, body: unknown, headers: Record<string, string>): Promise<Response> {
  return changeRole(
    new Request(`http://localhost:3100/api/admin/users/${targetId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: targetId }) },
  );
}

async function lastRoleAudit(actorId: string, targetId: string) {
  const rows = await getDb()
    .select()
    .from(auditEvents)
    .where(
      and(eq(auditEvents.action, 'user.role.change'), eq(auditEvents.actorId, actorId), eq(auditEvents.targetId, targetId)),
    );
  return rows[rows.length - 1] ?? null;
}

async function roleOf(userId: string): Promise<string> {
  const [row] = await getDb().select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.role ?? 'creator';
}

let admin: string;
let adminToken: string;
let member: string;
let memberToken: string;
let secondAdmin: string;
let guest: string;
const ghost = '00000000-0000-4000-8000-000000000001';

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: '提权-审核员', email: `role+admin+${stamp}@nexus.test`, role: 'admin' },
      { displayName: '提权-第二个审核员', email: `role+admin2+${stamp}@nexus.test`, role: 'admin' },
      { displayName: '提权-普通人', email: `role+member+${stamp}@nexus.test`, role: 'creator' },
      { displayName: '提权-未认领', email: `role+guest+${stamp}@nexus.test`, role: 'creator', guest: true },
    ])
    .returning({ id: users.id });
  admin = rows[0]!.id;
  secondAdmin = rows[1]!.id;
  member = rows[2]!.id;
  guest = rows[3]!.id;
  adminToken = await identityFor(admin);
  memberToken = await identityFor(member);
});

afterAll(async () => {
  const db = getDb();
  for (const actor of [admin, member]) {
    for (const id of [member, ghost, secondAdmin]) {
      await db
        .delete(auditEvents)
        .where(
          and(
            eq(auditEvents.action, 'user.role.change'),
            eq(auditEvents.actorId, actor),
            eq(auditEvents.targetId, id),
          ),
        );
    }
  }
  await db.delete(users).where(eq(users.id, admin));
  await db.delete(users).where(eq(users.id, secondAdmin));
  await db.delete(users).where(eq(users.id, member));
  await db.delete(users).where(eq(users.id, guest));
});

describe('§131 提权/降权入口：路由层的门序、报文与提权路径', () => {
  it('CSRF 没过 → 403，且一次库都没碰（角色没变、没有审计行）', async () => {
    const res = await call(member, { role: 'admin' }, asUser(adminToken, false));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('csrf_failed');
    expect(await roleOf(member)).toBe('creator');
    expect(await lastRoleAudit(admin, member)).toBeNull();
  });

  it('没登录 → 401（这个端点正是最不该"探测一下就白手造 guest"的地方）', async () => {
    const res = await call(member, { role: 'admin' }, asUser(null));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthenticated');
    expect(await lastRoleAudit(admin, member)).toBeNull();
  });

  it('非法的角色值 → 400，且一次库都没碰（zod 枚举挡在最前面，域都没进）', async () => {
    const res = await call(member, { role: 'root' }, asUser(adminToken));
    expect(res.status).toBe(400);
    // `badRequest()` 的 error 字面量是 validation_failed（issues 在同一个对象里）
    expect((await res.json()).error).toBe('validation_failed');
    expect(await roleOf(member)).toBe('creator');
    expect(await lastRoleAudit(admin, member)).toBeNull();
  });

  it('非 admin + 非法的角色值 → 仍是 400 而不是 403（域里"权限在报文之前"在这里不适用）', async () => {
    // 这一条看着像判序问题，其实不是：路由用的是 z.enum，非法值根本进不了域，
    // 所以域那句"先判权限再判档位"管的是进得来之后的顺序。边界本身要被钉住——
    // 哪天有人把 z.enum 换成 z.string()（像档位那条一样），这一条会红，提醒他重新评估。
    const res = await call(member, { role: 'root' }, asUser(memberToken));
    expect(res.status).toBe(400);
  });

  it('非 admin → 403 forbidden，且库里角色没变、审计记 not_admin', async () => {
    const res = await call(member, { role: 'admin' }, asUser(memberToken));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
    expect(await roleOf(member)).toBe('creator');

    const audit = await lastRoleAudit(member, member);
    expect(audit!.allowed).toBe(false);
    expect((audit!.detail as { reason?: string }).reason).toBe('not_admin');
  });

  it('admin 改自己的角色 → 400 self_change（"拿到这个会话的人就能变成审核员"那条路被挡住）', async () => {
    const before = await roleOf(admin);
    const res = await call(admin, { role: 'creator' }, asUser(adminToken));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('self_change');
    expect(await roleOf(admin), '降权自己同样不许').toBe(before);

    const audit = await lastRoleAudit(admin, admin);
    expect(audit!.allowed).toBe(false);
    expect((audit!.detail as { reason?: string }).reason).toBe('self_change');
  });

  it('admin 提权一个未认领的 guest → 400 guest_unclaimed（撤下内容的权力不能发给匿名会话）', async () => {
    const res = await call(guest, { role: 'admin' }, asUser(adminToken));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('guest_unclaimed');
    expect(await roleOf(guest)).toBe('creator');

    const audit = await lastRoleAudit(admin, guest);
    expect(audit!.allowed).toBe(false);
    expect((audit!.detail as { reason?: string }).reason).toBe('guest_target');
  });

  it('admin 改一个不存在的账号 → 404', async () => {
    const res = await call(ghost, { role: 'admin' }, asUser(adminToken));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('admin 提权一个普通账号 → 200，库里真的变了，审计 from/to 对、admin 数报出来', async () => {
    const before = await countAdmins();
    const res = await call(member, { role: 'admin' }, asUser(adminToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { previous: string; role: string; admins: number };
    expect(body.previous).toBe('creator');
    expect(body.role).toBe('admin');
    expect(body.admins).toBe(before + 1);
    expect(await roleOf(member)).toBe('admin');

    const audit = await lastRoleAudit(admin, member);
    expect(audit!.allowed).toBe(true);
    expect(audit!.detail).toMatchObject({ from: 'creator', to: 'admin' });
  });

  it('admin 降权另一个 admin → 200（"一个 admin 都不剩"从这条路径进不来：改自己被挡住）', async () => {
    // 增量而不是全局计数：库里可能住着别人的审核员（e2e 残留、人工账号），
    // 那不归这条用例说——它守的推论只需要"少了一个，而动手的那个还在"。
    // 2026-10-15 就是这么红的：9 个 mod+admin+ 残留把全局断言顶掉了。
    const before = await countAdmins();
    const res = await call(secondAdmin, { role: 'creator' }, asUser(adminToken));
    expect(res.status).toBe(200);
    expect(await roleOf(secondAdmin)).toBe('creator');
    expect(await countAdmins(), '降掉一个，总数少一个').toBe(before - 1);
    expect(await roleOf(admin), '动手的审核员自己还在（推论的另一半）').toBe('admin');
  });
});
