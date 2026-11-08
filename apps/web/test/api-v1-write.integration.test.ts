import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '../src/server/db/client';
import { apiTokens, auditEvents, projects, users } from '../src/server/db/schema';
import { issueApiToken } from '../src/server/domain/api-tokens';
import { POST as createProjectRoute } from '../src/app/api/v1/projects/route';
import { DELETE as deleteProjectRoute } from '../src/app/api/v1/projects/[projectId]/route';
import { GET as projectDetailRoute } from '../src/app/api/v1/projects/[projectId]/route';

/**
 * §188 M8 第三片：公开 API 的**建项目 / 删项目**（真库）。
 *
 * 这一片要证的不是"两个处理器写出来了"，而是下面这些**只有库知道答案**的事：
 *  ① 没有 `projects:write` 的凭据拿到 403，而且那句话**点名缺哪一格**——
 *     否则调用方只会看到"没权限"，然后去猜是自己配错了还是平台没这功能；
 *  ② 有 scope 时真的落库：项目行、`kind` 那一列、以及它出现在**同一个人的**清单里；
 *  ③ `kind` 不认识时**回 400 并列出可选值，而不是悄悄建一个 `website`**。
 *     这是这一片唯一一处与界面那条路故意不同的地方（界面是 `<select>`，送不出坏值），
 *     所以要有一条用例把它钉住：**库里的项目数一个都不许涨**；
 *  ④ 删除的确认词不对时：400，且**项目还在**（不是"删了一半"）；
 *  ⑤ 确认词对了之后：`deleted_at` 有值（软删），而 v1 的详情立刻 404——
 *     两件事都要证，只证"接口回 200"等于没证它真删了；
 *  ⑥ 别人的项目：删不动（404），而且**那个项目还在**（越权失败不能是"删了别人的"）；
 *  ⑦ 越权与确认词不符都在审计里留行（`allowed: false` / `true` 各一条）。
 *
 * 第 ③ 与第 ⑥ 是这一片最值钱的两条：它们都是"看起来成功了，其实做了别的事"的反面。
 */

let ownerId: string;
let otherId: string;
let ownerToken: string;
let readOnlyToken: string;
let otherToken: string;

const insertUser = async (handle: string, email: string): Promise<string> => {
  const rows = await getDb().insert(users).values({ displayName: handle, email, handle }).returning({ id: users.id });
  return rows[0]!.id;
};

/**
 * 每一轮都换一套 handle / email。
 *
 * 第一版用的是固定的 `api-w-owner`，于是**第二次跑必红**：上一轮如果没走到 `afterAll`
 * （比如断言先炸了），那个 handle 还留在库里，`users_handle_key` 直接拒插——
 * 一条用例的失败会把后面每一轮的建号都带塌，看起来像"整片都坏了"。
 */
const stamp = Date.now().toString(36);

/** 建项目的请求。`scopes` 那一栏是这一片的主角，所以调用方每次都显式写出来 */
const createReq = (token: string, body: unknown): Request =>
  new Request('http://localhost:3100/api/v1/projects', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const deleteReq = (token: string, projectId: string, confirm: string): Request =>
  new Request(`http://localhost:3100/api/v1/projects/${projectId}?confirm=${encodeURIComponent(confirm)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });

const detailReq = (token: string, projectId: string): Request =>
  new Request(`http://localhost:3100/api/v1/projects/${projectId}`, {
    headers: { authorization: `Bearer ${token}` },
  });

const ctx = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

/** 活着的项目数：软删的不算，所以删除那一组能靠它证明"真删了" */
const liveCount = async (owner: string): Promise<number> => {
  const rows = await getDb()
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.ownerId, owner), isNull(projects.deletedAt)));
  return rows.length;
};

beforeAll(async () => {
  ownerId = await insertUser(`w${stamp}a`, `api-w-owner-${stamp}@nexus.test`);
  otherId = await insertUser(`w${stamp}b`, `api-w-other-${stamp}@nexus.test`);
  ownerToken = (await issueApiToken({ userId: ownerId, name: '写侧', scopes: ['projects:read', 'projects:write'] })).token;
  readOnlyToken = (await issueApiToken({ userId: ownerId, name: '只读', scopes: ['projects:read'] })).token;
  otherToken = (await issueApiToken({ userId: otherId, name: '别人', scopes: ['projects:read', 'projects:write'] })).token;
});

afterAll(async () => {
  // 先判空：`beforeAll` 自己失败时这里会是 undefined，那时的报错会是
  // "Cannot read properties of undefined"，把真正的失败原因盖掉（第一版就是这样）
  if (!ownerId || !otherId) return;
  await getDb().delete(auditEvents).where(eq(auditEvents.actorId, ownerId));
  await getDb().delete(projects).where(eq(projects.ownerId, otherId));
  await getDb().delete(projects).where(eq(projects.ownerId, ownerId));
  await getDb().delete(apiTokens).where(eq(apiTokens.userId, ownerId));
  await getDb().delete(apiTokens).where(eq(apiTokens.userId, otherId));
  for (const id of [ownerId, otherId]) await getDb().delete(users).where(eq(users.id, id));
});

