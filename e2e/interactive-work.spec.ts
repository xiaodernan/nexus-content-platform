import { expect, test, type Page } from '@playwright/test';

/**
 * §167 **互动作品的 completion** 在真浏览器里的那一寸。
 *
 * 集成层证得了"记一次 ⇒ 创作者那边是 1"、"不是终点页记不上"，但它证不了**中间那一段**：
 * 访客真的能在公开设计稿页上点到那个热点吗？点了真的翻页吗？到了终点那一声真的发出去吗？
 * 只有真浏览器量得到——而且这一段只有它量得到。
 *
 * 这一条要钉的是：
 * 1. **热点真的铺在模型说的位置**：`data-interactive-hotspot` 出现，且点它真的翻页（URL 带 `?page=`）；
 * 2. **那一报真的发生了**：网络面板里 `/api/published/work-complete` 是 **200**，
 *    而且 `recorded: true`（不是 duplicate——这个访客此前没走过）；
 * 3. **直接打开终点页不算走通**：另一个访客直达终点页，终点横幅照常出现，但**没有**上报；
 * 4. **创作者那一侧真的多了一个数**：分析页「互动完成」是 1，且旁边游戏那格「通关过」还是 0
 *    ——两个口径各说各的，这一格不是从那一格抄来的。
 *
 * 为什么不重玩 §52 那条链：这条要的是"设计稿的点击跳页走通了"，不是游戏关卡；
 * 设计稿的页与交互直接走平台自己的 PUT 摆出来（ studio 同一份契约），不是假数据。
 *
 * 访客要**扮演真人**：Playwright 的 `navigator.webdriver` 恒为 true，
 * 不盖掉的话这一声上报会被服务端记成爬虫——「互动完成」会是 0，那不是这条用例要证的东西。
 */

const RUN = Date.now().toString(36);

async function register(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.fill('[data-auth-email]', email);
  await page.fill('[data-auth-password]', password);
  await page.click('[data-auth-submit]');
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });
}

async function createProject(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.fill('[data-project-name-input]', name);
  await page.click('[data-create-project]');
  await page.waitForURL(/\/studio\/[^/]+$/);
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  return new URL(page.url()).pathname.split('/').pop()!;
}

/**
 * 把默认那份单页设计稿改成两页互动：首页一个节点点了去「终点页」。
 * 与 `growDocument` 同一条纪律：先离开 Studio 再写（store 里留着旧的那一份，
 * 自动保存在卸载时可能把它盖回去）；新页克隆现有页，手写字面量会缺字段白屏。
 */
async function setInteractiveDocument(page: Page, projectId: string): Promise<string> {
  await page.goto('/');
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'nexus_csrf')?.value ?? '';
  const current = await page.request.get(`/api/projects/${projectId}`);
  expect(current.status(), `读取项目失败：${await current.text()}`).toBe(200);
  interface RawNode {
    id: string;
    children?: string[];
    [key: string]: unknown;
  }
  const doc = (
    (await current.json()) as { document: { pages: { id: string; name: string; rootId: string; nodes: Record<string, RawNode> }[] } }
  ).document;
  const home = doc.pages[0]!;
  const endId = `page-end-${RUN}`;
  const endRootId = `root-end-${RUN}`;
  const end = {
    ...structuredClone(home),
    id: endId,
    name: '终点页',
    rootId: endRootId,
    nodes: {
      [endRootId]: { ...structuredClone(home.nodes[home.rootId]!), id: endRootId, name: '终点', children: [] },
    },
  };
  doc.pages.push(end);
  const nodeId = Object.keys(home.nodes).find((id) => id !== home.rootId);
  if (!nodeId) throw new Error('默认首页里找不到可以挂交互的节点');
  home.nodes[nodeId]!.interactions = [{ id: `i-${RUN}`, trigger: 'click', action: 'navigate', target: endId }];
  const put = await page.request.put(`/api/projects/${projectId}`, {
    headers: { 'x-csrf-token': csrf },
    data: doc,
  });
  expect(put.status(), `写入互动稿失败：${await put.text()}`).toBe(200);
  return endId;
}

test('@smoke §167 互动作品：真点一遍 ⇒ 创作者那边多一个数', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await register(page, `iw+${RUN}@nexus.test`, 'e2e-secret-123');
  const projectId = await createProject(page, `互动作品${RUN}`);
  const endPageId = await setInteractiveDocument(page, projectId);

  // 发布（公开）：发布那一刻钉住这份两页的互动稿
  await page.goto(`/studio/${projectId}`);
  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-submit]')).toBeVisible();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 30_000 });
  const path = (await page.locator('[data-publish-url]').getAttribute('href'))!;

  // 一个**匿名**访客去点：首页有说明、恰好一个热点，点它翻页
  const visitorContext = await browser.newContext();
  await visitorContext.addInitScript(() => {
    Object.defineProperty(Object.getPrototypeOf(navigator), 'webdriver', { get: () => undefined });
  });
  const visitor = await visitorContext.newPage();
  const reported = visitor.waitForResponse(
    (res) => /\/api\/published\/work-complete$/.test(new URL(res.url()).pathname),
    { timeout: 30_000 },
  );
  await visitor.goto(new URL(path, page.url()).href);
  await expect(visitor.locator('[data-interactive-note]')).toBeVisible({ timeout: 30_000 });
  await expect(visitor.locator('[data-interactive-hotspot]')).toHaveCount(1);
  await visitor.locator('[data-interactive-hotspot]').click();

  // 翻页是真的：URL 带上了终点页，终点横幅出现，那一报是 200 且真记上了
  await expect(visitor).toHaveURL(new RegExp(`\\?page=${endPageId}$`));
  await expect(visitor.locator('[data-interactive-end]')).toBeVisible({ timeout: 30_000 });
  const response = await reported;
  expect(response.status(), `那一报没有成功：${await response.text()}`).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, recorded: true });
  await expect(visitor.locator('[data-interactive-end]')).toContainText('记上了');
  await expect(visitor.locator('[data-interactive-end]')).toHaveAttribute('data-interactive-record', 'yes');

  // 另一个访客**直达**终点页：横幅照常出现，但不上报（"发了个链接"不是"走完了"）
  const lurker = await visitorContext.newPage();
  let lurkerReports = 0;
  lurker.on('response', (res) => {
    if (/\/api\/published\/work-complete$/.test(new URL(res.url()).pathname)) lurkerReports += 1;
  });
  await lurker.goto(new URL(`${path}?page=${endPageId}`, page.url()).href);
  await expect(lurker.locator('[data-interactive-end]')).toBeVisible({ timeout: 30_000 });
  await expect(lurker.locator('[data-interactive-end]')).toContainText('不算走通', { timeout: 15_000 });
  await lurker.waitForTimeout(1_500);
  expect(lurkerReports, '直达终点页的访客不该发生上报').toBe(0);

  // 创作者那一侧：「互动完成」是 1，旁边游戏那格「通关过」还是 0——两格各说各的
  await page.goto('/analytics');
  const row = page.locator('[data-analytics-row]').first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.locator('[data-analytics-value="interactive_completed"]')).toHaveText('1');
  await expect(row.locator('[data-analytics-value="interactive_completed"]')).toHaveAttribute('data-analytics-interactive', 'yes');
  await expect(row.locator('[data-analytics-value="completed"]')).toHaveText('0');
});
