import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { GET as downloadContent } from '../src/app/api/marketplace/[id]/content/route';
import { SESSION_COOKIE } from '../src/server/domain/session';
import {
  MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR,
  createMarketplaceItem,
  purchaseMarketplaceItem,
} from '../src/server/domain/marketplace';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { marketplaceAuditLog, marketplaceItems, projects, sessions, users } from '../src/server/db/schema';
import { getRateLimiter } from '../src/server/security/rateLimit';

/**
 * §127-128 内容交付门（`GET /api/marketplace/[id]/content`）的第一份路由级覆盖，打真库。
 *
 * 这一格此前**一条用例都没有**，而它是界面上「下载（N）」那个数字唯一的写入方。
 * 域层 `buildProjectExport` 有 export.integration.test.ts 钉着包里有什么；这里钉的是**门**：
 * 谁能拿到包、拿不到时库里留不留痕、以及那条「先建包、建成了才记数」的顺序。
 *
 * 顺序这一条是本轮修掉的洞。修复前 `incrementDownloadCount` 排在 `buildProjectExport` 之前，
 * 于是三条失败路径（没有源项目 / 项目已删 / 导出抛错）照样让数字变大——
 * 界面上「下载（N）」印的其实是"被人点过 N 次"；而 #120 之前的第二条门
 * （`POST /[id]/download`，只记数不交付）已随界面改走交付门一并删掉。
 * 下面「失败路径一行都不写」那两条就是它的凭证：把 +1 挪回建包之前，它们全红。
 *
 * 顺带钉住的三件：
 * - **买家拿得到包**：`buildProjectExport` 的归属门判的是"项目在谁名下"，
 *   所以建包必须以**创作者**身份走；早先写的是 `user?.id ?? creatorId`，
 *   那等于"只有作者自己能下载自己上架的东西"，买家扣了点数永远 404（购买那一条是它唯一的凭证）。
 * - **中文标题不许把交付炸掉**：HTTP 头的值是 ByteString（latin1），把中文塞进 `filename`
 *   会在**构造响应**时抛 TypeError——这一格改之前，标题是中文的条目每次下载都 500，
 *   而且计数已经写了。修法照 §144 导出门：ASCII 兜底名 + RFC 5987 的 `filename*`。
 * - **限流按 条目 + IP，且门在授权与读库之前**：连 401 也吃配额。
 *   去掉 `getRateLimiter().hit(...)` 那一截，最后两条用例红。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(userId: string): Promise<string> {
  const token = `mktcontent-tok-${userId}`;
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

/** 身份走 cookie jar（Route Handler 里的 `cookies()` 是被 mock 的那一份），IP 走请求头 */
function asUser(token: string | null, ip = '203.0.113.10'): Record<string, string> {
  jar.clear();
  if (token) jar.set(SESSION_COOKIE, token);
  return { 'x-forwarded-for': ip };
}

const contentUrl = (id: string): string => `http://test.local/api/marketplace/${id}/content`;

const hit = (itemId: string, headers: Record<string, string>): Promise<Response> =>
  downloadContent(new Request(contentUrl(itemId), { headers }), { params: Promise.resolve({ id: itemId }) });

const countOf = async (itemId: string): Promise<number | null> => {
  const [row] = await getDb()
    .select({ c: marketplaceItems.downloadCount })
    .from(marketplaceItems)
    .where(eq(marketplaceItems.id, itemId));
  return row?.c ?? null;
};

const downloadRows = async (itemId: string) =>
  getDb()
    .select({ actorId: marketplaceAuditLog.actorId, metadata: marketplaceAuditLog.metadata })
    .from(marketplaceAuditLog)
    .where(and(eq(marketplaceAuditLog.action, 'download'), eq(marketplaceAuditLog.itemId, itemId)));

/** zip 的本地文件头魔数 `PK`：断言前两字节是"真给了一个包"最便宜的反谎 */
const magic = async (res: Response): Promise<string> =>
  Buffer.from(await res.arrayBuffer())
    .subarray(0, 2)
    .toString('latin1');

