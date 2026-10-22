import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { GET as getAuditLog } from '../src/app/api/admin/marketplace/audit/route';
import { GET as getReports, POST as fileReport } from '../src/app/api/admin/marketplace/reports/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { auditMarketplaceAction, createMarketplaceItem } from '../src/server/domain/marketplace';
import { getDb } from '../src/server/db/client';
import { marketplaceAuditLog, marketplaceReports, sessions, users } from '../src/server/db/schema';

/**
 * §123 Marketplace 审计日志与举报的两个入口：`GET /api/admin/marketplace/audit`、
 * `GET|POST /api/admin/marketplace/reports`，打真库。
 *
 * 这两个端点此前零路由层覆盖（域函数 `getAuditLog` / `getReports` / `flagSuspiciousActivity`
 * 各有单测，但门、查询参数的翻译、状态码都没有人钉）。横向对比别处的门（复核台、访问账）
 * 露出三处真洞，这一片就是钉住它们：
 *
 * 1. **门用错了会话函数**：三个处理函数调 `requireUser()`——没有 cookie 时它**抛错**
 *    （uncaught → 500），别处的门（访问账 / 复核台）用 `currentUserOrNull()`，没有会话
 *    时老老实实回 401 JSON。同一句"没登录"，一个 500 一个 401。
 * 2. **查询参数直塞进 SQL**：`?limit=abc` 被 `parseInt` 成 NaN 后 `.limit(NaN)`，
 *    `?itemId=not-a-uuid` 直进 `eq(item_id, ...)`——Postgres 报 22P02 / NaN，
 *    被 catch 成 500「查询失败」。一次坏查询参数被报成一次服务器故障。
 * 3. **举报正文不校验**：`reason` 是 CHECK 约束列（fraud/spam/copyright/inappropriate/other），
 *    `itemId` 是 UUID 外键列。正文里这两个值原样进库：名单外的 reason 撞 CHECK（23514），
 *    非 UUID 或"合法 UUID 但物品不存在"撞 22P02 / 外键（23503）——全部 500。
 *
 * 修法与别处同口径：zod 校验查询与正文 → 名单外 400；物品不存在 → 404；
 * NaN / 非 UUID 不再有到达数据库的机会。断言全部按**修好后**的行为写，
 * 所以这一片先红（500 / 抛错），修完才绿——红的形状就是这三处洞本身。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'b7c1d93a55e21084';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(userId: string): Promise<string> {
  const token = `mkt-tok-${userId}`;
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

/** 设上会话（可选 CSRF）并返回请求头；GET 只需要会话，POST 还要双提交 token */
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

const auditUrl = (query = ''): string => `http://test.local/api/admin/marketplace/audit${query}`;
const reportsUrl = (query = ''): string => `http://test.local/api/admin/marketplace/reports${query}`;

let admin: { id: string };
let creator: { id: string };
let adminToken: string;
let creatorToken: string;
let itemId: string;
/** 时间窗与动作筛选用另一件物品：同一物品上已有"精确值"那条用例（按 itemId 找第一行），别让新行挤掉它 */
let windowItemId: string;

