import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET as getMemories } from '../src/app/api/projects/[projectId]/memories/route';
import { POST as acceptDraft } from '../src/app/api/projects/[projectId]/agent/draft/route';
import { POST as resolveModeration } from '../src/app/api/admin/moderation/[caseId]/route';
import { POST as revokeToken } from '../src/app/api/account/api-tokens/[tokenId]/revoke/route';
import { DELETE as removeAnnotation } from '../src/app/api/annotations/[annotationId]/route';
import { GET as getMarketItem, PATCH as patchMarketItem, DELETE as deleteMarketRoute } from '../src/app/api/marketplace/[id]/route';
import { DELETE as v1DeleteProject } from '../src/app/api/v1/projects/[projectId]/route';
import { PATCH as adminChangeRole } from '../src/app/api/admin/users/[id]/route';
import { PATCH as adminChangePlan } from '../src/app/api/admin/users/[id]/plan/route';
import { POST as characterChat } from '../src/app/api/projects/[projectId]/characters/[characterId]/chat/route';
import { GET as listTasks } from '../src/app/api/projects/[projectId]/tasks/route';
import { GET as getMarketPreview } from '../src/app/api/marketplace/[id]/preview/route';
import { POST as purchaseMarketItem } from '../src/app/api/marketplace/[id]/purchase/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { isUuid } from '../src/server/domain/ids';
import { createProject, projectBelongsTo } from '../src/server/domain/projects';
import { plannedTask } from '../src/server/domain/agent-tasks';
import { revokeApiToken } from '../src/server/domain/api-tokens';
import { deleteAnnotation } from '../src/server/domain/annotations';
import { resolveCase } from '../src/server/domain/moderation';
import { setUserPlan } from '../src/server/domain/plan-admin';
import { setUserRole } from '../src/server/domain/roles';
import { createProjectCharacter } from '../src/server/domain/characters';
import { issueApiToken } from '../src/server/domain/api-tokens';
import {
  createMarketplaceItem,
  deleteMarketplaceItem,
  getMarketplaceItem,
  hasPurchased,
  incrementDownloadCount,
  purchaseMarketplaceItem,
  updateMarketplaceItem,
} from '../src/server/domain/marketplace';
import { getDb } from '../src/server/db/client';
import { marketplaceItems, projects, sessions, users } from '../src/server/db/schema';