const WEB_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? listSourceFiles(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });

let creator: { id: string };
let buyer: { id: string };
let creatorToken: string;
let buyerToken: string;
let projectId: string;
let deadProjectId: string;

let freeItem: string;
let paidItem: string;
let noSourceItem: string;
let deadSourceItem: string;
let floodItem: string;
let gateItem: string;

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: `交付-作者${stamp}`, email: `mktc+creator+${stamp}@nexus.test`, role: 'creator' },
      { displayName: `交付-买家${stamp}`, email: `mktc+buyer+${stamp}@nexus.test`, role: 'creator' },
    ])
    .returning({ id: users.id });
  creator = rows[0]!;
  buyer = rows[1]!;
  creatorToken = await identityFor(creator.id);
  buyerToken = await identityFor(buyer.id);

  projectId = (await createProject(creator.id, { name: `交付-作品${stamp}`, kind: 'website' })).id;
  deadProjectId = (await createProject(creator.id, { name: `交付-已删作品${stamp}`, kind: 'website' })).id;

  // 标题里带引号与空格：顺带钉住 Content-Disposition 的消毒（没消毒就能从引号里挣出去）
  freeItem = (
    await createMarketplaceItem({
      creatorId: creator.id,
      itemType: 'template',
      title: '交付 "带引号" 免费包',
      visibility: 'free',
      sourceProjectId: projectId,
    })
  ).id;
  paidItem = (
    await createMarketplaceItem({
      creatorId: creator.id,
      itemType: 'template',
      title: '交付-在售包',
      visibility: 'public',
      priceCredits: 5,
      sourceProjectId: projectId,
    })
  ).id;
  noSourceItem = (
    await createMarketplaceItem({ creatorId: creator.id, itemType: 'component', title: '交付-无源', visibility: 'free' })
  ).id;
  deadSourceItem = (
    await createMarketplaceItem({
      creatorId: creator.id,
      itemType: 'template',
      title: '交付-源已删',
      visibility: 'free',
      sourceProjectId: deadProjectId,
    })
  ).id;
  floodItem = (
    await createMarketplaceItem({
      creatorId: creator.id,
      itemType: 'template',
      title: '交付-限流洪水',
      visibility: 'free',
      sourceProjectId: projectId,
    })
  ).id;
  gateItem = (
    await createMarketplaceItem({
      creatorId: creator.id,
      itemType: 'template',
      title: '交付-限流门序',
      visibility: 'public',
      priceCredits: 5,
      sourceProjectId: projectId,
    })
  ).id;

  // 上架之后才软删源项目：那条路是"东西还在架上，作者先把作品注销了"
  await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, deadProjectId));
  // 装配要给足时间：两个身份 + 两整份文档 + 六个条目 + 一次软删，冷启动时 30s 挡过一道
  // （hook 超时不是"这次没跑成"——后台那段还在插行，afterAll 会撞在插到一半的 projects 外键上）
}, 120_000);

afterAll(async () => {
  if (!creator) return; // 装配没成功就没有属于这一片的行可清
  const db = getDb();
  // 物品外键会带走购买与审计行；projects 对 owner 是 restrict，得先摘掉作品。
  // **买家留着不删**：那次购买在 `credit_ledger` 写了一行扣点，而账本只追加（DELETE 被触发器挡），
  // 删他会级联到账本 → 清理整条失败。这是账本该有的样子，不是这里的疏漏。
  await db.delete(marketplaceItems).where(eq(marketplaceItems.creatorId, creator.id));
  await db.delete(projects).where(eq(projects.ownerId, creator.id));
  await db.delete(users).where(eq(users.id, creator.id));
}, 60_000);

