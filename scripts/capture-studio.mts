import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

/**
 * §192 的 Screenshot → Inspect 步骤：建一个项目，把 Studio 与预览各截一张图，
 * 输出到 screenshots/（gitignore 里已排除）。用法：
 *   npx tsx scripts/capture-studio.mts [baseUrl]
 */
const base = process.argv[2] ?? 'http://localhost:3100';
const outDir = new URL('../screenshots/', import.meta.url);
const out = fileURLToPath(outDir);
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.goto(`${base}/`);
await page.screenshot({ path: `${out}home.png` });
await page.fill('[data-project-name-input]', `截图 ${new Date().toISOString().slice(11, 19)}`);
// 等 React 接管表单：hydrate 之前 fill 不会进 state，按钮会一直 disabled
await page.waitForFunction(() => !document.querySelector('[data-create-project]')?.hasAttribute('disabled'));
await Promise.all([
  page.waitForURL(/\/studio\/[^/]+$/, { timeout: 60_000 }),
  page.click('[data-create-project]'),
]);
await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 60_000 });
const projectId = new URL(page.url()).pathname.split('/').pop()!;

await page.screenshot({ path: `${out}studio.png` });

// §19 Code 视图：选中画布上的 CTA → 切到代码 → 应该定位到它自己那一行
const ctaId = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('[data-canvas-frame] [data-node-id]')];
  const hits = nodes.filter((el) => el.textContent?.trim() === '开始设计');
  return hits.length ? hits[hits.length - 1]!.getAttribute('data-node-id') : null;
});
if (!ctaId) throw new Error('画布里找不到 CTA 节点，无法验证 Code 视图');
await page.click(`[data-node-id="${ctaId}"]`);
await page.click('[data-view="code"]');
await page.waitForSelector('[data-code-line="selected"]', { timeout: 30_000 });
const lineText = await page.textContent('[data-code-line="selected"]');
if (!lineText?.includes(`"${ctaId}"`)) {
  throw new Error(`代码高亮行不是选中节点：${lineText ?? '无'}`);
}
await page.screenshot({ path: `${out}code.png` });
await page.click('[data-view="canvas"]');

await page.click('[data-viewport="mobile"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}studio-mobile.png` });
await page.goto(`${base}/preview/${projectId}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-preview-frame] [data-node-id]');
await page.screenshot({ path: `${out}preview.png` });

await browser.close();
console.log(`saved screenshots for ${projectId}`);