/**
 * 域层的 id 形状校验：非 UUID 的 id 一律按"不存在"处理，不再让 Postgres 的
 * 22P02（invalid input syntax for type uuid）在界面上变成 500。
 *
 * 从路由进来的 id 大多是路径参数（[projectId]、[caseId]…），Next 只保证它们是字符串。
 * 横向审计发现十个家族的域助手曾经是裸 eq(id, …)：projects / moderation / memories /
 * branches / characters / snapshots（688a515 那片）+ agent-tasks 的 plannedTask
 * （/agent/draft 入口）+ api-tokens 的吊销与 annotations 的删除 + marketplace 的读与买
 * （2026-10-21 这片：`getMarketplaceItem` / `hasPurchased` / `purchaseMarketplaceItem` /
 * `incrementDownloadCount` 四个，交付门当初是在路由里临时挡的，现在收进域层）——
 * 这类请求此前整条 500。资产域（assets.ts）与 agent-tasks.ts 原先各自抄了一份正则
 * （UUID_SHAPE / UUID_LIKE），现在统一到 `domain/ids.ts` 的 isUuid，
 * 那句"不存在"的说法只剩一种：
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
let buyer: { id: string };
let adminToken: string;
let creatorToken: string;
let buyerToken: string;
let realProjectId: string;
let realItemId: string;

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: '形状-审核员', email: `idshape+admin+${stamp}@nexus.test`, role: 'admin' },
      { displayName: '形状-作者', email: `idshape+creator+${stamp}@nexus.test`, role: 'creator' },
      { displayName: '形状-买家', email: `idshape+buyer+${stamp}@nexus.test`, role: 'creator' },
    ])
    .returning({ id: users.id });
  admin = rows[0]!;
  creator = rows[1]!;
  buyer = rows[2]!;
  adminToken = await identityFor(admin.id);
  creatorToken = await identityFor(creator.id);
  buyerToken = await identityFor(buyer.id);
  realProjectId = (await createProject(creator.id, { name: `形状-真项目 ${stamp}`, kind: 'website' })).id;
  // 市场那一家要有真条目：正对照（形状合法的 id 一路走到数据库）与"守卫没挡住正常路径"
  // 都打在这条上。价格 0——`purchaseMarketplaceItem` 只对 pricePaid>0 写扣点流水，
  // 而账本只追加（DELETE 被触发器挡），留一行扣点就没法在 afterAll 里删掉买家。
  realItemId = (
    await createMarketplaceItem({
      creatorId: creator.id,
      itemType: 'template',
      title: `形状-真条目 ${stamp}`,
      visibility: 'public',
      priceCredits: 0,
      sourceProjectId: realProjectId,
    })
  ).id;
}, 120_000);

afterAll(async () => {
  const db = getDb();
  // 条目外键（购买、分成、审计）cascade 到条目自己，先摘条目再摘人；
  // projects 对 owner 是 restrict，得先删项目
  await db.delete(marketplaceItems).where(eq(marketplaceItems.creatorId, creator.id));
  await db.delete(projects).where(eq(projects.ownerId, creator.id));
  await db.delete(users).where(eq(users.id, buyer.id));
  await db.delete(users).where(eq(users.id, creator.id));
  await db.delete(users).where(eq(users.id, admin.id));
}, 60_000);

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

/**
 * 第十个家族：marketplace 的**读与买**。`[id]` 是路径参数，四条门（详情、预览图、购买、交付）
 * 都把它原样交给域函数，而域里只有 `updateMarketplaceItem` / `deleteMarketplaceItem` 挡了形状——
 * 读路径全是裸 `eq(marketplace_items.id, …)`。2026-10-21 实测的三种走法：
 * - `GET /api/marketplace/not-a-uuid/preview` → 500 空报文（浏览器里预览图就是一个碎图标）；
 * - `GET /api/marketplace/not-a-uuid` 与 `POST …/purchase` → 处理函数直接抛 PostgresError；
 * - 交付门 `GET …/content` 当时在**路由里**临时挡了一道（ADR-0047 记了"挡错位置"这句欠账）。
 *
 * 这一片把门收进域层：四个域助手按"查不到"回答（null / false / 0 / 与不存在同一句 throw），
 * 交付门那道临时 `isUuid` 随之删掉——同一件事只剩一处实现，路由侧就只剩 404 一种说法。
 * 紧接着的 #149 把 `update`/`delete` 也收进来：形状不对返回 `{ok:false,reason:'not_found'}`，
 * 路由回 404（此前它们 throw、路由一律回 400，且把内部英文句子原样回给客户端）。
 */
const marketUrl = (id: string, suffix = ''): string =>
  `http://test.local/api/marketplace/${id}${suffix}`;

