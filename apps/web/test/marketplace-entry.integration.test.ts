import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { GET as listItems, POST as createItem } from '../src/app/api/marketplace/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { createMarketplaceItem } from '../src/server/domain/marketplace';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { marketplaceItems, projects, sessions, users } from '../src/server/db/schema';

/**
 * §127-128 Marketplace 列表与创建两个入口的路由层，打真库。
 *
 * GET 是**公开端点**（连门都没有），此前它的查询参数是"取到就塞进 SQL"：
 * `?limit=abc` 被 parseInt 成 NaN 后 `.limit(NaN)`、`?minPrice=abc` 成 NaN 后进 `gte()`、
 * `?creatorId=not-a-uuid` 直进 `eq()`——Postgres 报 invalid input / 22P02，
 * 任何匿名访客一行坏参数就把列表打成 500。一次坏请求被报成一次服务器故障。
 *
 * POST 此前只校验 itemType/title 的存在性：`priceCredits: -100` 能建出负价商品——
 * 买家白拿（`pricePaid > 0` 才写扣点流水），创作者还被 `settlePurchase` 的
 * `floor(price * 0.7)` 记一条**负**分成，一次购买两头都错；
 * UUID 字段与 tags 原样进库时 22P02 / TEXT[] 错误被 catch 成 400，
 * 还把 Postgres 的报错原文回给了客户端（SECURITY.md §26：错误响应不带内部结构）。
 * 另外 `await req.json()` 在 try 之外——非 JSON 正文直接把请求带崩成 500。
 *
 * 断言全部按**修好后**的行为写：名单外/非整数/非 UUID → 400（`validation_failed`），
 * 负数价格 → 400，坏 JSON → 400，Postgres 原文不再回显。
 * 修前这些用例分别以 500 / 201 / 抛错失败——红的形状就是洞本身。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'c2d4e6f8091a3b5c';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(userId: string): Promise<string> {
  const token = `mktlist-tok-${userId}`;
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

/** 设上作者会话（可选 CSRF 双提交）并返回请求头；token 可换人（限流桶按 user.id 计） */
function authHeaders(token: string, withCsrf = false): Record<string, string> {
  jar.clear();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  jar.set(SESSION_COOKIE, token);
  headers.cookie = `${SESSION_COOKIE}=${token}`;
  if (withCsrf) {
    jar.set(CSRF_COOKIE, CSRF_TOKEN);
    headers[CSRF_HEADER] = CSRF_TOKEN;
  }
  return headers;
}

const listUrl = (query = ''): string => `http://test.local/api/marketplace${query}`;
const createUrl = 'http://test.local/api/marketplace';

const post = (body: unknown, withCsrf = true, token = creatorToken): Promise<Response> =>
  createItem(new Request(createUrl, { method: 'POST', headers: authHeaders(token, withCsrf), body: JSON.stringify(body) }));

let creator: { id: string };
let stranger: { id: string };
let creatorToken: string;
/** 限流用例现场造的专用身份（它的限流桶是满的），清理时一起带走 */
const extraUserIds: string[] = [];
let projectId: string;
let strangerProjectId: string;
let publicItemId: string;

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: '市场-作者', email: `mktlist+creator+${stamp}@nexus.test`, role: 'creator' },
      { displayName: '市场-别人', email: `mktlist+stranger+${stamp}@nexus.test`, role: 'creator' },
    ])
    .returning({ id: users.id });
  creator = rows[0]!;
  stranger = rows[1]!;
  creatorToken = await identityFor(creator.id);

  projectId = (await createProject(creator.id, { name: `市场-作者项目 ${stamp}`, kind: 'website' })).id;
  strangerProjectId = (await createProject(stranger.id, { name: `市场-别人项目 ${stamp}`, kind: 'website' })).id;

  // 一件真公开物品：列表只显示 public/free，草稿默认 private 不在列表里
  const item = await createMarketplaceItem({
    creatorId: creator.id,
    itemType: 'component',
    title: `市场-列表对象 ${stamp}`,
    visibility: 'public',
    priceCredits: 5,
  });
  publicItemId = item.id;
});

