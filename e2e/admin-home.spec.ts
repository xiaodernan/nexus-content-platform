import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test, expect } from '@playwright/test';
import { ADMIN_AREAS, AdminHomeCards } from '../apps/web/src/app/admin/AdminHomeCards';

/**
 * §A11Y-4 /admin 管理台首页——浏览器那一寸。
 *
 * 卡片直接渲染产品组件，样式直接截取产品 globals.css；样本只提供会话门外的页面外壳。
 * 这样卡片数量、文案、链接或 CSS 类名漂移时，浏览器断言会跟着真实产物红，而不是守着手抄样本。
 */
const PAGE = join(process.cwd(), 'apps/web/src/app/admin/page.tsx');
const NAV = join(process.cwd(), 'apps/web/src/components/AdminNav.tsx');
const GLOBALS = join(process.cwd(), 'apps/web/src/app/globals.css');
const TOKENS = join(process.cwd(), 'apps/web/src/styles/tokens.css');

const pageSrc = readFileSync(PAGE, 'utf8');
const navSrc = readFileSync(NAV, 'utf8');
const globalsCss = readFileSync(GLOBALS, 'utf8');
const tokensCss = readFileSync(TOKENS, 'utf8');

function extractAdmSegment(css: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = clean.indexOf('.adm-denied {');
  if (start < 0) throw new Error('globals.css 找不到 .adm- 段');
  const rest = clean.slice(start);
  const next = rest.search(/\.ar-[A-Za-z]/);
  return next > 0 ? rest.slice(0, next) : rest;
}

const ADMIN_CSS = extractAdmSegment(globalsCss);
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function cardsMarkup(locale: 'zh' | 'en'): string {
  return renderToStaticMarkup(createElement(AdminHomeCards, { locale }));
}

function htmlFor(scheme: 'dark' | 'light', locale: 'zh' | 'en' = 'zh'): string {
  const zh = locale === 'zh';
  const shell = `<main class="adm-shell" data-admin-home-root>
    <header class="adm-head">
      <div>
        <p class="adm-kicker" data-admin-home-kicker>admin console</p>
        <h1 class="adm-title">${zh ? '管理台' : 'Admin console'}</h1>
        <p class="adm-lede">${zh
          ? `控制面上你能做的每一件事，今安静地摆在${ADMIN_AREAS.length}张卡里；单击进入前，先读卡的一句话。`
          : `Everything you can do on the control plane sits quietly in ${ADMIN_AREAS.length} cards; read the one-liner before you click in.`}</p>
      </div>
    </header>
    ${cardsMarkup(locale)}
  </main>`;
  return `<!doctype html><html lang="${zh ? 'zh-CN' : 'en'}" data-nexus-theme="${scheme}"><head><meta charset="utf-8" />
    <style>${tokensCss}</style>
    <style>:root { color-scheme: ${scheme}; } body { margin: 0; } ${ADMIN_CSS}</style>
  </head><body>${shell}</body></html>`;
}

async function expectNoOverflow(page: import('@playwright/test').Page, width: number): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${width}px 横向溢出`).toBe(0);
}

for (const scheme of ['dark', 'light'] as const) {
  test(`@smoke §A11Y-4 /admin 真实卡片双主题渲染（${scheme}）`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: scheme });
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`); });
    await page.setContent(htmlFor(scheme), { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-admin-home-root]')).toBeVisible();
    await expect(page.locator('[data-admin-home-cards]')).toBeVisible();
    await expect(page.locator('[data-admin-home-card]')).toHaveCount(ADMIN_AREAS.length);
    for (const area of ADMIN_AREAS) {
      const card = page.locator(`[data-admin-home-card="${area.slug}"]`);
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute('href', area.href);
      await expect(card.locator('.adm-cardTitle')).toHaveText(area.titleZh);
    }

    expect(navSrc).toContain("{ key: 'home', href: '/admin', labelZh: '管理台', labelEn: 'Admin console' }");
    expect(pageSrc).toContain('current="home"');
    const kickerColor = await page.locator('.adm-kicker').evaluate((el) => getComputedStyle(el).color);
    expect(kickerColor).toMatch(/^rgb\(/);
    const gridCols = await page.locator('.adm-cards').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(gridCols, '1280px 需要 3 列').toBe(3);
    await expectNoOverflow(page, 1280);
    expect(consoleErrors, `${scheme} 控制台报错：\n${consoleErrors.join('\n')}`).toEqual([]);

    const screenshot = testInfo.outputPath(`admin-home-${scheme}-1280.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log(`screenshot: ${screenshot}`);
  });
}

for (const [width, columns] of [[390, 1], [768, 2], [1280, 3]] as const) {
  test(`@smoke §A11Y-4 /admin 真实卡片 ${width}px 响应式与相交检查`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
    await expectNoOverflow(page, width);
    const cols = await page.locator('.adm-cards').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(cols, `${width}px 列数`).toBe(columns);

    const boxes = await page.locator('[data-admin-home-card]').evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    }));
    expect(boxes.every((box) => box.width > 0 && box.height >= 104), '卡片不得折叠或被裁空').toBe(true);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlaps = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        expect(overlaps, `卡片 ${i} 与 ${j} 相交`).toBe(false);
      }
    }

    const screenshot = testInfo.outputPath(`admin-home-dark-${width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log(`screenshot: ${screenshot}`);
  });
}

test('@smoke §A11Y-4 /admin 十四张真实卡片全是链接，英文表面无 CJK 残留', async ({ page }) => {
  await page.setContent(htmlFor('dark', 'en'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-admin-home-card]')).toHaveCount(14);
  await expect(page.locator('[data-admin-home-cards] a')).toHaveCount(14);
  await expect(page.locator('button')).toHaveCount(0);
  const english = await page.locator('[data-admin-home-cards]').innerText();
  expect(english).not.toMatch(CJK);
  for (const area of ADMIN_AREAS) {
    await expect(page.locator(`[data-admin-home-card="${area.slug}"] .adm-cardTitle`)).toHaveText(area.titleEn);
  }
});
