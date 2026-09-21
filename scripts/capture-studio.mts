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

// §27 / §108 服务端快照：创建 → 继续改 → 恢复，整圈必须真的走数据库
await page.click('[data-panel-tab="history"]');
await page.fill('[data-snapshot-input]', '截图基线');
await page.click('[data-snapshot-create]');
const baseline = page.locator('[data-snapshot-item]:has-text("截图基线")');
await baseline.waitFor({ state: 'visible', timeout: 30_000 });
await page.screenshot({ path: `${out}history-snapshot.png` });

const headlineId = await page.evaluate(() => {
  const hits = [...document.querySelectorAll('[data-canvas-frame] [data-node-type="text"]')].filter(
    (el) => el.textContent?.includes('从一句话到一个可发布的产品'),
  );
  return hits.length ? hits[hits.length - 1]!.getAttribute('data-node-id') : null;
});
if (!headlineId) throw new Error('找不到标题节点，无法验证快照恢复');
await page.click('[data-view="canvas"]');
await page.click(`[data-node-id="${headlineId}"]`);
await page.fill('[data-prop="typography.fontSize"]', '30');
await page.waitForFunction(() => {
  const el = [...document.querySelectorAll('[data-canvas-frame] [data-node-id]')].find(
    (node) => node.textContent?.includes('从一句话到一个可发布的产品'),
  );
  return !!el && getComputedStyle(el).fontSize === '30px';
}, undefined, { timeout: 30_000 });
// 等自动保存落库：否则服务端看到的"当前状态"还是旧的，恢复就不会留下安全快照
await page.waitForFunction(
  () => document.querySelector('[data-save-state]')?.textContent?.includes('已保存'),
  undefined,
  { timeout: 30_000 },
);