afterAll(async () => {
  const db = getDb();
  // 顺序有讲究：projects.owner_id → users 的外键**不是**级联（只有 sessions 与物品是），
  // 先删项目再删用户；物品的 creator_id 级联到用户，跟着用户一起走
  await db.delete(projects).where(inArray(projects.ownerId, [creator.id, stranger.id, ...extraUserIds]));
  await db.delete(users).where(inArray(users.id, [creator.id, stranger.id, ...extraUserIds]));
});

describe('§127 市场列表（GET /api/marketplace，公开端点）', () => {
  it('limit=abc → 400（修前 parseInt 成 NaN 后 .limit(NaN)，Postgres 报 invalid input 变 500）', async () => {
    const res = await listItems(new Request(listUrl('?limit=abc')));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation_failed');
  });

  it('offset=abc → 400（同一个洞：NaN 进 .offset()）', async () => {
    const res = await listItems(new Request(listUrl('?offset=abc')));
    expect(res.status).toBe(400);
  });

  it('minPrice=abc → 400（NaN 进 gte()，修前 500）', async () => {
    const res = await listItems(new Request(listUrl('?minPrice=abc')));
    expect(res.status).toBe(400);
  });

  it('maxPrice=abc → 400（NaN 进 lte，修前 500）', async () => {
    const res = await listItems(new Request(listUrl('?maxPrice=abc')));
    expect(res.status).toBe(400);
  });

  it('creatorId=not-a-uuid → 400（直进 eq() 撞 22P02，修前 500）', async () => {
    const res = await listItems(new Request(listUrl('?creatorId=not-a-uuid')));
    expect(res.status).toBe(400);
  });

  it('itemType 名单外 → 400，不悄悄兜底成"全都要"', async () => {
    const res = await listItems(new Request(listUrl('?itemType=bogus')));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation_failed');
  });

  it('search 超长 → 400（ILIKE 参数化挡得住注入，但没理由收 10MB 的搜索词）', async () => {
    const res = await listItems(new Request(listUrl(`?search=${'x'.repeat(201)}`)));
    expect(res.status).toBe(400);
  });

  it('无参数 → 200：我插进去的公开物品读得回来', async () => {
    const res = await listItems(new Request(listUrl()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string; visibility: string }[] };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.some((item) => item.id === publicItemId)).toBe(true);
  });

  it('itemType=component → 200，过滤真的生效（不是"给我全表"）', async () => {
    const res = await listItems(new Request(listUrl('?itemType=component')));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string; itemType: string }[] };
    expect(body.items.every((item) => item.itemType === 'component')).toBe(true);
    expect(body.items.some((item) => item.id === publicItemId)).toBe(true);
  });

  it('limit=101 → 200（截断到 100，不是拒绝："要 101 条"是合法请求）', async () => {
    const res = await listItems(new Request(listUrl('?limit=101')));
    expect(res.status).toBe(200);
  });
});

