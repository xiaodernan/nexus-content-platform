import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { POST as purchaseRoute } from '../src/app/api/marketplace/[id]/purchase/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { createMarketplaceItem, detectSuspiciousPatterns } from '../src/server/domain/marketplace';
import { getDb } from '../src/server/db/client';
import {
  marketplaceAuditLog,
  marketplaceItems,
  marketplacePurchases,
  sessions,
  users,
} from '../src/server/db/schema';

/**
 * §123 风控：可疑购买要留下能查的证据（#156）。
 *
 * 此前 `detectSuspiciousPatterns` 只回一个 boolean，路由拿到 true 也只 `console.warn`
 * 一行——窗口一关，"谁在什么时候因为哪条规则被盯上"就没有了。这一片把它改成
 * 「命中了哪几条 + 每条读数」，路由据此写一行 `marketplace_audit_log`
 * （action = `suspicious_purchase`）。购买结果不因此改变：审计是旁证不是业务前提。
 *
 * 另一件如实钉住的事：三条规则里今天只有 24 小时总量够得着。
 * - 同一买家同一物品只有一行（唯一索引 + already_purchased），1 小时重复计数永远 ≤ 1；
 * - 自购在 `purchaseMarketplaceItem` 里先被 own_item 拒绝，走不到检测。
 * 规则本身仍可被直接调用命中（下面有用例），只是 API 路径到不了阈值。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 's1u2s3p4i5c6i7o8';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(userId: string): Promise<string> {
  const token = `mksus-tok-${userId}`;
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

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function postPurchase(itemId: string, token: string): Promise<Response> {
  return purchaseRoute(
    new Request(`http://test.local/api/marketplace/${itemId}/purchase`, {
      method: 'POST',
      headers: asUser(token),
    }),
    ctx(itemId),
  );
}

async function suspiciousRows(itemId: string) {
  return getDb()
    .select()
    .from(marketplaceAuditLog)
    .where(
      and(
        eq(marketplaceAuditLog.action, 'suspicious_purchase'),
        eq(marketplaceAuditLog.itemId, itemId),
      ),
    );
}

const SEED_COUNT = 50;

let creator: { id: string };
let buyer: { id: string };
let control: { id: string };
let buyerToken: string;
let creatorToken: string;
let controlToken: string;
let targetItemId: string;
let controlItemId: string;
const seedItemIds: string[] = [];

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: '风控-作者', email: `mksus+creator+${stamp}@nexus.test`, role: 'creator' },
      { displayName: '风控-买家', email: `mksus+buyer+${stamp}@nexus.test`, role: 'creator' },
      { displayName: '风控-对照', email: `mksus+control+${stamp}@nexus.test`, role: 'creator' },
    ])
    .returning({ id: users.id });
  creator = rows[0]!;
  buyer = rows[1]!;
  control = rows[2]!;
  creatorToken = await identityFor(creator.id);
  buyerToken = await identityFor(buyer.id);
  controlToken = await identityFor(control.id);

  const base = {
    creatorId: creator.id,
    itemType: 'component' as const,
    visibility: 'public' as const,
    priceCredits: 0,
  };
  targetItemId = (await createMarketplaceItem({ ...base, title: `风控-目标 ${stamp}` })).id;
  controlItemId = (await createMarketplaceItem({ ...base, title: `风控-对照单 ${stamp}` })).id;

  // 50 笔 24 小时内的购买：买家下一笔（第 51 笔）越过阈值。种子条目只用于承载购买行。
  const seeded = await db
    .insert(marketplaceItems)
    .values(
      Array.from({ length: SEED_COUNT }, (_, i) => ({
        creatorId: creator.id,
        itemType: 'component' as const,
        title: `风控-种子 ${stamp} ${i}`,
        visibility: 'public' as const,
        priceCredits: 0,
      })),
    )
    .returning({ id: marketplaceItems.id });
  seedItemIds.push(...seeded.map((row) => row.id));
  await db
    .insert(marketplacePurchases)
    .values(seedItemIds.map((itemId) => ({ itemId, buyerId: buyer.id, pricePaid: 0 })));
}, 120_000);

afterAll(async () => {
  const db = getDb();
  // 条目先删：购买行与审计行随 item 外键级联；再删人（会话随用户级联）
  await db
    .delete(marketplaceItems)
    .where(inArray(marketplaceItems.id, [targetItemId, controlItemId, ...seedItemIds]));
  await db.delete(users).where(inArray(users.id, [creator.id, buyer.id, control.id]));
}, 60_000);

describe('§123 风控判定：命中规则与读数', () => {
  it('24 小时恰好 50 笔：还没过阈值，不命中，读数如实是 50', async () => {
    const detection = await detectSuspiciousPatterns(targetItemId, buyer.id);
    expect(detection.fired).toEqual([]);
    expect(detection.counts.purchase_volume_24h).toBe(SEED_COUNT);
  });

  it('对照买家没有购买史：读数为 0，不命中', async () => {
    const detection = await detectSuspiciousPatterns(controlItemId, control.id);
    expect(detection.fired).toEqual([]);
    expect(detection.counts.purchase_volume_24h).toBe(0);
  });

  it('同一买家同一物品的 1 小时计数就是 1 行——重复购买规则够不着阈值 3', async () => {
    const detection = await detectSuspiciousPatterns(seedItemIds[0]!, buyer.id);
    expect(detection.counts.repeat_same_item_1h).toBe(1);
    expect(detection.fired).not.toContain('repeat_same_item_1h');
  });

  it('规则本身没坏：直接拿「作者买自己的」去判，self_purchase 会命中（API 路径先拒绝）', async () => {
    const detection = await detectSuspiciousPatterns(targetItemId, creator.id);
    expect(detection.fired).toContain('self_purchase');
    expect(detection.counts.self_purchase).toBe(1);
  });
});

describe('§123 路由：可疑购买写进审计，购买结果不变', () => {
  it('第 51 笔购买 200，多一行 suspicious_purchase，带规则与读数', async () => {
    const res = await postPurchase(targetItemId, buyerToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pricePaid: number; purchaseId: string };
    expect(body.pricePaid).toBe(0);

    const rows = await suspiciousRows(targetItemId);
    expect(rows, '命中 24 小时总量应写一行审计').toHaveLength(1);
    const metadata = rows[0]!.metadata as { rules?: string[]; counts?: Record<string, number> };
    expect(metadata.rules).toContain('purchase_volume_24h');
    expect(metadata.counts?.purchase_volume_24h).toBe(SEED_COUNT + 1);

    // 正常购买那一行还在：风控行是并存的旁证，不替代交易流水
    const purchaseRows = await getDb()
      .select()
      .from(marketplaceAuditLog)
      .where(
        and(eq(marketplaceAuditLog.action, 'purchase'), eq(marketplaceAuditLog.itemId, targetItemId)),
      );
    expect(purchaseRows).toHaveLength(1);
  });

  it('同一物品再买一次 → 400 already_purchased，可疑行不增加（重复 rule 到不了阈值）', async () => {
    const res = await postPurchase(targetItemId, buyerToken);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: string }).error).toBe('already_purchased');
    expect(await suspiciousRows(targetItemId)).toHaveLength(1);
    const detection = await detectSuspiciousPatterns(targetItemId, buyer.id);
    expect(detection.counts.repeat_same_item_1h).toBe(1);
  });

  it('作者买自己的 → 400 own_item，不写可疑行', async () => {
    const res = await postPurchase(targetItemId, creatorToken);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: string }).error).toBe('own_item');
    expect(await suspiciousRows(targetItemId)).toHaveLength(1);
  });

  it('对照买家（0 笔历史）买另一件 → 200，不写可疑行', async () => {
    const res = await postPurchase(controlItemId, controlToken);
    expect(res.status).toBe(200);
    expect(await suspiciousRows(controlItemId)).toHaveLength(0);
  });
});
