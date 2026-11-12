import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * §FE-13 我的举报页 `/marketplace/reports` 门面的**浏览器那一寸**（脱离后端，纯 CSS + 真结构因果）。
 *
 * 为什么离线：本机 3100 上游常无干净窗口（Next 未起时网关回 502），而 `/marketplace/reports`
 * 是登录后 server 组件，真页面要数据库 + 会话 + 真实举报工单。本片门面的正确性只取决于两件事——
 * reports 真实产物的**结构/文案/data 钩子/门面类名（含 STATUS_LABELS 的数据驱动状态类）**与产物
 * `.mr-` CSS 在真 Chromium 下的双主题渲染，二者都与后端数据无关。本 spec 从**产物真实字节**取
 * 这两样，用 `page.setContent` 离线注入，零后端零夹具。
 *
 * 为什么 markup 是"复刻样本"而非直接抽 JSX：reports 是 server 组件，JSX 含 `{reports.map(...)}`、
 * `{status.className}`、`{stamp(report.createdAt)}`、`{itemState(...)}` 等表达式，裸 HTML 无法解释。
 * 因此人工构造**覆盖 denied/empty/list 三态 + list 内四状态徽标四类 + 两种结案文案**的静态 markup
 * 样本，每个 className / data-* / 静态文案逐字取自真实产物（见 SAMPLE 常量旁出处行号）。**动态假
 * 数据**（物品标题/理由/日期/工单 ID）是编造的，不锚产物（FE-11 教训内置）。验的是"真实门面类 +
 * 结构钩子 + 数据驱动状态类在真 Chrome 下的渲染因果"，不是"真页面点开过一遍"。诚实边界写进 ADR。
 *
 * 验六件静态门覆盖不了的事：
 *  1. 样本锚真实产物（SAMPLE 的 mr- 类 / data-report* 钩子 / 静态文案逐字出自 page.tsx，脱节即红）；
 *  2. 深/浅双主题下 denied/empty/list 三态门面真渲染、四工单行 + 两结案备注、零 console error；
 *  3. 四状态徽标（待受理/审核中/成立/不成立）配色**四档各异**且非空/非透明，resolved 用 nexus
 *     success token 在双主题下真切换（数据驱动状态类闭环的浏览器因果）；
 *  4. 两个 `<Link>`（去登录/回市场）键盘 Tab 下 `:focus-visible` 描边真生效（真 Tab，非编程 focus）；
 *  5. row hover 的 transform 真生效；
 *  6. reduced-motion 只切 emulateMedia，验产品关闭块把 fade-in / transition / row hover transform
 *     都真关掉（零手工 !important 兜底）。
 *
 * 静态那一寸归 `apps/web/test/marketplace-reports-visual-style.test.ts`。
 */
const PAGE = join(process.cwd(), 'apps/web/src/app/marketplace/reports/page.tsx');
const GLOBALS = join(process.cwd(), 'apps/web/src/app/globals.css');
const TOKENS = join(process.cwd(), 'apps/web/src/styles/tokens.css');

const pageSrc = readFileSync(PAGE, 'utf8');
const cssSrc = readFileSync(GLOBALS, 'utf8');
const tokensCss = readFileSync(TOKENS, 'utf8');

/** 从产物 globals.css 提取 `.mr-` 视觉段整段（到第一个 `.me-` 之前，FE-13 段插在 FE-12 前方，含 reduced-motion）。 */
function extractMrSegment(css: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = clean.search(/\.mr-[A-Za-z]/);
  if (start < 0) throw new Error('globals.css 找不到 .mr- 视觉段——FE-13 没落地');
  const tail = clean.slice(start);
  const nextFacade = tail.search(/\.me-[A-Za-z]/);
  return nextFacade >= 0 ? tail.slice(0, nextFacade) : tail;
}

