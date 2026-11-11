import { expect, test } from '@playwright/test';

/**
 * §FE-4 全平台搜索页的**浏览器那一寸**：没人此刻点开 `/search` 时，它必须真的渲染、
 * 搜索框门面真的可聚焦、结果/空态二选一、控制台零报错。/search 是发现链路的第二个公开入口，
 * 这一寸此前没有判据；FE-4 只动了视觉（`.se-` 类），结构钩子一字未动，这里钉住那条不变式。
 *
 * 全是结构不变式（不依赖库里有哪些作品/用户）：
 * 1. 标题、搜索框、提交键、范围说明都可见；提交键是原生 GET 表单的 submit；
 * 2. 有结果 ⇒ 每条命中是带 href 的链接、分组口径写在页上；无结果/词太短 ⇒ 对应空态可见；
 * 3. "这份搜索没覆盖什么"范围条始终在场（诚实边界不因改版消失）；
 * 4. 全程零 console error（视觉层用了 color-mix/渐变/::before，能在真浏览器里验没有无效样式报错）。
 *
 * 不在判据里：排序/相关性对不对（归 search-relevance.spec.ts 与 domain/search 集成测）、
 * 建议接口返回什么（归 /api/search/suggest 的测试）——不重复断言。
 */
test('@smoke §FE-4 搜索：匿名冷启动——门面、表单、结果/空态二选一与控制台零报错', async ({ page }) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
  });

  await page.goto('/search');
  // 标题（渐变墨字也要能被读到）、搜索框、提交键、范围说明都可见
  await expect(page.locator('[data-search-root]')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('heading', { name: '全平台搜索' })).toBeVisible();
  await expect(page.locator('[data-search-form]')).toBeVisible();
  await expect(page.locator('[data-search-input]')).toBeVisible();
  await expect(page.locator('[data-search-submit]')).toBeVisible();
  await expect(page.locator('[data-search-scope]')).toBeVisible();

  // 搜索框是可聚焦的真实输入（focus 后 activeElement 就是它），提交键属于 GET 表单（没 JS 也能搜）
  await page.locator('[data-search-input]').focus();
  expect(
    await page.locator('[data-search-input]').evaluate((el) => document.activeElement === el),
  ).toBe(true);
  const form = page.locator('[data-search-form]');
  await expect(form).toHaveAttribute('action', '/search');
  await expect(form).toHaveAttribute('method', 'get');

  // 结果/空态二选一：有结果 ⇒ 命中是带 href 的链接 + 排法口径在页上；
  // 否则 ⇒ "至少两个字符"或"没有匹配"其中一个空态可见（空不是坏）。
  const results = page.locator('[data-search-results]');
  if (await results.count()) {
    await expect(page.locator('[data-search-method]')).toBeVisible();
    const hits = page.locator('[data-search-hit]');
    const count = await hits.count();
    if (count > 0) {
      const href = await hits.first().getAttribute('data-search-hit');
      expect(href && href.length > 0).toBe(true);
      await expect(hits.first()).toHaveAttribute('href', /.+/);
    }
  } else {
    const tooShort = page.locator('[data-search-too-short]');
    const empty = page.locator('[data-search-empty]');
    expect((await tooShort.count()) > 0 || (await empty.count()) > 0).toBe(true);
  }

  // 视觉层落地的钩子：渐变压边 header、门面搜索框、边界彩排法条都在 DOM 里
  await expect(page.locator('.se-header')).toBeVisible();
  await expect(page.locator('.se-form')).toBeVisible();
  await expect(page.locator('.se-submit')).toBeVisible();

  expect(consoleErrors, `控制台有报错：\n${consoleErrors.join('\n')}`).toEqual([]);
});

test('@smoke §FE-4 搜索：浅色主题下门面与空态仍成立（零新增 token 的双主题承诺）', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ colorScheme: 'light' });
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
  });

  await page.goto('/search');
  await expect(page.locator('[data-search-root]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.se-header')).toBeVisible();
  await expect(page.locator('.se-form')).toBeVisible();
  await expect(page.locator('.se-submit')).toBeVisible();
  // 渐变墨字标题在浅色下用的是 fg-1 端，必须仍可读（不是把白字写到白底上）
  const titleColor = await page.locator('.se-title').evaluate((el) => getComputedStyle(el).color);
  expect(titleColor).not.toBe('rgb(255, 255, 255)');
  expect(consoleErrors, `浅色下控制台有报错：\n${consoleErrors.join('\n')}`).toEqual([]);
});
