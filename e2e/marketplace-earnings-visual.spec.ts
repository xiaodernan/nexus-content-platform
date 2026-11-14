import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * §FE-12 创作者收入页 `/marketplace/earnings` 门面的**浏览器那一寸**（脱离后端，纯 CSS + 真结构因果）。
 *
 * 为什么离线：本机 3100 上游常无干净窗口（Next 未起时网关回 502），earnings 又是登录后页，
 * 真页面要数据库 + 会话 + 有销售数据。本片门面的正确性只取决于两件事——真实产物的**结构/文案/
 * data 钩子/门面类名**与产物 `.me-` CSS 在真 Chromium 下的渲染，二者都与后端数据无关。本 spec
 * 从**产物真实字节**取这两样，用 `page.setContent` 离线注入，零后端零夹具。
 *
 * 为什么 markup 是"复刻样本"而非直接抽 JSX：earnings 是 client 组件，JSX 含 `{summary.totalEarned}`、
 * `{summary.dailyBreakdown.map(...)}`、`{error}` 等 JS 表达式，裸 HTML 无法解释。因此人工构造**覆盖
 * loading/error/empty/data 四态 + 三行每日明细表格**的静态 markup 样本，每个 className / data-* /
 * 静态文案逐字取自真实产物（见 SAMPLE 出处）。**动态假数据**（金额/销量/日期/标题）是编造的，
 * 不锚产物（FE-11 教训内置）。验的是"真实门面类 + 结构钩子在真 Chrome 下的渲染因果"，
 * 不是"真页面点开过一遍"。诚实边界写进 ADR。
 *
 * 验五件静态门覆盖不了的事：
 *  1. 样本锚真实产物（SAMPLE 的 me- 类 / data-* / 静态文案逐字出自组件，脱节即红）；
 *  2. 深/浅双主题下四态门面真渲染 + 表格行 + 零 console error；
 *  3. 四态视觉分档（loading/error/empty 边框/背景各异，不是同一副裸样子）；
 *  4. 收入列强调色在双主题下都渲染（非零透明/零尺寸）；
 *  5. reduced-motion 只切 emulateMedia，验产品关闭块把 loading 的 fade-in 与**伪元素 pulse**
 *     都真关掉（静态门刚修实的伪元素归并缺陷，e2e 独立再验产品真规则，零手工 !important 兜底）。
 *
 * 静态那一寸归 `apps/web/test/marketplace-earnings-visual-style.test.ts`。
 */
const PAGE = join(process.cwd(), 'apps/web/src/app/marketplace/earnings/page.tsx');
const GLOBALS = join(process.cwd(), 'apps/web/src/app/globals.css');
const TOKENS = join(process.cwd(), 'apps/web/src/styles/tokens.css');

const pageSrc = readFileSync(PAGE, 'utf8');
const cssSrc = readFileSync(GLOBALS, 'utf8');
const tokensCss = readFileSync(TOKENS, 'utf8');

/** 从产物 globals.css 提取 `.me-` 视觉段整段（从第一个 `.me-` 到第一个 `.mi-` 之前）。 */
function extractMeSegment(css: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = clean.search(/\.me-[A-Za-z]/);
  if (start < 0) throw new Error('globals.css 找不到 .me- 视觉段——FE-12 没落地');
  const tail = clean.slice(start);
  const nextFacade = tail.search(/\.mi-[A-Za-z]/);
  return nextFacade >= 0 ? tail.slice(0, nextFacade) : tail;
}

/**
 * 四态 markup 样本：className / data-* / 静态文案逐字取自真实产物字节。
 * 出处：earnings/page.tsx —
 *   me-loading/error/empty（:46-56 三个提前 return）；me-root/title（:58-60）；
 *   me-summary/summaryGrid/stat/statLabel/statValue/statValueAccent（:61-77）；
 *   me-section/sectionTitle/table/tr/th/thRight/td/tdRight/tdAccent（:79-100）；
 *   me-emptyDetail（:101-105）。金额/销量/日期为编造假数据，不锚产物。
 */
