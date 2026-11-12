import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * §FE-15 `TrendChart.tsx` `.tc-` 门面 + **三轴语义色守恒**的**浏览器那一寸**（脱离后端，纯 CSS + 真 SVG 因果）。
 *
 * 为什么离线：本机 3100 上游常无干净窗口（Next 未起时网关回 502），TrendChart 又是 server 组件，
 * 真页面要数据库 + 会话 + 发布记录 + 心跳。本片门面与 SVG 语义色的正确性只取决于两件事——真实产物的
 * **结构/data 钩子/三轴 color token/门面类名**与产物 `.tc-` CSS + tokens.css 在真 Chromium 下的
 * 双主题渲染，二者都与后端数据无关。本 spec 从**产物真实字节**取这两样，用 `page.setContent`
 * 离线注入，零后端零夹具。
 *
 * 为什么 markup 是"复刻样本"而非直接抽 JSX：TrendChart/MiniChart 是 server 组件，JSX 含
 * `{days.map(...)}`、`{showAxis ? … : null}`、`spec.color`/`spec.pick` 等表达式，裸 HTML 解释不了。
 * 因此人工构造**覆盖三轴各一根正常柱 + 一根缺数据柱 + 坐标轴标签**的静态 markup 样本，每个
 * className / data-* / 三轴 color token / 静态文案逐字取自真实产物（见 SAMPLE 旁出处）。**动态假数据**
 * （具体数字/日期/柱高）编造、不锚产物（FE-11 教训内置）。验的是"真实门面类 + 三轴语义色 + 缺数据
 * 虚线柱在真 Chrome 下的渲染因果"，不是"真页面点开过一遍"。诚实边界写进 ADR。
 *
 * 验五件静态门覆盖不了的事：
 *  1. 样本锚真实产物（SAMPLE 的 tc- 类 / data-analytics-* / 三轴 color token 逐字出自 TrendChart.tsx）；
 *  2. **三轴语义色双主题真渲染**：三张图柱子 fill 在真 Chrome 下解析成三个不同 rgb、跨暗/亮主题恒定
 *     （brand/accent-2/success 只在 tokens.css 声明一次、亮主题段不覆盖；真正随主题切换的是 fg-3 轴标签 fill）；
 *  3. **缺数据虚线短柱**：state=missing 柱真透明填充 + 轴色描边 + dasharray 2 2 + opacity 0.5 + 基线高度；
 *  4. **.tc-axisLabel**：9px 字号（size-9 token）与 fg-3 fill 真渲染，非回退继承；
 *  5. SVG role=img + aria-label + <title> 真结构 + 双主题零 console error。
 *
 * 静态那一寸归 `apps/web/test/trend-chart-visual-style.test.ts`。
 */
const CHART = join(process.cwd(), 'apps/web/src/app/analytics/TrendChart.tsx');
const GLOBALS = join(process.cwd(), 'apps/web/src/app/globals.css');
const TOKENS = join(process.cwd(), 'apps/web/src/styles/tokens.css');

const chartSrc = readFileSync(CHART, 'utf8');
const cssSrc = readFileSync(GLOBALS, 'utf8');
const tokensCss = readFileSync(TOKENS, 'utf8');

/** 从产物 globals.css 提取 `.tc-` 视觉段整段（首个 `.tc-` 到首个 `.an-` 之前）。 */
function extractTcSegment(css: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = clean.search(/\.tc-[A-Za-z]/);
  if (start < 0) throw new Error('globals.css 找不到 .tc- 视觉段——FE-15 没落地');
  const tail = clean.slice(start);
  const nextFacade = tail.search(/\.an-[A-Za-z]/);
  return nextFacade >= 0 ? tail.slice(0, nextFacade) : tail;
}

