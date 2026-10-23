import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET as getMemories } from '../src/app/api/projects/[projectId]/memories/route';
import { POST as acceptDraft } from '../src/app/api/projects/[projectId]/agent/draft/route';
import { POST as resolveModeration } from '../src/app/api/admin/moderation/[caseId]/route';
import { POST as revokeToken } from '../src/app/api/account/api-tokens/[tokenId]/revoke/route';
import { DELETE as removeAnnotation, PATCH as resolveAnnotation } from '../src/app/api/annotations/[annotationId]/route';
import { GET as getMarketItem, PATCH as patchMarketItem, DELETE as deleteMarketRoute } from '../src/app/api/marketplace/[id]/route';
import { DELETE as v1DeleteProject } from '../src/app/api/v1/projects/[projectId]/route';
import { PATCH as adminChangeRole } from '../src/app/api/admin/users/[id]/route';
import { PATCH as adminChangePlan } from '../src/app/api/admin/users/[id]/plan/route';
import { POST as characterChat } from '../src/app/api/projects/[projectId]/characters/[characterId]/chat/route';
import { GET as jobStatusGet } from '../src/app/api/ai/jobs/[jobId]/route';
import { POST as jobCancelPost } from '../src/app/api/ai/jobs/[jobId]/cancel/route';
import { POST as approvalDecide, GET as approvalRead } from '../src/app/api/ai/tasks/[taskId]/approval/route';
import { POST as taskRetryPost } from '../src/app/api/ai/tasks/[taskId]/retry/route';
import { PATCH as reportStatusPatch } from '../src/app/api/admin/marketplace/reports/[id]/route';
import { GET as assetFileGet } from '../src/app/api/assets/[assetId]/file/route';
import { DELETE as assetDeleteRoute } from '../src/app/api/assets/[assetId]/route';
import { POST as branchSwitchPost } from '../src/app/api/projects/[projectId]/branches/[branchId]/switch/route';
import {
  PATCH as characterProfilePatch,
  DELETE as characterDeleteRoute,
} from '../src/app/api/projects/[projectId]/characters/[characterId]/route';
import { DELETE as memoryDeleteRoute } from '../src/app/api/projects/[projectId]/memories/[memoryId]/route';
import { GET as snapshotReadRoute } from '../src/app/api/projects/[projectId]/snapshots/[snapshotId]/route';
import { POST as snapshotRestorePost } from '../src/app/api/projects/[projectId]/snapshots/[snapshotId]/restore/route';
import { GET as v1DesignGetRoute, PATCH as v1DesignPatchRoute } from '../src/app/api/v1/projects/[projectId]/design/route';
import { POST as v1PublishPost } from '../src/app/api/v1/projects/[projectId]/publish/route';
import { POST as projectRestorePost } from '../src/app/api/projects/[projectId]/restore/route';
import { GET as gameCodeGetRoute } from '../src/app/api/projects/[projectId]/game/code/route';
import { GET as publicAssetGetRoute } from '../src/app/api/public/[handle]/assets/[assetId]/route';
import { GET as listTasks } from '../src/app/api/projects/[projectId]/tasks/route';
import { GET as getMarketPreview } from '../src/app/api/marketplace/[id]/preview/route';
import { POST as purchaseMarketItem } from '../src/app/api/marketplace/[id]/purchase/route';
import { GET as agentGet, POST as agentPost } from '../src/app/api/projects/[projectId]/agent/route';
import { GET as annGet, POST as annPost } from '../src/app/api/projects/[projectId]/annotations/route';
import { GET as assetsGet } from '../src/app/api/projects/[projectId]/assets/route';
import { POST as branchPost } from '../src/app/api/projects/[projectId]/branches/route';
import { GET as charsGet, POST as charsPost } from '../src/app/api/projects/[projectId]/characters/route';
import { GET as contextGet } from '../src/app/api/projects/[projectId]/context/route';
import { PATCH as designPatch } from '../src/app/api/projects/[projectId]/design/route';
import { POST as dupPost } from '../src/app/api/projects/[projectId]/duplicate/route';
import { GET as exportGet } from '../src/app/api/projects/[projectId]/export/route';
import { GET as gameGet, PUT as gamePut } from '../src/app/api/projects/[projectId]/game/route';
import { GET as gameZipGet } from '../src/app/api/projects/[projectId]/game/code/zip/route';
import { POST as imagesPost } from '../src/app/api/projects/[projectId]/images/route';
import { GET as knowGet, POST as knowPost } from '../src/app/api/projects/[projectId]/knowledge/route';
import { GET as blockGet, POST as blockPost } from '../src/app/api/projects/[projectId]/knowledge/block/route';
import { POST as searchPost } from '../src/app/api/projects/[projectId]/knowledge/search/route';
import { GET as memGet, POST as memPost, DELETE as memDel } from '../src/app/api/projects/[projectId]/memories/route';
import { GET as pubGet, POST as pubPost, DELETE as pubDel } from '../src/app/api/projects/[projectId]/publish/route';
import { GET as retGet, POST as retPost } from '../src/app/api/projects/[projectId]/retrieve/route';
import { GET as snapGet, POST as snapPost } from '../src/app/api/projects/[projectId]/snapshots/route';
import { GET as sbGet, PUT as sbPut } from '../src/app/api/projects/[projectId]/storyboard/route';
import { GET as varGet, POST as varPost } from '../src/app/api/projects/[projectId]/variants/route';
import { POST as mergePost } from '../src/app/api/projects/[projectId]/variants/merge/route';
import { POST as dnaPost } from '../src/app/api/projects/[projectId]/visual-dna/route';
import { GET as worldGet, PUT as worldPut } from '../src/app/api/projects/[projectId]/world/route';
import { PUT as projectPut, PATCH as projectPatch, DELETE as projectDelete } from '../src/app/api/projects/[projectId]/route';
import { GET as v1ProjectGet } from '../src/app/api/v1/projects/[projectId]/route';
import { GET as marketContent } from '../src/app/api/marketplace/[id]/content/route';
import { GET as avatarGet } from '../src/app/api/avatar/[userId]/[file]/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { isUuid } from '../src/server/domain/ids';
import {
  createProject,
  loadDocument,
  projectBelongsTo,
  restoreProject,
  softDeleteProject,
  updateProjectDescription,
} from '../src/server/domain/projects';
import { plannedTask } from '../src/server/domain/agent-tasks';
import { revokeApiToken } from '../src/server/domain/api-tokens';
import { deleteAnnotation, setAnnotationResolved } from '../src/server/domain/annotations';
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

  // #185 给这条路由加了 PATCH（批注的「已解决」）。新的写入口就是新的撞 22P02 的面：
  // 形状门必须和 DELETE 在同一处（域层的 setAnnotationResolved），不是各写一份。
  it('setAnnotationResolved 对非 UUID → not_found，不抛', async () => {
    await expect(setAnnotationResolved(creator.id, 'not-a-uuid', true)).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('PATCH /api/annotations/not-a-uuid → 404，不是 500（eq(comments.id, …) 撞 22P02）', async () => {
    const res = await resolveAnnotation(
      new Request('http://test.local/api/annotations/not-a-uuid', {
        method: 'PATCH',
        headers: asUser(creatorToken, true),
        body: JSON.stringify({ resolved: true }),
      }),
      { params: Promise.resolve({ annotationId: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
  });

  it('正对照：合法 UUID 但不存在 → 同样的 not-found / false（形状合法的那条路照旧走到数据库再答"没有"）', async () => {
    await expect(revokeApiToken('00000000-0000-4000-8000-000000000009', creator.id)).resolves.toMatchObject({ ok: false, reason: 'not-found' });
    await expect(deleteAnnotation(creator.id, '00000000-0000-4000-8000-000000000009')).resolves.toBe(false);
    await expect(setAnnotationResolved(creator.id, '00000000-0000-4000-8000-000000000009', true)).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    });
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

/**
 * 第二十三片（#176）：`restoreProject` 的形状门，与其余动态参数路由的全扫。
 *
 * 探针五打的是 id-shape 前几片没覆盖到的动态参数路由。20 条里只有一条真漏了：
 * `POST /api/projects/<id>/restore`。恢复这条路**直达域层**（不像别的项目路由先过
 * `projectBelongsTo`），而 `restoreProject` 的 UPDATE 是裸 `eq(projects.id, …)`——
 * 非 UUID 的 id 撞 22P02，路由 catch 住变 500「恢复失败」，而它只是一次打错的请求。
 * 修法同族：形状不对按"不存在"处理，回 404，与 softDeleteProject 同一道门同一句回执。
 *
 * 其余 19 条这一趟全部实测过：各自的守卫（域层 isUuid / 先过 projectBelongsTo）都拦得住。
 * 它们没有修复动作，收编在这里是为了**锁住"不打 500"这条不变式**——将来哪条路由的
 * 守卫被摘掉，这张表当场红。请求体都按各路由的契约填满（角色档案、v1 补丁带 summary），
 * 确保每一发都真的走到数据库那一行，而不是在 zod 那层空转（#170 的教训）。
 */
describe('域层与路由层：restoreProject 的形状门与动态参数路由全扫（#176）', () => {
  let creatorBearer = '';

  beforeAll(async () => {
    creatorBearer = (
      await issueApiToken({
        userId: creator.id,
        name: '形状门-凭据',
        scopes: ['projects:read', 'projects:write', 'publish:write', 'design:read', 'design:write'],
      })
    ).token;
  }, 60_000);

  it('域层：restoreProject 对非 UUID → null，不抛（修复前 eq(projects.id, …) 撞 22P02）', async () => {
    await expect(restoreProject(creator.id, 'not-a-uuid')).resolves.toBeNull();
  });

  it('POST /api/projects/not-a-uuid/restore → 404（修复前 500：恢复路直达域层，不过 projectBelongsTo）', async () => {
    const res = await projectRestorePost(
      new Request('http://test.local/api/projects/not-a-uuid/restore', {
        method: 'POST',
        headers: asUser(creatorToken, true),
      }),
      { params: Promise.resolve({ projectId: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
  });

  it('正对照：真项目没删过 → 404；软删之后恢复 → 200（守卫只挡坏形状，不挡合法 id）', async () => {
    const name = `形状门-恢复正对照 ${Date.now()}`;
    const made = await createProject(creator.id, { name, kind: 'website' });
    // 没删过的项目：恢复不动它——404 而不是一句"恢复成功"但其实什么都没发生的 200
    const untouched = await projectRestorePost(
      new Request(`http://test.local/api/projects/${made.id}/restore`, {
        method: 'POST',
        headers: asUser(creatorToken, true),
      }),
      { params: Promise.resolve({ projectId: made.id }) },
    );
    expect(untouched.status).toBe(404);

    const deleted = await softDeleteProject(creator.id, made.id, name);
    expect(deleted).toMatchObject({ ok: true });
    const restored = await projectRestorePost(
      new Request(`http://test.local/api/projects/${made.id}/restore`, {
        method: 'POST',
        headers: asUser(creatorToken, true),
      }),
      { params: Promise.resolve({ projectId: made.id }) },
    );
    expect(restored.status).toBe(200);
    expect((await restored.json()).restored).toBe(true);
  }, 60_000);

  it('其余 19 条动态参数路由：not-a-uuid 一律走到数据库再答"不存在"，没有一个 500', async () => {
    const bearer = { authorization: `Bearer ${creatorBearer}` };
    const bad = 'not-a-uuid';
    const real = realProjectId;
    const probes: Array<{ name: string; want: number; run: () => Promise<Response> }> = [
      {
        name: 'GET /api/ai/jobs/not-a-uuid',
        want: 404,
        run: () =>
          jobStatusGet(new Request('http://test.local/api/ai/jobs/not-a-uuid', { headers: asUser(creatorToken) }), {
            params: Promise.resolve({ jobId: bad }),
          }),
      },
      {
        name: 'POST /api/ai/jobs/not-a-uuid/cancel',
        want: 404,
        run: () =>
          jobCancelPost(
            new Request('http://test.local/api/ai/jobs/not-a-uuid/cancel', {
              method: 'POST',
              headers: asUser(creatorToken, true),
            }),
            { params: Promise.resolve({ jobId: bad }) },
          ),
      },
      {
        name: 'POST /api/ai/tasks/not-a-uuid/approval',
        want: 404,
        run: () =>
          approvalDecide(
            new Request('http://test.local/api/ai/tasks/not-a-uuid/approval', {
              method: 'POST',
              headers: asUser(creatorToken, true),
              body: JSON.stringify({ decision: 'approve' }),
            }),
            { params: Promise.resolve({ taskId: bad }) },
          ),
      },
      {
        name: 'GET /api/ai/tasks/not-a-uuid/approval',
        want: 404,
        run: () =>
          approvalRead(new Request('http://test.local/api/ai/tasks/not-a-uuid/approval', { headers: asUser(creatorToken) }), {
            params: Promise.resolve({ taskId: bad }),
          }),
      },
      {
        name: 'POST /api/ai/tasks/not-a-uuid/retry',
        want: 404,
        run: () =>
          taskRetryPost(
            new Request('http://test.local/api/ai/tasks/not-a-uuid/retry', {
              method: 'POST',
              headers: asUser(creatorToken, true),
            }),
            { params: Promise.resolve({ taskId: bad }) },
          ),
      },
      {
        name: 'PATCH /api/admin/marketplace/reports/not-a-uuid',
        want: 404,
        run: () =>
          reportStatusPatch(
            new Request('http://test.local/api/admin/marketplace/reports/not-a-uuid', {
              method: 'PATCH',
              headers: asUser(adminToken, true),
              body: JSON.stringify({ status: 'reviewing' }),
            }),
            { params: Promise.resolve({ id: bad }) },
          ),
      },
      {
        name: 'GET /api/assets/not-a-uuid/file',
        want: 404,
        run: () =>
          assetFileGet(new Request('http://test.local/api/assets/not-a-uuid/file', { headers: asUser(creatorToken) }), {
            params: Promise.resolve({ assetId: bad }),
          }),
      },
      {
        name: 'DELETE /api/assets/not-a-uuid',
        want: 404,
        run: () =>
          assetDeleteRoute(
            new Request('http://test.local/api/assets/not-a-uuid', { method: 'DELETE', headers: asUser(creatorToken, true) }),
            { params: Promise.resolve({ assetId: bad }) },
          ),
      },
      {
        // switchBranch 的形状门在 branches.ts：projectId / branchId 两个都验
        name: 'POST /api/projects/<真项目>/branches/not-a-uuid/switch',
        want: 400,
        run: () =>
          branchSwitchPost(
            new Request(`http://test.local/api/projects/${real}/branches/not-a-uuid/switch`, {
              method: 'POST',
              headers: asUser(creatorToken, true),
            }),
            { params: Promise.resolve({ projectId: real, branchId: bad }) },
          ),
      },
      {
        // 补丁报文按 CharacterProfileSchema 填满：空转到 zod 那层的 400 不算走到守卫
        name: 'PATCH /api/projects/<真项目>/characters/not-a-uuid',
        want: 400,
        run: () =>
          characterProfilePatch(
            new Request(`http://test.local/api/projects/${real}/characters/not-a-uuid`, {
              method: 'PATCH',
              headers: asUser(creatorToken, true),
              body: JSON.stringify({
                profile: {
                  name: '形状门',
                  appearance: '',
                  personality: '',
                  backstory: '',
                  goals: [],
                  fears: [],
                  relationships: [],
                  voice: { register: '', pace: '', catchphrases: [], notes: '' },
                  visualIdentity: { palette: [], silhouette: '', motifs: [], referenceAssetId: null },
                },
              }),
            }),
            { params: Promise.resolve({ projectId: real, characterId: bad }) },
          ),
      },
      {
        name: 'DELETE /api/projects/<真项目>/characters/not-a-uuid',
        want: 404,
        run: () =>
          characterDeleteRoute(
            new Request(`http://test.local/api/projects/${real}/characters/not-a-uuid`, {
              method: 'DELETE',
              headers: asUser(creatorToken, true),
            }),
            { params: Promise.resolve({ projectId: real, characterId: bad }) },
          ),
      },
      {
        name: 'DELETE /api/projects/<真项目>/memories/not-a-uuid',
        want: 404,
        run: () =>
          memoryDeleteRoute(
            new Request(`http://test.local/api/projects/${real}/memories/not-a-uuid`, {
              method: 'DELETE',
              headers: asUser(creatorToken, true),
            }),
            { params: Promise.resolve({ projectId: real, memoryId: bad }) },
          ),
      },
      {
        name: 'GET /api/projects/<真项目>/snapshots/not-a-uuid',
        want: 404,
        run: () =>
          snapshotReadRoute(new Request(`http://test.local/api/projects/${real}/snapshots/not-a-uuid`, { headers: asUser(creatorToken) }), {
            params: Promise.resolve({ projectId: real, snapshotId: bad }),
          }),
      },
      {
        name: 'POST /api/projects/<真项目>/snapshots/not-a-uuid/restore',
        want: 400,
        run: () =>
          snapshotRestorePost(
            new Request(`http://test.local/api/projects/${real}/snapshots/not-a-uuid/restore`, {
              method: 'POST',
              headers: asUser(creatorToken, true),
            }),
            { params: Promise.resolve({ projectId: real, snapshotId: bad }) },
          ),
      },
      {
        name: 'GET /api/v1/projects/not-a-uuid/design',
        want: 404,
        run: () =>
          v1DesignGetRoute(new Request('http://test.local/api/v1/projects/not-a-uuid/design', { headers: bearer }), {
            params: Promise.resolve({ projectId: bad }),
          }),
      },
      {
        // summary 是 ApiDesignPatchRequestSchema 的必填项：不带它 400 出自 zod，守卫根本没被走到
        name: 'PATCH /api/v1/projects/not-a-uuid/design',
        want: 404,
        run: () =>
          v1DesignPatchRoute(
            new Request('http://test.local/api/v1/projects/not-a-uuid/design', {
              method: 'PATCH',
              headers: { ...bearer, 'content-type': 'application/json' },
              body: JSON.stringify({ summary: '形状门', ops: [{ op: 'removePage', pageId: bad }] }),
            }),
            { params: Promise.resolve({ projectId: bad }) },
          ),
      },
      {
        name: 'POST /api/v1/projects/not-a-uuid/publish',
        want: 404,
        run: () =>
          v1PublishPost(
            new Request('http://test.local/api/v1/projects/not-a-uuid/publish', {
              method: 'POST',
              headers: { ...bearer, 'content-type': 'application/json' },
              body: JSON.stringify({ visibility: 'unlisted' }),
            }),
            { params: Promise.resolve({ projectId: bad }) },
          ),
      },
      {
        name: 'GET /api/projects/not-a-uuid/game/code',
        want: 404,
        run: () =>
          gameCodeGetRoute(new Request('http://test.local/api/projects/not-a-uuid/game/code', { headers: asUser(creatorToken) }), {
            params: Promise.resolve({ projectId: bad }),
          }),
      },
      {
        name: 'GET /api/public/<handle>/assets/not-a-uuid',
        want: 404,
        run: () =>
          publicAssetGetRoute(new Request('http://test.local/api/public/nobody/assets/not-a-uuid', {}), {
            params: Promise.resolve({ handle: 'nobody', assetId: bad }),
          }),
      },
    ];
    for (const probe of probes) {
      const res = await probe.run();
      expect(res.status, probe.name).toBe(probe.want);
    }
  }, 120_000);
});

/**
 * 第三十片（#179）：`updateProjectDescription` 的形状门，与第二轮动态参数路由全扫。
 *
 * 第一轮到 #176 为止，扫的是"路由 → 域助手 → 裸 eq()"这一族，收编了 20 条。
 * 这一轮换一个问法：**把 id-shape 测试还没碰过的动态参数路由全部打一遍**。
 * 43 条里只有一条真漏——`PATCH /api/projects/<id>`（项目简介）：
 * 它的路由**不过 `projectBelongsTo`**（GET / PUT / DELETE 都过，只有它不过），
 * 而 `updateProjectDescription` 的 UPDATE 是裸 `eq(projects.id, …)`，
 * 非 UUID 的 id 撞 22P02，路由 catch 住变 500「更新失败」——而它只是一次打错的请求。
 * 所有权本来写在 SQL 的 `owner_id` 里（见函数头注释），所以这不是越权，是"坏形状被当成服务器故障"。
 * 修法同族：域层形状不对按"不存在"处理回 null，路由照旧翻 404。
 *
 * 其余 42 条这一趟全部实测过：各自的守卫（路由先过 `projectBelongsTo`，或域层 `isUuid`）都拦得住。
 * 它们没有修复动作，收编在这里是为了**锁住"不打 500"这条不变式**。
 * 请求体都按各路由的契约填满（`patches` / `confirm` / `assetId` / 两个分支 id / 一份真文档），
 * 确保每一发都真的走到数据库那一行，而不是在 zod 那层空转（#170 的教训）。
 */
describe('域层与路由层：updateProjectDescription 的形状门与第二轮动态参数路由全扫（#179）', () => {
  // PUT /snapshots 与 PATCH /design 都要一份**形状合法**的文档：只改 id 的话
  // parseDocument 会先以 400 收场，守卫根本没被走到——那正是 #170 记下的空转
  let realDocument: Record<string, unknown> = {};
  // v1 那几条认 Bearer 不认 cookie，所以这一轮自己签发一枚（与上一个 describe 同一招）
  let creatorBearer = '';

  beforeAll(async () => {
    realDocument = JSON.parse(JSON.stringify((await loadDocument(realProjectId)) ?? {}));
    creatorBearer = (
      await issueApiToken({
        userId: creator.id,
        name: '形状门-凭据-二轮',
        scopes: ['projects:read', 'projects:write', 'publish:write', 'design:read', 'design:write'],
      })
    ).token;
  }, 60_000);

  it('域层：updateProjectDescription 对非 UUID → null，不抛（修复前 eq(projects.id, …) 撞 22P02）', async () => {
    await expect(updateProjectDescription(creator.id, 'not-a-uuid', '形状门')).resolves.toBeNull();
  });

  it('PATCH /api/projects/not-a-uuid → 404（修复前 500：这条 PATCH 不过 projectBelongsTo，形状门只能落在域层）', async () => {
    const res = await projectPatch(
      new Request('http://test.local/api/projects/not-a-uuid', {
        method: 'PATCH',
        headers: asUser(creatorToken, true),
        body: JSON.stringify({ description: '形状门' }),
      }),
      { params: Promise.resolve({ projectId: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
  });

  it('别的坏形状同样 404，不是只有 not-a-uuid 这一个字符串幸运', async () => {
    for (const bad of ['', '1', 'abc-def', 'x'.repeat(200), '00000000-0000-9000-8000-000000000000']) {
      const res = await projectPatch(
        new Request(`http://test.local/api/projects/${encodeURIComponent(bad)}`, {
          method: 'PATCH',
          headers: asUser(creatorToken, true),
          body: JSON.stringify({ description: '形状门' }),
        }),
        { params: Promise.resolve({ projectId: bad }) },
      );
      expect(res.status, `"${bad.slice(0, 20)}"`).toBe(404);
    }
  });

  it('正对照：真项目的简介改得动、读得回（守卫只挡坏形状，不挡合法 id）', async () => {
    const res = await projectPatch(
      new Request(`http://test.local/api/projects/${realProjectId}`, {
        method: 'PATCH',
        headers: asUser(creatorToken, true),
        body: JSON.stringify({ description: '形状门-简介' }),
      }),
      { params: Promise.resolve({ projectId: realProjectId }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).project.description).toBe('形状门-简介');
  });

  it('其余 42 条动态参数路由：not-a-uuid 一律走到数据库再答"不存在"，没有一个 500', async () => {
    const bad = 'not-a-uuid';
    const real = realProjectId;
    const probes: Array<{ name: string; want: number; run: () => Promise<Response> }> = [
      { name: 'GET /api/projects/BAD/agent', want: 404, run: () => agentGet(new Request(`http://test.local/api/projects/${bad}/agent`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'POST /api/projects/BAD/agent', want: 404, run: () => agentPost(new Request(`http://test.local/api/projects/${bad}/agent`, { method: 'POST', headers: asUser(creatorToken, true), body: JSON.stringify({ goal: '形状门' }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/projects/BAD/annotations', want: 404, run: () => annGet(new Request(`http://test.local/api/projects/${bad}/annotations`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'POST /api/projects/BAD/annotations', want: 404, run: () => annPost(new Request(`http://test.local/api/projects/${bad}/annotations`, { method: 'POST', headers: asUser(creatorToken, true), body: JSON.stringify({ nodeId: 'n1', text: '形状门' }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/projects/BAD/assets', want: 404, run: () => assetsGet(new Request(`http://test.local/api/projects/${bad}/assets`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'POST /api/projects/BAD/branches', want: 404, run: () => branchPost(new Request(`http://test.local/api/projects/${bad}/branches`, { method: 'POST', headers: asUser(creatorToken, true), body: JSON.stringify({ name: '形状门' }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/projects/BAD/characters', want: 404, run: () => charsGet(new Request(`http://test.local/api/projects/${bad}/characters`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'POST /api/projects/BAD/characters', want: 404, run: () => charsPost(new Request(`http://test.local/api/projects/${bad}/characters`, { method: 'POST', headers: asUser(creatorToken, true), body: JSON.stringify({ name: '形状门' }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/projects/BAD/context', want: 404, run: () => contextGet(new Request(`http://test.local/api/projects/${bad}/context`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'PATCH /api/projects/BAD/design', want: 404, run: () => designPatch(new Request(`http://test.local/api/projects/${bad}/design`, { method: 'PATCH', headers: asUser(creatorToken, true), body: JSON.stringify({ patches: [{ ops: [] }] }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'POST /api/projects/BAD/duplicate', want: 404, run: () => dupPost(new Request(`http://test.local/api/projects/${bad}/duplicate`, { method: 'POST', headers: asUser(creatorToken, true), body: JSON.stringify({}) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/projects/BAD/export', want: 404, run: () => exportGet(new Request(`http://test.local/api/projects/${bad}/export?parts=design`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/projects/BAD/game', want: 404, run: () => gameGet(new Request(`http://test.local/api/projects/${bad}/game`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'PUT /api/projects/BAD/game', want: 404, run: () => gamePut(new Request(`http://test.local/api/projects/${bad}/game`, { method: 'PUT', headers: asUser(creatorToken, true), body: JSON.stringify({ document: {} }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/projects/BAD/game/code/zip', want: 404, run: () => gameZipGet(new Request(`http://test.local/api/projects/${bad}/game/code/zip`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'POST /api/projects/BAD/images', want: 404, run: () => imagesPost(new Request(`http://test.local/api/projects/${bad}/images`, { method: 'POST', headers: asUser(creatorToken, true), body: JSON.stringify({ prompt: '形状门' }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/projects/BAD/knowledge', want: 404, run: () => knowGet(new Request(`http://test.local/api/projects/${bad}/knowledge`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'POST /api/projects/BAD/knowledge', want: 404, run: () => knowPost(new Request(`http://test.local/api/projects/${bad}/knowledge`, { method: 'POST', headers: asUser(creatorToken, true), body: JSON.stringify({}) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/projects/BAD/knowledge/block', want: 404, run: () => blockGet(new Request(`http://test.local/api/projects/${bad}/knowledge/block?sourceType=design&sourceId=x`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'POST /api/projects/BAD/knowledge/block', want: 404, run: () => blockPost(new Request(`http://test.local/api/projects/${bad}/knowledge/block`, { method: 'POST', headers: asUser(creatorToken, true), body: JSON.stringify({ sourceType: 'design', sourceId: 'x' }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'POST /api/projects/BAD/knowledge/search', want: 404, run: () => searchPost(new Request(`http://test.local/api/projects/${bad}/knowledge/search`, { method: 'POST', headers: asUser(creatorToken, true), body: JSON.stringify({ q: '形状门' }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/projects/BAD/memories', want: 404, run: () => memGet(new Request(`http://test.local/api/projects/${bad}/memories`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'POST /api/projects/BAD/memories', want: 404, run: () => memPost(new Request(`http://test.local/api/projects/${bad}/memories`, { method: 'POST', headers: asUser(creatorToken, true), body: JSON.stringify({ scope: 'world', content: '形状门' }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'DELETE /api/projects/BAD/memories', want: 404, run: () => memDel(new Request(`http://test.local/api/projects/${bad}/memories?scope=world`, { method: 'DELETE', headers: asUser(creatorToken, true) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/projects/BAD/publish', want: 404, run: () => pubGet(new Request(`http://test.local/api/projects/${bad}/publish`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'POST /api/projects/BAD/publish', want: 404, run: () => pubPost(new Request(`http://test.local/api/projects/${bad}/publish`, { method: 'POST', headers: asUser(creatorToken, true), body: JSON.stringify({ visibility: 'unlisted' }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'DELETE /api/projects/BAD/publish', want: 404, run: () => pubDel(new Request(`http://test.local/api/projects/${bad}/publish`, { method: 'DELETE', headers: asUser(creatorToken, true) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/projects/BAD/retrieve', want: 404, run: () => retGet(new Request(`http://test.local/api/projects/${bad}/retrieve?q=x`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'POST /api/projects/BAD/retrieve', want: 404, run: () => retPost(new Request(`http://test.local/api/projects/${bad}/retrieve`, { method: 'POST', headers: asUser(creatorToken, true), body: JSON.stringify({ query: '形状门' }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/projects/BAD/snapshots', want: 404, run: () => snapGet(new Request(`http://test.local/api/projects/${bad}/snapshots`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'POST /api/projects/BAD/snapshots', want: 404, run: () => snapPost(new Request(`http://test.local/api/projects/${bad}/snapshots`, { method: 'POST', headers: asUser(creatorToken, true), body: JSON.stringify({ document: { ...realDocument, id: bad } }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/projects/BAD/storyboard', want: 404, run: () => sbGet(new Request(`http://test.local/api/projects/${bad}/storyboard`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'PUT /api/projects/BAD/storyboard', want: 404, run: () => sbPut(new Request(`http://test.local/api/projects/${bad}/storyboard`, { method: 'PUT', headers: asUser(creatorToken, true), body: JSON.stringify({ document: {} }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/projects/BAD/variants', want: 404, run: () => varGet(new Request(`http://test.local/api/projects/${bad}/variants`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'POST /api/projects/BAD/variants', want: 404, run: () => varPost(new Request(`http://test.local/api/projects/${bad}/variants`, { method: 'POST', headers: asUser(creatorToken, true), body: JSON.stringify({}) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'POST /api/projects/BAD/variants/merge', want: 404, run: () => mergePost(new Request(`http://test.local/api/projects/${bad}/variants/merge`, { method: 'POST', headers: asUser(creatorToken, true), body: JSON.stringify({ layoutBranchId: bad, visualBranchId: bad }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'POST /api/projects/BAD/visual-dna', want: 404, run: () => dnaPost(new Request(`http://test.local/api/projects/${bad}/visual-dna`, { method: 'POST', headers: asUser(creatorToken, true), body: JSON.stringify({ assetId: bad }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/projects/BAD/world', want: 404, run: () => worldGet(new Request(`http://test.local/api/projects/${bad}/world`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'PUT /api/projects/BAD/world', want: 404, run: () => worldPut(new Request(`http://test.local/api/projects/${bad}/world`, { method: 'PUT', headers: asUser(creatorToken, true), body: JSON.stringify({ document: {} }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'PUT /api/projects/BAD', want: 404, run: () => projectPut(new Request(`http://test.local/api/projects/${bad}`, { method: 'PUT', headers: asUser(creatorToken, true), body: JSON.stringify({ ...realDocument, id: bad }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'DELETE /api/projects/BAD', want: 404, run: () => projectDelete(new Request(`http://test.local/api/projects/${bad}`, { method: 'DELETE', headers: asUser(creatorToken, true), body: JSON.stringify({ confirm: 'x' }) }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/v1/projects/BAD', want: 404, run: () => v1ProjectGet(new Request(`http://test.local/api/v1/projects/${bad}`, { headers: { authorization: `Bearer ${creatorBearer}` } }), { params: Promise.resolve({ projectId: bad }) }) },
      { name: 'GET /api/marketplace/BAD/content', want: 404, run: () => marketContent(new Request(`http://test.local/api/marketplace/${bad}/content`, {}), { params: Promise.resolve({ id: bad }) }) },
      { name: 'GET /api/avatar/BAD/x.png', want: 404, run: () => avatarGet(new Request(`http://test.local/api/avatar/${bad}/x.png`, {}), { params: Promise.resolve({ userId: bad, file: 'x.png' }) }) },
      // 正对照：同一个项目换成**合法** id，这一轮新接进来的路由照旧走通——
      // 守卫挡的是坏形状，不是正常路径（"为了不打 500 把真用户也挡了"同样是一条缺陷）
      { name: 'GET /api/projects/<真项目>/context', want: 200, run: () => contextGet(new Request(`http://test.local/api/projects/${real}/context`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: real }) }) },
      { name: 'GET /api/projects/<真项目>/knowledge', want: 200, run: () => knowGet(new Request(`http://test.local/api/projects/${real}/knowledge`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: real }) }) },
      { name: 'GET /api/projects/<真项目>/snapshots', want: 200, run: () => snapGet(new Request(`http://test.local/api/projects/${real}/snapshots`, { headers: asUser(creatorToken) }), { params: Promise.resolve({ projectId: real }) }) },
    ];
    for (const probe of probes) {
      const res = await probe.run();
      expect(res.status, probe.name).toBe(probe.want);
    }
  }, 180_000);
});
