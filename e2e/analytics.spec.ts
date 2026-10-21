import { readFile } from 'node:fs/promises';
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
  // §168 第三片：这条用例**扮演真人**——Playwright 的 navigator.webdriver 恒为 true，
  // 不盖掉的话这个访客会把自己上报成疑似爬虫（服务端把爬虫行排除在"真人曲线"之外），
  // 于是"今天"那格的时长变成 null、被画成"缺数据"——正好与这条用例要证的
  // "缺的那天与有行但为 0 的那天长得不一样"相反。
  // 自动化标记的真身由 studio.spec.ts 的 §168 用例扮演（那一笔 webdriver:true 才是被分类器抓住的样子）。
  await visitorContext.addInitScript(() => {
    Object.defineProperty(Object.getPrototypeOf(navigator), 'webdriver', { get: () => undefined });
  });
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

/**
 * §168 的**导出**在真浏览器里的那一格（2026-10-22）。
 *
 * 集成测证得了服务端算出了那份 CSV，但证不了"页面上点那个链接**真的下一个文件**下来、
 * 而且那个文件里的数字与页面上显示的**是同一份**" ⇒ ⇒ 这一格钉的是那两件事：
 * - 下载真的发生（点下去有一个文件落在磁盘上）；
 * - **BOM 在**（Excel 打开无 BOM 的 UTF-8 中文会乱码 ⇒ 这一格是给人拿去用的）；
 * - 文件里那一行的数与页面上那一格**逐字相同**（两处读的是同一个 domain 函数，§159）。
 */
test('@smoke §168 导出：点那个链接真的下一个 CSV 下来，数字与页面上那一份相同', async ({ page }) => {
  test.setTimeout(300_000);
  const name = `导出作品${Date.now().toString(36)}`;

  await page.goto('/');
  await page.fill('[data-project-name-input]', name);
  await page.click('[data-create-project]');
  await page.waitForURL(/\/studio\/[^/]+$/);
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });

  // 发布一版 ⇒ 才有"发布过的版本"可导
  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-submit]')).toBeVisible();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 30_000 });

  await page.goto('/analytics');
  const link = page.locator('[data-analytics-export]');
  await expect(link).toBeVisible();
  // 页面上那一格的数（导出必须与它是同一份）
  const viewsOnPage = ((await page.locator('[data-analytics-value="views"]').first().textContent()) ?? '').trim();
  const playTimeOnPage = ((await page.locator('[data-analytics-value="play_time"]').first().textContent()) ?? '').trim();

  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const file = await download.path();
  expect(file, '点那个链接没有文件落下来').toBeTruthy();
  const bytes = await readFile(file);
  // BOM：Excel 打开中文不乱码
  expect(bytes[0], '要给 Excel 带 BOM').toBe(0xef);
  expect(bytes[1]).toBe(0xbb);
  expect(bytes[2]).toBe(0xbf);
  const text = new TextDecoder('utf-8').decode(bytes);
  const lines = text.replace(/^\uFEFF/, '').trim().split('\r\n');
  const header = lines[0]!.split(',');
  const row = lines[1]!.split(',');
  const cell = (label: string) => row[header.indexOf(label)]!;
  // 数字与页面上那一份逐字相同（两处读的是同一个 domain 函数）
  expect(cell('打开次数'), '导出里的打开次数与页面上那一份不同').toBe(viewsOnPage);
  // "未采集"在两处是同一件事：页面上写着"未采集"，导出里是**空格子**（不是 0）
  expect(playTimeOnPage, '这一格本来就没有访客现场，页面上该写"未采集"').toContain('未采集');
  expect(cell('累计可见时长毫秒'), '"未采集"在导出里不能变成 0').toBe('');
});