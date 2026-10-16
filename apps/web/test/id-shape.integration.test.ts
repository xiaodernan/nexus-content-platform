import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET as getMemories } from '../src/app/api/projects/[projectId]/memories/route';
import { POST as acceptDraft } from '../src/app/api/projects/[projectId]/agent/draft/route';
import { POST as resolveModeration } from '../src/app/api/admin/moderation/[caseId]/route';
import { POST as revokeToken } from '../src/app/api/account/api-tokens/[tokenId]/revoke/route';
import { DELETE as removeAnnotation } from '../src/app/api/annotations/[annotationId]/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { isUuid } from '../src/server/domain/ids';
import { createProject, projectBelongsTo } from '../src/server/domain/projects';
import { plannedTask } from '../src/server/domain/agent-tasks';
import { revokeApiToken } from '../src/server/domain/api-tokens';
import { deleteAnnotation } from '../src/server/domain/annotations';
import { resolveCase } from '../src/server/domain/moderation';
import { getDb } from '../src/server/db/client';
import { projects, sessions, users } from '../src/server/db/schema';

/**
 * 域层的 id 形状校验：非 UUID 的 id 一律按"不存在"处理，不再让 Postgres 的
 * 22P02（invalid input syntax for type uuid）在界面上变成 500。
 *
 * 从路由进来的 id 大多是路径参数（[projectId]、[caseId]…），Next 只保证它们是字符串。
 * 横向审计发现九个家族的域助手曾经是裸 eq(id, …)：projects / moderation / memories /
 * branches / characters / snapshots（688a515 那片）+ agent-tasks 的 plannedTask
 * （/agent/draft 入口）+ api-tokens 的吊销与 annotations 的删除（本片收尾）——
 * 这类请求此前整条 500。资产域（assets.ts）与 agent-tasks.ts 原先各自抄了一份正则
 * （UUID_SHAPE / UUID_LIKE），现在统一到 `domain/ids.ts` 的 isUuid，
 * 现在统一到 `domain/ids.ts` 的 isUuid，那句"不存在"的说法只剩一种：
 * 与 v1 项目详情同一口径（"不在你名下或已被删除——两者都给同一个答案"）。
 *
 * 断言全部按**修好后**的行为写：域层直调返回 false / { ok: false }，
 * 路由层回 404 / 409。修复前它们分别以抛 PostgresError 失败——红的形状就是洞本身。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'e5f7a9c1b3d52084';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(userId: string): Promise<string> {
  const token = `idshape-tok-${userId}`;
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

function asUser(token: string | null, withCsrf = false): Record<string, string> {
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

const memoriesUrl = 'http://test.local/api/projects/not-a-uuid/memories';
const resolveUrl = (caseId: string): string => `http://test.local/api/admin/moderation/${caseId}`;

let admin: { id: string };
let creator: { id: string };
let adminToken: string;
let creatorToken: string;
let realProjectId: string;

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: '形状-审核员', email: `idshape+admin+${stamp}@nexus.test`, role: 'admin' },
      { displayName: '形状-作者', email: `idshape+creator+${stamp}@nexus.test`, role: 'creator' },
    ])
    .returning({ id: users.id });
  admin = rows[0]!;
  creator = rows[1]!;
  adminToken = await identityFor(admin.id);
  creatorToken = await identityFor(creator.id);
  realProjectId = (await createProject(creator.id, { name: `形状-真项目 ${stamp}`, kind: 'website' })).id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, creator.id));
  await db.delete(users).where(eq(users.id, creator.id));
  await db.delete(users).where(eq(users.id, admin.id));
});

describe('isUuid：形状校验只此一处', () => {
  it('真形状的 UUID 都认（含大写与 nil）', () => {
    expect(isUuid('3fa02eba-f5ca-44cf-aa77-0631cc143cd9')).toBe(true);
    expect(isUuid('00000000-0000-4000-8000-000000000000')).toBe(true);
    expect(isUuid('3FA02EBA-F5CA-44CF-AA77-0631CC143CD9')).toBe(true);
  });

  it('长得像 UUID 但不是的也挡（版本位 / 变体位不对）', () => {
    // zod 的 uuid 是 RFC 4122 形状：版本位 [1-8]、变体位 [89ab]。
    // 这两条守的是"像 UUID 的垃圾"也被按不存在处理，而不是碰运气让数据库去判
    expect(isUuid('00000000-0000-9000-8000-000000000000')).toBe(false);
    expect(isUuid('00000000-0000-4000-f000-000000000000')).toBe(false);
  });

  it('常见坏形状全部 false', () => {
    for (const bad of ['not-a-uuid', '', '123', 'abc-def', 'x'.repeat(200)]) {
      expect(isUuid(bad), `"${bad.slice(0, 20)}" 不该被当成 UUID`).toBe(false);
    }
  });
});

describe('域层：形状不对的 id 按"不存在"处理（修复前抛 PostgresError）', () => {
  it('projectBelongsTo 对非 UUID → false，不抛', async () => {
    await expect(projectBelongsTo('not-a-uuid', creator.id)).resolves.toBe(false);
  });

  it('resolveCase 对非 UUID 案号 → { ok: false }，路由照旧翻成 409', async () => {
    const result = await resolveCase('not-a-uuid', { adminId: admin.id, resolution: 'approved' });
    expect(result).toMatchObject({ ok: false, reason: '没有这个案号' });
  });

  it('正对照：真项目的归属照旧查得到（守卫没挡住正常路径）', async () => {
    expect(await projectBelongsTo(realProjectId, creator.id)).toBe(true);
    expect(await projectBelongsTo(realProjectId, admin.id)).toBe(false);
  });
});

describe('路由层：非 UUID 的路径参数回 404 / 409，不再 500', () => {
  it('GET /api/projects/not-a-uuid/memories → 404（修复前 projectBelongsTo 的 eq() 撞 22P02 变 500）', async () => {
    asUser(creatorToken);
    const res = await getMemories(
      new Request(memoriesUrl),
      { params: Promise.resolve({ projectId: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('正对照：自己的真项目 → 200，记忆列表照旧读得出来', async () => {
    asUser(creatorToken);
    const res = await getMemories(
      new Request(`http://test.local/api/projects/${realProjectId}/memories`),
      { params: Promise.resolve({ projectId: realProjectId }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('POST /api/admin/moderation/not-a-uuid → 409（修复前 resolveCase 的 eq() 撞 22P02 变 500）', async () => {
    const res = await resolveModeration(
      new Request(resolveUrl('not-a-uuid'), {
        method: 'POST',
        headers: asUser(adminToken, true),
        body: JSON.stringify({ resolution: 'approved' }),
      }),
      { params: Promise.resolve({ caseId: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('cannot_resolve');
  });

  it('正对照：合法 UUID 的不存在案号照旧 409（"没有这个案号"这一句没变）', async () => {
    const res = await resolveModeration(
      new Request(resolveUrl('00000000-0000-4000-8000-000000000009'), {
        method: 'POST',
        headers: asUser(adminToken, true),
        body: JSON.stringify({ resolution: 'approved' }),
      }),
      { params: Promise.resolve({ caseId: '00000000-0000-4000-8000-000000000009' }) },
    );
    expect(res.status).toBe(409);
  });
});

/**
 * 第七个家族：agent-tasks 的 `plannedTask`。这是 688a515 那片没覆盖到的入口——
 * `/agent/draft` 的请求体 schema（lib/agent-runtime.ts 的 AgentDraftAcceptRequestSchema）
 * 只校验 taskId 是"非空串"，于是一个 `not-a-uuid` 能一路走到裸 eq()。
 * agent-tasks.ts 里原先的 6 处 UUID_LIKE 本地正则也统一到了 domain/ids.ts 的 isUuid。
 */