/**
 * 三态 markup 样本：className / data-* / 静态文案逐字取自真实产物字节。
 * 出处：reports/page.tsx —
 *   denied: mr-denied/mr-title/mr-deniedCopy/mr-loginLink + data-reports-denied（:40-48）；
 *   list:   mr-root/mr-head/mr-heading/mr-title/mr-subtitle/mr-back（:53-68）；
 *           mr-count/mr-list（:76-79）；
 *           mr-row/mr-rowTop/mr-rowTitle/mr-itemState/mr-status/mr-statusXxx（数据驱动）/mr-rowMeta/
 *           mr-metaTime/mr-desc/mr-outcomeNote（:83-126）；
 *   empty:  mr-empty（:70-73）；
 *   footer: mr-footer（:133-135）。
 * 物品标题/理由/日期/工单 ID 为编造假数据，不锚产物。四状态 label 与 className 值取自 STATUS_LABELS
 * （:13-18），`mr-status mr-statusPending` 的模板串组合对应产物 `className={`mr-status ${status.className}`}`。
 */
const SAMPLE = `
<main class="mr-denied" data-reports-denied="anonymous" data-sample="denied">
  <h1 class="mr-title">我的举报</h1>
  <p class="mr-deniedCopy">需要先登录：举报按举报人存放，没有身份就没有可归属的那一份。</p>
  <a href="http://localhost/login" class="mr-loginLink">去登录</a>
</main>

<main class="mr-root" data-sample="empty">
  <header class="mr-head">
    <div class="mr-heading">
      <h1 class="mr-title" data-reports-title>我的举报</h1>
      <p class="mr-subtitle">你提交过的举报都在这里。工单状态与物品此刻的状态是两件事：结案 / 驳回都不自动下架物品，撤内容走人工复核台；作者也可能自己把物品下架或转私密。</p>
    </div>
    <a href="http://localhost/marketplace" class="mr-back" data-reports-back>回市场</a>
  </header>
  <p class="mr-empty" data-reports-empty>你还没有提交过举报。在市场的物品行里点「举报」即可提交——同一件物品只能举报一次。</p>
  <p class="mr-footer">页面只列你自己提交的工单：别人的举报不在这一页，也拿不到举报人是谁。</p>
</main>

<main class="mr-root" data-sample="list">
  <header class="mr-head">
    <div class="mr-heading">
      <h1 class="mr-title" data-reports-title>我的举报</h1>
      <p class="mr-subtitle">你提交过的举报都在这里。工单状态与物品此刻的状态是两件事：结案 / 驳回都不自动下架物品，撤内容走人工复核台；作者也可能自己把物品下架或转私密。</p>
    </div>
    <a href="http://localhost/marketplace" class="mr-back" data-reports-back>回市场</a>
  </header>
  <p class="mr-count" data-reports-count="4">共 4 条；按提交时间倒序。审核员的内部笔记不在这一页。</p>
  <ul class="mr-list" data-reports-list>
    <li class="mr-row" data-report-row data-report-id="r1" data-report-status="pending">
      <div class="mr-rowTop">
        <strong class="mr-rowTitle" data-report-item-title>雾港素材集</strong>
        <span class="mr-itemState" data-report-item-state="free">物品免费在售</span>
        <span class="mr-status mr-statusPending" data-report-status-label="pending">待受理</span>
      </div>
      <div class="mr-rowMeta">
        <span data-report-reason>虚假描述</span>
        <span class="mr-metaTime" data-report-created>提交于 2026-11-01 08:30 UTC</span>
      </div>
      <p class="mr-desc" data-report-description>你的说明：图片与实物不符。</p>
    </li>
    <li class="mr-row" data-report-row data-report-id="r2" data-report-status="reviewing">
      <div class="mr-rowTop">
        <strong class="mr-rowTitle" data-report-item-title>潮汐组件包</strong>
        <span class="mr-itemState" data-report-item-state="free">物品在售</span>
        <span class="mr-status mr-statusReviewing" data-report-status-label="reviewing">审核中</span>
      </div>
      <div class="mr-rowMeta">
        <span data-report-reason>侵权</span>
        <span class="mr-metaTime" data-report-created>提交于 2026-11-02 10:00 UTC</span>
      </div>
    </li>
    <li class="mr-row" data-report-row data-report-id="r3" data-report-status="resolved">
      <div class="mr-rowTop">
        <strong class="mr-rowTitle" data-report-item-title>灯塔模板</strong>
        <span class="mr-itemState" data-report-item-state="private">物品已转私密</span>
        <span class="mr-status mr-statusResolved" data-report-status-label="resolved">举报成立</span>
      </div>
      <div class="mr-rowMeta">
        <span data-report-reason>垃圾信息</span>
        <span class="mr-metaTime" data-report-created>提交于 2026-10-28 07:15 UTC</span>
        <span class="mr-metaTime" data-report-resolved>处置于 2026-11-03 09:20 UTC</span>
      </div>
      <p class="mr-outcomeNote" data-report-outcome-note>审核员认定举报成立。这是工单结论，物品是否撤下由人工复核台另行处理。</p>
    </li>
    <li class="mr-row" data-report-row data-report-id="r4" data-report-status="dismissed">
      <div class="mr-rowTop">
        <strong class="mr-rowTitle" data-report-item-title>盐海图集</strong>
        <span class="mr-itemState" data-report-item-state="deleted">物品已删除</span>
        <span class="mr-status mr-statusDismissed" data-report-status-label="dismissed">举报不成立</span>
      </div>
      <div class="mr-rowMeta">
        <span data-report-reason>其他</span>
        <span class="mr-metaTime" data-report-created>提交于 2026-10-20 12:40 UTC</span>
        <span class="mr-metaTime" data-report-resolved>处置于 2026-10-22 16:05 UTC</span>
      </div>
      <p class="mr-outcomeNote" data-report-outcome-note>审核员判定这次举报不成立。若之后发现新的证据，可以留意物品页面的变化。</p>
    </li>
  </ul>
  <p class="mr-footer">页面只列你自己提交的工单：别人的举报不在这一页，也拿不到举报人是谁。</p>
</main>`;

