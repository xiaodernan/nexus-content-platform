import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * §FE-9 根 404 门面 `/not-found.tsx` 的**浏览器那一寸**（脱离后端，纯 CSS + 真实结构因果验证）。
 *
 * 为什么离线：本机 3100 端口常无干净窗口（上游 Next dev server 未起时网关回 502，
 * `upstream connect failed`），而这条门面的正确性只取决于两件事——not-found.tsx 的真实
 * JSX 结构（六个 data-not-found-* 钩子、诚实文案、两个去处）与产物 `.nf-` CSS 在真
 * Chromium 下的双主题渲染。二者都与后端数据无关。本 spec 从**产物源码真实提取**这两样，
 * 用 `page.setContent` 离线注入，零后端、零夹具、确定性、不假绿也不误报。
 *
 * 验四件事（都是静态门无法覆盖、"必须真浏览器"的那一寸）：
 *  1. 深/浅双主题下门面真渲染、诚实文案与全部结构钩子/去处在、零 console error；
 *  2. 浅色下 `.nf-code` / `.nf-title` 渐变墨字仍是 transparent 字 + gradient
 *     （background-clip:text 的预期形态，非 bug，由 A11Y-1 forced 门兜高对比度）；
 *  3. 键盘 Tab / focus 下两个链接的 `:focus-visible` 描边真生效；
 *  4. forced-colors:active 下 nf 渐变墨字从透明字回退为系统前景色 + border-box
 *     （A11Y-1 联动：Chromium 已兜住 color/bg，clip:text 残留是跨 UA 隐患，测这个可区分量）。
 *
 * 静态那一寸（类名闭环/零 hex/token/钩子/诚实边界/零行为/reduced-motion/focus/
 * 层优先级/forced 联动/注释配对）归 `apps/web/test/not-found-visual-style.test.ts`。
 */
const PAGE = join(process.cwd(), 'apps/web/src/app/not-found.tsx');
const GLOBALS = join(process.cwd(), 'apps/web/src/app/globals.css');
const TOKENS = join(process.cwd(), 'apps/web/src/styles/tokens.css');

/**
 * 从产物 not-found.tsx 里取出 return(...) 内的真实 JSX（类名/文案/data 钩子全用真字节），
 * 只做 React→HTML 的**载体适配**（不改结构、不改类名、不改文案）：
 *  - `className=` → `class=`（HTML 里 className 不是类属性，不转则 .nf-* 选择器一个都匹配不到）；
 *  - `<Link>` → `<a>`（Next 组件在裸 HTML 里不是链接元素）；
 *  - 站内 `href="/.…"` → 绝对 `http://localhost/.…`（setContent 无 baseURL，相对 href 会解析到 about:blank）。
 */