/**
 * 三轴 SVG markup 样本：className / data-* / 三轴 color token / 静态文案逐字取自真实产物字节。
 * 出处：TrendChart.tsx —
 *   opens:    color var(--nexus-color-accent-2) key 'opens'（:140-147）；
 *   visitors: color var(--nexus-color-brand)    key 'visitors'（:153-161）；
 *   playTime: color var(--nexus-color-success)  key 'playTimeMs'（:167-177）；
 *   结构: tc-root/tc-chart/tc-head/tc-title/tc-max/tc-svg/tc-axisLabel/tc-empty（:67-179）；
 *   data:  data-analytics-charts/series/series-max/bar/bar-day/bar-state/chart-empty（全文）；
 *   SVG:   role=img + aria-label + <title>、baseline stroke=var(--nexus-color-border-subtle)。
 * 动态假数据（作品数字/日期/point.day/柱高）编造、不锚产物。
 */
const AXES = [
  { key: 'opens', color: 'var(--nexus-color-accent-2)', title: '每天打开次数（只数真人；爬虫/自动化的打开另计在窗口汇总里，不画进这条曲线）', max: '12 次' },
  { key: 'visitors', color: 'var(--nexus-color-brand)', title: '每天访客数（同一人同一天只算一个；这一天没有人来就是 0）', max: '5 人' },
  { key: 'playTimeMs', color: 'var(--nexus-color-success)', title: '每天可见时长（虚线短柱 = 那一天一条心跳都没有，不是 0 秒）', max: '40 秒' },
] as const;

/** 单张图样本：一根正常柱（fill=轴色）+ 一根缺数据柱（fill=transparent/stroke=轴色/dasharray/opacity）。 */
function chartSvg(axis: (typeof AXES)[number], showAxis: boolean): string {
  return `
    <div class="tc-chart">
      <div class="tc-head">
        <span class="tc-title">${axis.title}</span>
        <span class="tc-max" data-analytics-series-max="${axis.key}">纵轴 0 → ${axis.max}</span>
      </div>
      <svg viewBox="0 0 720 92" class="tc-svg" role="img"
           aria-label="${axis.title}：2 天，最高 ${axis.max}" data-analytics-series="${axis.key}">
        <line x1="44" y1="80" x2="712" y2="80" stroke="var(--nexus-color-border-subtle)"></line>
        <rect x="120" y="20" width="22" height="60" fill="${axis.color}" stroke="none"
              data-analytics-bar="${axis.key}" data-analytics-bar-day="2026-11-01" data-analytics-bar-state="value">
          <title>2026-11-01 · 有数据</title>
        </rect>
        <rect x="300" y="77" width="22" height="3" fill="transparent" stroke="${axis.color}"
              stroke-dasharray="2 2" stroke-opacity="0.5"
              data-analytics-bar="${axis.key}" data-analytics-bar-day="2026-11-02" data-analytics-bar-state="missing">
          <title>2026-11-02 · 未采集（这一天没有心跳）</title>
        </rect>
        ${showAxis ? '<text x="130" y="89" text-anchor="middle" class="tc-axisLabel">11/01</text>' : ''}
      </svg>
    </div>`;
}

const SAMPLE = `
<div class="tc-root" data-analytics-charts>
  ${chartSvg(AXES[0], false)}
  ${chartSvg(AXES[1], false)}
  ${chartSvg(AXES[2], true)}
  <p class="tc-empty" data-analytics-chart-empty>这 2 天里一条心跳都没有：图上的 0 是"没人来"，不是"没采到"（采集一直开着）。</p>
</div>`;

const tcCss = extractTcSegment(cssSrc);

/** 真实 token + 真实 .tc- CSS + 三轴样本装进一个 data-nexus-theme 可控文档。 */
function htmlFor(scheme: 'dark' | 'light'): string {
  return `<!doctype html><html lang="zh-CN" data-nexus-theme="${scheme}"><head><meta charset="utf-8" />
    <style>${tokensCss}</style>
    <style>
      :root { color-scheme: ${scheme}; }
      body { margin: 0; background: var(--nexus-color-bg-0); color: var(--nexus-color-fg-1); }
      ${tcCss}
    </style></head><body>${SAMPLE}</body></html>`;
}

