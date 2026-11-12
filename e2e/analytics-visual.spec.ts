import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * §FE-14 创作数据页 `/analytics` 门面的**浏览器那一寸**（脱离后端，纯 CSS + 真结构因果）。
 *
 * 为什么离线：本机 3100 上游常无干净窗口（Next 未起时网关回 502），analytics 又是登录后 server
 * 组件，真页面要数据库 + 会话 + 发布记录 + 心跳。本片门面的正确性只取决于两件事——真实产物的
 * **结构/文案/data 钩子/门面类名（含三元选中态两分支）**与产物 `.an-` CSS 在真 Chromium 下的
 * 双主题渲染，二者都与后端数据无关。本 spec 从**产物真实字节**取这两样，用 `page.setContent`
 * 离线注入，零后端零夹具。
 *
 * 为什么 markup 是"复刻样本"而非直接抽 JSX：analytics 是 server 组件，JSX 含
 * `{DEFINITIONS.map(...)}`、`{rows.map(...)}`、`{option === windowDays ? …}`、`{overview.totals.*}`
 * 等表达式，裸 HTML 无法解释。因此人工构造**覆盖 denied/空/列表三态 + 三元 range 两档 + 
 * 12 列表格 + 告警/爬虫/截断旁注**的静态 markup 样本，每个 className / data-* / 静态文案逐字
 * 取自真实产物（见 SAMPLE 旁出处行号）。**动态假数据**（作品名/日期/数字）编造、不锚产物
 * （FE-11 教训内置）。验的是"真实门面类 + 结构钩子 + 三元分档在真 Chrome 下的渲染因果"，
 * 不是"真页面点开过一遍"。诚实边界写进 ADR。
 *
 * 验七件静态门覆盖不了的事：
 *  1. 样本锚真实产物（SAMPLE 的 an- 类 / data-analytics-* 钩子 / 静态文案逐字出自 page.tsx）；
 *  2. 深/浅双主题三态门面真渲染 + 12 列表格 + 零 console error；
 *  3. **三元 range 两档视觉分档**（an-rangeOn vs an-rangeOff 颜色真不同，选中态更强）；
 *  4. **告警徽标 token 化双主题 AA**（裸 text-amber-300→warn-ink，暗 #f5a623 / 亮 #7a4f00，
 *     两主题色值真切换且非空/非透明）；
 *  5. 多个 `<Link>`/`<a>` 键盘 Tab `:focus-visible` 描边真生效（真 Tab，非编程 focus）；
 *  6. row hover 真生效；reduced-motion 只切 emulateMedia，验产品关闭块把 fade-in / transition /
 *     row hover 背景都真关掉（零手工 !important 兜底）；
 *  7. **补齐 size-11 token 后密集辅助字真渲染 11px**（双主题 × 3 个门面类）：静态 token 门只验
 *     声明存在，验不到浏览器里 var() 无效回退继承值 16px；本门从计算样式证明原始 20 处
 *     text-11 的视觉被忠实还原，并顺带堵住 .se- 段 2 处历史遗留未声明引用。
 *
 * 静态那一寸归 `apps/web/test/analytics-visual-style.test.ts`。
 */
const PAGE = join(process.cwd(), 'apps/web/src/app/analytics/page.tsx');
const GLOBALS = join(process.cwd(), 'apps/web/src/app/globals.css');
const TOKENS = join(process.cwd(), 'apps/web/src/styles/tokens.css');

const pageSrc = readFileSync(PAGE, 'utf8');
const cssSrc = readFileSync(GLOBALS, 'utf8');
const tokensCss = readFileSync(TOKENS, 'utf8');

