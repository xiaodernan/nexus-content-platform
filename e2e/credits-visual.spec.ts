import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * §FE-16 credits 页 `/credits` `.cr-` 门面——**浏览器那一寸**（setContent 离线注入，不访问任何 URL）。
 *
 * credits 页是 server component 且两条渲染分支（anonymous / logged-in），所以样本结构手写为**已登录 +
 * 空表**一支（余额表 + 档位表 + 20 行账本空态 + 档位对比），结构标签、data-* 钩子、class 一律照搬产物
 * `page.tsx` 的真字节（不发明任何东西）——drift（真的渲染逻辑与门面脱节）靠
 * `apps/web/test/credits-visual-style.test.ts` 的剥 className SHA256 钉死。
 *
 * 验什么（静态门覆盖不了、"必须真 Chromium"的那一寸）：
 *  1. 深/浅双主题下账本正负语义色真上屏：`.cr-deltaNeg`=danger-ink、`.cr-deltaPos`=accent-2-ink，
 *     两两不同且都是 tokens.css 里真声明的 token 值（不是本地 hex）；
 *  2. 48rem 断点真分档：≤767px `cr-balanceGrid`=2 列、≥768px=4 列（`.cr-balanceGrid` 的
 *     `@media (min-width: 48rem)` 真生效，不是靠塌类猜的）；
 *  3. `.cr-*` 段与 tokens.css 真注入后页面真渲染、诚实空态在、零 console error；
 *  4. `.cr-backlink` 的 `:focus-visible` 描边真生效（键盘 Tab 可达，不是只 hover）；
 *  5. 四类余额卡片的 bg-2 与页面 bg-0 可辨（色阶表面真用上，不是同一个底）。
 *
 * 静态那一寸（类名闭环/零 hex/token/钩子/零 behavior/响应式断点/**作摘要恒等哈希**）归
 * `apps/web/test/credits-visual-style.test.ts`。
 */
const GLOBALS = join(process.cwd(), 'apps/web/src/app/globals.css');
const TOKENS = join(process.cwd(), 'apps/web/src/styles/tokens.css');

/** 去 globals.css 注释后提取 `.cr-` 段（到下一个 `-- §FE-15` 段注释标记为止）。 */
function extractCrSegment(css: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = clean.search(/\.cr-[A-Za-z]/);
  if (start < 0) throw new Error('globals.css 找不到 .cr- 段——FE-16 没落地');
  const tail = clean.slice(start);
  const nextMark = tail.search(/-- §FE-15|\.tc-[A-Za-z]/);
  return nextMark >= 0 ? tail.slice(0, nextMark) : tail;
}

const cssSrc = readFileSync(GLOBALS, 'utf8');
const tokensCss = readFileSync(TOKENS, 'utf8');
const crCss = extractCrSegment(cssSrc);

/** 手写样本：已登录 + 空账本 + 完整档位表 + 四类余额卡 + cr-* 类名原样。 */
const SAMPLE = `
<main class="cr-page">
  <header class="cr-head">
    <h1 class="cr-title">额度与消费</h1>
    <p class="cr-lede" data-credits-whose> Guest Creator（guest@nexus.test）· 当前档位 <b data-credits-plan="free">Free</b> · 本月 2026-11 </p>
  </header>
  <section class="cr-section">
    <h2 class="cr-h2">四类余额</h2>
    <ul class="cr-balanceGrid">
      <li class="cr-balanceCard"><p class="cr-balanceLabel">AI</p><p class="cr-balanceValue" data-credit-balance="ai">60</p><p class="cr-balanceFoot">本月发放 60 · 每次 1 次</p></li>
      <li class="cr-balanceCard"><p class="cr-balanceLabel">Image</p><p class="cr-balanceValue" data-credit-balance="image">0</p><p class="cr-balanceFoot">本月发放 30</p></li>
      <li class="cr-balanceCard"><p class="cr-balanceLabel">Video</p><p class="cr-balanceValue" data-credit-balance="video">0</p><p class="cr-balanceFoot">本月发放 0</p></li>
      <li class="cr-balanceCard"><p class="cr-balanceLabel">Compute</p><p class="cr-balanceValue" data-credit-balance="compute">100</p><p class="cr-balanceFoot">本月发放 100</p></li>
    </ul>
  </section>
  <section class="cr-section">
    <h2 class="cr-h2">最近消费与发放</h2>
    <p class="cr-empty" data-credit-empty>一行流水都没有。刚注册完的话，刷新一次这一页就会把本月的额度发下来。</p>
    <p class="cr-window" data-credit-window>这里只列最近 20 行；余额是按全部流水算的，不是这 20 行的和。</p>
  </section>
  <section class="cr-section">
    <h2 class="cr-h2">档位与上限（§133）</h2>
    <table class="cr-table">
      <thead><tr class="cr-theadRow"><th class="cr-th">档位</th><th class="cr-th">AI / 月</th></tr></thead>
      <tbody>
        <tr class="cr-theadRow"><td class="cr-planCurrent">Free <span class="cr-youBadge">你</span></td><td class="cr-td">1,500</td></tr>
        <tr class="cr-theadRow"><td class="cr-planOther">Pro</td><td class="cr-td">20,000</td></tr>
      </tbody>
    </table>
  </section>
  <section class="cr-section">
    <h2 class="cr-h2">最近一笔</h2>
    <table class="cr-table">
      <tbody><tr data-credit-entry="generation" data-credit-kind="ai" data-credit-delta="-1">
        <td class="cr-tdTs">2026/11/12</td>
        <td class="cr-tdKind">AI 文字</td>
        <td class="cr-tdDelta cr-deltaNeg">-1</td>
        <td class="cr-tdReason">生成一段描述</td>
        <td class="cr-tdTask"><span>任务 3f2a1b</span></td>
      </tr>
      <tr data-credit-entry="grant" data-credit-kind="ai" data-credit-delta="60">
        <td class="cr-tdTs">2026/11/01</td>
        <td class="cr-tdKind">AI 发放</td>
        <td class="cr-tdDelta cr-deltaPos">+60</td>
        <td class="cr-tdReason">本月额度</td>
        <td class="cr-tdTask">—</td>
      </tr></tbody>
    </table>
  </section>
  <p class="cr-note">余额由流水加出来（没有"余额"这一列可改）。</p>
  <p class="cr-body"><a class="cr-backlink" href="/">回到首页</a></p>
</main>`;

