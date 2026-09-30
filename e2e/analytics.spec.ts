import { expect, test } from '@playwright/test';

/**
 * §168 的第二片（按天曲线与跨作品总览）在真浏览器里的那一格。
 *
 * 这一片在库里挑不出毛病、在图上却很容易说谎，所以这里钉的都是**图上**的规则：
 * 窗口是密集的（30 天就是 30 根柱子，不是"有数据的那几天"）、缺的那天与 0 的那天
 * 长得不一样、换窗口真的换柱子数。多天数据造不出来（访客现场由服务端定哪一天），
 * 所以多天那一半的凭证在 `apps/web/test/analytics-trend.integration.test.ts` 里；
 * 这里证的是"这些规则真的走到了屏幕上"。
 *
 * 与 §168 那条 smoke 分开成文件，是因为它证的是另一件事（数采得对不对），
 * 而这一条证的是"窗口怎么画"。两条用例各自独立跑得起来，谁也不依赖谁先跑。
 */

test('@smoke §168 曲线：窗口是密集的，缺的那天在图上看得出来', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const name = `曲线作品${Date.now().toString(36)}`;

  await page.goto('/');
  await page.fill('[data-project-name-input]', name);
  await page.click('[data-create-project]');
  await page.waitForURL(/\/studio\/[^/]+$/);
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });

  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-submit]')).toBeVisible();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 30_000 });
  const path = (await page.locator('[data-publish-url]').getAttribute('href'))!;

  // 一个真访客打开公开页：页面自己上报一次"打开"，于是"今天"这一格有数
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  const opened = visitor.waitForResponse(
    (res) => /\/api\/published\/visit$/.test(new URL(res.url()).pathname) && res.status() === 200,
  );
  await visitor.goto(new URL(path, page.url()).href);
  await expect(visitor.locator('[data-published-frame]')).toBeVisible({ timeout: 30_000 });
  await opened;

  await page.goto('/analytics');
  const trend = page.locator('[data-analytics-trend]');
  await expect(trend).toBeVisible();
  await expect(trend).toContainText('最近 30 天');

  const bars = (series: string) => trend.locator(`[data-analytics-series="${series}"] [data-analytics-bar]`);
  const missing = (series: string) => trend.locator(`[data-analytics-series="${series}"] [data-analytics-bar-state="missing"]`);
  const valued = (series: string) => trend.locator(`[data-analytics-series="${series}"] [data-analytics-bar-state="value"]`);

  // 密集：只采到今天一天，但窗口里必须有 30 根柱子——跳过去会把"这一个月没人来"画成有人来
  await expect(bars('opens')).toHaveCount(30);
  await expect(bars('visitors')).toHaveCount(30);
  await expect(bars('playTimeMs')).toHaveCount(30);
  // 缺数据的那天与"有行但为 0"长得不一样：时长图上 29 根是虚线短柱，只有今天那根是柱子
  await expect(missing('playTimeMs')).toHaveCount(29);
  await expect(valued('playTimeMs')).toHaveCount(1);

  // 窗口口径与今天这一格对得上：1 个人、1 次打开、连续 1 天
  await expect(trend.locator('[data-analytics-window="visitors"]')).toHaveText('1');
  await expect(trend.locator('[data-analytics-window="opens"]')).toHaveText('1');
  await expect(trend.locator('[data-analytics-window="active_days"]')).toHaveText('1');
  await expect(trend.locator('[data-analytics-window="streak"]')).toHaveText('1');
  // 每一格的纵轴上限写在标题右边，可以当场核对（不是一条说不清来历的固定刻度）
  await expect(trend.locator('[data-analytics-series-max="opens"]')).toContainText('1 次');
  await expect(trend.locator('[data-analytics-series-max="visitors"]')).toContainText('1 人');

  await page.screenshot({ path: 'screenshots/analytics-trend-smoke.png', fullPage: true });

  // 换窗口真的换柱子数：7 天就是 7 根，不是只把标题改一下
  await page.goto('/analytics?days=7');
  await expect(trend).toContainText('最近 7 天');
  await expect(bars('opens')).toHaveCount(7);
  await expect(bars('playTimeMs')).toHaveCount(7);
  await expect(missing('playTimeMs')).toHaveCount(6);
  // 同一批数据换了窗口，窗口内的访客还是那 1 个人（窗口变小不会把人变成 0）
  await expect(trend.locator('[data-analytics-window="visitors"]')).toHaveText('1');

  // 没有身份的人看不到任何一条曲线：这一页的图是作者自己的账
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(new URL('/analytics', page.url()).href);
  await expect(anonPage.locator('[data-analytics-denied]')).toBeVisible();
  await expect(anonPage.locator('[data-analytics-series]')).toHaveCount(0);
  await anon.close();
  await visitorContext.close();
});