/** 从产物 globals.css 提取 `.an-` 视觉段整段（首个 `.an-` 到首个 `.mr-` 之前，含 reduced-motion）。 */
function extractAnSegment(css: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = clean.search(/\.an-[A-Za-z]/);
  if (start < 0) throw new Error('globals.css 找不到 .an- 视觉段——FE-14 没落地');
  const tail = clean.slice(start);
  const nextFacade = tail.search(/\.mr-[A-Za-z]/);
  return nextFacade >= 0 ? tail.slice(0, nextFacade) : tail;
}

/**
 * 三态 markup 样本：className / data-* / 静态文案逐字取自真实产物字节。
 * 出处：analytics/page.tsx —
 *   denied: an-denied/an-title/an-deniedCopy/an-homeLink + data-analytics-denied（:105-110）；
 *   空:     an-page/an-title/an-subtitle/an-export/an-exportNote/an-defs/an-empty/an-back + data-analytics-page/export/empty（:132-158,325,462）；
 *   列表:  an-panel/an-panelTitle/an-windowTotals/an-mono/an-rangeNav/an-rangeOn|Off/an-table/
 *          an-thead/an-th/an-thRight/an-row/an-td/an-workLink/an-version/an-ask/an-visibility/an-cell/
 *          an-cellMuted/an-flagWarn/an-flagMuted/an-footer + data-*（:162-452）；
 *   12 列头 + 3 条 DEFINITIONS 样例逐字取自产物；长静态文案按连续片段锚，动态假数据（作品名/日期/数字）不锚。
 */