const SAMPLE = `
<div class="me-loading" data-state="loading">加载中...</div>
<div class="me-error" data-state="error">获取失败（500）</div>
<div class="me-empty" data-state="empty">暂无数据</div>

<main class="me-root" data-state="data">
  <h1 class="me-title">创作者收入明细</h1>
  <section class="me-summary">
    <div class="me-summaryGrid">
      <div class="me-stat">
        <div class="me-statLabel">累计收入</div>
        <div class="me-statValue me-statValueAccent" data-earnings-total>128 credits</div>
      </div>
      <div class="me-stat">
        <div class="me-statLabel">总销量</div>
        <div class="me-statValue" data-earnings-sales>7 次</div>
      </div>
    </div>
  </section>
  <section class="me-section">
    <h2 class="me-sectionTitle">每日明细</h2>
    <table class="me-table">
      <thead><tr class="me-tr">
        <th class="me-th">日期</th><th class="me-th me-thRight">销量</th><th class="me-th me-thRight">收入</th>
      </tr></thead>
      <tbody>
        <tr class="me-tr"><td class="me-td">2026-11-10</td><td class="me-td me-tdRight">3</td><td class="me-td me-tdRight me-tdAccent">54 credits</td></tr>
        <tr class="me-tr"><td class="me-td">2026-11-09</td><td class="me-td me-tdRight">2</td><td class="me-td me-tdRight me-tdAccent">36 credits</td></tr>
        <tr class="me-tr"><td class="me-td">2026-11-08</td><td class="me-td me-tdRight">2</td><td class="me-td me-tdRight me-tdAccent">38 credits</td></tr>
      </tbody>
    </table>
  </section>
</div>`;

const meCss = extractMeSegment(cssSrc);

/** 真实 token + 真实 .me- CSS + 四态样本装进一个 data-nexus-theme 可控文档。
 *  reduced-motion 门禁此文件注入任何手工关闭规则：产品 globals.css 的 .me- 段自带
 *  @media (prefers-reduced-motion: reduce) 块，真 emulateMedia 触发它才验得到产品真规则。 */
function htmlFor(scheme: 'dark' | 'light'): string {
  return `<!doctype html><html lang="zh-CN" data-nexus-theme="${scheme}"><head><meta charset="utf-8" />
    <style>${tokensCss}</style>
    <style>
      :root { color-scheme: ${scheme}; }
      body { margin: 0; background: var(--nexus-color-bg-0); color: var(--nexus-color-fg-1); }
      ${meCss}
    </style></head><body>${SAMPLE}</body></html>`;
}

test('@smoke §FE-12 样本锚真实产物：SAMPLE 的 me- 类 / data-* / 静态文案逐字出自 page.tsx', async () => {
  // SAMPLE 是人造静态 markup（client 组件含 JS 表达式，裸 HTML 解释不了）。这道门把 JSDoc 的
  // "逐字取自真实产物"承诺变成可执行判据：样本一旦与产物脱节就红。动态假数据（金额/日期）不锚。
  const classes = [...new Set([...SAMPLE.matchAll(/\bme-[A-Za-z0-9-]+/g)].map((m) => m[0]!))];
  const missingClasses = classes.filter((c) => !pageSrc.includes(c));
  expect(missingClasses, `SAMPLE 用了产物里不存在的 me- 类（样本与产物脱节）：${missingClasses.join(', ')}`).toEqual([]);

  const hooks = [...new Set([...SAMPLE.matchAll(/\bdata-earnings-[a-z-]+/g)].map((m) => m[0]!))];
  const missingHooks = hooks.filter((h) => !pageSrc.includes(h));
  expect(missingHooks, `SAMPLE 用了产物里不存在的 data-* 钩子：${missingHooks.join(', ')}`).toEqual([]);

  // 只锚组件里真实写死的**静态 UI 文案**（动态金额/销量/日期不锚）
  for (const copy of [
    '加载中...', '暂无数据', '创作者收入明细', '累计收入', '总销量', '每日明细',
    '日期', '销量', '收入', '暂无销售记录。把你的作品上架到 Marketplace，开始获得收入吧！',
    'credits', '次',
  ]) {
    expect(pageSrc, `SAMPLE 静态文案「${copy}」在真实产物里找不到`).toContain(copy);
  }
});