test('@smoke §FE-15 样本锚真实产物：tc- 类 / data-* / 三轴 color token 逐字出自 TrendChart.tsx', async () => {
  // SAMPLE 是人造静态 markup（server 组件含 JS 表达式，裸 HTML 解释不了）。这道门把 JSDoc 的
  // "逐字取自真实产物"承诺变成可执行判据：样本一旦与产物脱节就红。动态假数据不锚。
  const classes = [...new Set([...SAMPLE.matchAll(/\btc-[A-Za-z0-9-]+/g)].map((m) => m[0]!))];
  const missingClasses = classes.filter((c) => !chartSrc.includes(c));
  expect(missingClasses, `SAMPLE 用了产物里不存在的 tc- 类：${missingClasses.join(', ')}`).toEqual([]);

  const hooks = [...new Set([...SAMPLE.matchAll(/\bdata-analytics-[a-z-]+/g)].map((m) => m[0]!))];
  const missingHooks = hooks.filter((h) => !chartSrc.includes(h));
  expect(missingHooks, `SAMPLE 用了产物里不存在的 data-* 钩子：${missingHooks.join(', ')}`).toEqual([]);

  // 三轴语义色 token 逐字锚产物（本片灵魂，动态假数据不锚但色必须锚）
  for (const axis of AXES) {
    expect(chartSrc, `${axis.key} 轴的 color token「${axis.color}」不在真实产物里`).toContain(`color: '${axis.color}'`);
    expect(chartSrc, `${axis.key} 轴的 key 不在真实产物里`).toContain(`key: '${axis.key}'`);
  }
  // 缺数据柱的 SVG 语义 attributes 逐字锚产物
  for (const fragment of [
    "fill={empty ? 'transparent' : spec.color}",
    "stroke={empty ? spec.color : 'none'}",
    "strokeDasharray={empty ? '2 2' : undefined}",
    'strokeOpacity={empty ? 0.5 : undefined}',
    'stroke="var(--nexus-color-border-subtle)"',
  ]) {
    expect(chartSrc, `缺数据语义「${fragment}」不在真实产物里`).toContain(fragment);
  }
  // 三轴真实静态文案逐字锚产物
  for (const axis of AXES) expect(chartSrc, `三轴标题「${axis.title.slice(0, 12)}」不在产物里`).toContain(axis.title);
});

for (const scheme of ['dark', 'light'] as const) {
  test(`@smoke §FE-15 三轴语义色双主题渲染（${scheme}）：三色两两不同 + SVG 结构 + 零 console error`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: scheme });
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    });

    await page.setContent(htmlFor(scheme), { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-analytics-series]')).toHaveCount(3);
    await expect(page.locator('[data-analytics-series-max]')).toHaveCount(3);
    await expect(page.locator('svg[role="img"][aria-label]')).toHaveCount(3);
    await expect(page.locator('[data-analytics-bar]')).toHaveCount(6); // 3 轴 × (正常 + 缺数据)
    await expect(page.locator('[data-analytics-bar-state="value"]')).toHaveCount(3);
    await expect(page.locator('[data-analytics-bar-state="missing"]')).toHaveCount(3);
    await expect(page.locator('svg title')).toHaveCount(6);
    await expect(page.locator('.tc-axisLabel')).toHaveCount(1);
    await expect(page.locator('[data-analytics-chart-empty]')).toHaveCount(1);

    // 三轴正常柱 fill 在真 Chrome 下必须解析成三个互异的 rgb（语义色守恒的浏览器因果）
    const fills: string[] = [];
    for (const key of AXES.map((a) => a.key)) {
      fills.push(await page.locator(`[data-analytics-bar="${key}"][data-analytics-bar-state="value"]`).evaluate(
        (el) => getComputedStyle(el).fill,
      ));
    }
    for (const c of fills) expect(c, `三轴 fill 非有效 rgb：${c}`).toMatch(/^rgb\(/);
    expect(new Set(fills).size, `三轴语义色在 ${scheme} 撞色，图失去区分：${fills.join(' | ')}`).toBe(3);

    expect(consoleErrors, `${scheme} 控制台有报错：\n${consoleErrors.join('\n')}`).toEqual([]);
  });
}