function htmlFor(scheme: 'dark' | 'light'): string {
  return `<!doctype html><html lang="zh-CN" data-nexus-theme="${scheme}"><head><meta charset="utf-8" />
    <style>${tokensCss}</style>
    <style>:root { color-scheme: ${scheme}; } body { margin: 0; } ${crCss}</style>
  </head><body>${SAMPLE}</body></html>`;
}

for (const scheme of ['dark', 'light'] as const) {
  test(`@smoke §FE-16 credits 双主题渲染 + 账本语义色真上屏（${scheme}）`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: scheme });
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    });

    await page.setContent(htmlFor(scheme), { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-credits-whose]')).toBeVisible();
    await expect(page.locator('[data-credit-balance="ai"]')).toHaveText('60');
    await expect(page.locator('[data-credit-empty]')).toContainText('流水');

    // 账本语义色必须用 tokens.css 里真声明的 -ink 值（不许本地 hex 漂）
    const negColor = await page.locator('.cr-deltaNeg').evaluate((el) => getComputedStyle(el).color);
    const posColor = await page.locator('.cr-deltaPos').evaluate((el) => getComputedStyle(el).color);
    const expected = scheme === 'dark'
      ? { neg: 'rgb(242, 85, 90)', pos: 'rgb(34, 211, 238)' }   // #f2555a / #22d3ee
      : { neg: 'rgb(180, 35, 24)', pos: 'rgb(15, 107, 122)' };  // #b42318 / #0f6b7a
    expect(negColor, `${scheme} deltaNeg 颜色不对`).toBe(expected.neg);
    expect(posColor, `${scheme} deltaPos 颜色不对`).toBe(expected.pos);
    expect(negColor, `${scheme} 账本正负色必须两两不同`).not.toBe(posColor);

    // 背景色阶真翻转（页面 bg-0 ≠ 卡片 bg-2）
    const pageBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const cardBg = await page.locator('.cr-balanceCard').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(pageBg).not.toBe(cardBg);

    expect(consoleErrors, `${scheme} 控制台报错：\n${consoleErrors.join('\n')}`).toEqual([]);
  });
}

test('@smoke §FE-16 credits 48rem 响应式断点真分档：≤767px 2 列，≥768px 4 列', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });

  await page.setViewportSize({ width: 700, height: 800 });
  await expect(page.locator('.cr-balanceGrid')).toBeVisible();
  const colsAt700 = await page.locator('.cr-balanceGrid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(colsAt700, '700px 下应为 2 列').toBe(2);

  await page.setViewportSize({ width: 900, height: 800 });
  const colsAt900 = await page.locator('.cr-balanceGrid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(colsAt900, '900px 下应为 4 列').toBe(4);
});

test('@smoke §FE-16 credits 键盘可达：回首页链接的 :focus-visible 真生效', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  await page.keyboard.press('Tab');
  const link = page.locator('.cr-backlink');
  await expect(link).toBeFocused();
  const outline = await link.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth };
  });
  expect(outline.style, '键盘 focus 无描边样式').toBe('solid');
  expect(parseFloat(outline.width), '描边宽度应大于 0').toBeGreaterThan(0);
});