const mrCss = extractMrSegment(cssSrc);

/** 真实 token + 真实 .mr- CSS + 三态样本装进一个 data-nexus-theme 可控文档。
 *  reduced-motion 门禁此文件注入任何手工关闭规则：产品 globals.css 的 .mr- 段自带
 *  @media (prefers-reduced-motion: reduce) 块，真 emulateMedia 触发它才验得到产品真规则；
 *  若在此处 !important 兜底，会让 A/B 退化成"验注入的 !important 生效"的同义反复。 */
function htmlFor(scheme: 'dark' | 'light'): string {
  return `<!doctype html><html lang="zh-CN" data-nexus-theme="${scheme}"><head><meta charset="utf-8" />
    <style>${tokensCss}</style>
    <style>
      :root { color-scheme: ${scheme}; }
      body { margin: 0; background: var(--nexus-color-bg-0); color: var(--nexus-color-fg-1); }
      ${mrCss}
    </style></head><body>${SAMPLE}</body></html>`;
}

/** 循环真 Tab 直到 selector 唯一命中元素聚焦（最多 8 次）。避免硬编码 Tab 次序（FE-11 教训内置）。 */
async function tabUntilFocused(page: import('@playwright/test').Page, selector: string, max = 8): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.locator(selector).evaluate((el) => el === document.activeElement)) return true;
  }
  return false;
}

