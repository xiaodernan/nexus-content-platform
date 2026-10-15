import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { POST as resolveModeration } from '../src/app/api/admin/moderation/[caseId]/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { auditEvents, moderationCases, projects, sessions, users } from '../src/server/db/schema';

/**
 * §131 人工裁决入口 `POST /api/admin/moderation/<caseId>` 的路由层，打真库。
 *
 * 这是全平台权力最大的一个按钮——"rejected" 会让公开 URL 立刻不可达。路由层此前零覆盖
 * （`domain/moderation` 的 resolveCase 有自己的单测，但门、判序、状态码翻译都没有）。
 *
 * 这一片的重点是**判序**，它和别的写路由不一样：
 *   登录 → 限流 → admin(+写审计) → CSRF → 报文 → 域
 * 也就是说 CSRF 判在 admin 判定**之后**，而别的路由多半是 CSRF 在最前。
 * 这不是笔误：被拒的越权尝试也要写审计，而那条路任何登录用户都能走；
 * 先限流再判权限，是为了不让一个非审核员的循环请求把审计表刷满。
 * 两条断言钉住它：admin 不带 CSRF → 403 csrf_failed；非 admin → 403 forbidden **且留一行审计**。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'd4e5f60718293041';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(userId: string): Promise<string> {
  const token = `mod-tok-${userId}`;
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
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

function call(caseId: string, body: unknown, headers: Record<string, string>): Promise<Response> {
  return resolveModeration(
    new Request(`http://localhost:3100/api/admin/moderation/${caseId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ caseId }) },
  );
}

async function lastModerationAudit(actorId: string, caseId: string) {
  const rows = await getDb()
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.action, 'moderation.resolve'), eq(auditEvents.actorId, actorId), eq(auditEvents.targetId, caseId)));
  return rows[rows.length - 1] ?? null;
}

async function caseOf(caseId: string) {
  const [row] = await getDb().select().from(moderationCases).where(eq(moderationCases.id, caseId)).limit(1);
  return row ?? null;
}

let admin: string;
let adminToken: string;
let member: string;
let memberToken: string;
const projectIds: string[] = [];
const caseIds: string[] = [];

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: '裁决-审核员', email: `mod+admin+${stamp}@nexus.test`, role: 'admin' },
      { displayName: '裁决-普通人', email: `mod+member+${stamp}@nexus.test`, role: 'creator' },
    ])
    .returning({ id: users.id });
  admin = rows[0]!.id;
  member = rows[1]!.id;
  adminToken = await identityFor(admin);
  memberToken = await identityFor(member);
});

afterAll(async () => {
  const db = getDb();
  for (const caseId of caseIds) {
    await db.delete(auditEvents).where(eq(auditEvents.targetId, caseId));
    await db.delete(moderationCases).where(eq(moderationCases.id, caseId));
  }
  await db.delete(auditEvents).where(eq(auditEvents.actorId, member));
  for (const id of projectIds) await db.delete(projects).where(eq(projects.id, id));
  await db.delete(users).where(eq(users.id, admin));
  await db.delete(users).where(eq(users.id, member));
});

/** 造一条待人裁决的案子（不带 publication 行：那是"被机检当场挡下"的形状） */
async function newCase(): Promise<string> {
  const projectId = (await createProject(member, { name: `裁决对象 ${caseIds.length}`, kind: 'website' })).id;
  projectIds.push(projectId);
  const [row] = await getDb()
    .insert(moderationCases)
    .values({
      projectId,
      publicationVersion: 1,
      visibility: 'public',
      decision: 'review',
      reviewRequired: true,
      rulesVersion: 'test-rules',
      findings: [],
    })
    .returning({ id: moderationCases.id });
  const id = row!.id;
  caseIds.push(id);
  return id;
}