await page.click('[data-panel-tab="history"]');
// §27 Compare：先看这份快照与当前文档差在哪，再决定恢复
await page.locator('[data-snapshot-item]:has-text("截图基线") [data-snapshot-compare]').click();
const compareList = page.locator('[data-snapshot-diff-list]');
await compareList.waitFor({ state: 'visible', timeout: 30_000 });
const compareText = (await compareList.textContent()) ?? '';
if (!compareText.includes('typography.fontSize')) {
  throw new Error(`快照比较没有列出字段级差异：${compareText.slice(0, 120)}`);
}
await page.screenshot({ path: `${out}history-compare.png` });
await page.locator('[data-snapshot-item]:has-text("截图基线") [data-snapshot-restore]').click();
await page.locator('[data-snapshot-item]:has-text("截图基线") [data-snapshot-restore]').click();
await page.waitForFunction(
  () => {
    const el = [...document.querySelectorAll('[data-canvas-frame] [data-node-id]')].find(
      (node) => node.textContent?.includes('从一句话到一个可发布的产品'),
    );
    return !!el && getComputedStyle(el).fontSize === '56px';
  },
  undefined,
  { timeout: 30_000, polling: 300 },
);
// 恢复动作自己留下历史，恢复前的状态也被存下来了
await page.locator('[data-snapshot-item]:has-text("恢复到「截图基线」")').waitFor({ state: 'visible', timeout: 30_000 });
await page.locator('[data-snapshot-item]:has-text("恢复前自动保存")').waitFor({ state: 'visible', timeout: 30_000 });
await page.goto(`${base}/studio/${projectId}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 60_000 });
const afterReload = await headlineFontSize();
if (afterReload !== '56px') throw new Error(`恢复没有落库：刷新后是 ${afterReload || '找不到标题节点'}`);
await page.click('[data-panel-tab="history"]');
await page.screenshot({ path: `${out}history-restored.png` });
await page.click('[data-panel-tab="layers"]');

/**
 * §28 分支 + §27 Duplicate：一条分支放一个方向，切来切去各自的现场都要在；
 * 副本则是另一个项目。断言只看画布上量得到的字号。
 */
const setHeadlineSize = async (value: string): Promise<void> => {
  await page.click('[data-view="canvas"]');
  await page.click(`[data-node-id="${headlineId}"]`);
  await page.fill('[data-prop="typography.fontSize"]', value);
  await page.waitForFunction(
    (expected) => {
      const el = [...document.querySelectorAll('[data-canvas-frame] [data-node-id]')].find(
        (node) => node.textContent?.includes('从一句话到一个可发布的产品'),
      );
      return !!el && getComputedStyle(el).fontSize === `${expected}px`;
    },
    value,
    { timeout: 30_000, polling: 300 },
  );
  await page.waitForFunction(
    () => document.querySelector('[data-save-state]')?.textContent?.includes('已保存'),
    undefined,
    { timeout: 30_000 },
  );
};
const expectHeadlineSize = async (value: string, where: string): Promise<void> => {
  await page.click('[data-view="canvas"]');
  await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 30_000 });
  const seen = await headlineFontSize();
  if (seen !== `${value}px`) throw new Error(`${where} 的标题字号应该是 ${value}px，实际是 ${seen || '找不到节点'}`);
};
const clickBranch = async (name: string): Promise<void> => {
  await page.click('[data-panel-tab="history"]');
  await page.click(`[data-branch][data-branch-name="${name}"]`);
  await page.waitForFunction(
    (target) => {
      const chip = document.querySelector(`[data-branch][data-branch-name="${target}"]`);
      return chip?.getAttribute('data-branch-current') === 'true';
    },
    name,
    { timeout: 30_000, polling: 300 },
  );
};

await page.click('[data-panel-tab="history"]');
await page.fill('[data-branch-input]', 'design-v2');
await page.click('[data-branch-create]');
await page.waitForFunction(
  () => document.querySelector('[data-branch][data-branch-name="design-v2"]')?.getAttribute('data-branch-current') === 'true',
  undefined,
  { timeout: 30_000, polling: 300 },
);
if (await page.locator('[data-snapshot-error]').count()) {
  throw new Error(`分支操作报错：${(await page.locator('[data-snapshot-error]').textContent()) ?? ''}`);
}
await page.screenshot({ path: `${out}history-branch.png` });
// 带着现场切到新分支，然后在这条线上做另一个方向
await setHeadlineSize('30');
await clickBranch('main');
await expectHeadlineSize('56', '切回 main');
await page.click('[data-panel-tab="history"]');
await page.screenshot({ path: `${out}history-branch-main.png` });
await clickBranch('design-v2');
await expectHeadlineSize('30', '切回 design-v2');

// Duplicate：副本是另一个项目，带着当前分支的内容，源项目的分支线不受影响
await page.click('[data-panel-tab="history"]');
await page.fill('[data-duplicate-input]', '另一种可能');
await page.click('[data-duplicate-create]');
await page.waitForFunction(
  (origin) => {
    const root = document.querySelector('[data-studio-root]');
    const id = root?.getAttribute('data-project-id') ?? '';
    return !!id && id !== origin;
  },
  projectId,
  { timeout: 60_000, polling: 300 },
);
await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 60_000 });
const copyProjectId = await page.evaluate(
  () => document.querySelector('[data-studio-root]')?.getAttribute('data-project-id') ?? '',
);
if (!copyProjectId || copyProjectId === projectId) throw new Error('复制项目后没有跳到副本');
const copyName = (await page.locator('[data-project-name]').textContent()) ?? '';
if (!copyName.includes('另一种可能')) throw new Error(`副本名字没落到顶栏：${copyName}`);
const copySize = await headlineFontSize();
if (copySize !== '30px') throw new Error(`副本没有带上当前内容：${copySize || '找不到标题节点'}`);
await page.screenshot({ path: `${out}duplicate-project.png` });
await page.goto(`${base}/studio/${projectId}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 60_000 });
await page.click('[data-panel-tab="history"]');
// 分支线是刷新后异步拉回来的：先等它出现，再数条数（否则会拿到 0 而误判成副本污染了源项目）
await page.waitForSelector('[data-branch]', { timeout: 30_000 });
const branchChips = await page.locator('[data-branch]').count();
if (branchChips !== 2) throw new Error(`源项目的分支线不该被副本改动，实际有 ${branchChips} 条`);
await page.click('[data-panel-tab="layers"]');

await page.click('[data-viewport="mobile"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}studio-mobile.png` });
await page.goto(`${base}/preview/${projectId}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-preview-frame] [data-node-id]');
await page.screenshot({ path: `${out}preview.png` });

await browser.close();
console.log(`saved screenshots for ${projectId}`);