const SAMPLE = `
<main class="an-denied" data-analytics-denied="anonymous" data-state="denied">
  <h1 class="an-title">创作数据</h1>
  <p class="an-deniedCopy">需要先登录：这里只列你自己发布过的版本。</p>
  <a href="/" class="an-homeLink">回到首页</a>
</main>

<main class="an-page" data-analytics-page data-state="empty">
  <h1 class="an-title">创作数据</h1>
  <p class="an-subtitle">示例作者 · 共 0 个发布过的版本 · 数据只对你自己可见</p>
  <p class="an-subtitle">
    <a href="/api/analytics/export" download="creator-analytics.csv" data-analytics-export class="an-export">导出这一份数据（CSV）</a>
    <span class="an-exportNote">导出的是上面这张表里的同一份数字；空着的格子是「未采集」，不是 0。</span>
  </p>
  <ul class="an-defs">
    <li><span class="an-defLabel">打开次数</span><span class="an-defMeaning">页面被服务端渲染的次数，含作者自己的刷新与爬虫（§56 就有的累计计数器）</span></li>
    <li><span class="an-defLabel">完成度</span><span class="an-defMeaning">每个访客"最远滚到页面几成"的平均值</span></li>
    <li><span class="an-defLabel">窗口口径</span><span class="an-defMeaning">「最近 N 天」那一节只看窗口内的行</span></li>
  </ul>
  <p class="an-empty" data-analytics-empty>你还没有发布过任何版本，所以这里没有数据可读。</p>
  <a href="/" class="an-back">回到我的项目</a>
</main>

<main class="an-page" data-state="list">
  <h1 class="an-title">创作数据</h1>
  <p class="an-subtitle">示例作者 · 共 2 个发布过的版本 · 数据只对你自己可见</p>

  <section class="an-panel" data-analytics-agent>
    <h2 class="an-panelTitle">「示例项目」为什么没人看？<span class="an-panelNote">规则分析：读的是这一页上面那几个数与项目本身的设置，没有调用任何模型</span></h2>
    <p class="an-agentNote" data-analytics-agent-clean>没有可挑的门面问题：标题与简介都在、有封面、公开且过审，数据里也没有"打不开 / 留不住人"的信号。这一句只说明这几项查过，不等于"会有人来"。</p>
    <p class="an-projectTrend" data-analytics-project-trend>这一版最近 30 天：打开 <span class="an-mono" data-analytics-project-window="opens">3</span> 次 · 访客 <span class="an-mono" data-analytics-project-window="visitors">1</span> 人</p>
    <a href="/analytics" class="an-close">收起这份分析</a>
  </section>

  <section class="an-panel" data-analytics-trend>
    <div class="an-trendHead">
      <h2 class="an-panelTitle">最近 30 天（按 UTC 日）<span class="an-panelNote">2026-11-01 → 2026-11-30</span></h2>
      <nav class="an-rangeNav" data-analytics-range>
        <a href="/analytics?days=7" class="an-rangeOff" data-analytics-range-option="7">7 天</a>
        <a href="/analytics?days=30" class="an-rangeOn" data-analytics-range-option="30">30 天</a>
        <a href="/analytics?days=90" class="an-rangeOff" data-analytics-range-option="90">90 天</a>
      </nav>
    </div>
    <ul class="an-windowTotals" data-analytics-window-totals>
      <li>窗口内打开 <span class="an-mono" data-analytics-window="opens">3</span></li>
      <li>窗口内访客（跨天去重） <span class="an-mono" data-analytics-window="visitors">1</span></li>
      <li>连续有人来 <span class="an-mono" data-analytics-window="streak">1</span> 天</li>
      <li>完成度 <span class="an-mono" data-analytics-window="completion">100%</span></li>
    </ul>
    <p class="an-trendNote">这一节读的是<b>窗口口径</b>，下面表格里那一排读的是<b>累计口径</b>，两者不是同一个数、也不能互相推：窗口内的访客按整段去重（同一个人连着来三天算一个），缺的那天是 0（那天真的没有心跳），累计那一列则包含窗口之外的全部历史。窗口外的行不进这张图，但仍在下面的表格里。</p>
  </section>

  <div class="an-tableScroll" data-analytics-table-scroll role="region" aria-label="作品数据表（可横向滚动）" tabindex="0">
    <table class="an-table">
      <thead><tr class="an-thead">
        <th class="an-th">作品</th><th class="an-th">可见性</th>
        <th class="an-thRight">打开</th><th class="an-thRight">今天</th><th class="an-thRight">访客</th>
        <th class="an-thRight">点赞</th><th class="an-thRight">改编</th><th class="an-thRight">粉丝</th>
        <th class="an-thRight">完成度</th><th class="an-thRight">通关过</th><th class="an-thRight">互动完成</th><th class="an-thRight">时长</th>
      </tr></thead>
      <tbody>
        <tr class="an-row" data-analytics-row="/n/demo/one" data-state="row">
          <td class="an-td">
            <a href="/n/demo/one" class="an-workLink" target="_blank" rel="noreferrer">示例作品甲</a>
            <span class="an-version">第 2 版</span>
            <a href="/analytics?project=p1" class="an-ask" data-analytics-ask>为什么没人看？</a>
            <span class="an-flagWarn" data-analytics-selfonly>只有你自己看过</span>
            <span class="an-flagMuted" data-analytics-bots>3 次打开来自爬虫/自动化（未计入）</span>
          </td>
          <td class="an-visibility">公开</td>
          <td class="an-cell" data-analytics-value="views">12</td>
          <td class="an-cell" data-analytics-value="opens_today">1</td>
          <td class="an-cell" data-analytics-value="visitors">1</td>
          <td class="an-cell" data-analytics-value="likes">0</td>
          <td class="an-cell" data-analytics-value="remixes">0</td>
          <td class="an-cell" data-analytics-value="followers">0</td>
          <td class="an-cell" data-analytics-value="completion">100% <span class="an-cellNote">/ 1 人·天</span></td>
          <td class="an-cell" data-analytics-value="completed">0</td>
          <td class="an-cell" data-analytics-value="interactive_completed" data-analytics-interactive="no"><span class="an-cellMuted">—</span></td>
          <td class="an-cell" data-analytics-value="play_time"><span class="an-cellMuted">未采集</span></td>
        </tr>
      </tbody>
    </table>
  </div>

  <p class="an-footer">爬虫与真人的区分已按"疑似另计"落地（见上面的口径）——UA 名单是保守的，漏掉的爬虫仍会混进真人的数里，这一条限度不假装已经解决。</p>
  <a href="/" class="an-back">回到我的项目</a>
</main>`;