describe('§127 免费物品的交付：真给了一个包，数字才动', () => {
  it('匿名下载免费物品 → 200 + zip 魔数 + 计数 0→1 + 不留审计行（没有身份可记）', async () => {
    expect(await countOf(freeItem)).toBe(0);
    const res = await hit(freeItem, asUser(null));
    expect(res.status).toBe(200);
    expect(await magic(res)).toBe('PK');
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(await countOf(freeItem)).toBe(1);
    // actor_id 是非空列：匿名那次交付在审计里根本不存在（界面上念的是同一句限度）
    expect(await downloadRows(freeItem)).toHaveLength(0);
  });

  it('文件名走 §144 那一套：中文标题不许把头构造炸掉，真名从 filename* 回来', async () => {
    const res = await hit(freeItem, asUser(null));
    expect(res.status, '修复前：filename 里塞中文，构造 NextResponse 直接抛 TypeError → 每次交付都 500').toBe(200);
    const cd = res.headers.get('content-disposition')!;
    // 头的值是 ByteString（latin1）：这一句把"整个头没有非 ASCII"钉成一条断言
    expect([...cd].every((ch) => ch.charCodeAt(0) < 128), cd).toBe(true);
    const ascii = cd.match(/filename="([^"]*)"/)![1]!;
    const utf = cd.match(/filename\*=UTF-8''([^;]*)/)![1]!;
    expect(ascii).toBe('nexus-marketplace.zip');
    expect(decodeURIComponent(utf)).toBe('交付 "带引号" 免费包.zip');

    const latin = (
      await createMarketplaceItem({
        creatorId: creator.id,
        itemType: 'template',
        title: 'Delivery Kit "v2"',
        visibility: 'free',
        sourceProjectId: projectId,
      })
    ).id;
    const cd2 = (await hit(latin, asUser(null))).headers.get('content-disposition')!;
    expect(cd2.match(/filename="([^"]*)"/)![1]).toBe('Delivery_Kit_v2.zip');
    expect(decodeURIComponent(cd2.match(/filename\*=UTF-8''([^;]*)/)![1]!)).toBe('Delivery Kit "v2".zip');
  });

  it('已下架的物品 → 404 not_found，一次交付都没发生就不计数', async () => {
    const item = (
      await createMarketplaceItem({
        creatorId: creator.id,
        itemType: 'template',
        title: '交付-下架包',
        visibility: 'free',
        sourceProjectId: projectId,
      })
    ).id;
    await getDb().update(marketplaceItems).set({ deletedAt: new Date() }).where(eq(marketplaceItems.id, item));
    const res = await hit(item, asUser(creatorToken));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
    expect(await countOf(item)).toBe(0);
  });

  it('形状不对的 id → 404（不是 22P02 翻成的 500），与 update/delete 两道门同一口径', async () => {
    const res = await downloadContent(new Request(contentUrl('not-a-uuid'), { headers: asUser(null) }), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });
});

describe('§127 在售物品的门：买过才给包，给的那一刻才计数', () => {
  it('匿名 → 401 unauthorized，计数与审计都不动', async () => {
    const res = await hit(paidItem, asUser(null));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
    expect(await countOf(paidItem)).toBe(0);
    expect(await downloadRows(paidItem)).toHaveLength(0);
  });

  it('登录但没买过 → 403 not_purchased，计数不动', async () => {
    const res = await hit(paidItem, asUser(buyerToken));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('not_purchased');
    expect(await countOf(paidItem)).toBe(0);
  });

  it('买过之后 → 200 + 计数 +1 + 一条 download 审计（isCreator:false）', async () => {
    // 建包以创作者身份走 §144 的归属门，买家不需要是项目 owner——这一条是那件事唯一的凭证：
    // 早先用 `user?.id` 时，这里是 404 export_failed
    await purchaseMarketplaceItem({ itemId: paidItem, buyerId: buyer.id });
    const res = await hit(paidItem, asUser(buyerToken));
    expect(res.status, '买过的人拿不到包，交付这一格就没存在过').toBe(200);
    expect(await magic(res)).toBe('PK');
    expect(await countOf(paidItem)).toBe(1);

    const rows = await downloadRows(paidItem);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorId).toBe(buyer.id);
    expect(rows[0]!.metadata).toEqual({ isCreator: false });
  });

  it('创作者本人不必买自己的东西 → 200，审计记 isCreator:true', async () => {
    const res = await hit(paidItem, asUser(creatorToken));
    expect(res.status).toBe(200);
    expect(await countOf(paidItem)).toBe(2);
    const rows = await downloadRows(paidItem);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => (r.metadata as { isCreator: boolean }).isCreator).sort()).toEqual([false, true]);
  });
});

