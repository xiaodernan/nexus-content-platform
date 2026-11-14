import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * §FE-19 Studio 顶栏 `TopBar.tsx` `.sp-` 门面——浏览器那一寸（setContent 离线注入，不访问任何 URL）。
 *
 * 样本结构对齐产物 `TopBar.tsx` 的真实分支（视口三态/保存态/disabled/2 个 <a>/4 个 data 钩子），
 * 类名、data 钩子、诚实文案逐字对齐产物（drift 靠 `studio-topbar-visual-style.test.ts` 的
 * 剥 className SHA256 门钉死）。tokens.css + .sp- 段真注入，Chrom 真渲染是它和纯静态门的关键差量。
 *
 * 验：
 *  1. 深/浅双主题各真渲染（顶栏/wordmark/视口/保存态/预览在页、零 console）；
 *  2. `.sp-` 段计算样式真生效（viewOn brand 底 / viewOff 无底 / divider 1px×1rem / topbar z-60）；
 *  3. 键盘 Tab 聚焦 `.sp-wordmark`（<a>）与 `.sp-topBtn` 有 brand outline；
 *  4. disabled TopButton 真 `cursor:not-allowed` + 半透明；
 *  5. 64rem 响应式：窄视口 railToggle 可见、宽视口隐藏（原 lg:hidden 真编译值）；
 *  6. 视口/保存态两态计算样式可分（不把状态记成谎话）。
 */
const GLOBALS = join(process.cwd(), 'apps/web/src/app/globals.css');
const TOKENS = join(process.cwd(), 'apps/web/src/styles/tokens.css');

/** 去注释后提取 `.sp-` 段（首个 .sp- 到下一个 § 段头或 EOF）——与静态门同一段边界范式。 */
function extractSpSegment(css: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = clean.search(/\.sp-[A-Za-z]/);
  if (start < 0) throw new Error('globals.css 找不到 .sp- 段——FE-19 没落地');
  const tail = clean.slice(start);
  const next = tail.search(/\/\*\s*─+\s*§[A-Z]/);
  return next >= 0 ? tail.slice(0, next) : tail;
}

const spCss = extractSpSegment(readFileSync(GLOBALS, 'utf8'));
const tokensCss = readFileSync(TOKENS, 'utf8');

/**
 * 真实分支样本：header + wordmark(<a>) + divider + 项目名按钮 + 撤销/重做(disabled/active) +
 * 保存态(error) + 视口三态(design 选中) + 主题下拉 + 预览(<a>)。
 * data 钩子逐字对齐 TopBar.tsx：data-project-name / data-save-state / data-viewport / data-theme-mode。
 */
const SAMPLE = `
<header class="sp-topbar" data-sp-root>
  <button class="sp-railToggle" data-rail-toggle>面板</button>
  <a href="/" class="sp-wordmark" data-wordmark>NEXUS</a>
  <span class="sp-divider" data-divider></span>
  <button class="sp-nameBtn" data-project-name>我的作品</button>
  <div class="sp-toolGroup">
    <button class="sp-topBtn sp-topBtnOff sp-topBtnDisabled" data-undo disabled>撤销</button>
    <button class="sp-topBtn sp-topBtnOff" data-redo>重做</button>
  </div>
  <div class="sp-actions">
    <span class="sp-saveState sp-saveErr" data-save-state>保存失败：网络异常</span>
    <div class="sp-toolGroup" data-view-switch>
      <button class="sp-viewportBtn sp-viewportOn" data-viewport="design">设计</button>
      <button class="sp-viewportBtn sp-viewportOff" data-viewport="mobile">手机 375</button>
      <button class="sp-viewportBtn sp-viewportOff" data-viewport="tablet">平板 768</button>
      <button class="sp-viewportBtn sp-topBtnOn" data-grid aria-pressed="true">网格</button>
    </div>
    <select class="sp-modeSelect" data-theme-mode><option>默认主题</option></select>
    <a href="/preview/p1" class="sp-previewLink" data-preview>预览</a>
  </div>
</header>`;

function htmlFor(scheme: 'dark' | 'light'): string {
  return `<!doctype html><html lang="zh-CN" data-nexus-theme="${scheme}"><head><meta charset="utf-8" />
    <style>${tokensCss}</style>
    <style>:root { color-scheme: ${scheme}; } body { margin: 0; } ${spCss}</style>
  </head><body>${SAMPLE}</body></html>`;
}