/** 三个固定时刻：不动 Date.now，时间窗断言才不会由跑测试的时刻决定 */
const T_OLD = new Date('2026-01-01T00:00:00.000Z');
const T_MID = new Date('2026-06-01T00:00:00.000Z');
const T_NEW = new Date('2026-12-01T00:00:00.000Z');

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: '市场-审核员', email: `mkt+admin+${stamp}@nexus.test`, role: 'admin' },
      { displayName: '市场-作者', email: `mkt+creator+${stamp}@nexus.test`, role: 'creator' },
    ])
    .returning({ id: users.id });
  admin = rows[0]!;
  creator = rows[1]!;
  adminToken = await identityFor(admin.id);
  creatorToken = await identityFor(creator.id);

  // 审计行挂在一件真物品上：action 列有 CHECK、item_id 是 UUID 外键，
  // 插入时就按线上会发生的形状造，别在测试里绕开约束（绕开了约束，500 那条就复现不出来）
  const item = await createMarketplaceItem({ creatorId: creator.id, itemType: 'component', title: `市场-审计对象 ${stamp}` });
  itemId = item.id;
  await auditMarketplaceAction({
    actorId: admin.id,
    action: 'purchase',
    itemId,
    metadata: { priceCredits: 42, buyer: creator.id },
  });

  // 第二件物品：三行固定时刻的审计，覆盖 §123/#156 写入的 suspicious_purchase 与时间窗右端
  const windowItem = await createMarketplaceItem({ creatorId: creator.id, itemType: 'component', title: `市场-时间窗 ${stamp}` });
  windowItemId = windowItem.id;
  await db.insert(marketplaceAuditLog).values([
    { actorId: admin.id, action: 'purchase', itemId: windowItemId, occurredAt: T_OLD, metadata: {} },
    {
      actorId: admin.id,
      action: 'suspicious_purchase',
      itemId: windowItemId,
      occurredAt: T_MID,
      metadata: { rules: ['purchase_volume_24h'], counts: { purchase_volume_24h: 51 } },
    },
    { actorId: admin.id, action: 'purchase', itemId: windowItemId, occurredAt: T_NEW, metadata: {} },
  ]);
});

afterAll(async () => {
  const db = getDb();
  // 用户级联带走 sessions → items → audit/reports（三张表的外键都 ON DELETE CASCADE）
  await db.delete(users).where(inArray(users.id, [admin.id, creator.id]));
});

describe('§123 市场审计日志入口（GET /api/admin/marketplace/audit）', () => {
  it('没登录 → 401（修好后走 currentUserOrNull；修前 requireUser 抛错）', async () => {
    const res = await getAuditLog(new Request(auditUrl()));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthenticated');
  });

  it('非 admin → 403，一行日志都不给', async () => {
    asUser(creatorToken);
    const res = await getAuditLog(new Request(auditUrl()));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
    expect(body.message).toContain('role=admin');
  });

  it('admin → 200：我那一行按精确值读得回来', async () => {
    asUser(adminToken);
    const res = await getAuditLog(new Request(auditUrl()));
    expect(res.status).toBe(200);
    const rows = (await res.json()) as { itemId: string; actorId: string; action: string; metadata: { priceCredits?: number } }[];
    expect(Array.isArray(rows)).toBe(true);
    const mine = rows.find((row) => row.itemId === itemId);
    expect(mine, '插进去的审计行必须读得到').toBeTruthy();
    expect(mine!.actorId).toBe(admin.id);
    expect(mine!.action).toBe('purchase');
    expect(mine!.metadata.priceCredits).toBe(42);
  });

  it('itemId 过滤只回我的行', async () => {
    asUser(adminToken);
    const res = await getAuditLog(new Request(auditUrl(`?itemId=${itemId}`)));
    expect(res.status).toBe(200);
    const rows = (await res.json()) as { itemId: string }[];
    expect(rows.every((row) => row.itemId === itemId)).toBe(true);
    expect(rows.some((row) => row.itemId === itemId)).toBe(true);
  });

  it('action 名单外 → 400，不悄悄按"没有这个 action"兜底成空数组', async () => {
    asUser(adminToken);
    const res = await getAuditLog(new Request(auditUrl('?action=steal-everything')));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation_failed');
  });

  it('itemId 不是 UUID → 400（修前直进 eq()，Postgres 报 22P02 变 500）', async () => {
    asUser(adminToken);
    const res = await getAuditLog(new Request(auditUrl('?itemId=not-a-uuid')));
    expect(res.status).toBe(400);
  });

  it('limit=abc → 400（修前 parseInt 成 NaN 后 .limit(NaN)，报 invalid input 变 500）', async () => {
    asUser(adminToken);
    const res = await getAuditLog(new Request(auditUrl('?limit=abc')));
    expect(res.status).toBe(400);
  });

  it('offset=-1 → 400（负数偏移没有意义，也不该让数据库报错）', async () => {
    asUser(adminToken);
    const res = await getAuditLog(new Request(auditUrl('?offset=-1')));
    expect(res.status).toBe(400);
  });

  it('startDate 不是日期 → 400（修前 new Date("garbage") 变成 Invalid Date 进 gte()）', async () => {
    asUser(adminToken);
    const res = await getAuditLog(new Request(auditUrl('?startDate=not-a-date')));
    expect(res.status).toBe(400);
  });
});

