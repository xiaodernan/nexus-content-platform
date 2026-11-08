import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { inArray } from 'drizzle-orm';
import { GET as getItem } from '../src/app/api/marketplace/[id]/route';
import { POST as purchaseItem } from '../src/app/api/marketplace/[id]/purchase/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { createMarketplaceItem, deleteMarketplaceItem, hasPurchased, purchaseMarketplaceItem } from '../src/server/domain/marketplace';
import { getDb } from '../src/server/db/client';
import { sessions, users } from '../src/server/db/schema';

/**
 * §127 marketplace 私有草稿的可见性执行，打真库。
 *
 * `visibility: 'private'` 的语义是**私有草稿**（schema 注释：公开出售 / 免费分享 / 私有草稿）：
 * 店面只列 public/free，预览路由对 private 只放创作者本人（[id]/preview 的注释写明了这条口径）。
 * 但横向对比露出两个没跟上这条口径的入口：
 *
 * 1. **purchase 完全不看 visibility**：`purchaseMarketplaceItem` 只挡了 free 与"自己的东西"。
 *    私有草稿默认 priceCredits=0，于是 pricePaid=0 → 不写扣点流水 → 购买"免费成交"，
 *    之后 content 路由的 `hasPurchased` 就为任何人放行——未公开草稿的完整
 *    设计+代码导出包（buildProjectExport 的 ZIP）凭一个 UUID 免费到手。
 * 2. **详情路由对 private 零门控**：GET /api/marketplace/[id] 把整行（含 sourceProjectId /
 *    documentId 这些内部 id）回给任何知道 UUID 的人，连登录都不用。
 *
 * 修法：purchase 在 free 检查之后挡 private（复用"不存在或已下架"这一句 404——对买家来说
 * "没上架"与"不存在"是同一个答案，不留下可分辨的差别）；详情对 private 只放创作者本人
 * （与预览路由同一口径）。content 路由随之安全：private 不再能被新买，`purchased` 那条
 * 对未购买者自然 403（修复前合法买过的人保留访问，那是该有的）。
 *
 * 断言按**修好后**的行为写。修复前：私有购买回 200 且库里多一行幽灵购买、
 * 匿名详情回 200 带着内部 id——红的形状就是洞本身。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'f1a3b5c7d9e24680';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(userId: string): Promise<string> {
  const token = `mktvis-tok-${userId}`;
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

const itemUrl = (id: string): string => `http://test.local/api/marketplace/${id}`;
const purchaseUrl = (id: string): string => `http://test.local/api/marketplace/${id}/purchase`;

let creator: { id: string };
let buyer: { id: string };
let creatorToken: string;
let buyerToken: string;
let privateItemId: string;
let publicItemId: string;
let freeItemId: string;

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: '可见性-作者', email: `mktvis+creator+${stamp}@nexus.test`, role: 'creator' },
      { displayName: '可见性-买家', email: `mktvis+buyer+${stamp}@nexus.test`, role: 'creator' },
    ])
    .returning({ id: users.id });
  creator = rows[0]!;
  buyer = rows[1]!;
  creatorToken = await identityFor(creator.id);
  buyerToken = await identityFor(buyer.id);

  // 私有草稿：默认价格 0——"免费成交"的那一条正是它的形状
  privateItemId = (await createMarketplaceItem({ creatorId: creator.id, itemType: 'component', title: `可见性-草稿 ${stamp}` })).id;
  publicItemId = (await createMarketplaceItem({ creatorId: creator.id, itemType: 'component', title: `可见性-公开 ${stamp}`, visibility: 'public', priceCredits: 5 })).id;
  freeItemId = (await createMarketplaceItem({ creatorId: creator.id, itemType: 'component', title: `可见性-免费 ${stamp}`, visibility: 'free' })).id;
});

afterAll(async () => {
  const db = getDb();
  // 用户级联带走 sessions → items → purchases（三张表的外键都 ON DELETE CASCADE）
  await db.delete(users).where(inArray(users.id, [creator.id, buyer.id]));
});

describe('§127 私有草稿的购买门（修复前：凭 UUID 免费成交未公开草稿）', () => {
  it('买家买私有草稿 → 404，且库里不留幽灵购买行', async () => {
    const res = await purchaseItem(
      new Request(purchaseUrl(privateItemId), { method: 'POST', headers: asUser(buyerToken) }),
      { params: Promise.resolve({ id: privateItemId }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
    // 修复前这一行是 true：pricePaid=0 免费成交，content 路由随后就放行
    expect(await hasPurchased(privateItemId, buyer.id)).toBe(false);
  });

  it('创作者本人买自己的私有草稿 → 404（private 门在"不能买自己的东西"之前）', async () => {
    const res = await purchaseItem(
      new Request(purchaseUrl(privateItemId), { method: 'POST', headers: asUser(creatorToken) }),
      { params: Promise.resolve({ id: privateItemId }) },
    );
    expect(res.status).toBe(404);
  });

  it('正对照：公开物品照旧能买（200），免费物品照旧回 free_item（400）', async () => {
    const bought = await purchaseItem(
      new Request(purchaseUrl(publicItemId), { method: 'POST', headers: asUser(buyerToken) }),
      { params: Promise.resolve({ id: publicItemId }) },
    );
    expect(bought.status).toBe(200);
    expect(await hasPurchased(publicItemId, buyer.id)).toBe(true);

    const free = await purchaseItem(
      new Request(purchaseUrl(freeItemId), { method: 'POST', headers: asUser(buyerToken) }),
      { params: Promise.resolve({ id: freeItemId }) },
    );
    expect(free.status).toBe(400);
    expect((await free.json()).error).toBe('free_item');
  });

  it('创作者买自己的公开物品 → 400 own_item（路由按 reason 翻码，不比对句子）', async () => {
    const res = await purchaseItem(
      new Request(purchaseUrl(publicItemId), { method: 'POST', headers: asUser(creatorToken) }),
      { params: Promise.resolve({ id: publicItemId }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('own_item');
  });

  it('同一买家买第二次 → 400 already_purchased（先经域层买一次，再走路由重放）', async () => {
    const item = await createMarketplaceItem({
      creatorId: creator.id,
      itemType: 'component',
      title: `可见性-重复 ${Date.now()}`,
      visibility: 'public',
      priceCredits: 0,
    });
    const first = await purchaseMarketplaceItem({ buyerId: buyer.id, itemId: item.id });
    expect(first.ok).toBe(true);

    const res = await purchaseItem(
      new Request(purchaseUrl(item.id), { method: 'POST', headers: asUser(buyerToken) }),
      { params: Promise.resolve({ id: item.id }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('already_purchased');
  });
});

describe('§127 私有草稿的详情门（修复前：匿名拿到含内部 id 的整行）', () => {
  it('匿名看私有草稿 → 404（修复前：200 且带着 sourceProjectId 等内部 id）', async () => {
    const res = await getItem(new Request(itemUrl(privateItemId)), { params: Promise.resolve({ id: privateItemId }) });
    expect(res.status).toBe(404);
  });

  it('买家（登录但非作者）看私有草稿 → 404', async () => {
    asUser(buyerToken);
    const res = await getItem(new Request(itemUrl(privateItemId)), { params: Promise.resolve({ id: privateItemId }) });
    expect(res.status).toBe(404);
  });

  it('创作者本人看自己的草稿 → 200（"我的物品"那条路要过）', async () => {
    asUser(creatorToken);
    const res = await getItem(new Request(itemUrl(privateItemId)), { params: Promise.resolve({ id: privateItemId }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { item: { id: string; visibility: string } };
    expect(body.item.id).toBe(privateItemId);
    expect(body.item.visibility).toBe('private');
  });

  it('正对照：公开物品匿名可见（200）', async () => {
    jar.clear();
    const res = await getItem(new Request(itemUrl(publicItemId)), { params: Promise.resolve({ id: publicItemId }) });
    expect(res.status).toBe(200);
  });
});

describe('下架后的详情（GET 的文档曾写"包括已下架的，用于收藏者查看原因"）', () => {
  it('下架后匿名与创作者本人都是 404 not_found，正文带中文 message', async () => {
    const item = await createMarketplaceItem({
      creatorId: creator.id,
      itemType: 'component',
      title: `下架样本 ${Date.now()}`,
      visibility: 'public',
      priceCredits: 0,
    });
    const del = await deleteMarketplaceItem(item.id, creator.id);
    expect(del.ok).toBe(true);

    jar.clear();
    const anon = await getItem(new Request(itemUrl(item.id)), { params: Promise.resolve({ id: item.id }) });
    expect(anon.status).toBe(404);
    const anonBody = (await anon.json()) as { error: string; message?: string };
    expect(anonBody.error, '详情 404 应与市场其它 [id] 门同一个稳定机器码').toBe('not_found');
    expect(anonBody.message).toBe('物品不存在或已下架');

    asUser(creatorToken);
    const owner = await getItem(new Request(itemUrl(item.id)), { params: Promise.resolve({ id: item.id }) });
    expect(owner.status, '没有"下架原因"可看，创作者本人也不该能点开——数据在「我的购买」那条读路').toBe(404);
    jar.clear();
  });
});
