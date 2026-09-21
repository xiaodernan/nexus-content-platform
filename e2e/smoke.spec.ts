import { expect, test } from '@playwright/test';

test('@smoke home renders the provider readiness panel', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'NEXUS' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Provider 就绪状态' })).toBeVisible();
  // §160：未配置真实 key 时必须出现 DEMO MODE 标识
  await expect(page.locator('[data-demo-mode]')).toHaveText('DEMO MODE');
  await expect(page.getByText('文本 / 设计生成')).toBeVisible();
});