describe('域层与路由层：marketplace 的读与买（门收进域层，交付门那道临时 isUuid 同时删掉）', () => {
  it('getMarketplaceItem 对非 UUID → null，不抛（详情、预览、交付三条读路共用它）', async () => {
    await expect(getMarketplaceItem('not-a-uuid')).resolves.toBeNull();
  });

  it('hasPurchased 对非 UUID → false，不抛', async () => {
    await expect(hasPurchased('not-a-uuid', buyer.id)).resolves.toBe(false);
  });

  it('incrementDownloadCount 对非 UUID → 0（没有行被 +1），不抛', async () => {
    await expect(incrementDownloadCount('not-a-uuid')).resolves.toBe(0);
  });

  it('purchaseMarketplaceItem 对非 UUID → {ok:false,reason:not_found}，不是 Postgres 报错', async () => {
    await expect(purchaseMarketplaceItem({ buyerId: buyer.id, itemId: 'not-a-uuid' })).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('updateMarketplaceItem / deleteMarketplaceItem 对非 UUID → {ok:false,reason:not_found}，不抛', async () => {
    await expect(updateMarketplaceItem('not-a-uuid', creator.id, { title: '改个名' })).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    });
    await expect(deleteMarketplaceItem('not-a-uuid', creator.id)).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('PATCH /api/marketplace/not-a-uuid → 404 not_found（#149：修复前 400 + 22P02 原文）', async () => {
    const res = await patchMarketItem(
      new Request(marketUrl('not-a-uuid'), {
        method: 'PATCH',
        headers: asUser(creatorToken, true),
        body: JSON.stringify({ title: '改个名' }),
      }),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('DELETE /api/marketplace/not-a-uuid → 404 not_found（#149：修复前 400 + 22P02 原文）', async () => {
    const res = await deleteMarketRoute(
      new Request(marketUrl('not-a-uuid'), { method: 'DELETE', headers: asUser(creatorToken, true) }),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('GET /api/marketplace/not-a-uuid → 404（修复前处理函数直接抛 22P02）', async () => {
    const res = await getMarketItem(
      new Request(marketUrl('not-a-uuid')),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
  });

  it('GET /api/marketplace/not-a-uuid/preview → 404（修复前实测 500 空报文：界面上是个碎图标）', async () => {
    const res = await getMarketPreview(
      new Request(marketUrl('not-a-uuid', '/preview')),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
  });

  it('POST /api/marketplace/not-a-uuid/purchase → 404（修复前 purchase 的裸 eq() 撞 22P02 变 500）', async () => {
    const res = await purchaseMarketItem(
      new Request(marketUrl('not-a-uuid', '/purchase'), {
        method: 'POST',
        headers: asUser(buyerToken, true),
      }),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('正对照：形状合法的条目照旧读得到、买得成、数得上（守卫没挡住正常路径）', async () => {
    expect(await getMarketplaceItem(realItemId)).not.toBeNull();
    const res = await getMarketItem(
      new Request(marketUrl(realItemId)),
      { params: Promise.resolve({ id: realItemId }) },
    );
    expect(res.status).toBe(200);

    expect(await hasPurchased(realItemId, buyer.id)).toBe(false);
    const purchase = await purchaseMarketplaceItem({ buyerId: buyer.id, itemId: realItemId });
    expect(purchase.ok).toBe(true);
    if (!purchase.ok) return;
    expect(purchase.pricePaid).toBe(0);
    expect(await hasPurchased(realItemId, buyer.id)).toBe(true);

    expect(await incrementDownloadCount(realItemId)).toBe(1);
  });

  it('正对照：合法 UUID 但条目不存在 → 与形状不对的同一个答案', async () => {
    const missing = '00000000-0000-4000-8000-000000000009';
    expect(await getMarketplaceItem(missing)).toBeNull();
    await expect(purchaseMarketplaceItem({ buyerId: buyer.id, itemId: missing })).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    });
    const res = await getMarketItem(
      new Request(marketUrl(missing)),
      { params: Promise.resolve({ id: missing }) },
    );
    expect(res.status).toBe(404);
  });
});

/**
 * 第十一个家族：v1 的软删、admin 的改角色 / 改档位、角色对话、任务账本（2026-10-23 横向审计）。
 *
 * 这一批是同一族漏网的第二种形状：**不是每条路由都会先过一道已守住的归属门**。
 * 前十个家族的洞都长在"路由 → 域助手 → 裸 eq()"上；这四个入口里，
 * v1 DELETE 直达 `softDeleteProject`（界面那条先过 `projectBelongsTo`，所以从来没红过）、
 * 两个 admin 端点的 `targetId` 直落 `eq(users.id, …)`、角色对话那次查询干脆写在路由里
 * （不在域层，`characters.ts` 的域助手反而是守着的）、任务账本的归属查询自己一句 eq。
 * 五处的答复现在统一成 404 / not_found——"这个东西不存在"不该因为 id 长得不像 uuid
 * 就变成 500（§159：界面上的错误要么是用户的错，要么是服务端的错，别混）。
 */
describe('域层与路由层：v1 软删 / admin 改角色与档位 / 角色对话 / 任务账本（第二形状）', () => {
  it('setUserRole 对非 UUID 的 targetId → not_found，不抛（修复前 eq(users.id,…) 撞 22P02，路由连 catch 都没有）', async () => {
    await expect(setUserRole(admin.id, 'not-a-uuid', 'creator')).resolves.toEqual({
      ok: false,
      status: 404,
      code: 'not_found',
      reason: '没有这个账号',
    });
  });

  it('setUserPlan 对非 UUID 的 targetId → not_found，不抛（与 setUserRole 同一道门）', async () => {
    await expect(setUserPlan(admin.id, 'not-a-uuid', 'pro')).resolves.toEqual({
      ok: false,
      status: 404,
      code: 'not_found',
      reason: '没有这个账号',
    });
  });

  it('PATCH /api/admin/users/not-a-uuid → 404 not_found（修复前整个请求以 PostgresError 抛出）', async () => {
    const res = await adminChangeRole(
      new Request(`http://test.local/api/admin/users/not-a-uuid`, {
        method: 'PATCH',
        headers: asUser(adminToken, true),
        body: JSON.stringify({ role: 'creator' }),
      }),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('PATCH /api/admin/users/not-a-uuid/plan → 404 not_found（修复前同上）', async () => {
    const res = await adminChangePlan(
      new Request(`http://test.local/api/admin/users/not-a-uuid/plan`, {
        method: 'PATCH',
        headers: asUser(adminToken, true),
        body: JSON.stringify({ plan: 'pro' }),
      }),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('DELETE /api/v1/projects/not-a-uuid → 404 project_not_found（修复前 softDeleteProject 的 eq() 撞 22P02 变 500）', async () => {
    // 这一枚凭据只为本用例存在：v1 认 Bearer 不认 cookie，而 afterAll 删用户时 api_tokens 级联清掉
    const issued = await issueApiToken({ userId: creator.id, name: '形状门-v1删除', scopes: ['projects:write'] });
    const res = await v1DeleteProject(
      new Request('http://test.local/api/v1/projects/not-a-uuid', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${issued.token}` },
      }),
      { params: Promise.resolve({ projectId: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('project_not_found');
  });

  it('POST 角色对话 characterId=not-a-uuid → 404（修复前被路由 catch 成 500「对话失败」——请求写错说成服务端的错）', async () => {
    const res = await characterChat(
      new Request(`http://test.local/api/projects/${realProjectId}/characters/not-a-uuid/chat`, {
        method: 'POST',
        headers: asUser(creatorToken, true),
        body: JSON.stringify({ message: '在吗' }),
      }),
      { params: Promise.resolve({ projectId: realProjectId, characterId: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('GET /api/projects/not-a-uuid/tasks → 404（修复前 listProjectTasks 的 eq() 撞 22P02 变 500）', async () => {
    const res = await listTasks(
      new Request('http://test.local/api/projects/not-a-uuid/tasks', { headers: asUser(creatorToken) }),
      { params: Promise.resolve({ projectId: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
  });

  it('正对照：形状合法的路照旧走到数据库——改自己的档位回 free、任务账本读得到、角色对话走到 DEMO 409', async () => {
    // 改档位与改角色都拿"本来就是那个值"的真账号：证明守卫没挡住正常路径，且不留下真实变更
    await expect(setUserPlan(admin.id, creator.id, 'free')).resolves.toMatchObject({ ok: true, previous: 'free', plan: 'free' });
    await expect(setUserRole(admin.id, creator.id, 'creator')).resolves.toMatchObject({ ok: true, previous: 'creator', role: 'creator' });

    const tasks = await listTasks(
      new Request(`http://test.local/api/projects/${realProjectId}/tasks`, { headers: asUser(creatorToken) }),
      { params: Promise.resolve({ projectId: realProjectId }) },
    );
    expect(tasks.status).toBe(200);

    // 真角色存在时这条路由继续往下走，直到 DEMO MODE 那道诚实的 409（没有真 provider 不生成回复）
    const made = await createProjectCharacter(realProjectId, creator.id, { name: '形状门-真角色' });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const chat = await characterChat(
      new Request(`http://test.local/api/projects/${realProjectId}/characters/${made.character.id}/chat`, {
        method: 'POST',
        headers: asUser(creatorToken, true),
        body: JSON.stringify({ message: '在吗' }),
      }),
      { params: Promise.resolve({ projectId: realProjectId, characterId: made.character.id }) },
    );
    expect(chat.status).toBe(409);
    expect((await chat.json()).error).toBe('demo_mode');
  });
});