describe('域层：plannedTask（/agent/draft 的入口，688a515 没覆盖到的那一个）', () => {
  const draftUrl = (projectId: string): string => `http://test.local/api/projects/${projectId}/agent/draft`;

  it('plannedTask 对非 UUID → null，不抛', async () => {
    await expect(plannedTask('not-a-uuid', creator.id)).resolves.toBeNull();
  });

  it('POST /api/projects/<真项目>/agent/draft 带 taskId=not-a-uuid → 404（修复前 plannedTask 的 eq() 撞 22P02 变 500）', async () => {
    const res = await acceptDraft(
      new Request(draftUrl(realProjectId), {
        method: 'POST',
        headers: asUser(creatorToken, true),
        body: JSON.stringify({ taskId: 'not-a-uuid' }),
      }),
      { params: Promise.resolve({ projectId: realProjectId }) },
    );
    expect(res.status).toBe(404);
    // 路由对"没有这一行"只有这一种说法：任务不存在、不属于你、不属于这个项目，同一个答案
    expect((await res.json()).error).toBe('not_found');
  });

  it('正对照：合法 UUID 但任务不存在 → 404（形状合法的那条路照旧走到数据库再答"没有"）', async () => {
    await expect(plannedTask('00000000-0000-4000-8000-000000000009', creator.id)).resolves.toBeNull();
    const res = await acceptDraft(
      new Request(draftUrl(realProjectId), {
        method: 'POST',
        headers: asUser(creatorToken, true),
        body: JSON.stringify({ taskId: '00000000-0000-4000-8000-000000000009' }),
      }),
      { params: Promise.resolve({ projectId: realProjectId }) },
    );
    expect(res.status).toBe(404);
  });
});

