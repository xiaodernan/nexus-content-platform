import { expect, test } from '@playwright/test';

/**
 * §165 搜索建议的 429（ADR-0075）：限流时界面必须**看得见**地停一下。
 *
 * 三条承诺：
 * 1. 429 之后出现可读的暂停提示（role=status），而不是把建议默默藏起来——
 *    "藏起来"与"这个词没有命中"在用户眼里是同一件事。
 * 2. 暂停期内继续键入**不再发请求**（限流是为了少打服务端，不是让客户端空转）。
 * 3. 暂停到期自己恢复：不要求用户再敲一个键才知道可以继续。
 *
 * 用 route 拦截喂一个 2 秒的 429，不依赖真限流窗口，也不占限流名额。
 */

test('@smoke §165 建议 429：提示可见、暂停期不再请求、到期自动恢复', async ({ page }) => {
  test.setTimeout(120_000);
  let suggestRequests = 0;
  let mode: 'rate-limited' | 'empty' = 'rate-limited';

  await page.route('**/api/search/suggest**', async (route) => {
    suggestRequests += 1;
    if (mode === 'rate-limited') {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'too_many_requests', retryAfterMs: 2000 }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions: [] }) });
  });

  await page.goto('/search');
  const input = page.locator('[data-search-input]');
  await expect(input).toBeVisible({ timeout: 30_000 });

  await input.fill('mvsj0rjc');
  const pause = page.locator('[data-search-suggest-pause]');
  await expect(pause, '429 之后应当有一句看得见的暂停说明').toBeVisible({ timeout: 30_000 });
  await expect(pause).toHaveAttribute('role', 'status');
  await expect(pause).toContainText('建议暂停');
  await expect(page.locator('[data-search-suggest]'), '限流时不该假装"没有建议"还能列出旧列表').toHaveCount(0);
  await expect(input).toHaveAttribute('aria-expanded', 'false');

  // 暂停期内继续键入：请求数不应该跟着涨
  const before = suggestRequests;
  await input.fill('mvsj0rjc1');
  await page.waitForTimeout(400);
  await input.fill('mvsj0rjc12');
  await page.waitForTimeout(700);
  expect(suggestRequests, '暂停期内继续打字不应再发建议请求').toBe(before);

  // 到期自动恢复：提示消失，下一次键入重新请求
  mode = 'empty';
  await expect(pause, '暂停到期后提示应当自己消失').toHaveCount(0, { timeout: 10_000 });
  await input.fill('mvsj0rjc123');
  await expect.poll(() => suggestRequests, { timeout: 10_000 }).toBeGreaterThan(before);
});