function extractMarkup(src: string): string {
  const start = src.indexOf('<main');
  const end = src.lastIndexOf('</main>');
  if (start < 0 || end < 0) throw new Error('not-found.tsx 找不到 <main>...</main> 门面结构');
  return src
    .slice(start, end + '</main>'.length)
    .replace(/\bclassName=/g, 'class=')
    .replace(/<Link\b/g, '<a')
    .replace(/<\/Link>/g, '</a>')
    .replace(/\bhref="\//g, 'href="http://localhost/');
}

/** 从产物 globals.css 里按括号深度提取 `.nf-` 视觉段整段（到 forced-colors 块之前）。 */
function extractNfSegment(css: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = clean.search(/\.nf-[A-Za-z]/);
  if (start < 0) throw new Error('globals.css 找不到 .nf- 视觉段——FE-9 没落地');
  const tail = clean.slice(start);
  const forcedAt = tail.search(/@media\s*\(forced-colors:\s*active\)/);
  return (forcedAt >= 0 ? tail.slice(0, forcedAt) : tail);
}

/** 从产物 globals.css 里按括号深度提取 `@media (forced-colors: active) { ... }` 整块。 */
function extractForcedColorsBlock(css: string): string {
  const marker = '@media (forced-colors: active)';
  const start = css.indexOf(marker);
  if (start < 0) throw new Error('globals.css 找不到 forced-colors 块');
  const braceStart = css.indexOf('{', start);
  let depth = 0;
  let end = braceStart;
  for (; end < css.length; end++) {
    if (css[end] === '{') depth++;
    else if (css[end] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return css.slice(start, end + 1);
}

const pageSrc = readFileSync(PAGE, 'utf8');
const cssSrc = readFileSync(GLOBALS, 'utf8');
/** 真实 token 定义：.nf- 段的 var(--nexus-*) 全靠它解析，缺了会让 gradient / outline 整条失效。 */
const tokensCss = readFileSync(TOKENS, 'utf8');
const markup = extractMarkup(pageSrc);
const nfCss = extractNfSegment(cssSrc);
const forcedBlock = extractForcedColorsBlock(cssSrc);

/**
 * 把真实 token + 真实门面结构 + 真实 .nf- CSS 离线装进一个 data-nexus-theme 可控的文档。
 * 必须注入产物 tokens.css：否则 .nf-code 的 linear-gradient(var(...)) 在 computed-value time
 * 因变量未定义整条失效（background-image=none），:focus-visible 的 outline 同理——那是载体缺
 * 变量上下文，不是产品缺陷。tokens.css 里的 [data-nexus-theme='light'] 段随 scheme 自动切换。
 */
function htmlFor(scheme: 'dark' | 'light', forcedCss = ''): string {
  return `<!doctype html><html lang="zh-CN" data-nexus-theme="${scheme}"><head><meta charset="utf-8" />
    <style>${tokensCss}</style>
    <style>
      :root { color-scheme: ${scheme}; }
      body { margin: 0; }
      ${nfCss}
      ${forcedCss}
    </style></head><body>${markup}</body></html>`;
}

for (const scheme of ['dark', 'light'] as const) {
  test(`@smoke §FE-9 根 404 门面双主题渲染（${scheme}）：诚实文案/钩子/去处/零 console error`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: scheme });
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    });

    await page.setContent(htmlFor(scheme), { waitUntil: 'domcontentloaded' });

    // 门面与全部结构钩子真渲染
    await expect(page.locator('.nf-root')).toBeVisible();
    await expect(page.locator('[data-not-found]')).toBeVisible();
    for (const hook of [
      'data-not-found-code',
      'data-not-found-title',
      'data-not-found-detail',
      'data-not-found-actions',
      'data-not-found-honesty',
    ]) {
      await expect(page.locator(`[${hook}]`), `结构钩子 ${hook} 没渲染`).toHaveCount(1);
    }
    await expect(page.locator('.nf-code')).toHaveText('404');
    await expect(page.locator('.nf-title')).toHaveText('这个地址没有内容');
    // 诚实边界：不臆断 + 列原因，真浏览器里文本确实在
    await expect(page.locator('.nf-honesty')).toContainText('不会替你猜');
    await expect(page.locator('.nf-reasons')).toContainText('失效');
    // 两个去处都是真链接
    await expect(page.locator('[data-not-found-discover]')).toHaveAttribute('href', /\/discover$/);
    await expect(page.locator('[data-not-found-home]')).toHaveAttribute('href', /\/$/);

    // 渐变墨字：transparent 字 + gradient 在两主题都在（背景裁剪文字的预期形态）
    for (const cls of ['.nf-code', '.nf-title']) {
      const color = await page.locator(cls).evaluate((el) => getComputedStyle(el).color);
      const image = await page.locator(cls).evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(color, `${cls} ${scheme} 下不是透明字`).toBe('rgba(0, 0, 0, 0)');
      expect(image, `${cls} ${scheme} 下渐变墨字丢了`).toContain('gradient');
    }

    expect(consoleErrors, `${scheme} 控制台有报错：\n${consoleErrors.join('\n')}`).toEqual([]);
  });
}

test('@smoke §FE-9 根 404 门面键盘可达：两个去处的 :focus-visible 描边真生效', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });

  // 用真 Tab 键导航（而非编程 focus()）：:focus-visible 的语义就是"键盘可达"，
  // 两个链接是文档里仅有的可聚焦元素，连按两次 Tab 依次落到去发现页 / 回首页。
  for (const sel of ['.nf-discover', '.nf-home']) {
    await page.keyboard.press('Tab');
    await expect(page.locator(sel), `Tab 没落到 ${sel}`).toBeFocused();
    const outline = await page.locator(sel).evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth };
    });
    expect(outline.style, `${sel} 键盘 focus 无描边样式`).toBe('solid');
    expect(parseFloat(outline.width), `${sel} 键盘 focus 描边宽度为 0`).toBeGreaterThan(0);
  }
});

test('@smoke §FE-9 forced-colors 下 nf 渐变墨字回退为系统前景色（A11Y-1 联动）', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ forcedColors: 'active' });

  // ① 对照组：只有 .nf- 常规 CSS，无 forced 回退。Chromium 兜住 color/bg，但 clip 仍残留 text。
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  const before = await page.locator('.nf-title').evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.color, backgroundClip: s.backgroundClip };
  });
  expect(before.color, 'Chromium 理应在 forced 态把 color 兜成系统前景色').not.toBe('rgba(0, 0, 0, 0)');
  expect(before.backgroundClip, '无回退时 background-clip 应残留 text——这是回退要改变的量').toBe('text');

  // ② 实验组：注入产物真实 forced 回退块（含 .nf-code, .nf-title 独立组）。
  await page.setContent(htmlFor('dark', forcedBlock), { waitUntil: 'domcontentloaded' });
  const after = await page.locator('.nf-title').evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      color: s.color,
      backgroundClip: s.backgroundClip,
      visibility: s.visibility,
      text: el.textContent?.trim(),
    };
  });
  expect(after.backgroundClip, 'forced 态 background-clip 没回落到 border-box，透明字裁剪仍在').toBe('border-box');
  expect(after.color, '回退后不是系统前景色').toMatch(/^rgb\(/);
  expect(after.color, '回退后仍是透明字').not.toBe('rgba(0, 0, 0, 0)');
  expect(after.visibility).toBe('visible');
  expect(after.text, '标题文本丢了').toBe('这个地址没有内容');
});
