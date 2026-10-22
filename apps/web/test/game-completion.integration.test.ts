import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { POST as gameComplete } from '../src/app/api/published/game-complete/route';
import { creatorAnalytics, recordGameCompletion } from '../src/server/domain/analytics';
import { createProject } from '../src/server/domain/projects';
import { publishProject } from '../src/server/domain/publish';
import { getDb } from '../src/server/db/client';
import { gameCompletions, projects, users } from '../src/server/db/schema';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';

/**
 * §168：**游戏侧的 completion 事件**（"玩到了结局"）打真库。
 *
 * 这一格要钉的是四件事，每一件都是"少一道就会说谎"的那种：
 * 1. **粒度是"多少人通关过"，不是"通关了几次"**：同一个人再报一次不加一
 *    （唯一索引），另一个人报才算多一个 ⇒ 界面上那句话必须跟着这个粒度走；
 * 2. **爬虫另计**：可疑的行照收（"被爬过"要留得下痕迹），但不算进真人那格；
 * 3. **匿名可写，但三道边界都在**：CSRF 双提交、visitorKey 的形状、路径必须真的公开
 *    ⇒ private 的作品连一行都不写；
 * 4. **不与页面的滚动完成度混为一谈**：那是另一张表、另一个口径（这里只证"没混"）。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const RUN = `s168gc${Date.now().toString(36)}`;
const CSRF_TOKEN = 'a1b2c3d4e5f60718';
/** 32 位十六进制的匿名 key（与服务端那一把同格式） */
const KEY = (n: number) => `${n}`.padStart(2, '0').repeat(16);
/** 一个像浏览器的 UA（不能命中 classifyVisit 的名单） */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

let ownerId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const [owner] = await db
    .insert(users)
    .values({ displayName: `通关作者${RUN}`, email: `gc+${RUN}@nexus.test`, handle: `gc${RUN}` })
    .returning({ id: users.id });
  ownerId = owner!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

async function publish(visibility: 'public' | 'private' = 'public'): Promise<{ publicationId: string; path: string }> {
  const projectId = (await createProject(ownerId, { name: `通关作品${RUN}`, kind: 'website' })).id;
  const result = await publishProject(projectId, { visibility, createdById: ownerId });
  if (!result || !result.ok) throw new Error(result && !result.ok ? result.reason : '发布失败');
  return { publicationId: result.publication.id, path: result.publication.path };
}

/** 创作者侧读回来的那一格 */
async function completedOf(path: string): Promise<number> {
  const row = (await creatorAnalytics(ownerId)).find((item) => item.path === path);
  if (!row) throw new Error('库里读不到自己刚发的那一份');
  return row.analytics.completedVisitors;
}

