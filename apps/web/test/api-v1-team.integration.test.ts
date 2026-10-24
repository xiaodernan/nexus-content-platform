import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET as membersRoute } from '../src/app/api/v1/projects/[projectId]/members/route';
import { createProject } from '../src/server/domain/projects';
import { issueApiToken, listApiAccessSummary } from '../src/server/domain/api-tokens';
import { acceptInvite, inviteMember } from '../src/server/domain/team';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * #207 v1 的团队名册端点：`GET /api/v1/projects/<id>/members`，scope `team:read`。
 * 打真 Postgres（nexus_regress）。
 *
 * 钉的是"v1 与界面同一口径"这件事在四个方向上都成立：
 * ① owner 的凭据读得到名册（成员在册、role 对、token 这个 secret 不在回执里）；
 * ② 协作者的凭据也读得到（"被拉进项目"的最低语义，API 侧不缩水）；
 * ③ 外人的凭据 404 project_not_found——与 v1 其它端点同一句"不存在"，不区分"不是你的"；
 * ④ 没有 team:read 的凭据 403——scope 不够先于一切，least-privilege 同 0028。
 * 外加两件账：一次成功读取在 api_access 留一行；非 UUID 的 projectId 回 404 不 500
 * （id-shape 不变式，形状门在 ownerOf 里）。
 */

let ownerId = '';
let memberId = '';
let strangerId = '';
let projectId = '';
let ownerBearer = '';
let memberBearer = '';
let strangerBearer = '';
let narrowBearer = '';

const get = (url: string, bearer: string) =>
  new Request(url, { headers: { authorization: `Bearer ${bearer}` } });
const ctx = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: 'v1名册-Owner', email: `v1team+owner+${stamp}@nexus.test` },
      { displayName: 'v1名册-成员', email: `v1team+member+${stamp}@nexus.test` },
      { displayName: 'v1名册-外人', email: `v1team+stranger+${stamp}@nexus.test` },
    ])
    .returning({ id: users.id });
  ownerId = rows[0]!.id;
  memberId = rows[1]!.id;
  strangerId = rows[2]!.id;
  projectId = (await createProject(ownerId, { name: `v1名册-项目 ${stamp}`, kind: 'website' })).id;

  ownerBearer = (await issueApiToken({ userId: ownerId, name: 'v1名册-owner', scopes: ['team:read'] })).token;
  memberBearer = (await issueApiToken({ userId: memberId, name: 'v1名册-member', scopes: ['team:read'] })).token;
  strangerBearer = (await issueApiToken({ userId: strangerId, name: 'v1名册-stranger', scopes: ['team:read'] })).token;
  // 窄凭据：有 projects:read 但没有 team:read——scope 门要先于归属门说话
  narrowBearer = (await issueApiToken({ userId: ownerId, name: 'v1名册-窄', scopes: ['projects:read'] })).token;

  // 真实制造"名册上有成员"：owner 拉人 -> 成员接受
  const invited = await inviteMember(projectId, ownerId, { email: `v1team+member+${stamp}@nexus.test`, role: 'editor' });
  expect(invited.ok, '邀请应成功').toBe(true);
  if (!invited.ok || !invited.token) throw new Error('邀请没有返回 token');
  const accepted = await acceptInvite(invited.token, memberId);
  expect(accepted.ok, '接受应成功').toBe(true);
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  for (const id of [ownerId, memberId, strangerId]) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describe('#207 v1 团队名册端点（team:read）', () => {
  it('① owner 的凭据读得到名册：成员在册、role 正确、token 这个 secret 不在回执里', async () => {
    const res = await membersRoute(get(`http://test.local/api/v1/projects/${projectId}/members`, ownerBearer), ctx(projectId));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      projectId: string;
      members: { userId: string; role: string }[];
      invites: unknown[];
      teamLimit: number;
    };
    expect(body.projectId).toBe(projectId);
    expect(body.members.map((m) => m.userId)).toContain(memberId);
    expect(body.members.find((m) => m.userId === memberId)!.role).toBe('editor');
    expect(body.teamLimit).toBeGreaterThanOrEqual(1);
    // 邀请的 token 是 secret：回执里任何一层都不许出现它
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('token');
  });

  it('② 协作者的凭据也读得到名册（"被拉进项目"的最低语义，API 侧不缩水）', async () => {
    const res = await membersRoute(get(`http://test.local/api/v1/projects/${projectId}/members`, memberBearer), ctx(projectId));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { members: { userId: string }[] };
    expect(body.members.map((m) => m.userId)).toContain(memberId);
  });

  it('③ 外人的凭据 404 project_not_found：与 v1 其它端点同一句"不存在"', async () => {
    const res = await membersRoute(get(`http://test.local/api/v1/projects/${projectId}/members`, strangerBearer), ctx(projectId));
    expect(res.status).toBe(404);
    expect((await res.json()) as { error?: string }).toMatchObject({ error: 'project_not_found' });
  });

  it('④ 没有 team:read 的凭据 403：scope 不够先于归属门', async () => {
    const res = await membersRoute(get(`http://test.local/api/v1/projects/${projectId}/members`, narrowBearer), ctx(projectId));
    expect(res.status).toBe(403);
  });

  it('⑤ 一次成功读取在 api_access 留一行；非 UUID 的 projectId 回 404 不 500', async () => {
    const ledger = await listApiAccessSummary(ownerId);
    expect(ledger.some((e) => e.endpoint === 'GET /api/v1/projects/[projectId]/members')).toBe(true);

    const bad = await membersRoute(get('http://test.local/api/v1/projects/not-a-uuid/members', ownerBearer), ctx('not-a-uuid'));
    expect(bad.status).toBe(404);
  });
});