test('@smoke §FE-15 三轴语义色跨双主题恒定 + 缺数据虚线柱真渲染（透明填充/轴色描边/2 2/0.5/基线高度）', async ({ page }) => {
  test.setTimeout(60_000);
  const readAxisColor = async (scheme: 'dark' | 'light'): Promise<string[]> => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setContent(htmlFor(scheme), { waitUntil: 'domcontentloaded' });
    const out: string[] = [];
    for (const key of AXES.map((a) => a.key)) {
      out.push(await page.locator(`[data-analytics-bar="${key}"][data-analytics-bar-state="value"]`).evaluate(
        (el) => getComputedStyle(el).fill,
      ));
    }
    return out;
  };
  const dark = await readAxisColor('dark');
  const light = await readAxisColor('light');
  // 三轴语义色（brand/accent-2/success）在 tokens.css 只声明一次、亮主题段不覆盖——
  // 设计上跨双主题**恒定**：同一轴在两主题下颜色必须一致，读者才不会把"打开"在两个主题读成两种量。
  // 故正确契约是"暗=亮且两主题下都两两不同"，而非"随主题切换"（初版判据在此拍错、读码后修实）。
  for (let i = 0; i < dark.length; i++) {
    expect(dark[i], `第 ${i} 轴语义色跨双主题漂移——同量在两主题下会是两种颜色`).toBe(light[i]);
  }
  expect(new Set(dark).size, `暗主题三轴撞色：${dark.join(' | ')}`).toBe(3);
  expect(new Set(light).size, `亮主题三轴撞色：${light.join(' | ')}`).toBe(3);

  // 真正该随双主题切换的是坐标轴标签 fg-3（表面/文本层），验它确实变了——
  // 与上面三轴恒定形成对照：语义色守恒定、文本层守对比度，各司其职。
  const readAxisLabelFill = async (scheme: 'dark' | 'light'): Promise<string> => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setContent(htmlFor(scheme), { waitUntil: 'domcontentloaded' });
    return page.locator('.tc-axisLabel').evaluate((el) => getComputedStyle(el).fill);
  };
  expect(await readAxisLabelFill('dark'), 'fg-3 轴标签暗/亮撞色——文本层未随双主题切换').not.toBe(
    await readAxisLabelFill('light'),
  );

  // 缺数据柱：真计算样式验"别把图画成谎话"——透明填充 + 轴色描边 + 虚线 + 半透明
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  const missing = page.locator('[data-analytics-bar-state="missing"]').first();
  const mStyle = await missing.evaluate((el) => {
    const s = getComputedStyle(el);
    return { fill: s.fill, stroke: s.stroke, dash: s.strokeDasharray, opacity: s.strokeOpacity, height: el.getAttribute('height') };
  });
  // transparent 在 Chrome computed fill 里是 rgba(0,0,0,0)
  expect(mStyle.fill, '缺数据柱不该有实心填充（会读成一根柱子）').toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(mStyle.stroke, '缺数据柱描边须是轴色 token').toMatch(/^rgb\(/);
  // Chrome computed strokeDasharray 随版本返回 "2px 2px" 或 "2px, 2px"——归一化分隔符后比语义，不比格式。
  expect(mStyle.dash.replace(/,\s*/g, ' '), '缺数据柱须是虚线（2 2）').toBe('2px 2px');
  expect(parseFloat(mStyle.opacity)).toBeCloseTo(0.5, 2);
  expect(Number(mStyle.height), '缺数据柱高度须是 MISSING_STUB=3 短柱（非 0、非满高）').toBe(3);
});

test('@smoke §FE-15 .tc-axisLabel 9px 字号与 fg-3 fill 真渲染（size-9 token 落地、非回退继承）', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  const label = page.locator('.tc-axisLabel');
  const style = await label.evaluate((el) => {
    const s = getComputedStyle(el);
    return { fontSize: s.fontSize, fill: s.fill };
  });
  expect(style.fontSize, '坐标轴标签须是 9px（size-9 token），非回退 16px').toBe('9px');
  expect(style.fill, '坐标轴标签 fill 须是 fg-3 token 解析色').toMatch(/^rgb\(/);
  // size-9 确实在真实 tokens.css 声明为 9px（门锚产物，防样本自说自话）
  expect(tokensCss).toMatch(/--nexus-font-size-9:\s*9px/);
});
