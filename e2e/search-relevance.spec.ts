import { expect, test, type Page } from '@playwright/test';

/**
 * §165 搜索的**浏览器那一寸**（ADR-0056）：相关度排序在真页面上真的按那四档排。
 *
 * 集成层证得了"标题完全一样的那条排在最前"，但它证不了**页面上看到的就是那个次序**：
 * 界面上的排序可能来自别处（CSS order、另一次查询、缓存），只有浏览器量得到。
 *
 * 这一条要钉的是：
 * 1. **口径写在页面上**（`data-search-method`）：藏起来的序会被读成"平台公认最相关"；
 * 2. **次序真的是相关度的次序**：把"标题完全一样"的那条**先**建（⇒ 它更旧），
 *    "标题以搜索词开头"的那条**后**建（⇒ 它更新）⇒
 *    **按更新时间排的话次序正好相反** ⇒ 页面上的次序若与建的时间无关，才算真的在按相关度排。
 *
 * 为什么用项目这一组：它在首页就能建（走真实界面），而且"名字"就是标题 ⇒
 * "标题完全一样"这一档说得清。
 */

const RUN = Date.now().toString(36);
const TOKEN = `样板${RUN}`;

async function register(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.fill('[data-auth-email]', email);
  await page.fill('[data-auth-password]', password);
  await page.click('[data-auth-submit]');
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });
}

/** 用首页真实的那个入口建项目（不是直接写库 ⇒ 建出来的是平台自己的项目） */
async function createProject(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.fill('[data-project-name-input]', name);
  await page.click('[data-create-project]');
  await page.waitForURL(/\/studio\/[^/]+$/);
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
}

test('@smoke §165 搜索：相关度排在更新时间前面（标题完全一样的那条在最前）', async ({ page }) => {
  test.setTimeout(240_000);
  await register(page, `sr+${RUN}@nexus.test`, 'e2e-secret-123');

  // 先建"标题完全一样"的那条 ⇒ 它更旧；后建"以搜索词开头"的那条 ⇒ 它更新
  await createProject(page, TOKEN);
  await createProject(page, `${TOKEN}续篇`);

  await page.goto(`/search?q=${encodeURIComponent(TOKEN)}`);
  await expect(page.locator('[data-search-results]')).toBeVisible({ timeout: 30_000 });

  // 口径写在页面上（不是藏在代码里）
  await expect(page.locator('[data-search-method]')).toContainText('完全一样');

  const titles = await page.locator('[data-search-group="projects"] [data-search-hit-title]').allTextContents();
  const exactAt = titles.indexOf(TOKEN);
  const prefixAt = titles.indexOf(`${TOKEN}续篇`);
  expect(exactAt, `搜索结果里没有那条项目：${JSON.stringify(titles)}`).toBeGreaterThanOrEqual(0);
  expect(prefixAt, `搜索结果里没有那条项目：${JSON.stringify(titles)}`).toBeGreaterThanOrEqual(0);
  expect(
    exactAt,
    `标题与搜索词完全一样的那条要排在前面（它建得更早，按时间排会在后面）：${JSON.stringify(titles)}`,
  ).toBeLessThan(prefixAt);
});
