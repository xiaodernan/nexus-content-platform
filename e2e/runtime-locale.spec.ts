import { expect, test, type Page } from '@playwright/test';

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

async function visibleSurfaceText(page: Page, selector: string): Promise<string> {
  return page.evaluate((rootSelector) => {
    const root = document.querySelector(rootSelector);
    if (!root) throw new Error(`Missing surface: ${rootSelector}`);

    const parts: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, [data-locale-toggle], [aria-hidden="true"]')) continue;
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const text = node.textContent?.trim();
      if (text) parts.push(text);
    }

    for (const element of root.querySelectorAll('*')) {
      if (element.closest('script, style, [data-locale-toggle], [aria-hidden="true"]')) continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      for (const attribute of ['aria-label', 'title', 'placeholder', 'alt']) {
        const value = element.getAttribute(attribute)?.trim();
        if (value) parts.push(value);
      }
    }

    return parts.join('\n');
  }, selector);
}

async function expectEnglishOnly(page: Page, selector: string): Promise<void> {
  const text = await visibleSurfaceText(page, selector);
  expect(text.length, `${selector} 必须有可见文案`).toBeGreaterThan(0);
  expect(text.match(CJK), `${selector} 英文面夹了 CJK:\n${text}`).toBeNull();
}

test('真实 /guide：语言切换往返与全站英文壳零 CJK 残留', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.context().addCookies([{
    name: 'NEXUS_LOCALE',
    value: 'zh',
    url: testInfo.project.use.baseURL ?? 'http://127.0.0.1:3100',
  }]);

  const chineseResponse = await page.goto('/guide', { waitUntil: 'domcontentloaded' });
  expect(chineseResponse?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('[data-guide-locale]')).toHaveAttribute('data-guide-locale', 'zh');
  await expect(page.locator('.gd-title')).toContainText('NEXUS 使用指南：从第一个项目到发布与游玩');
  await page.screenshot({ path: testInfo.outputPath('guide-zh.png'), fullPage: true });

  await expect(page.locator('[data-theme-toggle-ready="1"]')).toBeAttached();
  const [localeResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/locale') && response.request().method() === 'POST'),
    page.locator('[data-locale-toggle]').click(),
  ]);
  expect(localeResponse.ok()).toBe(true);
  await page.waitForFunction(() => (
    document.documentElement.lang === 'en'
    && document.querySelector('[data-guide-locale]')?.getAttribute('data-guide-locale') === 'en'
  ));

  await expect(page.locator('.gd-title')).toContainText('The NEXUS guide: from your first project to publishing and play');
  await expect(page.locator('[data-locale-toggle]')).toHaveAttribute('aria-label', 'Switch to Chinese');
  await expectEnglishOnly(page, 'main[data-guide-root]');
  await expectEnglishOnly(page, 'body');
  await page.screenshot({ path: testInfo.outputPath('guide-en.png'), fullPage: true });

  await page.locator('[data-kb-fab]').click();
  await expect(page.locator('[data-kb-sheet]')).toBeVisible();
  await expect(page.locator('.kb-title')).toHaveText('Shortcut cheatsheet');
  await expectEnglishOnly(page, '[data-kb-sheet]');
  await page.screenshot({ path: testInfo.outputPath('shortcuts-en.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-kb-sheet]')).toHaveCount(0);

  await page.keyboard.press('Control+k');
  await expect(page.locator('[data-command-palette-dialog]')).toBeVisible();
  await expect(page.locator('[data-command-palette-row].cp-rowActive')).toHaveCount(1);
  await expectEnglishOnly(page, '[data-command-palette-dialog]');
  await page.screenshot({ path: testInfo.outputPath('command-palette-en.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-command-palette-dialog]')).toHaveCount(0);

  const [backResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/locale') && response.request().method() === 'POST'),
    page.locator('[data-locale-toggle]').click(),
  ]);
  expect(backResponse.ok()).toBe(true);
  await page.waitForFunction(() => (
    document.documentElement.lang === 'zh-CN'
    && document.querySelector('[data-guide-locale]')?.getAttribute('data-guide-locale') === 'zh'
  ));
  await expect(page.locator('.gd-title')).toContainText('NEXUS 使用指南：从第一个项目到发布与游玩');
});
