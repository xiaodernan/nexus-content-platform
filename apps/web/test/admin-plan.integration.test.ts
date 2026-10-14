import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { PATCH as changePlan } from '../src/app/api/admin/users/[id]/plan/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { getDb } from '../src/server/db/client';
import { auditEvents, sessions, users } from '../src/server/db/schema';

/**
 * §133 的改档位入口 `PATCH /api/admin/users/<id>/plan`，打真库。
 *
 * 为什么值得单独立一片：这是**发额度**的端点，却没有一处覆盖——没有单测，也没有 e2e
 * 走到它（管理界面不在 e2e 里）。所以这一片要钉的不是"接口通不通"，而是四件会出事的事：
 * 1. 三门齐全：CSRF / 登录 / admin 权限，缺任何一门都是越权发额度；
 * 2. **判序**：权限必须在判档位**之前**。否则"越权的人随手带了个错档位"会被记成 `unknown_plan`，
 *    审计里再也分不出"有人越权"与"有人填错表格"——这正是 `plan-admin.ts` 注释里那个承诺；
 * 3. 改成功了库里真的改，审计里 from/to/changed 对得上（事后读审计的人不用翻代码）；
 * 4. 同档位重复提交也落一行（`changed: false`）：走到这里的要么是脚本要么是页面 bug，
 *    这是它与"真的改档"之间唯一的可分辨信号。
 *
 * 另有一条不对称照 ADR-0021 钉住：**允许改自己的档位**（档位是发额度不是提权；
 * 角色那一边相反，自己提权等于把审核员身份送给拿到这个会话的人）。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'b2c3d4e5f6071829';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(userId: string): Promise<string> {
  const token = `plan-tok-${userId}`;
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

/**
 * 带 CSRF 不带会话（`asUser(null)`）：这条路由的门序是 CSRF → 登录 → 权限，
 * 所以"没登录"要看到 401 就得先过 CSRF 那一道——不然拿到的是 403，那测的是门序不是登录。
 */
function asUser(token: string | null, withCsrf = true): Record<string, string> {
  jar.clear();
  const headers: Record<string, string> = {};
  if (token) {
    jar.set(SESSION_COOKIE, token);
    headers.cookie = `${SESSION_COOKIE}=${token}`;
  }
  if (withCsrf) {
    jar.set(CSRF_COOKIE, CSRF_TOKEN);
    headers[CSRF_HEADER] = CSRF_TOKEN;
  }
  headers['content-type'] = 'application/json';
  return headers;
}

function call(targetId: string, body: unknown, headers: Record<string, string>): Promise<Response> {
  return changePlan(
    new Request(`http://localhost:3100/api/admin/users/${targetId}/plan`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: targetId }) },
  );
}

/** 只取这个 actor 在这个 target 上最后一条改档位审计（库里可能有别的跑次留下的行） */
async function lastPlanAudit(actorId: string, targetId: string) {
  const rows = await getDb()
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.action, 'user.plan.change'), eq(auditEvents.actorId, actorId), eq(auditEvents.targetId, targetId)));
  return rows[rows.length - 1] ?? null;
}

async function planOf(userId: string): Promise<string> {
  const [row] = await getDb().select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.plan ?? 'free';
}

let admin: string;
let adminToken: string;
let member: string;
let memberToken: string;
let target: string;
const ghost = '00000000-0000-4000-8000-000000000000';

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: '改档-审核员', email: `plan+admin+${stamp}@nexus.test`, role: 'admin' },
      { displayName: '改档-普通人', email: `plan+member+${stamp}@nexus.test`, role: 'creator' },
      { displayName: '改档-目标', email: `plan+target+${stamp}@nexus.test`, role: 'creator' },
    ])
    .returning({ id: users.id });
  admin = rows[0]!.id;
  member = rows[1]!.id;
  target = rows[2]!.id;
  adminToken = await identityFor(admin);
  memberToken = await identityFor(member);
});

afterAll(async () => {
  const db = getDb();
  // 审计行按 target/actor 逐个清：它是 append-only 的账，不能整表 truncate
  for (const actor of [admin, member]) {
    for (const id of [target, ghost]) {
      await db
        .delete(auditEvents)
        .where(and(eq(auditEvents.action, 'user.plan.change'), eq(auditEvents.actorId, actor), eq(auditEvents.targetId, id)));
    }
  }
  await db.delete(users).where(eq(users.id, admin));
  await db.delete(users).where(eq(users.id, member));
  await db.delete(users).where(eq(users.id, target));
});