describe('POST /api/v1/projects', () => {
  it('凭据没有 projects:write → 403，且那句话点名缺的是哪一格', async () => {
    const before = await liveCount(ownerId);
    const res = await createProjectRoute(createReq(readOnlyToken, { name: '不该建出来' }));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string; message?: string };
    expect(body.error).toBe('insufficient_scope');
    // 点名"缺 projects:write"：只回一句"没权限"的话，调用方得去猜是自己配错了还是平台没这功能
    expect(body.message).toContain('projects:write');
    expect(await liveCount(ownerId), '被拒的请求却建出了项目').toBe(before);
  });

  it('有 scope → 201，项目真的落库、kind 生效、且出现在同一个人的清单里', async () => {
    const res = await createProjectRoute(createReq(ownerToken, { name: 'API 建的项目', kind: 'dashboard' }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string; kind: string; pageCount: number };
    expect(body.name).toBe('API 建的项目');
    expect(body.kind).toBe('dashboard');
    // 响应形状与 GET /projects/<id> 一致：建完就能直接拿它去 PATCH 设计，不用再解析一遍
    expect(body.pageCount).toBeGreaterThan(0);

    // 期望值从 SQL 读，不拿 domain 的返回当期望值（那样两处一起错也算对）
    const [row] = await getDb().select().from(projects).where(eq(projects.id, body.id)).limit(1);
    expect(row?.kind).toBe('dashboard');
    expect(row?.ownerId).toBe(ownerId);
    expect(row?.deletedAt).toBeNull();

    const detail = await projectDetailRoute(detailReq(ownerToken, body.id), ctx(body.id));
    expect(detail.status).toBe(200);
  });

  it('kind 不认识 → 400 并列出可选值，**库里一个项目都不许涨**（不悄悄建 website）', async () => {
    const before = await liveCount(ownerId);
    const res = await createProjectRoute(createReq(ownerToken, { name: '类型写错了', kind: 'roguelike' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; allowed?: string[] };
    expect(body.error).toBe('unknown_kind');
    // 可选值来自服务端，不在这里重抄一份
    expect(body.allowed).toContain('website');
    expect(body.allowed).not.toContain('roguelike');
    expect(await liveCount(ownerId), '类型不认识却建出了一个（多半是悄悄兜底成 website）').toBe(before);
  });

  it('名字不合法 → 400（空白名不该变成一个叫空串的项目）', async () => {
    const before = await liveCount(ownerId);
    const res = await createProjectRoute(createReq(ownerToken, { name: '   ' }));
    expect(res.status).toBe(400);
    expect(await liveCount(ownerId)).toBe(before);
  });
});

describe('DELETE /api/v1/projects/[projectId]', () => {
  it('确认词不对 → 400，且项目还在（不是删了一半）', async () => {
    const created = await createProjectRoute(createReq(ownerToken, { name: '删之前先想清楚' }));
    const { id } = (await created.json()) as { id: string };

    const res = await deleteProjectRoute(deleteReq(ownerToken, id, '名字写错了'), ctx(id));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: string }).error).toBe('approval_required');

    const [row] = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
    expect(row?.deletedAt, '确认词不对却把它删了').toBeNull();

    // 拒绝也要留痕：这一条是"有人在拿凭据试着删东西"的唯一记录
    const denied = await getDb()
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(and(eq(auditEvents.actorId, ownerId), eq(auditEvents.targetId, id), eq(auditEvents.allowed, false)));
    expect(denied.length).toBeGreaterThan(0);
  });

  it('确认词对了 → 200，deleted_at 有值，v1 详情立刻 404（两件事都要证）', async () => {
    const created = await createProjectRoute(createReq(ownerToken, { name: '要删掉的那个' }));
    const { id } = (await created.json()) as { id: string };

    const res = await deleteProjectRoute(deleteReq(ownerToken, id, '要删掉的那个'), ctx(id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted?: boolean; recoverable?: string };
    expect(body.deleted).toBe(true);
    // 限度写在回执里：调用方不该以为"删了还能用同一个凭据装回来"
    expect(body.recoverable).toContain('软删');

    const [row] = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
    expect(row?.deletedAt, '回了 200 但库里没软删').not.toBeNull();
    // 行还在（软删不是删行）：§108 的项目历史归 Snapshot 管，不能跟着一次撤销消失
    expect(row?.id).toBe(id);

    const after = await projectDetailRoute(detailReq(ownerToken, id), ctx(id));
    expect(after.status).toBe(404);
  });

  it('别人的项目：删不动（404），而且**那个项目还在**', async () => {
    const created = await createProjectRoute(createReq(ownerToken, { name: '别人的东西别动' }));
    const { id } = (await created.json()) as { id: string };

    const res = await deleteProjectRoute(deleteReq(otherToken, id, '别人的东西别动'), ctx(id));
    // 404 而不是 403：403 会泄露"这个 id 存在"
    expect(res.status).toBe(404);

    const [row] = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
    expect(row?.deletedAt, '越权的那一次把别人的项目删了').toBeNull();
    expect(row?.ownerId).toBe(ownerId);
  });

  it('已经删过的再删一次 → 404，不是"又成功了一次"', async () => {
    const created = await createProjectRoute(createReq(ownerToken, { name: '删两次' }));
    const { id } = (await created.json()) as { id: string };
    expect((await deleteProjectRoute(deleteReq(ownerToken, id, '删两次'), ctx(id))).status).toBe(200);
    expect((await deleteProjectRoute(deleteReq(ownerToken, id, '删两次'), ctx(id))).status).toBe(404);
  });
});
