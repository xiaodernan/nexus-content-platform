import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET as getProject } from '../src/app/api/projects/[projectId]/route';
import { GET as getAssets } from '../src/app/api/projects/[projectId]/assets/route';
import { GET as getContext } from '../src/app/api/projects/[projectId]/context/route';
import { POST as postKnowledgeBlock } from '../src/app/api/projects/[projectId]/knowledge/block/route';
import { POST as postMemories } from '../src/app/api/projects/[projectId]/memories/route';
import { POST as postInvite } from '../src/app/api/projects/[projectId]/members/invite/route';
import { POST as postAccept } from '../src/app/api/projects/invites/[token]/accept/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { memories, projectInvites, projects, sessions, users } from '../src/server/db/schema';

/**
 * #205 协作者可见性贯通：projectBelongsTo（只认 owner）在**读路径**上换成
 * projectVisibleTo（owner 或名册成员）。打真 Postgres + mock 的 next/headers。
 *
 * 钉三件事：
 * ① 协作者读得通：项目详情/资产/上下文/知识块四条读路径，成员 200、陌生人 404；
 * ② 写路径仍是 owner-only：成员 POST memories 被 404 挡在门外，owner 过得去；
 * ③ 名册上的成员身份由 invite→accept 真实制造，不直接插库——门放行的前提
 *    就是"名册上真的有这一行"。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = '7a1c4e9b2d6f8035';
const ctxProject = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

let ownerId = '';
let memberId = '';
let strangerId = '';
let ownerToken = '';
let memberToken = '';
let strangerToken = '';
let projectId = '';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(userId: string): Promise<string> {
  const token = `visroute-tok-${userId}`;
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

function asUser(token: string): void {
  jar.clear();
  jar.set(SESSION_COOKIE, token);
  jar.set(CSRF_COOKIE, CSRF_TOKEN);
}

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [CSRF_HEADER]: CSRF_TOKEN },
    body: JSON.stringify(body),
  });
}

const get = (url: string) => new Request(url);

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: '可见性-Owner', email: `visroute+owner+${stamp}@nexus.test` },
      { displayName: '可见性-成员', email: `visroute+member+${stamp}@nexus.test` },
      { displayName: '可见性-路人', email: `visroute+stranger+${stamp}@nexus.test` },
    ])
    .returning({ id: users.id });
  ownerId = rows[0]!.id;
  memberId = rows[1]!.id;
  strangerId = rows[2]!.id;
  ownerToken = await identityFor(ownerId);
  memberToken = await identityFor(memberId);
  strangerToken = await identityFor(strangerId);
  projectId = (await createProject(ownerId, { name: `可见性-项目 ${stamp}`, kind: 'website' })).id;

  // 真实制造"名册上有成员"：owner 拉人 -> 成员接受
  asUser(ownerToken);
  const memberEmail = (
    await db.select({ email: users.email }).from(users).where(eq(users.id, memberId)).limit(1)
  )[0]!.email!;
  const invited = await postInvite(
    post(`http://test.local/api/projects/${projectId}/members/invite`, { email: memberEmail, role: 'editor' }),
    ctxProject(projectId),
  );
  expect(invited.status).toBe(201);
  const inviteToken = (
    await db.select({ token: projectInvites.token }).from(projectInvites).where(eq(projectInvites.projectId, projectId)).limit(1)
  )[0]!.token;
  asUser(memberToken);
  const accepted = await postAccept(post(`http://test.local/api/projects/invites/${inviteToken}/accept`, {}), {
    params: Promise.resolve({ token: inviteToken }),
  });
  expect(accepted.status).toBe(200);
  asUser('');
  jar.clear();
});

afterAll(async () => {
  const db = getDb();
  await db.delete(memories).where(eq(memories.projectId, projectId));
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
  await db.delete(users).where(eq(users.id, memberId));
  await db.delete(users).where(eq(users.id, strangerId));
});

describe('#205 协作者可见性贯通（读路径放名册成员，写路径仍 owner-only）', () => {
  it('① 成员读得通：项目详情/资产/上下文/知识块 200，同址陌生人 404', async () => {
    const reads: [string, string, (req: Request, ctx: { params: Promise<{ projectId: string }> }) => Promise<Response>][] = [
      ['GET /api/projects/[id]', `http://test.local/api/projects/${projectId}`, getProject],
      ['GET /api/projects/[id]/assets', `http://test.local/api/projects/${projectId}/assets`, getAssets],
      ['GET /api/projects/[id]/context', `http://test.local/api/projects/${projectId}/context`, getContext],
    ];
    for (const [label, url, handler] of reads) {
      asUser(memberToken);
      const memberRes = await handler(get(url), ctxProject(projectId));
      expect(memberRes.status, `${label} 成员应放行`).toBe(200);

      asUser(strangerToken);
      const strangerRes = await handler(get(url), ctxProject(projectId));
      expect(strangerRes.status, `${label} 陌生人应 404`).toBe(404);
    }

    // knowledge/block 走 POST 变体验证：GET 对"库里没有这一块"如实回 404 block_not_found
    // （那是"块不存在"不是"人不该看"），POST 对空结果直接 200，门禁形状看得更干净。
    // 这个 POST 不需要 CSRF（Agent 组装上下文用的入口），Body 给合法形状即可。
    asUser(memberToken);
    const memberBlock = await postKnowledgeBlock(
      post(`http://test.local/api/projects/${projectId}/knowledge/block`, { sourceType: 'lore', sourceId: 'probe' }),
      ctxProject(projectId),
    );
    expect(memberBlock.status, 'knowledge/block POST 成员应放行').toBe(200);

    asUser(strangerToken);
    const strangerBlock = await postKnowledgeBlock(
      post(`http://test.local/api/projects/${projectId}/knowledge/block`, { sourceType: 'lore', sourceId: 'probe' }),
      ctxProject(projectId),
    );
    expect(strangerBlock.status, 'knowledge/block POST 陌生人应 404').toBe(404);
  });

  it('② 写路径仍 owner-only：成员 POST memories 404，owner 过得去（201）', async () => {
    asUser(memberToken);
    const memberWrite = await postMemories(
      post(`http://test.local/api/projects/${projectId}/memories`, { scope: 'session', content: '成员不该写得进来' }),
      ctxProject(projectId),
    );
    expect(memberWrite.status).toBe(404);

    asUser(ownerToken);
    const ownerWrite = await postMemories(
      post(`http://test.local/api/projects/${projectId}/memories`, { scope: 'session', content: 'owner 写得进来' }),
      ctxProject(projectId),
    );
    expect(ownerWrite.status).toBe(201);
  });

  it('③ owner 自己的读路径不受影响（回归护栏）', async () => {
    asUser(ownerToken);
    const res = await getAssets(get(`http://test.local/api/projects/${projectId}/assets`), ctxProject(projectId));
    expect(res.status).toBe(200);
  });
});