describe('§123/#157 审计查询的动作名单与时间窗', () => {
  interface WindowRow {
    action: string;
    occurredAt: string;
    metadata: { rules?: string[]; counts?: { purchase_volume_24h?: number } };
  }

  const windowAuditUrl = (query: string): string => auditUrl(`?itemId=${windowItemId}${query}`);

  it('action=suspicious_purchase（#156 真写入的那个动作）→ 200 且筛得回它', async () => {
    asUser(adminToken);
    const res = await getAuditLog(new Request(windowAuditUrl('&action=suspicious_purchase')));
    expect(res.status, '新动作不在路由那张手抄名单里时这里是 400').toBe(200);
    const rows = (await res.json()) as WindowRow[];
    expect(rows.map((row) => row.action)).toEqual(['suspicious_purchase']);
    expect(rows[0]!.metadata.counts?.purchase_volume_24h).toBe(51);
  });

  it('action=purchase 不会把 suspicious_purchase 顺带回来（筛的是值，不是"有 action 就行"）', async () => {
    asUser(adminToken);
    const res = await getAuditLog(new Request(windowAuditUrl('&action=purchase')));
    expect(res.status).toBe(200);
    const rows = (await res.json()) as WindowRow[];
    expect(rows.map((row) => row.action)).toEqual(['purchase', 'purchase']);
  });

  it('endDate 是右端闭区间：这一刻及以前回来，晚于它的行不回来', async () => {
    asUser(adminToken);
    // 对照先证明这件物品确实有三行——否则「只回两行」可能只是 itemId 打错
    const all = await getAuditLog(new Request(windowAuditUrl('')));
    expect(all.status).toBe(200);
    expect(((await all.json()) as WindowRow[]).length).toBe(3);

    const res = await getAuditLog(
      new Request(windowAuditUrl(`&endDate=${encodeURIComponent('2026-06-01T00:00:00.000Z')}`)),
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as WindowRow[];
    expect(rows.map((row) => row.occurredAt)).toEqual([T_MID.toISOString(), T_OLD.toISOString()]);
    expect(rows.some((row) => row.occurredAt === T_NEW.toISOString())).toBe(false);
  });

  it('startDate + endDate 围出中间那一行', async () => {
    asUser(adminToken);
    const res = await getAuditLog(
      new Request(
        windowAuditUrl(
          `&startDate=${encodeURIComponent('2026-05-01T00:00:00.000Z')}&endDate=${encodeURIComponent('2026-07-01T00:00:00.000Z')}`,
        ),
      ),
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as WindowRow[];
    expect(rows.map((row) => row.action)).toEqual(['suspicious_purchase']);
  });
});

describe('§123 市场举报查询入口（GET /api/admin/marketplace/reports）', () => {
  it('门同审计：没登录 401、非 admin 403、admin 200', async () => {
    // 先清罐：上一个 describe 最后一句留的是 admin 会话，不清就变成"带着 admin 测没登录"
    asUser(null);
    expect((await getReports(new Request(reportsUrl()))).status).toBe(401);
    asUser(creatorToken);
    const denied = await getReports(new Request(reportsUrl()));
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe('forbidden');
    asUser(adminToken);
    const ok = await getReports(new Request(reportsUrl()));
    expect(ok.status).toBe(200);
    expect(Array.isArray(await ok.json())).toBe(true);
  });

  it('status 名单外 → 400，不悄悄兜底', async () => {
    const res = await getReports(new Request(reportsUrl('?status=not-a-status')));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation_failed');
  });

  it('status=pending 过滤后每一行都是 pending（过滤真的生效，不是"给我全表"）', async () => {
    const res = await getReports(new Request(reportsUrl('?status=pending')));
    expect(res.status).toBe(200);
    const rows = (await res.json()) as { status: string }[];
    expect(rows.every((row) => row.status === 'pending')).toBe(true);
  });

  it('limit=abc → 400（与审计入口同一处洞）', async () => {
    const res = await getReports(new Request(reportsUrl('?limit=abc')));
    expect(res.status).toBe(400);
  });
});

describe('§123 举报提交入口（POST /api/admin/marketplace/reports）', () => {
  const post = (body: unknown, headers: Record<string, string>): Promise<Response> =>
    fileReport(new Request(reportsUrl(), { method: 'POST', headers, body: JSON.stringify(body) }));

  it('没登录 → 401（修前 requireUser 抛错）', async () => {
    const res = await post({ itemId, reason: 'spam' }, asUser(null, true));
    expect(res.status).toBe(401);
  });

  it('举报不是管理员权力：任何登录用户 + CSRF 都能提交', async () => {
    const res = await post({ itemId, reason: 'spam', description: '看着像刷量' }, asUser(creatorToken, true));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { reportId: string };
    expect(body.reportId).toBeTruthy();
    // 落库的形状：举报人、原因、初始状态都是待处理
    const [row] = await getDb().select().from(marketplaceReports).where(eq(marketplaceReports.id, body.reportId)).limit(1);
    expect(row!.reporterId).toBe(creator.id);
    expect(row!.itemId).toBe(itemId);
    expect(row!.reason).toBe('spam');
    expect(row!.status).toBe('pending');
  });

  it('缺 reason → 400', async () => {
    const res = await post({ itemId }, asUser(creatorToken, true));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation_failed');
  });

  it('reason 名单外 → 400（修前原样进库撞 CHECK 23514，被 catch 成 500）', async () => {
    const res = await post({ itemId, reason: 'because-i-said-so' }, asUser(creatorToken, true));
    expect(res.status).toBe(400);
  });

  it('itemId 不是 UUID → 400（修前 22P02 → 500）', async () => {
    const res = await post({ itemId: 'not-a-uuid', reason: 'spam' }, asUser(creatorToken, true));
    expect(res.status).toBe(400);
  });

  it('物品不存在（合法 UUID）→ 404（修前撞外键 23503 → 500）', async () => {
    const res = await post({ itemId: '00000000-0000-4000-8000-000000000009', reason: 'spam' }, asUser(creatorToken, true));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('item_not_found');
  });

  it('同一人对同一物品重复举报 → 409（幂等：库里 UNIQUE(reporter_id, item_id) 挡着）', async () => {
    const res = await post({ itemId, reason: 'spam' }, asUser(creatorToken, true));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; reportId: string };
    expect(body.error).toContain('已经举报过');
    expect(body.reportId).toBeTruthy();
  });

  it('没有 CSRF → 403 csrf_failed（双提交是第二道防线，不能省）', async () => {
    const res = await post({ itemId, reason: 'spam' }, asUser(creatorToken, false));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('csrf_failed');
  });

  it('description 超长 → 400（正文进的是 TEXT 列，但没理由替攻击者存 10MB）', async () => {
    const res = await post({ itemId, reason: 'spam', description: 'x'.repeat(2000) }, asUser(creatorToken, true));
    expect(res.status).toBe(400);
  });

  it('GET 按 itemId 过滤只回我这条（过滤真的生效，不是"给我全表"）', async () => {
    asUser(adminToken);
    const res = await getReports(new Request(reportsUrl(`?itemId=${itemId}`)));
    expect(res.status).toBe(200);
    const rows = (await res.json()) as { itemId: string }[];
    expect(rows.every((row) => row.itemId === itemId)).toBe(true);
    expect(rows.some((row) => row.itemId === itemId)).toBe(true);
  });
});