describe('§133 改档位入口：发额度端点的三门、判序与账', () => {
  it('CSRF 没过 → 403，且一次库都没碰（档位没变、没有审计行）', async () => {
    const before = await planOf(target);
    const res = await call(target, { plan: 'pro' }, asUser(adminToken, false));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('csrf_failed');
    expect(await planOf(target)).toBe(before);
    expect(await lastPlanAudit(admin, target)).toBeNull();
  });

  it('没登录 → 401（这个端点不该"探测一下就白手造一个 guest 用户"）', async () => {
    const res = await call(target, { plan: 'pro' }, asUser(null));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthenticated');
    expect(await lastPlanAudit(admin, target)).toBeNull();
  });

  it('非 admin → 403，且审计记的是 not_admin 而不是 unknown_plan（权限判在档位之前）', async () => {
    // 这一条故意带上一个**不存在的档位**：如果判序是"先看档位再看权限"，
    // 这一行就会被记成 unknown_plan，于是"有人越权"与"有人填错表"在审计里再也分不开。
    const res = await call(target, { plan: 'not-a-plan' }, asUser(memberToken));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
    expect(await planOf(target), '越权请求不许改到档位').toBe('free');

    const audit = await lastPlanAudit(member, target);
    expect(audit, '越权尝试必须留一行').not.toBeNull();
    expect(audit!.allowed).toBe(false);
    expect((audit!.detail as { reason?: string }).reason, '判序漂移：越权那行被写成了 unknown_plan').toBe('not_admin');
  });

  it('admin + 未知档位 → 400 unknown_plan，库没动', async () => {
    const res = await call(target, { plan: 'platinum' }, asUser(adminToken));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('unknown_plan');
    expect(body.message, '拒的理由里要说清五档是哪五档').toContain('free');
    expect(await planOf(target)).toBe('free');

    const audit = await lastPlanAudit(admin, target);
    expect((audit!.detail as { reason?: string }).reason).toBe('unknown_plan');
  });

  it('admin + 不存在的账号 → 404，不留成功审计', async () => {
    const res = await call(ghost, { plan: 'pro' }, asUser(adminToken));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('admin + 合法档位 → 200，库里真的改了，审计 from/to/changed 对得上', async () => {
    const res = await call(target, { plan: 'pro' }, asUser(adminToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { previous: string; plan: string; message: string };
    expect(body.previous).toBe('free');
    expect(body.plan).toBe('pro');
    expect(body.message).toBe('free → pro');

    expect(await planOf(target)).toBe('pro');
    const audit = await lastPlanAudit(admin, target);
    expect(audit!.allowed).toBe(true);
    expect(audit!.detail).toMatchObject({ from: 'free', to: 'pro', changed: true, self: false });
    // 把这一档的额度与存储上限一起记下来了：事后读审计的人不用翻当时的代码
    expect((audit!.detail as { grants?: unknown }).grants).toBeDefined();
  });

  it('同档位再提交一次 → 200，但审计是 changed:false（拿端点当探针扫的信号）', async () => {
    const res = await call(target, { plan: 'pro' }, asUser(adminToken));
    expect(res.status).toBe(200);
    expect((await res.json()).previous).toBe('pro');
    expect(await planOf(target)).toBe('pro');

    const audit = await lastPlanAudit(admin, target);
    expect(audit!.allowed).toBe(true);
    expect((audit!.detail as { changed?: boolean }).changed).toBe(false);
  });

  it('admin 改自己的档位 → 200（ADR-0021 的不对称：档位是发额度，不是提权）', async () => {
    const before = await planOf(admin);
    const res = await call(admin, { plan: 'studio' }, asUser(adminToken));
    expect(res.status).toBe(200);
    expect(await planOf(admin)).toBe('studio');

    const audit = await lastPlanAudit(admin, admin);
    expect(audit!.detail).toMatchObject({ from: before, to: 'studio', changed: true, self: true });
    // 收尾：把自己的档位放回去，别给同库的别的跑次留一个不同起点的管理员
    await call(admin, { plan: 'free' }, asUser(adminToken));
  });
});