const anCss = extractAnSegment(cssSrc);

/** 真实 token + 真实 .an- CSS + 三态样本装进一个 data-nexus-theme 可控文档。
 *  reduced-motion 门禁此文件注入任何手工关闭规则：产品 globals.css 的 .an- 段自带
 *  @media (prefers-reduced-motion: reduce) 块，真 emulateMedia 触发它才验得到产品真规则。 */
function htmlFor(scheme: 'dark' | 'light'): string {
  return `<!doctype html><html lang="zh-CN" data-nexus-theme="${scheme}"><head><meta charset="utf-8" />
    <style>${tokensCss}</style>
    <style>
      :root { color-scheme: ${scheme}; }
      body { margin: 0; background: var(--nexus-color-bg-0); color: var(--nexus-color-fg-1); }
      ${anCss}
    </style></head><body>${SAMPLE}</body></html>`;
}

/** 循环真 Tab 直到 selector 唯一命中元素聚焦（最多 10 次），避免硬编码 Tab 次序。 */
async function tabUntilFocused(page: import('@playwright/test').Page, selector: string, max = 10): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.locator(selector).evaluate((el) => el === document.activeElement)) return true;
  }
  return false;
}

test('@smoke §FE-14 样本锚真实产物：SAMPLE 的 an- 类 / data-* 钩子 / 静态文案逐字出自 page.tsx', async () => {
  // SAMPLE 是人造静态 markup（server 组件含 JS 表达式，裸 HTML 解释不了）。这道门把 JSDoc 的
  // "逐字取自真实产物"承诺变成可执行判据：样本一旦与产物脱节就红。动态假数据不锚。
  const classes = [...new Set([...SAMPLE.matchAll(/\ban-[A-Za-z0-9-]+/g)].map((m) => m[0]!))];
  const missingClasses = classes.filter((c) => !pageSrc.includes(c));
  expect(missingClasses, `SAMPLE 用了产物里不存在的 an- 类：${missingClasses.join(', ')}`).toEqual([]);

  const hooks = [...new Set([...SAMPLE.matchAll(/\bdata-analytics-[a-z-]+/g)].map((m) => m[0]!))];
  const missingHooks = hooks.filter((h) => !pageSrc.includes(h));
  expect(missingHooks, `SAMPLE 用了产物里不存在的 data-* 钩子：${missingHooks.join(', ')}`).toEqual([]);

  // 只锚组件里真实写死的**静态 UI 文案**（动态假数据：作品名/数字/日期不锚）
  for (const copy of [
    '创作数据', '需要先登录：这里只列你自己发布过的版本。', '回到首页',
    '数据只对你自己可见', '导出这一份数据（CSV）',
    '导出的是上面这张表里的同一份数字；空着的格子是「未采集」，不是 0。',
    '打开次数', '完成度', '窗口口径', '你还没有发布过任何版本，所以这里没有数据可读。',
    '为什么没人看？', '收起这份分析', '天（按 UTC 日）',
    '窗口内打开', '窗口内访客（跨天去重）', '连续有人来',
    '两者不是同一个数、也不能互相推',
    '作品', '可见性', '打开', '今天', '访客', '点赞', '改编', '粉丝', '通关过', '互动完成', '时长',
    '只有你自己看过', '次打开来自爬虫/自动化（未计入）', '只有你自己看过',
    '未采集', '回到我的项目', '爬虫与真人的区分已按"疑似另计"落地（见上面的口径）',
  ]) {
    expect(pageSrc, `SAMPLE 静态文案「${copy.slice(0, 16)}」在真实产物里找不到`).toContain(copy);
  }
});

