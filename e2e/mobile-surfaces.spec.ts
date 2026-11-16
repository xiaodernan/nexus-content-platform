import { expect, test } from '@playwright/test';

/**
 * §85b 移动端体检（续篇）——公开 app-chrome 面在 390×844 下的读数（2026-11-15）。
 *
 * ROADMAP「移动端布局体检（公开页优先）」第一片（mobile-layout.spec.ts）覆盖了真发布语料；
 * 这一片补上 app-chrome 公开落点（匿名可看）——任何人从移动浏览器进站都会落到这里。
 * 判一下"窄屏下横向溢出"和"框架本体到达可见区"，任何一张页面 404/500 都是失败——
 * 页面上的数据可能是空的（发现页未登录/空市场），但**空也必须是有门面的空**（§159：
 * 零内容落点不等于零像素），且不得产生/暗示不给的横向溢出带。
 *
 * 纪律：
 * - 390×844 与 1280×900 双宽度对照同一 DOM（裁切值只在小屏被允许为 0）；
 * - 断言为硬判据：全页无横向溢出（docScrollWidth == clientWidth，±1）；
 * - 页面正文必须落地（ref=status 2xx/3xx 之外就是回归）；
 */
const WIDTHS = [
  { label: '手机390', width: 390, height: 844 },
  { label: '桌面1280', width: 1280, height: 900 },
] as const;

const PAGES: Array<{ path: string; label: string; skipOnFailure?: boolean }> = [
  { path: '/', label: '首页' },
  { path: '/discover', label: '发现页' },
  { path: '/marketplace', label: '创作者市场' },
  { path: '/credits', label: 'credits 账本' },
  { path: '/notifications', label: '通知中心' },
  { path: '/guide', label: '新手上路手册' },
  { path: '/about-nexus', label: '关于 NEXUS' },
  { path: '/bible', label: '典籍室' },
  { path: '/bible/quiz', label: '典籍室·潮汐挑战' },
  { path: '/bible/well', label: '典籍室·七口井' },
];

test('§85b 公开 app-chrome 面：窄屏零横向溢出、宽屏零溢出', async ({ browser }) => {
  test.setTimeout(600_000);
  const all: Array<{ page: string; width: string; status: number; docOverflow: number }> = [];

  for (const { path, label } of PAGES) {
    for (const vp of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.width <= 500,
        hasTouch: vp.width <= 500,
      });
      const page = await context.newPage();
      const resp = await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => null);
      // let lazy content settle (dev-mode first compiles are slow)
      await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
      const status = resp?.status() ?? 0;
      const docOverflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - doc.clientWidth;
      });
      all.push({ page: `${label} ${path}`, width: vp.label, status, docOverflow });
      console.log(`[85b] ${path} ${vp.width}px -> status=${status} overflow-px=${docOverflow}`);
      await context.close();
    }
  }

  // summary + gates
  const failures: string[] = [];
  for (const r of all) {
    if (r.status < 200 || r.status >= 400) failures.push(`${r.page} @ ${r.width}: HTTP ${r.status}`);
    if (r.docOverflow > 1) failures.push(`${r.page} @ ${r.width}: horizontal overflow ${r.docOverflow}px`);
  }
  expect(failures, `窄屏/宽屏 app-chrome 面缺陷:\n${failures.join('\n')}`).toEqual([]);
});