/**
 * 收尾两个家族：api-tokens 的吊销与 annotations 的删除。两个路由都把 id 当路径参数
 * 原样传进域函数——`/api/account/api-tokens/not-a-uuid/revoke` 与
 * `DELETE /api/annotations/not-a-uuid` 此前整条 500。至此 id 形状校验的全家：
 * projects / moderation / memories / branches / characters / snapshots /
 * agent-tasks / api-tokens / annotations 九个家族，加上 assets.ts 与
 * agent-tasks.ts 两份本地正则统一到 domain/ids.ts。
 */
describe('域层与路由层：api-tokens 吊销与 annotations 删除（id 形状审计的最后两个入口）', () => {
  it('revokeApiToken 对非 UUID → not-found，不抛', async () => {
    await expect(revokeApiToken('not-a-uuid', creator.id)).resolves.toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('deleteAnnotation 对非 UUID → false，不抛', async () => {
    await expect(deleteAnnotation(creator.id, 'not-a-uuid')).resolves.toBe(false);
  });

  it('POST /api/account/api-tokens/not-a-uuid/revoke → 404（修复前 eq(apiTokens.id, …) 撞 22P02 变 500）', async () => {
    const res = await revokeToken(
      new Request('http://test.local/api/account/api-tokens/not-a-uuid/revoke', {
        method: 'POST',
        headers: asUser(creatorToken, true),
      }),
      { params: Promise.resolve({ tokenId: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
  });

  it('DELETE /api/annotations/not-a-uuid → 404（修复前 eq(comments.id, …) 撞 22P02 变 500）', async () => {
    const res = await removeAnnotation(
      new Request('http://test.local/api/annotations/not-a-uuid', {
        method: 'DELETE',
        headers: asUser(creatorToken, true),
      }),
      { params: Promise.resolve({ annotationId: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
  });

  it('正对照：合法 UUID 但不存在 → 同样的 not-found / false（形状合法的那条路照旧走到数据库再答"没有"）', async () => {
    await expect(revokeApiToken('00000000-0000-4000-8000-000000000009', creator.id)).resolves.toMatchObject({ ok: false, reason: 'not-found' });
    await expect(deleteAnnotation(creator.id, '00000000-0000-4000-8000-000000000009')).resolves.toBe(false);
  });
});
