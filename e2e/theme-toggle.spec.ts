import { expect, test } from '@playwright/test';

/**
 * §120 主题入口的浏览器见证。
 *
 * 三件事必须一起成立，否则"支持浅色"就只是 tokens.css 里的一堆十六进制：
 * ① 点一下真的换（`data-nexus-theme` + body 的计算底色）；
 * ② 刷新后还记得（显式选择写进 localStorage，首帧脚本读回来）；
 * ③ 没存过时跟随系统（light 系统第一次进来就是浅色）。
 *
 * 点击前等 `data-theme-toggle-ready="1"`：这是 React 真接住事件的屏障，
 * 只等按钮可见会点到"还没水合"的空壳上（本仓 2026-10-28 的固定坑）。
 */
test('§120 主题切换：显式选择覆盖系统偏好、跨刷新记住', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const toggle = page.locator('[data-theme-toggle]');
  await expect(toggle).toHaveAttribute('data-theme-toggle-ready', '1', { timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('data-nexus-theme', 'dark');

  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-nexus-theme', 'light');
  await expect(toggle).toHaveAttribute('data-theme-toggle', 'light');
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(lightBg, '换了属性但底色没跟着翻——浅色没有落到像素上').toBe('rgb(247, 248, 251)');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-nexus-theme', 'light');
  await expect(page.locator('[data-theme-toggle]')).toHaveAttribute('data-theme-toggle-ready', '1', { timeout: 30_000 });

  await page.locator('[data-theme-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-nexus-theme', 'dark');
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(darkBg).toBe('rgb(10, 11, 16)');
  // 首帧脚本会先于 React 改 html 属性；没有 suppressHydrationWarning 时这里会红在 hydration mismatch 上。
  expect(consoleErrors.filter((t) => /hydrat/i.test(t)), consoleErrors.join('\n')).toEqual([]);
});

test('§120 首次访问跟随系统偏好（浅色系统 → 浅色）', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-nexus-theme', 'light');
  await expect(page.locator('[data-theme-toggle]')).toHaveAttribute('data-theme-toggle-ready', '1', { timeout: 30_000 });
});
