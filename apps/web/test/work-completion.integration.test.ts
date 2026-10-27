import { raisePlan } from './support/test-plan';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { POST as workComplete } from '../src/app/api/published/work-complete/route';
import { creatorAnalytics, recordWorkCompletion } from '../src/server/domain/analytics';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { publishProject } from '../src/server/domain/publish';
import { getDb } from '../src/server/db/client';
import { projects, users, workCompletions } from '../src/server/db/schema';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { createPage } from '@nexus/design-model';

/**
 * §167/§168：**互动作品侧的 completion 事件**（"点着走通了"）打真库。
 *
 * 与游戏那一条（game-completion.integration.test.ts）并列的格子，钉的是它自己的几件事：
 * 1. **判定按钉住的快照**：只有"这一版有可走通的点击流程、且到达的页是终点"才记——
 *    客户端把 pageId 随便填是记不上的；没有互动流程的静态作品连 400 都省不出错处地
 *    （它根本没有终点页）；
 * 2. **粒度是"多少人走通过"**：一人一版一次（唯一索引），重复上报返回 duplicate；
 * 3. **爬虫另计、无 UA 按爬虫**：与访客现场 / 游戏通关同一条纪律；
 * 4. **与游戏通关、滚动完成度各是各的数**：三个来源三张表，混着说就谁也不说了。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const RUN = `s167wc${Date.now().toString(36)}`;
const CSRF_TOKEN = 'b2c3d4e5f607189a';
/** 32 位十六进制的匿名 key（与服务端那一把同格式） */
const KEY = (n: number) => `${n}`.padStart(2, '0').repeat(16);
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