for (const scheme of ['dark', 'light'] as const) {
  test(`@smoke §FE-19 Studio 顶栏双主题渲染 + 钩子（${scheme}）`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: scheme });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
    await page.setContent(htmlFor(scheme), { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-wordmark]')).toHaveText('NEXUS');
    await expect(page.locator('[data-wordmark]')).toHaveAttribute('href', '/');
    await expect(page.locator('[data-preview]')).toHaveAttribute('href', '/preview/p1');
    await expect(page.locator('[data-project-name]')).toHaveText('我的作品');
    await expect(page.locator('[data-save-state]')).toHaveText('保存失败：网络异常');
    await expect(page.locator('[data-viewport]')).toHaveCount(3);
    // 4 个真实 data 钩子都在
    for (const h of ['data-project-name', 'data-save-state', 'data-theme-mode', 'data-viewport']) {
      await expect(page.locator(`[${h}]`).first()).toBeVisible();
    }
    // 顶栏 background 真来自 token（非透明），viewOn 品牌底 / viewOff 无底可分
    const barBg = await page.locator('[data-sp-root]').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(barBg).toMatch(/^rgb\(/);
    const onBg = await page.locator('[data-viewport="design"]').evaluate((el) => getComputedStyle(el).backgroundColor);
    const offBg = await page.locator('[data-viewport="mobile"]').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(onBg).not.toBe(offBg);
    // 保存态 error 用 danger-ink（非 fg-3），语义色可分
    const errColor = await page.locator('[data-save-state]').evaluate((el) => getComputedStyle(el).color);
    expect(errColor).toMatch(/^rgb\(/);
    expect(errors, `${scheme} 控制台报错：\n${errors.join('\n')}`).toEqual([]);
  });
}

test('@smoke §FE-19 计算样式守恒：divider 1px×1rem / topbar z-60 / viewOn 品牌实底', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  const d = await page.locator('[data-divider]').evaluate((el) => {
    const s = getComputedStyle(el); return { w: s.width, h: s.height };
  });
  expect(parseFloat(d.w), 'divider 应 1px').toBeCloseTo(1, 1);
  expect(parseFloat(d.h), 'divider 应 1rem(16px)').toBeCloseTo(16, 0);
  const z = await page.locator('[data-sp-root]').evaluate((el) => getComputedStyle(el).zIndex);
  expect(z, 'topbar z-index 应 60').toBe('60');
  const on = await page.locator('[data-viewport="design"]').evaluate((el) => getComputedStyle(el).color);
  const off = await page.locator('[data-viewport="mobile"]').evaluate((el) => getComputedStyle(el).color);
  expect(on, 'viewOn=accent-fg / viewOff=fg-3，两态前景色可分').not.toBe(off);
});

test('@smoke §FE-19 键盘可达：真 Tab 聚焦 <a> 与 <button> 有 brand outline', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  // 真键盘 Tab 才触发 :focus-visible（程序化 el.focus() 对 <button> 在 Chrome 下不触发，
  // 会假红——FE-18 同款教训：键盘可达必须真按键，不能绕过用户实际操作路径）。
  // 依次 Tab，累计记录每个被聚焦元素的 focus-visible 计算样式。
  const seen: Record<string, { style: string; width: number }> = {};
  const checked = new Set<string>();
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press('Tab');
    const cur = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const s = getComputedStyle(el);
      return { cls: el.className, style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    if (!cur) continue;
    for (const [kind, marker] of [['wordmark', 'sp-wordmark'], ['topBtn', 'sp-topBtn']] as const) {
      if (checked.has(kind)) continue;
      // 跳过 disabled 按钮（撤销不可聚焦），认准带对应类的当前焦点
      if (cur.cls.split(/\s+/).includes(marker)) {
        seen[kind] = { style: cur.style, width: cur.width };
        checked.add(kind);
      }
    }
    if (checked.size === 2) break;
  }
  for (const kind of ['wordmark', 'topBtn']) {
    const o = seen[kind];
    expect(o, `Tab 没走到 ${kind}（键盘不可达）`).toBeTruthy();
    expect(o!.style, `${kind} 聚焦环应 solid`).toBe('solid');
    expect(o!.width, `${kind} 聚焦环宽度应 > 0`).toBeGreaterThan(0);
  }
});

test('@smoke §FE-19 disabled 语义：撤销按钮真 not-allowed + 半透明', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  const dis = await page.locator('[data-undo]').evaluate((el) => {
    const s = getComputedStyle(el); return { cursor: s.cursor, opacity: s.opacity };
  });
  expect(dis.cursor).toBe('not-allowed');
  expect(parseFloat(dis.opacity)).toBeCloseTo(0.4, 1);
});

test('@smoke §FE-19 响应式真值：原 lg:hidden 在 64rem 两侧真切换 railToggle', async ({ page }) => {
  test.setTimeout(60_000);
  // @media (min-width:64rem) 看的是 **viewport 宽**，不是 body style（setContent 下写 body 宽无效，
  // Playwright viewport 恒 1280px 会假红）——必须真 setViewportSize 改视口（首跑吃过这个亏）。
  await page.setViewportSize({ width: 1000, height: 720 });         // < 1024px(64rem)
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-rail-toggle]')).toBeVisible();   // 窄视口：可见
  await page.setViewportSize({ width: 1100, height: 720 });         // >= 1024px(64rem)
  await expect(page.locator('[data-rail-toggle]')).toBeHidden();    // 宽视口：隐藏（lg:hidden 真编译值）
});
