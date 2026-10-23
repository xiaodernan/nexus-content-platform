import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET as getRoster } from '../src/app/api/projects/[projectId]/members/route';
import { POST as postInvite } from '../src/app/api/projects/[projectId]/members/invite/route';
import { POST as postRemove } from '../src/app/api/projects/[projectId]/members/remove/route';
import { POST as postRevoke } from '../src/app/api/projects/[projectId]/invites/[inviteId]/revoke/route';
import { POST as postAccept } from '../src/app/api/projects/invites/[token]/accept/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projectInvites, projects, sessions, users } from '../src/server/db/schema';

/**
 * §133 teamCollaboration（#201）的路由层，打真 Postgres + mock 的 next/headers。
 *
 * 路由只是 team.ts 的转发（§74：不在路由里重写第二遍归属/名额/去重），所以这里钉的是
 * **转发没丢东西**与**鉴权形状**：
 * ① roster：owner 与协作者看得见名册（含 teamLimit），陌生人 404；
 * ② 写路由三件套：CSRF → requireUser → domain；被拒时错误码与话说得对；
 * ③ accept 按当前登录用户：token 证明邀请真、邮箱证明"是发给我的"，缺一不可。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'b2c4d6e8f0a19375';
const ctxProject = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(userId: string): Promise<string> {
  const token = `teamroute-tok-${userId}`;
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

let ownerId: string;
let editorId: string;
let strangerId: string;
let ownerToken: string;
let editorToken: string;
let strangerToken: string;
let projectId: string;
let strangerInviteId = '';

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: '路由-Owner', email: `teamroute+owner+${stamp}@nexus.test` },
      { displayName: '路由-Editor', email: `teamroute+editor+${stamp}@nexus.test` },
      { displayName: '路由-路人', email: `teamroute+stranger+${stamp}@nexus.test` },
    ])
    .returning({ id: users.id });
  ownerId = rows[0]!.id;
  editorId = rows[1]!.id;
  strangerId = rows[2]!.id;
  ownerToken = await identityFor(ownerId);
  editorToken = await identityFor(editorId);
  strangerToken = await identityFor(strangerId);
  projectId = (await createProject(ownerId, { name: `路由-团队项目 ${stamp}`, kind: 'website' })).id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
  await db.delete(users).where(eq(users.id, editorId));
  await db.delete(users).where(eq(users.id, strangerId));
});

const emailOf = async (userId: string): Promise<string> => {
  const [row] = await getDb().select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return row!.email!;
};

const tokenOf = async (inviteId: string): Promise<string> => {
  const [row] = await getDb()
    .select({ token: projectInvites.token })
    .from(projectInvites)
    .where(eq(projectInvites.id, inviteId))
    .limit(1);
  return row!.token;
};

describe('§133 成员/邀请路由（真实数据库 + mock cookies）', () => {
  it('① roster：owner 与协作者看得见名册与名额上限，陌生人 404', async () => {
    // owner 先拉 editor 并让他兑现，制造"名册上有人"的状态
    asUser(ownerToken);
    const invited = await postInvite(
      post(`http://test.local/api/projects/${projectId}/members/invite`, {
        email: await emailOf(editorId),
        role: 'editor',
      }),
      ctxProject(projectId),
    );
    expect(invited.status).toBe(201);

    asUser(ownerToken);
    const ownerView = (await (await getRoster(new Request('http://test.local/x'), ctxProject(projectId))).json()) as {
      members: unknown[];
      invites: { id: string; email: string; status: string }[];
      teamLimit: number;
    };
    expect(ownerView.invites.length).toBe(1);
    expect(ownerView.invites[0]!.status).toBe('pending');
    expect(ownerView.teamLimit).toBe(1);
    // token 是 secret：roster 里不许出现它
    expect(JSON.stringify(ownerView)).not.toContain(await tokenOf(ownerView.invites[0]!.id));

    // 协作者（接受之后）看得见名册
    const editorTokenValue = await tokenOf(ownerView.invites[0]!.id);
    asUser(editorToken);
    const accepted = await postAccept(post(`http://test.local/api/projects/invites/${editorTokenValue}/accept`, {}), {
      params: Promise.resolve({ token: editorTokenValue }),
    });
    expect(accepted.status).toBe(200);

    asUser(editorToken);
    const editorView = await getRoster(new Request('http://test.local/x'), ctxProject(projectId));
    expect(editorView.status).toBe(200);
    const editorBody = (await editorView.json()) as { members: { userId: string }[] };
    expect(editorBody.members.map((m) => m.userId)).toContain(editorId);

    // 陌生人 404：名册含邮箱，不能谁都能看
    asUser(strangerToken);
    const strangerView = await getRoster(new Request('http://test.local/x'), ctxProject(projectId));
    expect(strangerView.status).toBe(404);
  });

  it('② 名额门经路由生效：free 档（1/1）再拉人被 400 挡下，话里带数字', async () => {
    asUser(ownerToken);
    const refused = await postInvite(
      post(`http://test.local/api/projects/${projectId}/members/invite`, {
        email: await emailOf(strangerId),
        role: 'viewer',
      }),
      ctxProject(projectId),
    );
    expect(refused.status).toBe(400);
    const body = (await refused.json()) as { error?: string; message?: string };
    expect(body.error).toBe('invite_rejected');
    expect(body.message).toContain('协作名额已满');
    expect(body.message).toContain('Free 档每个项目除所有者外最多 1 人');
  });

  it('③ 非 owner 的写请求 404（协作者互相拉人，团队就会自己长大）', async () => {
    asUser(editorToken);
    const byEditor = await postInvite(
      post(`http://test.local/api/projects/${projectId}/members/invite`, {
        email: `intruder+${Date.now()}@nexus.test`,
        role: 'viewer',
      }),
      ctxProject(projectId),
    );
    expect(byEditor.status).toBe(404);
  });

  it('④ remove：owner 移除成功；非 owner 404；移除后名额释放', async () => {
    asUser(editorToken);
    const byEditor = await postRemove(post(`http://test.local/api/projects/${projectId}/members/remove`, { userId: editorId }), ctxProject(projectId));
    expect(byEditor.status).toBe(404);

    asUser(ownerToken);
    const removed = await postRemove(post(`http://test.local/api/projects/${projectId}/members/remove`, { userId: editorId }), ctxProject(projectId));
    expect(removed.status).toBe(200);

    // 名额释放：再拉陌生人成功
    const afterFree = await postInvite(
      post(`http://test.local/api/projects/${projectId}/members/invite`, { email: await emailOf(strangerId), role: 'viewer' }),
      ctxProject(projectId),
    );
    expect(afterFree.status).toBe(201);
    const body = (await afterFree.json()) as { invite: { id: string } };
    strangerInviteId = body.invite.id;
  });

  it('⑤ revoke：owner 撤回成功；重复撤回 404（没有新事情发生就不报成功）', async () => {
    asUser(ownerToken);
    const revokeReq = () =>
      postRevoke(
        post(`http://test.local/api/projects/${projectId}/invites/${strangerInviteId}/revoke`, {}),
        { params: Promise.resolve({ projectId, inviteId: strangerInviteId }) },
      );
    const revoked = await revokeReq();
    expect(revoked.status).toBe(200);
    const again = await revokeReq();
    expect(again.status).toBe(404);
  });

  it('⑥ accept：token 证明邀请真、邮箱证明"是发给我的"，缺一不可', async () => {
    asUser(ownerToken);
    const invited = await postInvite(
      post(`http://test.local/api/projects/${projectId}/members/invite`, { email: await emailOf(strangerId), role: 'viewer' }),
      ctxProject(projectId),
    );
    expect(invited.status).toBe(201);
    const body = (await invited.json()) as { invite: { id: string } };
    const token = await tokenOf(body.invite.id);

    // editor 的邮箱对不上这枚（发给 stranger 的）邀请
    asUser(editorToken);
    const wrongUser = await postAccept(post(`http://test.local/api/projects/invites/${token}/accept`, {}), {
      params: Promise.resolve({ token }),
    });
    expect(wrongUser.status).toBe(400);
    expect(((await wrongUser.json()) as { message?: string }).message).toContain('不是发给你的邮箱');

    // 本主接受成功
    asUser(strangerToken);
    const ok = await postAccept(post(`http://test.local/api/projects/invites/${token}/accept`, {}), {
      params: Promise.resolve({ token }),
    });
    expect(ok.status).toBe(200);

    // 凭空捏造的 token：400，话说清
    asUser(strangerToken);
    const ghost = await postAccept(post('http://test.local/api/projects/invites/00000000-0000-4000-8000-000000000000/accept', {}), {
      params: Promise.resolve({ token: '00000000-0000-4000-8000-000000000000' }),
    });
    expect(ghost.status).toBe(400);
    expect(((await ghost.json()) as { message?: string }).message).toContain('不存在');
  });
});