for (const scheme of ['dark', 'light'] as const) {
  test(`@smoke §FE-14 三态双主题渲染（${scheme}）：门面 / 12 列表格 / 零 console error`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: scheme });
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    });

    await page.setContent(htmlFor(scheme), { waitUntil: 'domcontentloaded' });

    // denied 钩子挂在 <main> 自身（同元素复合），empty 钩子挂在后代 <p> 上（后代式）——
    // 两者选择器形态不同是忠实产物结构，不是笔误；统一成一种必有一条红。
    await expect(page.locator('[data-state="denied"][data-analytics-denied]')).toHaveCount(1);
    await expect(page.locator('[data-state="denied"] .an-homeLink')).toHaveText('回到首页');
    await expect(page.locator('[data-state="empty"] [data-analytics-empty]')).toHaveCount(1);
    await expect(page.locator('[data-state="list"].an-page')).toHaveCount(1);
    await expect(page.locator('[data-analytics-table-scroll]')).toHaveCount(1);
    // 12 = 表头列数（2 an-th + 10 an-thRight）；10 = 每行数值 data 钩子数——
    // 作品列（链接/版本号/告警）与可见性列（纯文本）不带 data-analytics-value。两数不同是产物真相。
    await expect(page.locator('.an-thead .an-th, .an-thead .an-thRight')).toHaveCount(12);
    await expect(page.locator('[data-analytics-row]')).toHaveCount(1);
    await expect(page.locator('[data-analytics-value]')).toHaveCount(10);
    await expect(page.locator('[data-analytics-range-option]')).toHaveCount(3);
    await expect(page.locator('.an-defs .an-defLabel')).toHaveCount(3);

    expect(consoleErrors, `${scheme} 控制台有报错：\n${consoleErrors.join('\n')}`).toEqual([]);
  });
}

test('@smoke §FE-14 补齐 size-11 token 后密集辅助字真渲染 11px（原 text-11 视觉忠实，非 var 回退继承值）', async ({ page }) => {
  test.setTimeout(60_000);
  // 回归锁：FE-14 的 token 存在门抓出 --nexus-font-size-11 从未在 tokens.css 声明，
  // 导致 .se- 段 2 处 + .an- 段 15 处 var() 在浏览器 computed-value 无效、回退到 body
  // 继承的 16px。原始 page.tsx 有 20 处 text-11（=11px），降成 12px 是视觉失真；
  // 正解是补齐 token 声明。本门从真 Chrome 计算样式证明这些小字被 100% 忠实还原。
  expect(tokensCss, 'tokens.css 缺 --nexus-font-size-11: 11px，11px 会再次回退继承值').toContain(
    '--nexus-font-size-11: 11px',
  );
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setContent(htmlFor(scheme), { waitUntil: 'domcontentloaded' });
    for (const sel of ['.an-version', '.an-cellNote', '.an-footer']) {
      const size = await page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontSize);
      expect(size, `${scheme} ${sel} 不是 11px——var(--nexus-font-size-11) 回退了继承值`).toBe('11px');
    }
  }
});

test('@smoke §FE-14 三元 range 两档视觉分档：选中态 an-rangeOn 比 an-rangeOff 真强', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });

  const on = page.locator('.an-rangeOn');
  const off = page.locator('.an-rangeOff').first();
  const onStyle = await on.evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.color, style: s.textDecorationStyle };
  });
  const offStyle = await off.evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.color, style: s.textDecorationStyle };
  });
  expect(onStyle.color, '三元选中/未选中颜色相同，分档没生效').not.toBe(offStyle.color);
  expect(onStyle.style, '选中态应为实线下划线').toBe('solid');
  expect(offStyle.style, '未选中态应为虚线下划线').toBe('dotted');
  for (const c of [onStyle.color, offStyle.color]) {
    expect(c, 'range 链接 color 非有效 rgb').toMatch(/^rgb\(/);
  }
});

