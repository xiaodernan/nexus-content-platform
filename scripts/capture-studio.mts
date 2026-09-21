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

// §19 Code → Design：改一个类名，应用，看回写报告是否如实说明改了什么
await page.click('[data-code-edit]');
await page.waitForSelector('[data-code-editor]', { timeout: 30_000 });
const editor = page.locator('[data-code-editor]');
const original = await editor.inputValue();
if (!original.includes('text-[56px]')) throw new Error('代码编辑器里没有预期的字号类名');
await editor.fill(original.replace('text-[56px]', 'text-[40px]'));
await page.click('[data-code-apply]');
await page.waitForSelector('[data-code-report]', { timeout: 30_000 });
const reportText = await page.textContent('[data-code-report]');
if (!reportText?.includes('typography.fontSize')) {
  throw new Error(`回写报告没有说明改了什么：${reportText ?? '无'}`);
}
await page.screenshot({ path: `${out}code-applied.png` });

// 撤销代码回写：一次应用 = 一个可撤销事务（§149）
await page.click('[data-view="canvas"]');
await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 30_000 });
const headlineFontSize = (): Promise<string> =>
  page.evaluate(() => {
    const hit = [...document.querySelectorAll('[data-canvas-frame] [data-node-type="text"]')].find(
      (el) => el.textContent?.includes('从一句话到一个可发布的产品'),
    );
    return hit ? getComputedStyle(hit).fontSize : '';
  });
const applied = await headlineFontSize();
if (applied !== '40px') throw new Error(`代码回写没有反映到画布：${applied || '找不到标题节点'}`);
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
const undone = await headlineFontSize();
if (undone !== '56px') throw new Error(`撤销代码回写失败：${undone || '找不到标题节点'}`);

// §151 AI Diff：展开刚才那次事务，确认变更清单是人能读的
await page.click('[data-panel-tab="history"]');
await page.locator('[data-history-toggle]').last().click();
const diffList = page.locator('[data-history-diff-list]').last();
await diffList.waitFor({ state: 'visible', timeout: 30_000 });
const diffText = (await diffList.textContent()) ?? '';
if (!diffText.includes('typography.fontSize')) {
  throw new Error(`变更清单没有列出字段：${diffText.slice(0, 80)}`);
}
await page.screenshot({ path: `${out}history-diff.png` });
await page.click('[data-panel-tab="layers"]');

await page.click('[data-viewport="mobile"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}studio-mobile.png` });
await page.goto(`${base}/preview/${projectId}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-preview-frame] [data-node-id]');
await page.screenshot({ path: `${out}preview.png` });

await browser.close();
console.log(`saved screenshots for ${projectId}`);