describe('§131 人工裁决入口：撤内容权力的门、判序与账', () => {
  it('没登录 → 401，案子上什么都没发生', async () => {
    const caseId = await newCase();
    const res = await call(caseId, { resolution: 'approved' }, asUser(null));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthenticated');
    const row = await caseOf(caseId);
    expect(row!.resolvedAt).toBeNull();
  });

  it('非 admin → 403，且**留一行审计**（被拒的越权尝试正是审计表存在的理由）', async () => {
    const caseId = await newCase();
    const res = await call(caseId, { resolution: 'approved' }, asUser(memberToken));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');

    const audit = await lastModerationAudit(member, caseId);
    expect(audit, '越权裁决必须留痕，不然关掉窗口就没人知道有人试过').not.toBeNull();
    expect(audit!.allowed).toBe(false);
    expect(audit!.detail).toMatchObject({ reason: 'not_admin' });
    // 判决没落：非 admin 不许改动案子
    const row = await caseOf(caseId);
    expect(row!.resolvedAt).toBeNull();
    expect(row!.resolution).toBeNull();
  });

  it('admin 不带 CSRF → 403 csrf_failed（CSRF 判在 admin 之后，这个顺序与别处不同）', async () => {
    const caseId = await newCase();
    const res = await call(caseId, { resolution: 'approved' }, asUser(adminToken, false));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('csrf_failed');
    expect((await caseOf(caseId))!.resolvedAt).toBeNull();
  });

  it('admin + 非法 resolution → 400 validation_failed，案子未动', async () => {
    const caseId = await newCase();
    const res = await call(caseId, { resolution: 'burn-it-down' }, asUser(adminToken));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation_failed');
    expect((await caseOf(caseId))!.resolvedAt).toBeNull();
  });

  it('admin + 不存在的案号 → 409 cannot_resolve', async () => {
    const res = await call('00000000-0000-4000-8000-000000000009', { resolution: 'approved' }, asUser(adminToken));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('cannot_resolve');
  });

  it('admin + approved → 200，落库的是"人看过并放行"，审计写清是谁', async () => {
    const caseId = await newCase();
    const res = await call(caseId, { resolution: 'approved', note: '我看了，是误报' }, asUser(adminToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; message: string; hidden: boolean };
    expect(body.ok).toBe(true);
    expect(body.hidden).toBe(false);
    expect(body.message).toContain('放行');

    const row = await caseOf(caseId);
    expect(row!.resolution).toBe('approved');
    expect(row!.resolutionNote).toBe('我看了，是误报');
    expect(row!.resolvedBy).toBe(admin);
    expect(row!.resolvedAt).not.toBeNull();

    const audit = await lastModerationAudit(admin, caseId);
    expect(audit!.allowed).toBe(true);
    expect(audit!.detail).toMatchObject({ resolution: 'approved', hidden: false });
  });

  it('第二次裁决同一个案子 → 409，且那一次尝试也留一行（改已结案的结论要能被看见）', async () => {
    const caseId = await newCase();
    await call(caseId, { resolution: 'approved' }, asUser(adminToken));
    const res = await call(caseId, { resolution: 'rejected' }, asUser(adminToken));
    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain('裁决过');
    // 结案结论没被第二次改掉
    expect((await caseOf(caseId))!.resolution).toBe('approved');

    const audit = await lastModerationAudit(admin, caseId);
    expect(audit!.allowed).toBe(false);
    expect((audit!.detail as { reason?: string }).reason).toBe('already_resolved');
  });

  it('admin + rejected → 200，一句话把内容撤下来（没有 publication 行时只结案）', async () => {
    const caseId = await newCase();
    const res = await call(caseId, { resolution: 'rejected', note: '违规' }, asUser(adminToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    // 话要按裁决说，不按"有没有公开页可撤"说：这一版没有 publication 行，
    // 所以"已拒绝"是对的，"已放行"是反的——早先那版在这里说的是"已放行"。
    expect(body.message).toContain('已拒绝');
    expect(body.message).toContain('没有公开页可撤');
    expect((await caseOf(caseId))!.resolution).toBe('rejected');
    // 账必须在：这一路曾经在关举报时把 `''` 塞进 uuid 列而 500，导致结案写进去了、审计没写
    const audit = await lastModerationAudit(admin, caseId);
    expect(audit!.allowed).toBe(true);
    expect(audit!.detail).toMatchObject({ resolution: 'rejected' });
  });

  it('admin + approved（无 publication）→ 消息是"已放行"，别把两件事说混', async () => {
    const caseId = await newCase();
    const res = await call(caseId, { resolution: 'approved' }, asUser(adminToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain('已放行');
    expect(body.message, '没有公开页可撤，就别提"不可访问"').not.toContain('不可访问');
  });
});
