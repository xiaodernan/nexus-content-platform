import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'nexus-guide-reading-v1';
const PROJECT_ID = '123e4567-e89b-12d3-a456-426614174000';

test('真实 /guide：服务端检索、稳定锚点、阅读记录与项目上下文', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.context().addCookies([{
    name: 'NEXUS_LOCALE',
    value: 'zh',
    url: testInfo.project.use.baseURL ?? 'http://127.0.0.1:3100',
  }]);

  await page.goto(`/guide?project=${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-guide-project-link]')).toHaveAttribute('href', `/studio/${PROJECT_ID}`);
  await expect(page.locator('[data-guide-project-input]')).toHaveValue(PROJECT_ID);

  await page.locator('[data-guide-search]').fill('撤销');
  await page.locator('.gd-searchSubmit').click();
  await page.waitForURL((url) => url.searchParams.get('q') === '撤销');
  await expect(page.locator('[data-guide-hit-count]')).toContainText(/找到 [1-9]\d* \/ 14 节/);
  await expect(page.locator('[data-guide-project-input]')).toHaveValue(PROJECT_ID);

  const sections = page.locator('[data-guide-section]');
  const tocLinks = page.locator('[data-guide-toc] a');
  const sectionCount = await sections.count();
  expect(sectionCount).toBeGreaterThan(0);
  await expect(tocLinks).toHaveCount(sectionCount);
  expect(await tocLinks.evaluateAll((links) => links.map((link) => link.getAttribute('href')))).toEqual(
    await sections.evaluateAll((nodes) => nodes.map((node) => `#${node.id}`)),
  );

  await sections.last().scrollIntoViewIfNeeded();
  await expect(page.locator('[data-guide-read-count]')).not.toHaveText('0 / 14 · 0%');
  const beforeReload = await page.locator('[data-guide-read-count]').innerText();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-guide-read-count]')).toHaveText(beforeReload);

  await page.locator('[data-guide-read-reset]').click();
  await expect(page.locator('[data-guide-read-count]')).toHaveText('0 / 14 · 0%');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]'), STORAGE_KEY)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('guide-search-progress.png'), fullPage: true });
});

test('真实 /guide：空结果恢复与非法项目上下文', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.context().addCookies([{
    name: 'NEXUS_LOCALE',
    value: 'zh',
    url: testInfo.project.use.baseURL ?? 'http://127.0.0.1:3100',
  }]);

  await page.goto('/guide?q=definitely-no-such-guide-term&project=not-a-uuid', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-guide-empty]')).toBeVisible();
  await expect(page.locator('[data-guide-project-warning]')).toContainText('不是有效 UUID');
  await expect(page.locator('[data-guide-project-link]')).toHaveCount(0);
  await expect(page.locator('[data-guide-section]')).toHaveCount(0);

  await page.locator('[data-guide-clear-search]').click();
  await page.waitForURL((url) => url.pathname === '/guide' && !url.searchParams.has('q') && !url.searchParams.has('project'));
  await expect(page.locator('[data-guide-section]')).toHaveCount(14);
  await expect(page.locator('[data-guide-hit-count]')).toHaveText('共 14 节');
});

test('真实 /guide：存储不可用时保留本次视口记录并如实提示', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript((key) => {
    const getItem = Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem')!.value as (this: Storage, name: string) => string | null;
    const setItem = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')!.value as (this: Storage, name: string, value: string) => void;
    const removeItem = Object.getOwnPropertyDescriptor(Storage.prototype, 'removeItem')!.value as (this: Storage, name: string) => void;
    Storage.prototype.getItem = function (name: string) {
      if (name === key) throw new DOMException('Storage disabled for test', 'SecurityError');
      return Reflect.apply(getItem, this, [name]);
    };
    Storage.prototype.setItem = function (name: string, value: string) {
      if (name === key) throw new DOMException('Storage disabled for test', 'SecurityError');
      return Reflect.apply(setItem, this, [name, value]);
    };
    Storage.prototype.removeItem = function (name: string) {
      if (name === key) throw new DOMException('Storage disabled for test', 'SecurityError');
      return Reflect.apply(removeItem, this, [name]);
    };
  }, STORAGE_KEY);

  await page.goto('/guide', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-guide-storage-unavailable]')).toBeVisible();
  await expect(page.locator('[data-guide-read-count]')).not.toHaveText('0 / 14 · 0%');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-guide-storage-unavailable]')).toBeVisible();
  await expect(page.locator('[data-guide-read-count]')).not.toHaveText('0 / 14 · 0%');
  await page.screenshot({ path: testInfo.outputPath('guide-storage-unavailable.png'), fullPage: false });
});

test('真实 /guide：窄屏无横向溢出且章节不越界', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/guide', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-guide-section]')).toHaveCount(14);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.locator('[data-guide-section]').evaluateAll((nodes) => nodes.every((node) => {
    const rect = node.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth;
  }))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('guide-mobile.png'), fullPage: true });
});
