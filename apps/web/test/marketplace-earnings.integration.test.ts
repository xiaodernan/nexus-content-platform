import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { inArray } from 'drizzle-orm';
import { GET as getEarnings } from '../src/app/api/marketplace/earnings/route';
import { POST as purchaseItem } from '../src/app/api/marketplace/[id]/purchase/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { createMarketplaceItem, getCreatorEarnings } from '../src/server/domain/marketplace';
import { getDb } from '../src/server/db/client';
import { sessions, users } from '../src/server/db/schema';

/**
 * §128 创作者收益明细：路由层（GET /api/marketplace/earnings）与域函数
 * （getCreatorEarnings）的第一份覆盖，打真库。
 *
 * 收益是创作者真会看的钱，而这个入口此前**零覆盖**，且路由自己内联重算了一遍聚合
 * （与 domain 的 getCreatorEarnings 同一件事两处实现）。本片把路由收敛到域函数，
 * 并用一次真实的购买（purchase → settle 自动分账）钉住三件事：
 * 1. 分成金额算得对：价格 100、70% 分成 → totalEarned 70 / totalSales 1；
 * 2. **归属**：买家的收益视图必须是空的（分成只记在创作者名下，不能互相看见）；
 * 3. 域函数的日期范围过滤（startDate 在未来 → 空），这是路由调用时用得到的口径。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'e7a9c1d3f5b70921';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(userId: string): Promise<string> {
  const token = `mktearn-tok-${userId}`;
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

function asUser(token: string | null): void {
  jar.clear();
  if (token) jar.set(SESSION_COOKIE, token);
}

let creator: { id: string };
let buyer: { id: string };
let creatorToken: string;
let buyerToken: string;
let itemId: string;

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: '收益-创作者', email: `mktearn+creator+${stamp}@nexus.test`, role: 'creator' },
      { displayName: '收益-买家', email: `mktearn+buyer+${stamp}@nexus.test`, role: 'creator' },
    ])
    .returning({ id: users.id });
  creator = rows[0]!;
  buyer = rows[1]!;
  creatorToken = await identityFor(creator.id);
  buyerToken = await identityFor(buyer.id);

  itemId = (await createMarketplaceItem({ creatorId: creator.id, itemType: 'component', title: `收益-商品 ${stamp}`, visibility: 'public', priceCredits: 100 })).id;
  // 一次真实购买：purchase 路由内部会自动 settle → 创作者得 floor(100 * 0.7) = 70 的分成行。
  // csrfOk 读的是被 mock 的 next/headers（jar）——cookie 必须先进 jar，光放在请求头里不算
  asUser(buyerToken);
  jar.set(CSRF_COOKIE, CSRF_TOKEN);
  const res = await purchaseItem(
    new Request(`http://test.local/api/marketplace/${itemId}/purchase`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CSRF_HEADER]: CSRF_TOKEN },
    }),
    { params: Promise.resolve({ id: itemId }) },
  );
  expect(res.status).toBe(200);
});

afterAll(async () => {
  const db = getDb();
  // 用户级联带走 sessions → purchases → splits；物品跟着创作者走
  await db.delete(users).where(inArray(users.id, [creator.id, buyer.id]));
});

describe('§128 收益明细（路由收敛到 getCreatorEarnings 之后）', () => {
  it('没登录 → 401 unauthenticated（error 装机器码，人话在 message 里）', async () => {
    asUser(null);
    const res = await getEarnings();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthenticated');
    expect(body.message).toBeTruthy();
  });

  it('创作者 → 200：分成金额算得对（价格 100 × 70% = 70，一次销售）', async () => {
    asUser(creatorToken);
    const res = await getEarnings();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { totalEarned: number; totalSales: number; dailyBreakdown: { date: string; totalAmount: number; salesCount: number }[] };
    expect(body.totalEarned).toBe(70);
    expect(body.totalSales).toBe(1);
    expect(body.dailyBreakdown).toHaveLength(1);
    expect(body.dailyBreakdown[0]!.totalAmount).toBe(70);
    expect(body.dailyBreakdown[0]!.salesCount).toBe(1);
    // 日期只钉形状不钉字面（UTC 午夜翻卷的竞态不值得为它引入不确定性）
    expect(body.dailyBreakdown[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('域函数与路由同源：直调 getCreatorEarnings 得到同样的数', async () => {
    const summary = await getCreatorEarnings({ creatorId: creator.id });
    expect(summary.totalEarned).toBe(70);
    expect(summary.totalSales).toBe(1);
    expect(summary.dailyBreakdown).toHaveLength(1);
  });

  it('买家 → 200 但一分没有（分成只记在创作者名下，别人的钱不泄漏）', async () => {
    asUser(buyerToken);
    const res = await getEarnings();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { totalEarned: number; totalSales: number; dailyBreakdown: unknown[] };
    expect(body.totalEarned).toBe(0);
    expect(body.totalSales).toBe(0);
    expect(body.dailyBreakdown).toHaveLength(0);
  });

  it('域函数的日期范围过滤：startDate 在未来 → 空（路由调用时用得到的口径）', async () => {
    const future = new Date(Date.now() + 86_400_000);
    const summary = await getCreatorEarnings({ creatorId: creator.id, startDate: future });
    expect(summary.totalEarned).toBe(0);
    expect(summary.dailyBreakdown).toHaveLength(0);
  });
});
