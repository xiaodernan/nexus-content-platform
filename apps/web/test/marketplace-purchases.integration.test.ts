import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { inArray } from 'drizzle-orm';
import { GET as getPurchases } from '../src/app/api/marketplace/purchases/route';
import { GET as getContent } from '../src/app/api/marketplace/[id]/content/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import {
  createMarketplaceItem,
  deleteMarketplaceItem,
  listBuyerPurchases,
  purchaseMarketplaceItem,
  updateMarketplaceItem,
} from '../src/server/domain/marketplace';
import { getDb } from '../src/server/db/client';
import { marketplaceItems, sessions, users } from '../src/server/db/schema';

/**
 * §127 买家侧「我的购买」（#150）。
 *
 * 背景：店面只显示在售 / 免费，交付门按条目 id 走——买家花完点后没有任何入口
 * 能再找到买过的东西。这条读路按**购买行**出发，因此必须回答三个问题：
 * - 只给本人看（buyerId 来自会话，别人的购买记录一条都不出现）；
 * - 已下架的条目**仍在单子上**（软删除不删购买行），并带上 `delistedAt` 让界面说清；
 * - 与交付门的口径一致：已下架条目现在**不再交付**（本片如实钉住这条限度，
 *   改交付策略时两处要一起动）。
 *
 * 购买用 `priceCredits: 0` 的 public 条目：不写扣点流水（账本只追加），
 * 买家因此删得掉，测试数据也干净。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'p1r2c3h4a5s6e7s8';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(userId: string): Promise<string> {
  const token = `mkpur-tok-${userId}`;
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

function asUser(token: string | null): Record<string, string> {
  jar.clear();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) {
    jar.set(SESSION_COOKIE, token);
    headers.cookie = `${SESSION_COOKIE}=${token}`;
  }
  jar.set(CSRF_COOKIE, CSRF_TOKEN);
  headers[CSRF_HEADER] = CSRF_TOKEN;
  return headers;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let creator: { id: string };
let buyer: { id: string };
let stranger: { id: string };
let creatorToken: string;
let buyerToken: string;
let strangerToken: string;
let activeItemId: string;
let delistedItemId: string;
let privateItemId: string;
let strangerItemId: string;

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: '购买-作者', email: `mkpur+creator+${stamp}@nexus.test`, role: 'creator' },
      { displayName: '购买-买家', email: `mkpur+buyer+${stamp}@nexus.test`, role: 'creator' },
      { displayName: '购买-别人', email: `mkpur+stranger+${stamp}@nexus.test`, role: 'creator' },
    ])
    .returning({ id: users.id });
  creator = rows[0]!;
  buyer = rows[1]!;
  stranger = rows[2]!;
  creatorToken = await identityFor(creator.id);
  buyerToken = await identityFor(buyer.id);
  strangerToken = await identityFor(stranger.id);

  const base = { creatorId: creator.id, itemType: 'component' as const, visibility: 'public' as const, priceCredits: 0 };
  activeItemId = (await createMarketplaceItem({ ...base, title: `购买-在售 ${stamp}` })).id;
  delistedItemId = (await createMarketplaceItem({ ...base, title: `购买-已下架 ${stamp}` })).id;
  privateItemId = (await createMarketplaceItem({ ...base, title: `购买-转私密 ${stamp}` })).id;
  strangerItemId = (await createMarketplaceItem({ ...base, title: `购买-别人的单 ${stamp}` })).id;

  // 三笔买家自己的购买，顺序即时间顺序（purchasedAt 精度是毫秒，隔开一点避免并列）
  await purchaseMarketplaceItem({ buyerId: buyer.id, itemId: activeItemId });
  await sleep(5);
  await purchaseMarketplaceItem({ buyerId: buyer.id, itemId: delistedItemId });
  await sleep(5);
  await purchaseMarketplaceItem({ buyerId: buyer.id, itemId: privateItemId });
  await purchaseMarketplaceItem({ buyerId: stranger.id, itemId: strangerItemId });

  // 买完之后作者才下架 / 转私密：购买记录必须活下来，且状态要跟着条目走
  await deleteMarketplaceItem(delistedItemId, creator.id);
  const flipped = await updateMarketplaceItem(privateItemId, creator.id, { visibility: 'private' });
  expect(flipped.ok).toBe(true);
}, 120_000);

afterAll(async () => {
  const db = getDb();
  // 条目先删：购买行随 item 外键级联；再删人（会话随用户级联）
  await db.delete(marketplaceItems).where(
    inArray(marketplaceItems.id, [activeItemId, delistedItemId, privateItemId, strangerItemId]),
  );
  await db.delete(users).where(inArray(users.id, [creator.id, buyer.id, stranger.id]));
}, 60_000);

describe('§127 买家侧我的购买：域层', () => {
  it('买家看到自己的三笔，按购买时间倒序；已下架的仍在，`delistedAt` 有值', async () => {
    const rows = await listBuyerPurchases(buyer.id);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.itemId)).toEqual([privateItemId, delistedItemId, activeItemId]);

    const delisted = rows.find((row) => row.itemId === delistedItemId)!;
    expect(delisted.delistedAt).toBeInstanceOf(Date);
    expect(delisted.visibility).toBe('public');
    expect(delisted.pricePaid).toBe(0);

    const active = rows.find((row) => row.itemId === activeItemId)!;
    expect(active.delistedAt).toBeNull();
    expect(active.creatorId).toBe(creator.id);
    expect(active.creatorName).toBe('购买-作者');
  });

  it('转私密的条目：购买记录照旧在，`visibility` 跟着条目变成 private', async () => {
    const rows = await listBuyerPurchases(buyer.id);
    const flipped = rows.find((row) => row.itemId === privateItemId)!;
    expect(flipped.visibility).toBe('private');
    expect(flipped.delistedAt).toBeNull();
  });

  it('别人的购买记录不出现（买家只看得到自己的）', async () => {
    const mine = await listBuyerPurchases(buyer.id);
    expect(mine.some((row) => row.itemId === strangerItemId)).toBe(false);
    const theirs = await listBuyerPurchases(stranger.id);
    expect(theirs.map((row) => row.itemId)).toEqual([strangerItemId]);
  });
});

describe('§127 GET /api/marketplace/purchases', () => {
  it('匿名 → 401 unauthenticated（购买记录不是公开数据）', async () => {
    const res = await getPurchases();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthenticated');
  });

  it('买家 → 200，三笔都在，已下架那一笔带 delistedAt', async () => {
    asUser(buyerToken);
    const res = await getPurchases();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as {
      purchases: { itemId: string; title: string; delistedAt: string | null; pricePaid: number }[];
    };
    expect(body.purchases).toHaveLength(3);
    const delisted = body.purchases.find((row) => row.itemId === delistedItemId)!;
    expect(typeof delisted.delistedAt).toBe('string');
    expect(delisted.title).toContain('购买-已下架');
  });

  it('另一个买家只看到自己那一笔（不是 403、也不是别人的单子）', async () => {
    asUser(strangerToken);
    const res = await getPurchases();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { purchases: { itemId: string }[] };
    expect(body.purchases.map((row) => row.itemId)).toEqual([strangerItemId]);
  });

  it('正对照：登录但从没买过的用户 → 200 空列表，不是 404', async () => {
    // 作者本人没买过任何东西（测试里也没让他买自己的）
    asUser(creatorToken);
    const res = await getPurchases();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { purchases: unknown[] }).purchases).toHaveLength(0);
  });
});

describe('§127 与交付门同一口径：已下架条目不再交付', () => {
  it('买家对已下架条目打内容门 → 404 not_found（界面上那颗按钮在这条限度下不出现）', async () => {
    asUser(buyerToken);
    const res = await getContent(
      new Request(`http://test.local/api/marketplace/${delistedItemId}/content`),
      { params: Promise.resolve({ id: delistedItemId }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });
});