function post(body: unknown, withCsrf = true, userAgent: string | null = BROWSER_UA): Promise<Response> {
  jar.clear();
  if (withCsrf) jar.set(CSRF_COOKIE, CSRF_TOKEN);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (withCsrf) headers[CSRF_HEADER] = CSRF_TOKEN;
  // UA 缺省给一个像浏览器的：classifyVisit 的纪律是"UA 为空也算疑似爬虫"
  // （浏览器一定带 UA，不带的多半是脚本）⇒ 不带 UA 的请求会落进爬虫那格，
  // 那条纪律由下面单独一条用例钉住。
  if (userAgent) headers['user-agent'] = userAgent;
  return gameComplete(
    new Request('http://localhost/api/published/game-complete', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
}

describe('§168 游戏侧 completion', () => {
  it('记一次通关 ⇒ 创作者那边"通关过"是 1（页面上那一格不是别的数）', async () => {
    const { publicationId, path } = await publish();
    const result = await recordGameCompletion({ publicationId, visitorKey: KEY(1), userId: null });
    expect(result).toBe('recorded');
    expect(await completedOf(path)).toBe(1);
  });

  it('粒度是"多少人通关过"：同一个人再报一次还是 1，另一个人报才是 2', async () => {
    const { publicationId, path } = await publish();
    await recordGameCompletion({ publicationId, visitorKey: KEY(2), userId: null });
    await recordGameCompletion({ publicationId, visitorKey: KEY(2), userId: null });
    expect(await completedOf(path), '同一个人通关两次不能变成两个人').toBe(1);
    const again = await recordGameCompletion({ publicationId, visitorKey: KEY(2), userId: null });
    expect(again, '重复上报要明确告诉调用方"没新增"').toBe('duplicate');
    await recordGameCompletion({ publicationId, visitorKey: KEY(3), userId: null });
    expect(await completedOf(path), '换一个人才是多一个').toBe(2);
    // 库里的原始行也只有一个（不是靠聚合层去重）
    const rows = await getDb().select().from(gameCompletions).where(eq(gameCompletions.publicationId, publicationId));
    expect(rows).toHaveLength(2);
  });

  it('爬虫另计：不算进真人那格，但留得下痕迹', async () => {
    const { publicationId, path } = await publish();
    await recordGameCompletion({ publicationId, visitorKey: KEY(4), userId: null, suspectedBot: true });
    expect(await completedOf(path), '爬虫通关不能算成真人通关').toBe(0);
    const row = (await creatorAnalytics(ownerId)).find((item) => item.path === path)!;
    expect(row.analytics.botCompletions, '爬虫的那一格要看得见').toBe(1);
    const rows = await getDb().select().from(gameCompletions).where(eq(gameCompletions.publicationId, publicationId));
    expect(rows, '可疑的行照样入库：被爬过这件事要有迹可查').toHaveLength(1);
  });

  it('匿名可写：没有会话也能报，但 CSRF / key / 路径三道边界都在', async () => {
    const { path } = await publish();

    // CSRF 没过 ⇒ 一次库都不碰
    const noCsrf = await post({ path, visitorKey: KEY(5) }, false);
    expect(noCsrf.status).toBe(403);
    expect(await completedOf(path), 'CSRF 没过时不能有写入').toBe(0);

    // key 不合法 ⇒ 400
    const badKey = await post({ path, visitorKey: 'not-a-key' });
    expect(badKey.status).toBe(400);
    expect(await completedOf(path)).toBe(0);

    // 路径不存在 ⇒ 404
    const missing = await post({ path: '/n/nobody/nothing-here', visitorKey: KEY(5) });
    expect(missing.status).toBe(404);

    // 匿名（无会话 cookie）上报 ⇒ 200 且真的记上了
    const ok = await post({ path, visitorKey: KEY(5) });
    expect(ok.status).toBe(200);
    expect(await completedOf(path)).toBe(1);

    // 再报一次 ⇒ 还是 200，但"没新增"要说清楚
    const again = await post({ path, visitorKey: KEY(5) });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ ok: true, recorded: false });
    expect(await completedOf(path)).toBe(1);
  });

  it('private 的作品连一行都不写（公开可玩页才有的那一声）', async () => {
    const { publicationId } = await publish('private');
    const res = await post({ path: `/n/${'x'}/${'y'}`, visitorKey: KEY(6) });
    expect(res.status).toBe(404);
    const rows = await getDb().select().from(gameCompletions).where(eq(gameCompletions.publicationId, publicationId));
    expect(rows).toHaveLength(0);
  });

  it('没有 UA 的上报按疑似爬虫另计（与访客现场同一条纪律）', async () => {
    const { publicationId, path } = await publish();
    const res = await post({ path, visitorKey: KEY(8) }, true, null);
    expect(res.status).toBe(200);
    expect(await completedOf(path), '不带 UA 的多半是脚本：不能算成真人通关').toBe(0);
    const row = (await creatorAnalytics(ownerId)).find((item) => item.path === path)!;
    expect(row.analytics.botCompletions).toBe(1);
    const rows = await getDb().select().from(gameCompletions).where(eq(gameCompletions.publicationId, publicationId));
    expect(rows, '可疑的行照样入库').toHaveLength(1);
  });

  it('不与页面的滚动完成度混为一谈：通关的那一格与完成度各说各的', async () => {
    const { publicationId, path } = await publish();
    await recordGameCompletion({ publicationId, visitorKey: KEY(7), userId: null });
    const row = (await creatorAnalytics(ownerId)).find((item) => item.path === path)!;
    // 通关了，但这一版**没有任何访客现场** ⇒ 完成度是"未采集"（null），不是 0
    expect(row.analytics.completedVisitors).toBe(1);
    expect(row.analytics.completion, '没有心跳就没有完成度：不能拿通关去顶').toBeNull();
  });

  it('只有你自己通关过：那串数不能当"有人玩得下去"的证据（与"只有你自己看过"同一句纪律）', async () => {
    // 作者自己玩通关 ⇒ 真人通关人数是 1，但"只有你自己通关过"必须说出来
    const mine = await publish();
    await recordGameCompletion({ publicationId: mine.publicationId, visitorKey: KEY(8), userId: ownerId });
    const myRow = (await creatorAnalytics(ownerId)).find((item) => item.path === mine.path)!;
    expect(myRow.analytics.completedVisitors).toBe(1);
    expect(myRow.analytics.selfCompleted, '自己通关没有说出来 ⇒ 这串数会被当成"有人玩得下去"').toBe(true);

    // 另一个人（匿名）通关 ⇒ 那句提醒就不该出现
    const other = await publish();
    await recordGameCompletion({ publicationId: other.publicationId, visitorKey: KEY(9), userId: null });
    const otherRow = (await creatorAnalytics(ownerId)).find((item) => item.path === other.path)!;
    expect(otherRow.analytics.completedVisitors).toBe(1);
    expect(otherRow.analytics.selfCompleted, '有人真的玩通了 ⇒ 不该还说"只有你自己"').toBe(false);
  });
});
