import { raisePlan } from './support/test-plan';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { createPage } from '@nexus/design-model';
import { POST as workComplete } from '../src/app/api/published/work-complete/route';
import { creatorAnalytics, recordWorkCompletion } from '../src/server/domain/analytics';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { publishProject } from '../src/server/domain/publish';
import { getDb } from '../src/server/db/client';
import { projects, users, workCompletions } from '../src/server/db/schema';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';

/**
 * §167/§168：**互动作品（非游戏）侧的 completion 事件**——访客点着换页走到终点，打真库。
 *
 * 这一格与游戏那条 `game-completion.integration.test.ts` 是并列的两格，不是同一条换名：
 * 判定规则不同（那边看游戏投影的结局段，这边看设计稿快照里"这一页没有下一跳"），
 * 所以这里要单独钉住四件容易说谎的事：
 * 1. **服务端不信客户端**：`pageId` 是客户端填的，但"这一页真的是终点、这一版真的有可走通的
 *    点击流程"只按**发布那一刻钉住的快照**判——静态作品、非终点页都写不进一行；
 * 2. **粒度是"多少人走通过"**：同一个访客再报一次不加一（唯一索引）；
 * 3. **爬虫另计**：可疑的行照收，但不进真人那一格；
 * 4. **两个事件不混**：游戏通关 `completedVisitors` 与互动完成 `interactiveCompleted`
 *    各说各的，一份作品同时有两种也不会互相顶。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const RUN = `s167wc${Date.now().toString(36)}`;
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
    .values({ displayName: `互动作者${RUN}`, email: `wc+${RUN}@nexus.test`, handle: `wc${RUN}` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  await raisePlan(ownerId);
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

interface Flow {
  /** 起点页（有下一跳） */
  homePageId: string;
  /** 终点页（没有下一跳） */
  terminalPageId: string;
}

/** 把这份文档改成"首页点一下就走到 Next 页"：返回两个页 id；`staticDoc` 为真时一动不动 */
async function makeFlow(projectId: string, staticDoc = false): Promise<Flow> {
  const document = (await loadDocument(projectId))!;
  if (staticDoc) {
    return { homePageId: document.pages[0]!.id, terminalPageId: document.pages[0]!.id };
  }
  const next = createPage('终点页');
  document.pages.push(next);
  const home = document.pages[0]!;
  const fromNodeId = Object.keys(home.nodes).find((id) => id !== home.rootId)!;
  home.nodes[fromNodeId]!.interactions = [
    { id: 'i1', trigger: 'click', action: 'navigate', target: next.id },
  ] as never;
  await saveDocument(projectId, document);
  return { homePageId: home.id, terminalPageId: next.id };
}

async function publish(
  visibility: 'public' | 'private' = 'public',
  staticDoc = false,
): Promise<{ publicationId: string; path: string; flow: Flow; interactive: boolean }> {
  const project = await createProject(ownerId, { name: `互动作品${RUN}`, kind: 'website' });
  const flow = await makeFlow(project.id, staticDoc);
  const result = await publishProject(project.id, { visibility, createdById: ownerId });
  if (!result || !result.ok) throw new Error(result && !result.ok ? result.reason : '发布失败');
  return {
    publicationId: result.publication.id,
    path: result.publication.path,
    flow,
    interactive: result.publication.interactive,
  };
}

/** 创作者侧读回来的那一格 */
async function completedOf(path: string): Promise<number> {
  const row = (await creatorAnalytics(ownerId)).find((item) => item.path === path);
  if (!row) throw new Error('库里读不到自己刚发的那一份');
  return row.analytics.interactiveCompleted;
}