test('@smoke §FE-14 告警徽标 token 化双主题 AA：暗亮色值真切换且非空/非透明', async ({ page }) => {
  test.setTimeout(60_000);
  const readWarn = async (scheme: 'dark' | 'light'): Promise<string> => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setContent(htmlFor(scheme), { waitUntil: 'domcontentloaded' });
    return page.locator('[data-analytics-selfonly]').evaluate((el) => getComputedStyle(el).color);
  };
  const dark = await readWarn('dark');
  const light = await readWarn('light');
  expect(dark, '暗主题告警色非有效 rgb').toMatch(/^rgb\(/);
  expect(light, '亮主题告警色非有效 rgb').toMatch(/^rgb\(/);
  expect(dark, '告警色未随 warn-ink token 双主题切换').not.toBe(light);
  // 暗 #f5a623 / 亮 #7a4f00：亮主题须明显更暗（AA 压深，不是同一色）
  const lum = (rgb: string) => {
    // 上面已 toMatch(/^rgb\(/) 保证是 `rgb(r, g, b)` 三数字；解构用 ??0 收窄
    // noUncheckedIndexedAccess 下的 possibly-undefined，缺失分量按 0 不影响"比暗主题更暗"的判定。
    const parts = (rgb.match(/\d+/g) ?? []).map(Number);
    const [r = 0, g = 0, b = 0] = parts;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  expect(lum(light), '亮主题告警色没有比暗主题更暗（双主题 AA 未兑现）').toBeLessThan(lum(dark));
});

test('@smoke §FE-14 多个 Link / <a> 真 Tab :focus-visible 描边生效', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });

  for (const [sel, name] of [
    ['[data-state="denied"] .an-homeLink', '去首页'],
    ['[data-analytics-export]', 'CSV 导出'],
    ['.an-rangeOn', 'range 选中档'],
    ['.an-workLink', '作品外链'],
  ] as const) {
    expect(await tabUntilFocused(page, sel), `Tab 到不了${name}`).toBe(true);
    const outline = await page.locator(sel).evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth };
    });
    expect(outline.style, `${name} 键盘 focus 无描边`).toBe('solid');
    expect(parseFloat(outline.width), `${name} 键盘 focus 描边宽度为 0`).toBeGreaterThan(0);
  }
});

test('@smoke §FE-14 row hover 真生效；reduced-motion 下产品关闭块真关掉 fade / transition / hover 背景', async ({ page }) => {
  test.setTimeout(60_000);
  // ① 非 reduced：page fade-in、link transition、row hover 背景变化
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  const root = page.locator('[data-state="list"]');
  expect(await root.evaluate((el) => getComputedStyle(el).animationName)).toBe('an-fade-in');
  const linkDur = await page.locator('[data-analytics-export]').evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(parseFloat(linkDur), 'link 缺 transition 时长').toBeGreaterThan(0);
  const row = page.locator('[data-state="row"]');
  const bgBefore = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
  await row.hover();
  const bgAfter = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bgAfter, 'row hover 背景没变化').not.toBe(bgBefore);

  // ② reduced：只切 emulateMedia，触发 globals.css .an- 段自带产品块（零手工 !important 注入）
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  const reducedRoot = page.locator('[data-state="list"]');
  expect(await reducedRoot.evaluate((el) => getComputedStyle(el).animationName), 'reduced 下 fade-in 没被关').toBe('none');
  const reducedLinkDur = await page.locator('[data-analytics-export]').evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(parseFloat(reducedLinkDur), 'reduced 下 link transition 没被关').toBe(0);
  const reducedRow = page.locator('[data-state="row"]');
  const reducedBefore = await reducedRow.evaluate((el) => getComputedStyle(el).backgroundColor);
  await reducedRow.hover();
  const reducedAfter = await reducedRow.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(reducedAfter, 'reduced 下 row hover 背景仍变化——产品 reduced 块没生效').toBe(reducedBefore);
});
