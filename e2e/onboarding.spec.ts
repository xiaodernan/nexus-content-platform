import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'nexus-onboarding-done';
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const HREFS = ['/', '/', '/', '/', '/discover', '/ship', '/tidewatch'];

test('真实 /onboarding：七步、正确链接、本地进度、刷新与重置', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.context().addCookies([{
    name: 'NEXUS_LOCALE',
    value: 'zh',
    url: testInfo.project.use.baseURL ?? 'http://127.0.0.1:3100',
  }]);

  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-onboarding-step]')).toHaveCount(7);
  expect(await page.locator('[data-onboarding-cta]').evaluateAll((links) => links.map((link) => link.getAttribute('href')))).toEqual(HREFS);
  await expect(page.locator('[data-onboarding-progress-text]')).toHaveText('0 / 7');

  await page.locator('[data-onboarding-step="think"] [data-onboarding-done]').click();
  await expect(page.locator('[data-onboarding-step="think"] [data-onboarding-done]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-onboarding-progress-text]')).toHaveText('1 / 7');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), STORAGE_KEY)).toEqual({ think: true });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-onboarding-progress-text]')).toHaveText('1 / 7');
  await expect(page.locator('[data-onboarding-step="think"] [data-onboarding-done]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-onboarding-reset]').click();
  await expect(page.locator('[data-onboarding-progress-text]')).toHaveText('0 / 7');
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await page.screenshot({ path: testInfo.outputPath('onboarding-reset.png'), fullPage: true });
});

test('真实 /onboarding：坏本地数据退化为零进度且不崩溃', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ think: 'yes', create: 1, unknown: true }));
  }, STORAGE_KEY);

  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-onboarding-progress-text]')).toHaveText('0 / 7');
  await expect(page.locator('[data-onboarding-step]')).toHaveCount(7);
  await expect(page.locator('[data-onboarding-storage-unavailable]')).toHaveCount(0);
});

test('真实 /onboarding：存储不可用时只保留页面会话进度', async ({ page }, testInfo) => {
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

  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-onboarding-storage-unavailable]')).toBeVisible();
  await page.locator('[data-onboarding-step="think"] [data-onboarding-done]').click();
  await expect(page.locator('[data-onboarding-progress-text]')).toHaveText('1 / 7');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-onboarding-progress-text]')).toHaveText('0 / 7');
  await expect(page.locator('[data-onboarding-storage-unavailable]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('onboarding-storage-unavailable.png'), fullPage: false });
});

test('真实 /onboarding：语言切换、英文纯度与窄屏布局', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addCookies([{
    name: 'NEXUS_LOCALE',
    value: 'zh',
    url: testInfo.project.use.baseURL ?? 'http://127.0.0.1:3100',
  }]);

  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  const [response] = await Promise.all([
    page.waitForResponse((result) => result.url().endsWith('/api/locale') && result.request().method() === 'POST'),
    page.locator('[data-locale-toggle]').click(),
  ]);
  expect(response.ok()).toBe(true);
  await expect(page.locator('[data-onboarding-locale]')).toHaveAttribute('data-onboarding-locale', 'en');
  await expect(page.locator('.obv-title')).toHaveText('From one word to one work: a seven-step onboarding');
  await expect(page.locator('[data-onboarding-step]')).toHaveCount(7);
  const surface = await page.locator('[data-onboarding-root]').evaluate((root) => {
    const values: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, [aria-hidden="true"]')) continue;
      const text = node.textContent?.trim();
      if (text) values.push(text);
    }
    for (const element of root.querySelectorAll('*')) {
      for (const attribute of ['aria-label', 'title', 'placeholder', 'alt']) {
        const value = element.getAttribute(attribute)?.trim();
        if (value) values.push(value);
      }
    }
    return values.join('\n');
  });
  expect(surface.match(CJK), `英文面夹了 CJK:\n${surface}`).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.locator('[data-onboarding-step]').evaluateAll((nodes) => nodes.every((node) => {
    const rect = node.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth;
  }))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('onboarding-mobile-en.png'), fullPage: true });
});
