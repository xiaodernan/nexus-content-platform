import { expect, test, type Page } from '@playwright/test';
import { createProjectNamed, registerMember } from './support/auth-session';

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
  await registerMember(page, email, password);
}

/** 用首页真实的那个入口建项目（不是直接写库 ⇒ 建出来的是平台自己的项目） */
async function createProject(page: Page, name: string): Promise<void> {
  await createProjectNamed(page, name);
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

/**
 * 格 13 的**浏览器那一寸**：页面上写着的口径真的是六档，而且六档里新增的两档都真的能命中。
 *
 * 集成层能证"排序算对了"，证不了**页面上那句话与代码是同一套**——
 * 一边写六档、一边只有四档，就是拿界面的说法当掩护（§159）。
 * 这一条直接量页面上的那句话。
 */
test('@smoke §165 搜索：页面上的口径真的是六档（含正文与语料库那两档）', async ({ page }) => {
  test.setTimeout(240_000);
  await register(page, `sr6+${RUN}@nexus.test`, 'e2e-secret-123');
  await createProject(page, `六档${RUN}`);

  await page.goto(`/search?q=${encodeURIComponent(`六档${RUN}`)}`);
  await expect(page.locator('[data-search-results]')).toBeVisible({ timeout: 30_000 });

  const method = page.locator('[data-search-method]');
  await expect(method).toContainText('完全一样');
  await expect(method).toContainText('开头');
  await expect(method).toContainText('只在简介/摘要/正文里有');
  await expect(method).toContainText('只在文档正文里有');
  await expect(method).toContainText('只在语料库里');
});
