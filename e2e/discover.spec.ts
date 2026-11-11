import { expect, test } from '@playwright/test';

/**
 * §FE-1 发现页的**浏览器那一寸**：没人此刻点开 `/discover` 时，它必须真的渲染、真的不报错、
 * 排序标签真的能切换。/discover 是平台上游客看到的第一眼东西，这一寸以前没有判据。
 *
 * 判据分三条，全是结构不变式（不依赖库里有哪些作品）：
 * 1. 标题/四个排序标签/搜索入口都可见；
 * 2. 切换排序由 href 驱动、无需确认——"最近最热"那一栏的 `data-discover-method` 必须写出排法；
 * 3. 任意一张卡片都带 `data-discover-card` 属性且 `href` 指向 `/<handle>/<slug>`。
 *    没有作品时（空态）：`data-discover-empty` 可见、标题照旧——空不是坏。
 *
 * 不在判据里：排序次序对不对（归集成层 / `search-relevance.spec.ts`）、哪一部作品在榜首
 * （归 `discover()` 的真库集成测试）——不重复断言。
 */
test('@smoke §FE-1 发现：匿名冷启动——标题、四个排序标签、搜索入口与控制台零报错', async ({ page }) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
  });

  await page.goto('/discover');
  // 标题写在渐变墨字里也好、图里也好——它必须可见、可被读到
  await expect(page.locator('[data-discover-title]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-discover-tabs]')).toBeVisible();
  await expect(page.locator('[data-discover-tab="new"]')).toBeVisible();
  await expect(page.locator('[data-discover-tab="popular"]')).toBeVisible();
  await expect(page.locator('[data-discover-tab="trending"]')).toBeVisible();
  await expect(page.locator('[data-discover-tab="following"]')).toBeVisible();
  // 搜索是一枚可聚焦的 pill，不是一行死字
  await expect(page.locator('[data-search-link]')).toBeVisible();
  await expect(page.locator('[data-search-link]')).toHaveAttribute('href', '/search');

  // 有内容 ⇒ 卡片是链接、带 href、属性齐备；没有内容 ⇒ 空态文案可见
  const cards = page.locator('[data-discover-card]');
  const count = await cards.count();
  if (count > 0) {
    const first = page.locator('[data-discover-card]').first();
    await expect(first.locator('[data-discover-name]')).toBeVisible();
    const href = await first.getAttribute('data-discover-card');
    expect(href?.startsWith('/')).toBe(true);
  } else {
    await expect(page.locator('[data-discover-empty]')).toBeVisible();
  }

  // 切到"最近最热"：href 真的变了、口径写在页上（不是藏在代码里）
  await page.click('[data-discover-tab="trending"]');
  await expect(page).toHaveURL(/sort=trending/, { timeout: 30_000 });
  await expect(page.locator('[data-discover-method]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-current="true"][data-discover-tab="trending"]')).toBeVisible();

  // 切到"关注的作者"：空的页也不报错（未登录看不到关注，但标签必须活着）
  await page.click('[data-discover-tab="following"]');
  await expect(page).toHaveURL(/sort=following/, { timeout: 30_000 });

  expect(consoleErrors, `控制台有报错：\n${consoleErrors.join('\n')}`).toEqual([]);
});