test('@smoke §FE-13 样本锚真实产物：SAMPLE 的 mr- 类 / data-report* 钩子 / 静态文案逐字出自 page.tsx', async () => {
  // SAMPLE 是人造静态 markup（server 组件含 JS 表达式，裸 HTML 解释不了）。这道门把 JSDoc 的
  // "逐字取自真实产物"承诺变成可执行判据：样本一旦与产物脱节就红。动态假数据（标题/理由/日期）不锚。
  const classes = [...new Set([...SAMPLE.matchAll(/\bmr-[A-Za-z0-9-]+/g)].map((m) => m[0]!))];
  const missingClasses = classes.filter((c) => !pageSrc.includes(c));
  expect(missingClasses, `SAMPLE 用了产物里不存在的 mr- 类（样本与产物脱节）：${missingClasses.join(', ')}`).toEqual([]);

  // 只锚产物真实 data-reports?-* 钩子；分区用 data-sample 不是产物钩子，故不纳入。
  const hooks = [...new Set([...SAMPLE.matchAll(/\bdata-reports?-[a-z-]+/g)].map((m) => m[0]!))];
  const missingHooks = hooks.filter((h) => !pageSrc.includes(h));
  expect(missingHooks, `SAMPLE 用了产物里不存在的 data-* 钩子：${missingHooks.join(', ')}`).toEqual([]);

  // 只锚组件里真实写死的**静态 UI 文案**（动态假数据不锚）。跨 JSX 换行的长句只锚连续片段。
  for (const copy of [
    '我的举报', '需要先登录：举报按举报人存放，没有身份就没有可归属的那一份。', '去登录', '回市场',
    '你提交过的举报都在这里。工单状态与物品此刻的状态是两件事',
    '撤内容走人工复核台；作者也可能自己把物品下架或转私密。',
    '你还没有提交过举报。在市场的物品行里点「举报」即可提交——同一件物品只能举报一次。',
    '条；按提交时间倒序。审核员的内部笔记不在这一页。',
    '待受理', '审核中', '举报成立', '举报不成立', '物品', '提交于 ', '处置于 ', '你的说明：',
    '审核员认定举报成立。这是工单结论，物品是否撤下由人工复核台另行处理。',
    '审核员判定这次举报不成立。若之后发现新的证据，可以留意物品页面的变化。',
    '页面只列你自己提交的工单：别人的举报不在这一页，也拿不到举报人是谁。',
    'anonymous',
  ]) {
    expect(pageSrc, `SAMPLE 静态文案「${copy.slice(0, 16)}」在真实产物里找不到`).toContain(copy);
  }
});

for (const scheme of ['dark', 'light'] as const) {
  test(`@smoke §FE-13 三态双主题渲染（${scheme}）：门面 / 四工单行 / 两结案备注 / 零 console error`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: scheme });
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    });

    await page.setContent(htmlFor(scheme), { waitUntil: 'domcontentloaded' });

    // denied / empty / list 三态真渲染（分区定位，避免重复 data 钩子触发 strict mode）。
    // data-reports-denied 挂在 <main> **自身**（不是后代），故用同元素复合选择器并锚其值 anonymous。
    await expect(page.locator('main[data-sample="denied"][data-reports-denied="anonymous"]')).toHaveCount(1);
    await expect(page.locator('main[data-sample="denied"] .mr-loginLink')).toHaveText('去登录');
    await expect(page.locator('main[data-sample="empty"] [data-reports-empty]')).toHaveCount(1);
    await expect(page.locator('main[data-sample="list"] [data-reports-list]')).toHaveCount(1);
    await expect(page.locator('main[data-sample="list"] [data-report-row]')).toHaveCount(4);
    await expect(page.locator('main[data-sample="list"] [data-report-outcome-note]')).toHaveCount(2);
    await expect(page.locator('main[data-sample="list"] [data-report-resolved]')).toHaveCount(2);
    await expect(page.locator('main[data-sample="list"] .mr-title')).toHaveText('我的举报');
    // 四状态 label 文案真在（数据驱动映射的浏览器因果）
    for (const [i, label] of ['待受理', '审核中', '举报成立', '举报不成立'].entries()) {
      await expect(page.locator('main[data-sample="list"] [data-report-status-label]').nth(i)).toHaveText(label);
    }

    expect(consoleErrors, `${scheme} 控制台有报错：\n${consoleErrors.join('\n')}`).toEqual([]);
  });
}

