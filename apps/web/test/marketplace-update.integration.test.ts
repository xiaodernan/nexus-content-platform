import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { PATCH as updateItem, DELETE as deleteItem } from '../src/app/api/marketplace/[id]/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { createMarketplaceItem } from '../src/server/domain/marketplace';
import { getDb } from '../src/server/db/client';
import { marketplaceItems, sessions, users } from '../src/server/db/schema';

/**
 * §127 marketplace 更新与删除入口（PATCH / DELETE /api/marketplace/[id]）的路由层，打真库。
 *
 * PATCH 此前是裸 cast 正文（`await req.json() as { ... }`）——与创建入口（eb068ec 那片）
 * 同一个形状的洞，只是从另一扇门进来：
 * - `priceCredits: -100` 能直写负价（负价=买家白拿+创作者账被 settle 抽干，与 POST 同一条 exploit）；
 * - `tags` 非数组撞 TEXT[] 列、`previewAssetId` 非 UUID 在域层的 eq() 撞 22P02 变 **500**；
 * - 路径参数 itemId 非 UUID 时，update/delete 域函数的 eq() 同样 22P02——
 *   而 Postgres 的报错原文会被 catch 成 400 回给客户端（§26：错误响应不带内部结构）。
 *
 * 修法同 POST 那片：正文过 zod（priceCredits 非负+上限、tags 字符串数组、
 * previewAssetId UUID、visibility 从 schema 常量派生），域函数入口 isUuid 守卫
 * （形状不对按"没有这个物品"处理）。
 *
 * 2026-10-21（#149）第二片：域函数改回**判别式结果**（`{ok:true,item}` / `{ok:false,reason}`），
 * 路由按语义翻码——不存在/已下架/私有别人的 404，可见别人的 403，预览素材不存在 400；
 * 响应正文只给稳定机器码 + 一句中文 `message`，不再回显内部英文句子（§26）。
 * 此前不存在的条目与"不是你的"都回 400，且 `error` 字段就是域层的内部句子。
 *
 * 断言按**修好后**的行为写。修复前：负价 PATCH 回 200 且库里多一个负价商品、
 * 坏 previewAssetId 回 500、坏 itemId 回 400 但带着 Postgres 的报错原文。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'a2c4e6g8i0k2m4o6';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(userId: string): Promise<string> {
  const token = `mktupd-tok-${userId}`;
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

function asUser(token: string): Record<string, string> {
  jar.clear();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  jar.set(SESSION_COOKIE, token);
  headers.cookie = `${SESSION_COOKIE}=${token}`;
  jar.set(CSRF_COOKIE, CSRF_TOKEN);
  headers[CSRF_HEADER] = CSRF_TOKEN;
  return headers;
}

const itemUrl = (id: string): string => `http://test.local/api/marketplace/${id}`;

let creator: { id: string };
let stranger: { id: string };
let creatorToken: string;
let myItemId: string;
let strangerItemId: string;
let strangerPrivateItemId: string;

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: '更新-作者', email: `mktupd+creator+${stamp}@nexus.test`, role: 'creator' },
      { displayName: '更新-别人', email: `mktupd+stranger+${stamp}@nexus.test`, role: 'creator' },
    ])
    .returning({ id: users.id });
  creator = rows[0]!;
  stranger = rows[1]!;
  creatorToken = await identityFor(creator.id);
  // stranger 只是"别人"那一侧：他的物品用来做归属校验的负对照，本人不用上场
  await identityFor(stranger.id);

  myItemId = (await createMarketplaceItem({ creatorId: creator.id, itemType: 'component', title: `更新-我的物品 ${stamp}`, visibility: 'public', priceCredits: 5 })).id;
  strangerItemId = (await createMarketplaceItem({ creatorId: stranger.id, itemType: 'component', title: `更新-别人的物品 ${stamp}`, visibility: 'public', priceCredits: 5 })).id;
  strangerPrivateItemId = (await createMarketplaceItem({ creatorId: stranger.id, itemType: 'component', title: `更新-别人的私稿 ${stamp}`, visibility: 'private' })).id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(users).where(inArray(users.id, [creator.id, stranger.id]));
});

describe('§127 更新入口的正文加固（修复前：负价能写、坏值 500、Postgres 报错回显）', () => {
  const patch = (id: string, body: unknown): Promise<Response> =>
    updateItem(
      new Request(itemUrl(id), { method: 'PATCH', headers: asUser(creatorToken), body: JSON.stringify(body) }),
      { params: Promise.resolve({ id }) },
    );

  it('priceCredits=-100 → 400（修复前：200 且库里多一个负价商品）', async () => {
    const res = await patch(myItemId, { priceCredits: -100 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation_failed');
    const [row] = await getDb().select({ priceCredits: marketplaceItems.priceCredits }).from(marketplaceItems).where(eq(marketplaceItems.id, myItemId)).limit(1);
    expect(row!.priceCredits).toBe(5);
  });

  it('priceCredits 超过 int4 上限 → 400（修复前：400 但回显 Postgres 的越界报错）', async () => {
    const res = await patch(myItemId, { priceCredits: 9_999_999_999 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation_failed');
  });

  it('tags 不是数组 → 400（修复前：400 但回显 Postgres 的 TEXT[] 报错）', async () => {
    const res = await patch(myItemId, { tags: '不是数组' });
    expect(res.status).toBe(400);
  });

  it('previewAssetId 不是 UUID → 400（修复前：域层 eq() 撞 22P02 变 500）', async () => {
    const res = await patch(myItemId, { previewAssetId: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation_failed');
  });

  it('路径 itemId 不是 UUID → 404 not_found（修复前：400 带着 invalid input syntax 原文）', async () => {
    const res = await patch('not-a-uuid', { title: '改个名' });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
    expect(typeof body.message).toBe('string');
    expect(JSON.stringify(body)).not.toMatch(/syntax for type|22P02|invalid input/i);
  });

  it('visibility 名单外 → 400（口径从自定义检查换成 zod，拒绝的语义不变）', async () => {
    const res = await patch(myItemId, { visibility: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('标题命中红线 → 400（机检照旧）', async () => {
    const res = await patch(myItemId, { title: 'child nude 未成年色情内容' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('prohibited');
  });

  it('别人的公开物品 → 403 forbidden，正文不回显内部英文句子（修复前：400 + "Only creator can update this item"）', async () => {
    const res = await patch(strangerItemId, { title: '改别人的名' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
    expect(JSON.stringify(body)).not.toMatch(/Only creator|Item not found or deleted/);
  });

  it('别人的私有物品 → 404（与详情/预览同一口径：403 会告诉陌生人这个 id 存在）', async () => {
    const res = await patch(strangerPrivateItemId, { title: '改别人的私稿' });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('正对照：自己的物品改标题与价格 → 200，落库的是新值', async () => {
    const res = await patch(myItemId, { title: '更新-改名后', priceCredits: 50 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { item: { title: string; priceCredits: number } };
    expect(body.item.title).toBe('更新-改名后');
    expect(body.item.priceCredits).toBe(50);
  });
});

describe('§127 删除入口的 id 守卫', () => {
  it('路径 itemId 不是 UUID → 404 not_found（修复前同样 22P02、回 400）', async () => {
    const res = await deleteItem(
      new Request(itemUrl('not-a-uuid'), { method: 'DELETE', headers: asUser(creatorToken) }),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
    expect(JSON.stringify(body)).not.toMatch(/syntax for type|22P02|invalid input/i);
  });

  it('正对照：删除自己的物品 → 200，落库的是软删（deletedAt 有值）', async () => {
    const res = await deleteItem(
      new Request(itemUrl(myItemId), { method: 'DELETE', headers: asUser(creatorToken) }),
      { params: Promise.resolve({ id: myItemId }) },
    );
    expect(res.status).toBe(200);
    const [row] = await getDb().select({ deletedAt: marketplaceItems.deletedAt }).from(marketplaceItems).where(eq(marketplaceItems.id, myItemId)).limit(1);
    expect(row!.deletedAt).not.toBeNull();
  });

  it('别人的公开物品删不掉 → 403（修复前：400）', async () => {
    const res = await deleteItem(
      new Request(itemUrl(strangerItemId), { method: 'DELETE', headers: asUser(creatorToken) }),
      { params: Promise.resolve({ id: strangerItemId }) },
    );
    expect(res.status).toBe(403);
  });

  it('别人的私有物品删不掉 → 404（不泄露存在）', async () => {
    const res = await deleteItem(
      new Request(itemUrl(strangerPrivateItemId), { method: 'DELETE', headers: asUser(creatorToken) }),
      { params: Promise.resolve({ id: strangerPrivateItemId }) },
    );
    expect(res.status).toBe(404);
  });
});