for (const scheme of ['dark', 'light'] as const) {
  test(`@smoke §FE-12 四态双主题渲染（${scheme}）：门面 / 表格 / 零 console error`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: scheme });
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    });

    await page.setContent(htmlFor(scheme), { waitUntil: 'domcontentloaded' });

    // 四态真渲染
    for (const state of ['loading', 'error', 'empty', 'data']) {
      await expect(page.locator(`[data-state="${state}"]`), `状态 ${state} 没渲染`).toHaveCount(1);
    }
    await expect(page.locator('[data-earnings-total]')).toContainText('credits');
    await expect(page.locator('[data-earnings-sales]')).toContainText('次');
    // 表格三行每日明细 + 表头
    await expect(page.locator('tbody .me-tr')).toHaveCount(3);
    await expect(page.locator('thead .me-th')).toHaveCount(3);
    // 收入强调列真渲染（双主题下 color 非空、非 transparent）
    const accentColor = await page.locator('.me-tdAccent').first().evaluate((el) => getComputedStyle(el).color);
    expect(accentColor, '收入强调列颜色为空/透明').toMatch(/^rgb\(/);

    expect(consoleErrors, `${scheme} 控制台有报错：\n${consoleErrors.join('\n')}`).toEqual([]);
  });
}

test('@smoke §FE-12 四态视觉分档：loading / error / empty 不是同一副裸样子', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });

  const styles = await Promise.all(
    ['loading', 'error', 'empty'].map((state) =>
      page.locator(`[data-state="${state}"]`).evaluate((el) => {
        const s = getComputedStyle(el);
        return `${s.borderLeftStyle}|${s.borderLeftWidth}|${s.backgroundColor}`;
      }),
    ),
  );
  expect(new Set(styles).size, `四态视觉趋同：${styles.join(' , ')}`).toBeGreaterThan(1);
});

test('@smoke §FE-12 reduced-motion 下产品关闭块真关掉 fade-in 与伪元素 pulse', async ({ page }) => {
  test.setTimeout(60_000);
  // 非 reduced：loading 基础块有 fade-in、::before 有 pulse
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  const loading = page.locator('[data-state="loading"]');
  const normalAnim = await loading.evaluate((el) => getComputedStyle(el).animationName);
  expect(normalAnim, 'loading 缺 fade-in 入场动画').toBe('me-fade-in');
  const normalPulse = await loading.evaluate((el) => getComputedStyle(el, '::before').animationName);
  expect(normalPulse, 'loading 伪元素缺 pulse 呼吸动画').toBe('me-pulse');

  // reduced：只切 emulateMedia，触发 globals.css .me- 段自带产品块（零手工 !important 注入）。
  // 静态门刚修实的"伪元素动画与基础类归并"缺陷，这里用真计算样式独立再验一遍：
  // 两者必须都变 none，缺任一条产品规则都会红。
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  const reducedLoading = page.locator('[data-state="loading"]');
  const reducedAnim = await reducedLoading.evaluate((el) => getComputedStyle(el).animationName);
  const reducedPulse = await reducedLoading.evaluate((el) => getComputedStyle(el, '::before').animationName);
  expect(reducedAnim, 'reduced 下 loading fade-in 没被产品块关掉').toBe('none');
  expect(reducedPulse, 'reduced 下 loading 伪元素 pulse 没被产品块关掉（伪元素独立动画槽）').toBe('none');
});
