import { expect, test, type Page } from '@playwright/test';

/**
 * Studio 竖向切片（§M1）：建项目 → 画布渲染模型 → 选中/改属性 → AI 命令栏（DEMO MODE）→ 撤销 → 自动保存。
 * 断言只看用户可见的结果（节点、尺寸读数、徽标、保存状态），不看内部实现。
 */

async function createProject(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.fill('[data-project-name-input]', name);
  await page.click('[data-create-project]');
  await page.waitForURL(/\/studio\/[^/]+$/);
  await waitForCanvas(page);
  return new URL(page.url()).pathname.split('/').pop()!;
}

/** 客户端 store 载入是异步的：先等模型投影出现，再断言具体数量 */
async function waitForCanvas(page: Page): Promise<void> {
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-node-id]')).toHaveCount(8);
}

async function layerId(page: Page, name: string): Promise<string> {
  let id = '';
  await expect
    .poll(async () => {
      id = await page.evaluate((target) => {
        const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-layer-id]'));
        const row = rows.find((r) => (r.textContent ?? '').includes(target));
        return row?.dataset.layerId ?? '';
      }, name);
      return id;
    })
    .toBeTruthy();
  return id;
}

test('@smoke studio slice renders the model on canvas with DEMO MODE visible', async ({ page }) => {
  test.setTimeout(90_000);
  await createProject(page, `切片 ${Date.now().toString(36)}`);

  await expect(page.locator('[data-studio-root]')).toBeVisible();
  // 起手页有 8 个节点，全部由模型投影出来
  await expect(page.locator('[data-node-id]')).toHaveCount(8);
  await expect(page.locator('[data-node-type="section"]')).toHaveCount(1);
  // 文本必须真的被投影出来，不只是有个盒子
  await expect(page.locator('[data-node-type="text"]').filter({ hasText: '从一句话到一个可发布的产品' })).toBeVisible();
  await expect(page.locator('[data-demo-mode]').first()).toHaveText('DEMO MODE');
  // 图层树与画布同源
  await expect(page.locator('[data-layer-id]')).toHaveCount(7);
});

test('@smoke studio slice: select, edit a property, undo, autosave', async ({ page }) => {
  test.setTimeout(120_000);
  await createProject(page, `编辑 ${Date.now().toString(36)}`);

  const headlineId = await layerId(page, 'Headline');
  // 画布命中测试：点最上层的文本节点，右面板切到该节点属性
  await page.click(`[data-node-id="${headlineId}"]`);
  const fontSize = page.locator('[data-prop="typography.fontSize"]');
  await expect(fontSize).toHaveValue('56');

  await page.fill('[data-prop="typography.fontSize"]', '72');
  await expect(page.locator(`[data-node-id="${headlineId}"]`)).toHaveCSS('font-size', '72px');

  const undo = page.getByTitle('撤销（Ctrl+Z）');
  const redo = page.getByTitle('重做（Ctrl+Shift+Z）');
  await page.locator('[data-canvas-surface]').click({ position: { x: 6, y: 6 } });
  await undo.click();
  await page.click(`[data-node-id="${headlineId}"]`);
  await expect(fontSize).toHaveValue('56');

  await page.locator('[data-canvas-surface]').click({ position: { x: 6, y: 6 } });
  await redo.click();
  await page.click(`[data-node-id="${headlineId}"]`);
  await expect(fontSize).toHaveValue('72');

  await expect(page.locator('[data-save-state]')).toContainText('已保存', { timeout: 20_000 });

  // 刷新后仍然是保存过的值：写入确实落到库里
  await page.reload();
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  const reloaded = await layerId(page, 'Headline');
  await page.click(`[data-node-id="${reloaded}"]`);
  await expect(page.locator('[data-prop="typography.fontSize"]')).toHaveValue('72');
});

test('@smoke studio slice: AI command bar runs in DEMO MODE as one undoable transaction', async ({ page }) => {
  test.setTimeout(120_000);
  await createProject(page, `AI ${Date.now().toString(36)}`);

  const before = await page.evaluate(() => document.querySelectorAll('[data-node-id]').length);

  await page.fill('[data-ai-input]', 'Add a section: 三档定价卡片');
  await page.click('[data-ai-submit]');

  await expect(page.locator('[data-ai-result]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-ai-result] [data-demo-mode]')).toHaveText('DEMO MODE');
  await expect
    .poll(() => page.evaluate(() => document.querySelectorAll('[data-node-id]').length))
    .toBeGreaterThan(before);

  // 一次 AI 操作 = 一个事务：一次撤销回到 AI 动手之前
  await page.getByTitle('撤销（Ctrl+Z）').click();
  await expect
    .poll(() => page.evaluate(() => document.querySelectorAll('[data-node-id]').length))
    .toBe(before);
});

test('@smoke studio slice: mobile viewport reflows the same model', async ({ page }) => {
  test.setTimeout(90_000);
  await createProject(page, `响应式 ${Date.now().toString(36)}`);

  await expect(page.locator('[data-canvas-frame]')).toHaveCSS('width', '1440px');
  await page.click('[data-viewport="mobile"]');
  await expect(page.locator('[data-canvas-frame]')).toHaveCSS('width', '375px');
  // 检查器要如实说明当前断点下的实际尺寸，而不是继续显示页面声明尺寸
  await expect(page.locator('[data-page-resolved-size]')).toContainText('375');
  // 按钮的 fills 是背景、字色来自 typography：在真实浏览器里确认这条投影契约
  await expect(page.locator('[data-node-type="button"]').first()).toHaveCSS('background-color', 'rgb(124, 92, 255)');
  await expect(page.locator('[data-node-type="button"]').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
});

test('@smoke studio slice: preview route is a read-only projection', async ({ page }) => {
  test.setTimeout(90_000);
  const projectId = await createProject(page, `预览 ${Date.now().toString(36)}`);
  await page.goto(`/preview/${projectId}?viewport=tablet`);
  await expect(page.locator('[data-preview-frame]')).toHaveCSS('width', '768px');
  await expect(page.locator('[data-node-id]')).toHaveCount(8);
  await expect(page.locator('[data-node-type="text"]').filter({ hasText: 'NEXUS STUDIO' })).toBeVisible();
  // 预览里没有编辑控件
  await expect(page.locator('[data-ai-input]')).toHaveCount(0);
});