describe('§127 市场创建（POST /api/marketplace）', () => {
  it('没有 CSRF → 403 csrf_failed（双提交是第二道防线，不能省）', async () => {
    const res = await post({ itemType: 'component', title: '无 CSRF 的创建' }, false);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('csrf_failed');
  });

  it('非 JSON 正文 → 400（修前 await req.json() 在 try 之外，直接把请求带崩成 500）', async () => {
    const res = await createItem(new Request(createUrl, { method: 'POST', headers: authHeaders(creatorToken, true), body: '这不是 json' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation_failed');
  });

  it('缺 title → 400', async () => {
    const res = await post({ itemType: 'component' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation_failed');
  });

  it('priceCredits=-100 → 400（修前建出负价商品：买家白拿，创作者账被 settle 的负分成抽干）', async () => {
    const res = await post({ itemType: 'component', title: '负价商品', priceCredits: -100 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation_failed');
  });

  it('priceCredits 超过 int4 上限 → 400（修前越界报错被 catch 成 400 并回显 Postgres 原文）', async () => {
    const res = await post({ itemType: 'component', title: '天价商品', priceCredits: 9_999_999_999 });
    expect(res.status).toBe(400);
  });

  it('sourceProjectId 不是 UUID → 400，且不回显 Postgres 的报错原文', async () => {
    const res = await post({ itemType: 'component', title: '坏 UUID 的创建', sourceProjectId: 'not-a-uuid' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_failed');
    // zod 自己的话（"Invalid UUID"）可以出现，Postgres 的内部报错（"invalid input syntax for type uuid"、
    // 22P02、约束名）不行——修前后者会被 catch 成 400 原样回给客户端（SECURITY.md §26）
    expect(JSON.stringify(body)).not.toMatch(/syntax for type|22P02|constraint|violates/i);
  });

  it('tags 不是数组 → 400（修前直进 TEXT[] 列，报错被 catch 成 400）', async () => {
    const res = await post({ itemType: 'component', title: '坏 tags 的创建', tags: '不是数组' });
    expect(res.status).toBe(400);
  });

  it('标题命中红线 → 400（机检照旧，不因为加了 zod 就松掉）', async () => {
    const res = await post({ itemType: 'component', title: 'child nude 未成年色情内容' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('prohibited');
  });

  it('visibility 名单外 → 400', async () => {
    const res = await post({ itemType: 'component', title: '坏可见性的创建', visibility: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('最小合法正文 → 201：落库的是 private 草稿、价格 0', async () => {
    const res = await post({ itemType: 'component', title: '市场-创建最小合法' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { item: { id: string; visibility: string; priceCredits: number } };
    expect(body.item.visibility).toBe('private');
    expect(body.item.priceCredits).toBe(0);
    const [row] = await getDb().select().from(marketplaceItems).where(eq(marketplaceItems.id, body.item.id)).limit(1);
    expect(row!.creatorId).toBe(creator.id);
  });

  it('带自己的 sourceProjectId → 201（归属校验的正常路径照旧通得过）', async () => {
    const res = await post({ itemType: 'template', title: '市场-从自己的项目发布', sourceProjectId: projectId });
    expect(res.status).toBe(201);
  });

  it('带别人的 sourceProjectId → 400（只有项目所有者能从它发布）', async () => {
    const res = await post({ itemType: 'template', title: '市场-从别人的项目发布', sourceProjectId: strangerProjectId });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Only project owner');
  });

  it('同一身份 10 分钟内第 21 次创建 → 429 rate_limited（guest 轮换 cookie 造行的口子堵上）', async () => {
    // 限流桶按 user.id + IP 双键：本文件别的用例已经用掉 creator 的一部分额度，
    // 所以这条用**专用新身份**——它的桶是满的：前 20 次必须放行，第 21 次必须 429。
    // 没有限流时这一条是 201：guest 会话每次未知 token 都会新建 guest 用户，
    // 等于"换 cookie 就能无限造行"，物品行与用户行一起涨
    const db = getDb();
    const stamp = Date.now();
    const [spammer] = await db
      .insert(users)
      .values({ displayName: '市场-限流探针', email: `mktlist+spam+${stamp}@nexus.test`, role: 'creator' })
      .returning({ id: users.id });
    extraUserIds.push(spammer!.id);
    const spammerToken = await identityFor(spammer!.id);

    for (let i = 0; i < 20; i++) {
      const res = await post({ itemType: 'component', title: `限流探针 ${i}` }, true, spammerToken);
      expect(res.status, `第 ${i + 1} 次应当放行`).toBe(201);
    }
    const blocked = await post({ itemType: 'component', title: '限流探针 21' }, true, spammerToken);
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: string; retryAfterMs?: number };
    expect(body.error).toBe('rate_limited');
    expect(body.retryAfterMs).toBeGreaterThan(0);
  });
});