test('@smoke §FE-13 四状态徽标双主题配色分档：四态各异 + resolved success token 真切换', async ({ page }) => {
  test.setTimeout(60_000);
  const readBadges = async (scheme: 'dark' | 'light'): Promise<string[]> => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setContent(htmlFor(scheme), { waitUntil: 'domcontentloaded' });
    return page.locator('main[data-sample="list"] [data-report-status-label]').evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return `${s.color}|${s.backgroundColor}`;
      }),
    );
  };

  const dark = await readBadges('dark');
  const light = await readBadges('light');
  expect(dark, '四状态徽标没渲染全').toHaveLength(4);
  expect(new Set(dark).size, `四状态徽标配色趋同（非四档）：${dark.join(' , ')}`).toBe(4);
  expect(new Set(light).size, `四状态徽标浅色配色趋同（非四档）：${light.join(' , ')}`).toBe(4);
  // 每个徽标 color 必须是有效 rgb（非空/非透明）
  for (const [scheme, colors] of [['dark', dark], ['light', light]] as const) {
    for (const c of colors) {
      expect(c.split('|')[0], `${scheme} 徽标 color 非有效 rgb：${c}`).toMatch(/^rgb\(/);
    }
  }
  // resolved（index 2）用 nexus success token：双主题色值必须真切换（不是写死同一个 hex）
  expect(dark[2], 'resolved 徽标双主题未随 success token 切换').not.toBe(light[2]);
});

test('@smoke §FE-13 两个 Link（去登录 / 回市场）真 Tab :focus-visible 描边生效', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });

  // 真键盘 Tab（非编程 focus）：先落到 denied 的「去登录」，再继续落到 empty 的「回市场」
  expect(await tabUntilFocused(page, 'main[data-sample="denied"] .mr-loginLink'), 'Tab 到不了去登录链接').toBe(true);
  const loginOutline = await page.locator('main[data-sample="denied"] .mr-loginLink').evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth };
  });
  expect(loginOutline.style, '去登录链接键盘 focus 无描边').toBe('solid');
  expect(parseFloat(loginOutline.width), '去登录链接键盘 focus 描边宽度为 0').toBeGreaterThan(0);

  expect(await tabUntilFocused(page, 'main[data-sample="empty"] .mr-back'), 'Tab 到不了回市场链接').toBe(true);
  const backOutline = await page.locator('main[data-sample="empty"] .mr-back').evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth };
  });
  expect(backOutline.style, '回市场链接键盘 focus 无描边').toBe('solid');
  expect(parseFloat(backOutline.width), '回市场链接键盘 focus 描边宽度为 0').toBeGreaterThan(0);
});

test('@smoke §FE-13 row hover 真生效；reduced-motion 下产品关闭块真关掉 fade / transition / transform', async ({ page }) => {
  test.setTimeout(60_000);
  // ① 非 reduced：root 有 fade-in 入场、link 有 transition、row hover 有 transform 抬升
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  const root = page.locator('main[data-sample="list"]');
  expect(await root.evaluate((el) => getComputedStyle(el).animationName)).toBe('mr-fade-in');
  const linkDur = await page.locator('main[data-sample="denied"] .mr-loginLink').evaluate((el) =>
    getComputedStyle(el).transitionDuration,
  );
  expect(parseFloat(linkDur), 'link 缺 transition 时长').toBeGreaterThan(0);
  const row = page.locator('main[data-sample="list"] [data-report-row]').first();
  await row.hover();
  const hoverTransform = await row.evaluate((el) => getComputedStyle(el).transform);
  expect(hoverTransform, 'row hover 无 transform 抬升').not.toBe('none');

  // ② reduced：只切 emulateMedia，触发 globals.css .mr- 段自带产品块（零手工 !important 注入）。
  //    前半段已证非 reduced 下三项动效都在，故此处验到的关闭只能来自产品规则。
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  const reducedRoot = page.locator('main[data-sample="list"]');
  expect(await reducedRoot.evaluate((el) => getComputedStyle(el).animationName), 'reduced 下 fade-in 没被关').toBe('none');
  const reducedLinkDur = await page.locator('main[data-sample="denied"] .mr-loginLink').evaluate((el) =>
    getComputedStyle(el).transitionDuration,
  );
  expect(parseFloat(reducedLinkDur), 'reduced 下 link transition 没被关').toBe(0);
  const reducedRow = page.locator('main[data-sample="list"] [data-report-row]').first();
  await reducedRow.hover();
  const reducedTransform = await reducedRow.evaluate((el) => getComputedStyle(el).transform);
  expect(reducedTransform, 'reduced 下 row hover 仍有 transform——产品 reduced 块没生效').toBe('none');
});
