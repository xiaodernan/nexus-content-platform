/**
 * §A11Y-3 取证：用 headless Chromium 渲染 docs/evidence/admin-nav-elevation/preview.html
 * ——该 HTML 不是 apps/web 的编译产物，而是"AdminNav.tsx 在本仓设计 token 下的落样"
 * 设计证据（CSS 数值逐字对应 tokens.css）。截图不证明生产构建，只证明设计形态、
 * 双主题对比、focus-visible 环与 forced-colors 媒体下的退化路径。
 *
 * 用法：npx tsx scripts/capture-admin-nav.mts
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', 'docs', 'evidence', 'admin-nav-elevation');
const page_url = 'file://' + path.resolve(outDir, 'preview.html').replace(/\\/g, '/');

const browser = await chromium.launch({ channel: 'chrome' });

for (const theme of ['dark', 'light'] as const) {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 250 },
    colorScheme: theme,
  });
  const page = await context.newPage();
  await page.goto(`${page_url}?theme=${theme}&current=observability`, { waitUntil: 'load' });
  await page.waitForSelector('[data-admin-nav]', { timeout: 15_000 });
  await page.screenshot({ path: path.join(outDir, `${theme}.png`), fullPage: false });
  await context.close();
  console.log(`captured ${theme}.png`);
}

// forced-colors 退化路径：Chrome 会砍掉渐变/backdrop，组件必须仍说得清自己是哪一格
const context = await browser.newContext({
  viewport: { width: 1024, height: 250 },
  colorScheme: 'dark',
  forcedColors: 'active',
});
const page = await context.newPage();
await page.goto(`${page_url}?theme=dark&current=observability`, { waitUntil: 'load' });
await page.waitForSelector('[data-admin-nav]', { timeout: 15_000 });
await page.screenshot({ path: path.join(outDir, 'forced-colors.png'), fullPage: false });
await context.close();
console.log('captured forced-colors.png');

await browser.close();
