import { raisePlan } from './support/test-plan';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '../src/server/db/client';
import { apiTokens, auditEvents, projects, publishedProjects, users } from '../src/server/db/schema';
import { issueApiToken } from '../src/server/domain/api-tokens';
import { createProject } from '../src/server/domain/projects';
import { resolvePublishedPath } from '../src/server/domain/publish';
import { POST as publishRoute } from '../src/app/api/v1/projects/[projectId]/publish/route';

/**
 * §188 M8 第八片：v1 的发布/下架（真库）。
 *
 * 这一片要证的不是"调用了 publishProject"，而是下面这些**只有库知道答案**的事：
 *  ① 没有 `publish:write` → 403 且点名缺哪格，publication 行一个都不许多；
 *  ② unlisted 真的落库（`published_projects.visibility`、version、path），
 *     而且 **公开访问解析真的通**（`resolvePublishedPath` 拿得到那一版）；
 *  ③ 重发布是同一 URL 换版本，不是新开一行抢唯一索引；
 *  ④ **public 走 v1 一律 400，且行一个字节都不动**——这一格最值钱：
 *     它证明"外部 Agent 不能通过 API 悄悄建一个公网 URL"（§131/§74 的审批在人的路径上）；
 *  ⑤ private 是下架：`resolvePublishedPath` 立刻解析不出来（URL 失效），行还留着；
 *  ⑥ 别人的项目 404（不是 403），且那个项目的 visibility 没被碰；
 *  ⑦ 审计留下 `allowed: true` 的 publish 行，actor 是凭据所属的人（不是 token 本身）。
 */

let ownerId: string;
let otherId: string;
let ownerToken: string;
let readWriteToken: string;
let otherToken: string;

const insertUser = async (handle: string, email: string): Promise<string> => {
  const rows = await getDb().insert(users).values({ displayName: handle, email, handle }).returning({ id: users.id });
  return rows[0]!.id;
};

/** 每一轮换一套 handle / email：上一轮断言先炸时，固定名字会让下一轮倒在 users_handle_key 上 */
const stamp = Date.now().toString(36);