function post(body: unknown, withCsrf = true, userAgent: string | null = BROWSER_UA): Promise<Response> {
  jar.clear();
  if (withCsrf) jar.set(CSRF_COOKIE, CSRF_TOKEN);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (withCsrf) headers[CSRF_HEADER] = CSRF_TOKEN;
  // UA 缺省给一个像浏览器的：classifyVisit 的纪律是"UA 为空也算疑似爬虫"
  if (userAgent) headers['user-agent'] = userAgent;
  return workComplete(
    new Request('http://localhost/api/published/work-complete', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
}

describe('§167/§168 互动作品的 completion', () => {
  it('发布时就钉住"这一版能走通"：互动作品 interactive=true，静态作品 false', async () => {
    const flow = await publish();
    expect(flow.interactive, '有可走通点击流程的作品，发布行要标成互动').toBe(true);
    const still = await publish('public', true);
    expect(still.interactive, '静态作品不能被标成互动（分析页那格要显示 — 而不是 0）').toBe(false);
  });

  it('记一次走通 ⇒ "互动完成"是 1，游戏通关仍是 0（两个事件不混）', async () => {
    const { publicationId, path, flow } = await publish();
    const result = await recordWorkCompletion({
      publicationId,
      visitorKey: KEY(1),
      userId: null,
      pageId: flow.terminalPageId,
    });
    expect(result).toBe('recorded');
    expect(await completedOf(path)).toBe(1);
    const row = (await creatorAnalytics(ownerId)).find((item) => item.path === path)!;
    expect(row.analytics.completedVisitors, '互动完成不能顶掉游戏通关那一格').toBe(0);
  });

  it('粒度是"多少人走通过"：同一个人再报一次还是 1，另一个人报才是 2', async () => {
    const { publicationId, path, flow } = await publish();
    await recordWorkCompletion({ publicationId, visitorKey: KEY(2), userId: null, pageId: flow.terminalPageId });
    await recordWorkCompletion({ publicationId, visitorKey: KEY(2), userId: null, pageId: flow.terminalPageId });
    expect(await completedOf(path), '同一个人走通两次不能变成两个人').toBe(1);
    const again = await recordWorkCompletion({
      publicationId,
      visitorKey: KEY(2),
      userId: null,
      pageId: flow.terminalPageId,
    });
    expect(again, '重复上报要明确告诉调用方"没新增"').toBe('duplicate');
    await recordWorkCompletion({ publicationId, visitorKey: KEY(3), userId: null, pageId: flow.terminalPageId });
    expect(await completedOf(path), '换一个人才是多一个').toBe(2);
    const rows = await getDb().select().from(workCompletions).where(eq(workCompletions.publicationId, publicationId));
    expect(rows, '库里的原始行也只有一个/人（不是靠聚合层去重）').toHaveLength(2);
  });

  it('爬虫另计：不算进真人那格，但留得下痕迹', async () => {
    const { publicationId, path, flow } = await publish();
    await recordWorkCompletion({
      publicationId,
      visitorKey: KEY(4),
      userId: null,
      pageId: flow.terminalPageId,
      suspectedBot: true,
    });
    expect(await completedOf(path), '爬虫走通不能算成真人走通').toBe(0);
    const row = (await creatorAnalytics(ownerId)).find((item) => item.path === path)!;
    expect(row.analytics.botInteractiveCompletions, '爬虫的那一格要看得见').toBe(1);
    const rows = await getDb().select().from(workCompletions).where(eq(workCompletions.publicationId, publicationId));
    expect(rows, '可疑的行照样入库：被爬过这件事要有迹可查').toHaveLength(1);
  });

  it('服务端不信客户端：非终点页 / 静态作品的任何页都写不进一行', async () => {
    const { publicationId, path, flow } = await publish();
    // 首页有下一跳 ⇒ 不是终点
    const atHome = await post({ path, visitorKey: KEY(5), pageId: flow.homePageId });
    expect(atHome.status, '有下一跳的页不能算终点').toBe(400);
    expect(await completedOf(path), '被拒的上报一行都不写').toBe(0);

    // 不存在的页同样拒
    const missingPage = await post({ path, visitorKey: KEY(5), pageId: 'no-such-page' });
    expect(missingPage.status).toBe(400);
    expect(await completedOf(path)).toBe(0);

    // 静态作品：哪怕客户端把唯一那一页当终点填进来也不行
    const still = await publish('public', true);
    const staticPost = await post({ path: still.path, visitorKey: KEY(5), pageId: still.flow.homePageId });
    expect(staticPost.status, '没有可走通的流程 ⇒ 任何页都不是互动终点').toBe(400);
    const rows = await getDb().select().from(workCompletions).where(eq(workCompletions.publicationId, publicationId));
    expect(rows).toHaveLength(0);
  });

  it('匿名可写，但 CSRF / key / 路径三道边界都在', async () => {
    const { path, flow } = await publish();

    const noCsrf = await post({ path, visitorKey: KEY(6), pageId: flow.terminalPageId }, false);
    expect(noCsrf.status).toBe(403);
    expect(await completedOf(path), 'CSRF 没过时不能有写入').toBe(0);

    const badKey = await post({ path, visitorKey: 'not-a-key', pageId: flow.terminalPageId });
    expect(badKey.status).toBe(400);
    expect(await completedOf(path)).toBe(0);

    const missing = await post({ path: '/n/nobody/nothing-here', visitorKey: KEY(6), pageId: flow.terminalPageId });
    expect(missing.status).toBe(404);

    const ok = await post({ path, visitorKey: KEY(6), pageId: flow.terminalPageId });
    expect(ok.status).toBe(200);
    expect(await completedOf(path)).toBe(1);

    const again = await post({ path, visitorKey: KEY(6), pageId: flow.terminalPageId });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ ok: true, recorded: false });
    expect(await completedOf(path)).toBe(1);
  });

  it('private 的作品连一行都不写（公开页才有的那一声）', async () => {
    const { publicationId, path, flow } = await publish('private');
    const res = await post({ path, visitorKey: KEY(7), pageId: flow.terminalPageId });
    expect(res.status).toBe(404);
    const rows = await getDb().select().from(workCompletions).where(eq(workCompletions.publicationId, publicationId));
    expect(rows).toHaveLength(0);
  });

  it('没有 UA 的上报按疑似爬虫另计（与访客现场同一条纪律）', async () => {
    const { publicationId, path, flow } = await publish();
    const res = await post({ path, visitorKey: KEY(8), pageId: flow.terminalPageId }, true, null);
    expect(res.status).toBe(200);
    expect(await completedOf(path), '不带 UA 的多半是脚本：不能算成真人走通').toBe(0);
    const row = (await creatorAnalytics(ownerId)).find((item) => item.path === path)!;
    expect(row.analytics.botInteractiveCompletions).toBe(1);
    const rows = await getDb().select().from(workCompletions).where(eq(workCompletions.publicationId, publicationId));
    expect(rows, '可疑的行照样入库').toHaveLength(1);
  });

  it('只有你自己走通过：那串数不能当"有人玩得下去"的证据', async () => {
    const mine = await publish();
    await recordWorkCompletion({
      publicationId: mine.publicationId,
      visitorKey: KEY(9),
      userId: ownerId,
      pageId: mine.flow.terminalPageId,
    });
    const myRow = (await creatorAnalytics(ownerId)).find((item) => item.path === mine.path)!;
    expect(myRow.analytics.interactiveCompleted).toBe(1);
    expect(myRow.analytics.selfInteractiveCompleted, '自己走通没有说出来 ⇒ 这串数会被当成"有人玩得下去"').toBe(
      true,
    );

    const other = await publish();
    await recordWorkCompletion({
      publicationId: other.publicationId,
      visitorKey: KEY(10),
      userId: null,
      pageId: other.flow.terminalPageId,
    });
    const otherRow = (await creatorAnalytics(ownerId)).find((item) => item.path === other.path)!;
    expect(otherRow.analytics.interactiveCompleted).toBe(1);
    expect(otherRow.analytics.selfInteractiveCompleted, '有人真的走通了 ⇒ 不该还说"只有你自己"').toBe(false);
  });

  it('走通与滚动完成度各说各的：没有心跳就没有完成度，不拿完成事件去顶', async () => {
    const { publicationId, path, flow } = await publish();
    await recordWorkCompletion({ publicationId, visitorKey: KEY(11), userId: null, pageId: flow.terminalPageId });
    const row = (await creatorAnalytics(ownerId)).find((item) => item.path === path)!;
    expect(row.analytics.interactiveCompleted).toBe(1);
    expect(row.analytics.completion, '没有访客心跳时完成度是"未采集"（null），不是 100%').toBeNull();
  });
});