describe('§127 失败路径一行都不写（把 +1 挪回建包之前，这两条就红）', () => {
  it('没有源项目的条目 → 404 no_source，计数不动', async () => {
    const res = await hit(noSourceItem, asUser(null));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('no_source');
    expect(await countOf(noSourceItem)).toBe(0);
  });

  it('源项目已软删 → 404 export_failed，计数与审计都不动', async () => {
    const res = await hit(deadSourceItem, asUser(creatorToken));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('export_failed');
    expect(await countOf(deadSourceItem)).toBe(0);
    expect(await downloadRows(deadSourceItem)).toHaveLength(0);
  });
});

describe('§127 限流：按 条目 + IP，且门在授权与读库之前', () => {
  it(`一个 IP 对一个条目打满 ${MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR} 次后，第 ${MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR + 1} 次 429，数字停在上限`, async () => {
    getRateLimiter().reset();
    const statuses: number[] = [];
    for (let i = 0; i < MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR; i += 1) {
      statuses.push((await hit(floodItem, asUser(null))).status);
    }
    expect(statuses.every((s) => s === 200), `放行的那 ${MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR} 次里出现了非 200`).toBe(true);

    const over = await hit(floodItem, asUser(null));
    expect(over.status).toBe(429);
    const body = (await over.json()) as { error: string; retryAfterMs: number };
    expect(body.error).toBe('rate_limited');
    expect(body.retryAfterMs).toBeGreaterThan(0);

    // 数字 = 真交付过的次数，一次不多：被 429 挡掉的那次没写进去
    expect(await countOf(floodItem)).toBe(MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR);
  }, 120_000);

  it('未登录的 401 也吃配额（门在授权之前）；换 IP 就换桶', async () => {
    getRateLimiter().reset();
    const seen: number[] = [];
    for (let i = 0; i < MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR; i += 1) {
      seen.push((await hit(gateItem, asUser(null, '198.51.100.7'))).status);
    }
    expect(seen.every((s) => s === 401), `匿名打在售物品应该是 401，实际是 ${[...new Set(seen)].join('/')}`).toBe(true);

    const blocked = await hit(gateItem, asUser(null, '198.51.100.7'));
    expect(blocked.status).toBe(429);
    expect(await countOf(gateItem)).toBe(0);

    // 另一个人打同一个条目：桶按 IP 分，他不该继承别人的额度
    const fresh = await hit(gateItem, asUser(null, '192.0.2.99'));
    expect(fresh.status).toBe(401);
  }, 60_000);
});

describe('§127 结构性门：那个数字只有一个写入方', () => {
  it('`incrementDownloadCount(` 在 apps/web/src 的生产代码里恰好两处：域层的定义 + 交付门的调用', () => {
    // 只看生产文件：src 里也有域层单测（`marketplace.test.ts`）会提到这个名字，
    // 而这一格要钉的是"谁能动那个数字"，不是"谁读过它"
    const sites = listSourceFiles(WEB_SRC)
      .filter((file) => !/\.(test|spec)\.[tm]sx?$/.test(file))
      .map((file) => ({
        file: relative(WEB_SRC, file),
        calls: readFileSync(file, 'utf8').split('incrementDownloadCount(').length - 1,
      }))
      .filter((s) => s.calls > 0)
      .sort((a, b) => a.file.localeCompare(b.file));
    expect(sites).toEqual([
      { file: join('app', 'api', 'marketplace', '[id]', 'content', 'route.ts'), calls: 1 },
      { file: join('server', 'domain', 'marketplace.ts'), calls: 1 },
    ]);
  });

  it('只记数不交付的那条门（`POST /[id]/download`）确实在树里消失了', () => {
    expect(existsSync(join(WEB_SRC, 'app', 'api', 'marketplace', '[id]', 'download', 'route.ts'))).toBe(false);
  });
});