const req = (token: string, projectId: string, body: unknown): Request =>
  new Request(`http://localhost:3100/api/v1/projects/${projectId}/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const ctx = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

const pubRow = async (projectId: string) => {
  const [row] = await getDb().select().from(publishedProjects).where(eq(publishedProjects.projectId, projectId)).limit(1);
  return row ?? null;
};

const newProject = async (name: string): Promise<string> => (await createProject(ownerId, { name, kind: 'website' })).id;

const createdIds: string[] = [];

beforeAll(async () => {
  ownerId = await insertUser(`pb${stamp}a`, `pb-owner-${stamp}@nexus.test`);
  await raisePlan(ownerId);
  otherId = await insertUser(`pb${stamp}b`, `pb-other-${stamp}@nexus.test`);
  ownerToken = (await issueApiToken({ userId: ownerId, name: '发布员', scopes: ['projects:read', 'publish:write'] })).token;
  readWriteToken = (await issueApiToken({ userId: ownerId, name: '只会建删', scopes: ['projects:write'] })).token;
  otherToken = (await issueApiToken({ userId: otherId, name: '别人', scopes: ['publish:write'] })).token;
});

afterAll(async () => {
  if (!ownerId || !otherId) return;
  // 先删引用项目的行，再删项目：published_projects / snapshots / audit 都挂 projectId
  if (createdIds.length) {
    await getDb().delete(publishedProjects).where(inArray(publishedProjects.projectId, createdIds));
  }
  await getDb().delete(auditEvents).where(inArray(auditEvents.actorId, [ownerId, otherId]));
  await getDb().delete(projects).where(inArray(projects.ownerId, [ownerId, otherId]));
  await getDb().delete(apiTokens).where(inArray(apiTokens.userId, [ownerId, otherId]));
  await getDb().delete(users).where(inArray(users.id, [ownerId, otherId]));
});

describe('POST /api/v1/projects/<id>/publish', () => {
  it('凭据没有 publish:write → 403 点名缺哪格，publication 行一个都不许多', async () => {
    const id = await newProject('发不出来的那个');
    createdIds.push(id);
    expect(await pubRow(id), '测试还没打库里就有行').toBeNull();

    const res = await publishRoute(req(readWriteToken, id, { visibility: 'unlisted' }), ctx(id));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string; message?: string };
    expect(body.error).toBe('insufficient_scope');
    expect(body.message).toContain('publish:write');
    expect(await pubRow(id), '被拒的请求却发布了').toBeNull();
  });

  it('unlisted → 200，行真的落库、URL 解析得出、projects.visibility 跟着变', async () => {
    const id = await newProject('链接可达的项目');
    createdIds.push(id);

    const res = await publishRoute(req(ownerToken, id, { visibility: 'unlisted' }), ctx(id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; path: string; visibility: string; version: number; publishedAt: string };
    expect(body.visibility).toBe('unlisted');
    expect(body.version).toBe(1);
    expect(body.path.startsWith('/n/')).toBe(true);
    expect(body.publishedAt).not.toBe('');

    // 期望值从 SQL 读，不拿响应当期望值
    const row = await pubRow(id);
    expect(row?.visibility).toBe('unlisted');
    expect(row?.version).toBe(1);
    expect(row?.path).toBe(body.path);

    // 链接真的可达（公开访问解析 = 公开页自己走的那条路），不是库里写了一行就算发布
    const page = await resolvePublishedPath(body.path);
    expect(page?.publication.id).toBe(row?.id);
    expect(page?.projectName).toBe('链接可达的项目');

    const [project] = await getDb().select({ visibility: projects.visibility }).from(projects).where(eq(projects.id, id)).limit(1);
    expect(project?.visibility).toBe('unlisted');
  });

  it('重发布是同一 URL 换版本，不是新开一行', async () => {
    const id = await newProject('要发第二版的项目');
    createdIds.push(id);
    const first = (await (await publishRoute(req(ownerToken, id, { visibility: 'unlisted' }), ctx(id))).json()) as {
      path: string;
      version: number;
    };
    const second = (await (await publishRoute(req(ownerToken, id, { visibility: 'unlisted' }), ctx(id))).json()) as {
      path: string;
      version: number;
    };

    expect(second.version).toBe(first.version + 1);
    expect(second.path).toBe(first.path);
    // 一条 path 一行：换版本而不是新增
    const rows = await getDb().select({ id: publishedProjects.id }).from(publishedProjects).where(eq(publishedProjects.projectId, id));
    expect(rows.length).toBe(1);
    expect((await resolvePublishedPath(first.path))?.publication.version).toBe(second.version);
  });

  it('public 走 v1 → 400 一句话说清为什么，且行一个字节都不动', async () => {
    const id = await newProject('想发公网的项目');
    createdIds.push(id);
    await publishRoute(req(ownerToken, id, { visibility: 'unlisted' }), ctx(id));
    const before = await pubRow(id);

    const res = await publishRoute(req(ownerToken, id, { visibility: 'public' }), ctx(id));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; message?: string };
    expect(body.error).toBe('public_requires_human');
    // 话里要说清人去哪：不给一句"不支持"让人卡死
    expect(body.message).toContain('界面');

    const after = await pubRow(id);
    expect(after?.visibility, '被拒的请求把可见性改了').toBe(before?.visibility);
    expect(after?.version, '被拒的请求把版本号涨了').toBe(before?.version);
  });

  it('visibility 写别的值 → 400（模板话里也要带允许的两档）', async () => {
    const id = await newProject('写错档位的项目');
    createdIds.push(id);
    const res = await publishRoute(req(ownerToken, id, { visibility: 'everyone' }), ctx(id));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; message?: string };
    expect(body.error).toBe('validation_failed');
    expect(body.message).toContain('unlisted');
    expect(await pubRow(id)).toBeNull();
  });

  it('private → 下架：URL 解析不出来（URL 失效），行还留着', async () => {
    const id = await newProject('要下架的项目');
    createdIds.push(id);
    const pub = (await (await publishRoute(req(ownerToken, id, { visibility: 'unlisted' }), ctx(id))).json()) as {
      path: string;
    };

    const res = await publishRoute(req(ownerToken, id, { visibility: 'private' }), ctx(id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { visibility: string; path: string };
    expect(body.visibility).toBe('private');

    // 两个都要证：公开解析拿不到（URL 真失效）+ 行还在（历史不跟着一次下架消失）
    expect(await resolvePublishedPath(pub.path)).toBeNull();
    expect((await pubRow(id))?.visibility).toBe('private');

    const [project] = await getDb().select({ visibility: projects.visibility }).from(projects).where(eq(projects.id, id)).limit(1);
    expect(project?.visibility).toBe('private');
  });

  it('别人的项目：发布不动（404），且那个项目的可见性没被碰', async () => {
    const id = await newProject('别人的项目');
    createdIds.push(id);

    const res = await publishRoute(req(otherToken, id, { visibility: 'unlisted' }), ctx(id));
    // 404 而不是 403：403 会泄露"这个 id 存在"
    expect(res.status).toBe(404);
    expect(await pubRow(id), '越权的那一次真发布了').toBeNull();
    const [project] = await getDb().select({ visibility: projects.visibility }).from(projects).where(eq(projects.id, id)).limit(1);
    expect(project?.visibility, '越权的那一次把可见性改了').toBe('private');
  });
});