let ownerId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const [owner] = await db
    .insert(users)
    .values({ displayName: `走通作者${RUN}`, email: `wc+${RUN}@nexus.test`, handle: `wc${RUN}` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  await raisePlan(ownerId);
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

/** 把默认那份静态设计稿改成两页互动：首页一个节点点了去「终点页」 */
async function makeInteractive(projectId: string): Promise<string> {
  const document = await loadDocument(projectId);
  if (!document) throw new Error('默认项目读不到设计稿');
  const end = createPage('终点页');
  document.pages.push(end);
  const home = document.pages[0]!;
  const nodeId = Object.keys(home.nodes).find((id) => id !== home.rootId);
  if (!nodeId) throw new Error('默认首页里找不到可以挂交互的节点');
  home.nodes[nodeId]!.interactions = [
    { id: 'i-e2e', trigger: 'click', action: 'navigate', target: end.id },
  ];
  await saveDocument(projectId, document);
  return end.id;
}

async function publish(interactive: boolean, visibility: 'public' | 'private' = 'public') {
  const projectId = (await createProject(ownerId, { name: `${interactive ? '互动' : '静态'}作品${RUN}`, kind: 'website' })).id;
  const endPageId = interactive ? await makeInteractive(projectId) : null;
  const result = await publishProject(projectId, { visibility, createdById: ownerId });
  if (!result || !result.ok) throw new Error(result && !result.ok ? result.reason : '发布失败');
  const homePageId = (await loadDocument(projectId))!.pages[0]!.id;
  return { publicationId: result.publication.id, path: result.publication.path, endPageId, homePageId };
}

function rowOf(path: string) {
  return (async () => {
    const row = (await creatorAnalytics(ownerId)).find((item) => item.path === path);
    if (!row) throw new Error('库里读不到自己刚发的那一份');
    return row;
  })();
}

function post(body: unknown, withCsrf = true, userAgent: string | null = BROWSER_UA): Promise<Response> {
  jar.clear();
  if (withCsrf) jar.set(CSRF_COOKIE, CSRF_TOKEN);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (withCsrf) headers[CSRF_HEADER] = CSRF_TOKEN;
  if (userAgent) headers['user-agent'] = userAgent;
  return workComplete(
    new Request('http://localhost/api/published/work-complete', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
}

describe('§167 互动作品 completion', () => {
  it('发布互动稿 ⇒ interactive 被存进发布行；走到终点记一次 ⇒ 创作者那边是 1', async () => {
    const { publicationId, path, endPageId } = await publish(true);
    const result = await recordWorkCompletion({ publicationId, visitorKey: KEY(1), userId: null, pageId: endPageId! });
    expect(result).toBe('recorded');
    const row = await rowOf(path);
    expect(row.interactive, '发布时没把"有互动流程"存下来 ⇒ 分析页会把这一版显示成「—」').toBe(true);
    expect(row.analytics.interactiveCompleted).toBe(1);
    const [stored] = await getDb().select().from(workCompletions).where(eq(workCompletions.publicationId, publicationId));
    expect(stored!.pageId, '终点页要留得下：分支作品要知道人是从哪一条走到底的').toBe(endPageId);
  });

  it('粒度是"多少人走通过"：同一个人再报一次还是 1，另一个人报才是 2', async () => {
    const { publicationId, path, endPageId } = await publish(true);
    await recordWorkCompletion({ publicationId, visitorKey: KEY(2), userId: null, pageId: endPageId! });
    await recordWorkCompletion({ publicationId, visitorKey: KEY(2), userId: null, pageId: endPageId! });
    expect((await rowOf(path)).analytics.interactiveCompleted, '同一个人走两次不能变成两个人').toBe(1);
    expect(await recordWorkCompletion({ publicationId, visitorKey: KEY(2), userId: null, pageId: endPageId! })).toBe('duplicate');
    await recordWorkCompletion({ publicationId, visitorKey: KEY(3), userId: null, pageId: endPageId! });
    expect((await rowOf(path)).analytics.interactiveCompleted, '换一个人才是多一个').toBe(2);
    const rows = await getDb().select().from(workCompletions).where(eq(workCompletions.publicationId, publicationId));
    expect(rows).toHaveLength(2);
  });

  it('爬虫另计：不算进真人那格，但留得下痕迹', async () => {
    const { publicationId, path, endPageId } = await publish(true);
    await recordWorkCompletion({ publicationId, visitorKey: KEY(4), userId: null, pageId: endPageId!, suspectedBot: true });
    const row = await rowOf(path);
    expect(row.analytics.interactiveCompleted, '爬虫走通不能算成真人走通').toBe(0);
    expect(row.analytics.botInteractiveCompletions, '爬虫的那一格要看得见').toBe(1);
  });

  it('路由边界：CSRF / key / 路径 / 终点判定，四道都在', async () => {
    const { path, endPageId, homePageId } = await publish(true);

    // CSRF 没过 ⇒ 403，不写库
    const noCsrf = await post({ path, visitorKey: KEY(5), pageId: endPageId }, false);
    expect(noCsrf.status).toBe(403);
    expect((await rowOf(path)).analytics.interactiveCompleted).toBe(0);

    // key 不合法 ⇒ 400
    expect((await post({ path, visitorKey: 'not-a-key', pageId: endPageId })).status).toBe(400);

    // 路径不存在 ⇒ 404
    expect((await post({ path: '/n/nobody/nothing-here', visitorKey: KEY(5), pageId: endPageId })).status).toBe(404);

    // pageId 不是终点（首页自己有出路）⇒ 400：客户端说什么都不算，判定只按快照
    const notTerminal = await post({ path, visitorKey: KEY(5), pageId: homePageId });
    expect(notTerminal.status, '首页不是终点页，不能被记成走通').toBe(400);
    expect((await rowOf(path)).analytics.interactiveCompleted).toBe(0);

    // 编一个不存在的 pageId ⇒ 同样 400
    expect((await post({ path, visitorKey: KEY(5), pageId: 'no-such-page' })).status).toBe(400);

    // 匿名（无会话）+ 真终点 ⇒ 200 且记上
    const ok = await post({ path, visitorKey: KEY(5), pageId: endPageId });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, recorded: true });
    expect((await rowOf(path)).analytics.interactiveCompleted).toBe(1);

    // 再报一次 ⇒ 还是 200，但"没新增"要说清楚
    const again = await post({ path, visitorKey: KEY(5), pageId: endPageId });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ ok: true, recorded: false });
    expect((await rowOf(path)).analytics.interactiveCompleted).toBe(1);
  });

  it('静态作品没有终点页 ⇒ 400 连一行都不写；分析行 interactive=false（那一格显示「—」的依据）', async () => {
    const { publicationId, path, homePageId } = await publish(false);
    const res = await post({ path, visitorKey: KEY(6), pageId: homePageId });
    expect(res.status, '没有互动流程的版本根本没有终点页可到达').toBe(400);
    expect(await getDb().select().from(workCompletions).where(eq(workCompletions.publicationId, publicationId))).toHaveLength(0);
    const row = await rowOf(path);
    expect(row.interactive).toBe(false);
    expect(row.analytics.interactiveCompleted).toBe(0);
  });

  it('private 的作品连一行都不写（公开页才有的那一声）', async () => {
    const { publicationId, endPageId } = await publish(true, 'private');
    const res = await post({ path: '/n/x/no-such-slug', visitorKey: KEY(7), pageId: endPageId });
    expect(res.status).toBe(404);
    expect(await getDb().select().from(workCompletions).where(eq(workCompletions.publicationId, publicationId))).toHaveLength(0);
  });

  it('没有 UA 的上报按疑似爬虫另计（与访客现场同一条纪律）', async () => {
    const { path, endPageId } = await publish(true);
    const res = await post({ path, visitorKey: KEY(8), pageId: endPageId }, true, null);
    expect(res.status).toBe(200);
    const row = await rowOf(path);
    expect(row.analytics.interactiveCompleted, '不带 UA 的多半是脚本：不能算成真人走通').toBe(0);
    expect(row.analytics.botInteractiveCompletions).toBe(1);
  });

  it('只有你自己走通过：那串数不能当"有人走得下去"的证据', async () => {
    const mine = await publish(true);
    await recordWorkCompletion({ publicationId: mine.publicationId, visitorKey: KEY(9), userId: ownerId, pageId: mine.endPageId! });
    const myRow = await rowOf(mine.path);
    expect(myRow.analytics.interactiveCompleted).toBe(1);
    expect(myRow.analytics.selfInteractiveCompleted, '自己走通没有说出来 ⇒ 这串数会被当成"有人走得下去"').toBe(true);

    const other = await publish(true);
    await recordWorkCompletion({ publicationId: other.publicationId, visitorKey: KEY(10), userId: null, pageId: other.endPageId! });
    const otherRow = await rowOf(other.path);
    expect(otherRow.analytics.interactiveCompleted).toBe(1);
    expect(otherRow.analytics.selfInteractiveCompleted, '有真人走通 ⇒ 不该还说"只有你自己"').toBe(false);
  });

  it('三个口径各是各的：走通了 ≠ 通关了，完成度仍是"未采集"', async () => {
    const { publicationId, path, endPageId } = await publish(true);
    await recordWorkCompletion({ publicationId, visitorKey: KEY(11), userId: null, pageId: endPageId! });
    const row = await rowOf(path);
    expect(row.analytics.interactiveCompleted).toBe(1);
    expect(row.analytics.completedVisitors, '互动走通不能冒充游戏通关').toBe(0);
    expect(row.analytics.completion, '没有心跳就没有完成度：不能拿走通去顶').toBeNull();
  });
});
