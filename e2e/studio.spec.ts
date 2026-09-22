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

/**
 * §27 / §108：Snapshot 是用户项目历史，落在服务端，和 Ctrl+Z 的本地事务栈是两件事。
 * 这里验的是"创建 → 继续编辑 → 恢复"整圈真的走数据库，而不是只换内存。
 */
test('@smoke studio slice: server snapshot is created and restored through the database', async ({ page }) => {
  test.setTimeout(150_000);
  const label = `基线 ${Date.now().toString(36)}`;
  await createProject(page, `快照 ${Date.now().toString(36)}`);

  await page.click('[data-panel-tab="history"]');
  await page.fill('[data-snapshot-input]', label);
  await page.click('[data-snapshot-create]');
  // 创建项目时已有一条"初始版本"，手动快照接在它后面
  await expect(page.locator('[data-snapshot-item]')).toHaveCount(2);
  const baseline = page.locator(`[data-snapshot-item]:has-text("${label}")`);
  await expect(baseline).toBeVisible();
  await expect(page.locator('[data-snapshot-error]')).toHaveCount(0);

  await page.click('[data-panel-tab="layers"]');
  const headlineId = await layerId(page, 'Headline');
  await page.click(`[data-node-id="${headlineId}"]`);
  await page.fill('[data-prop="typography.fontSize"]', '72');
  await expect(page.locator(`[data-node-id="${headlineId}"]`)).toHaveCSS('font-size', '72px');
  await expect(page.locator('[data-save-state]')).toContainText('已保存', { timeout: 20_000 });

  // Compare（§27）：这份快照与当前文档差在哪，必须一眼能看到
  await page.click('[data-panel-tab="history"]');
  await baseline.locator('[data-snapshot-compare]').click();
  const compareList = page.locator('[data-snapshot-diff-list]');
  await expect(compareList).toBeVisible();
  await expect(compareList).toContainText('typography.fontSize');
  await expect(compareList).toContainText('共 1 处');

  await baseline.locator('[data-snapshot-restore]').click();
  await baseline.locator('[data-snapshot-restore]').click();
  await expect(page.locator('[data-node-id]')).toHaveCount(8);
  // 恢复动作自己也是一条历史，且恢复前当前状态被存下来了
  await expect(page.locator(`[data-snapshot-item]:has-text("恢复到「${label}」")`)).toBeVisible();
  await expect(page.locator('[data-snapshot-item]:has-text("恢复前自动保存")')).toBeVisible();
  // 本地撤销栈随之清空：这是恢复的语义，不假装还能 Ctrl+Z 回去
  await expect(page.locator('[data-history-entry]')).toHaveCount(0);

  await page.click('[data-panel-tab="layers"]');
  await page.click(`[data-node-id="${headlineId}"]`);
  await expect(page.locator('[data-prop="typography.fontSize"]')).toHaveValue('56');

  await page.reload();
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await page.click(`[data-node-id="${headlineId}"]`);
  await expect(page.locator('[data-prop="typography.fontSize"]')).toHaveValue('56');
});

/**
 * §28 分支 + §27 Duplicate：一条分支 = 一个设计方向，切来切去各自的现场都要在。
 * 断言只用用户可见的结果：画布上的字号、分支徽标、地址栏里的项目 id。
 */
test('@smoke studio slice: branches keep each design direction and duplicate forks the project', async ({ page }) => {
  test.setTimeout(180_000);
  await createProject(page, `分支 ${Date.now().toString(36)}`);
  const originId = new URL(page.url()).pathname.split('/').pop()!;

  const headline = async () => {
    // 图层树和属性面板都在 layers 页签下，切分支/开分支后要重新打开
    await page.click('[data-panel-tab="layers"]');
    const id = await layerId(page, 'Headline');
    await page.click(`[data-node-id="${id}"]`);
    return page.locator('[data-prop="typography.fontSize"]');
  };
  const setFontSize = async (value: string) => {
    const size = await headline();
    await size.fill(value);
    await expect(page.locator('[data-save-state]')).toContainText('已保存', { timeout: 20_000 });
  };
  const expectFontSize = async (value: string) => {
    const size = await headline();
    await expect(size).toHaveValue(value);
  };
  const switchBranchTo = async (name: string) => {
    await page.click('[data-panel-tab="history"]');
    await page.click(`[data-branch][data-branch-name="${name}"]`);
    await expect(page.locator(`[data-branch][data-branch-name="${name}"]`)).toHaveAttribute(
      'data-branch-current',
      'true',
      { timeout: 30_000 },
    );
  };

  await setFontSize('72');

  await page.click('[data-panel-tab="history"]');
  await expect(page.locator('[data-branch][data-branch-name="main"]')).toHaveAttribute('data-branch-current', 'true');
  await page.fill('[data-branch-input]', 'design-v2');
  await page.click('[data-branch-create]');
  // 开分支 = checkout -b：带着当前现场切过去，所以画布仍是 72
  await expect(page.locator('[data-branch][data-branch-name="design-v2"]')).toHaveAttribute('data-branch-current', 'true');
  await expect(page.locator('[data-snapshot-error]')).toHaveCount(0);
  await expect(page.locator(`[data-snapshot-item]:has-text("开分支「design-v2」")`)).toBeVisible();
  await setFontSize('30');

  // 切回 main：看到的是 main 自己的现场，不是 v2 的
  await switchBranchTo('main');
  await expectFontSize('72');
  // 再切回 v2：那边的改动还在
  await switchBranchTo('design-v2');
  await expectFontSize('30');
  // 刷新也还是 30：切换真的落在库里
  await page.reload();
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await expectFontSize('30');

  // Duplicate：整份项目变成另一个项目，副本带着当前内容，源项目不受影响
  await page.click('[data-panel-tab="history"]');
  await page.fill('[data-duplicate-input]', '另一个方向');
  await page.click('[data-duplicate-create]');
  const root = page.locator('[data-studio-root]');
  // 不能用 waitForURL(/\/studio\/[^/]+$/)：副本的 URL 也满足同一个模式，会立刻通过
  await expect(root).not.toHaveAttribute('data-project-id', originId, { timeout: 60_000 });
  const copyId = (await root.getAttribute('data-project-id'))!;
  expect(copyId).toBeTruthy();
  await waitForCanvas(page);
  await expectFontSize('30');
  await expect(page.locator('[data-project-name]')).toHaveText('另一个方向');
  await page.click('[data-panel-tab="history"]');
  // 副本是独立的项目：自己的 main、自己的一条初始快照，不带着源项目的分支线
  await expect(page.locator('[data-branch][data-branch-name="main"]')).toHaveAttribute('data-branch-current', 'true');
  await expect(page.locator('[data-branch]')).toHaveCount(1);
  await expect(page.locator('[data-snapshot-item]')).toHaveCount(1);

  // 回到源项目：分支线和内容都没被副本动过
  await page.goto(`/studio/${originId}`);
  await waitForCanvas(page);
  await expectFontSize('30');
  await page.click('[data-panel-tab="history"]');
  await expect(page.locator('[data-branch]')).toHaveCount(2);
});

/**
 * §29 多方案：一次生成几条方向、并排比较、再"取 A 的布局 + C 的视觉"合成一条。
 * 关键不变量用用户可见的结果断言：生成不能动画布，采纳才会动。
 */
test('@smoke studio slice: variants generate side by side and combine into a new direction', async ({ page }) => {
  test.setTimeout(240_000);
  await createProject(page, `方案 ${Date.now().toString(36)}`);

  // 先在 main 上留一个可识别的现场：生成方案不该动它
  await page.click('[data-panel-tab="layers"]');
  const headlineId = await layerId(page, 'Headline');
  await page.click(`[data-node-id="${headlineId}"]`);
  await page.fill('[data-prop="typography.fontSize"]', '72');
  await expect(page.locator('[data-save-state]')).toContainText('已保存', { timeout: 20_000 });

  const cardList = async () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-variant-card]')).map((el) => ({
        id: el.dataset.variantCard ?? '',
        name: el.querySelector('[data-variant-name]')?.textContent?.trim() ?? '',
        current: el.dataset.variantCurrent === 'true',
      })),
    );

  await page.click('[data-view="variants"]');
  await expect(page.locator('[data-variants-board]')).toBeVisible();
  // 一开始只有手上这一条线
  await expect(page.locator('[data-variant-card]')).toHaveCount(1);
  await expect(page.locator('[data-variant-demo-mode]')).toHaveText('DEMO MODE');

  await page.click('[data-variant-generate]');
  await expect(page.locator('[data-variant-card]')).toHaveCount(5, { timeout: 60_000 });
  await expect(page.locator('[data-variant-error]')).toHaveCount(0);
  const generated = await cardList();
  expect(generated.map((c) => c.name).sort()).toEqual(['concept-a', 'concept-b', 'concept-c', 'concept-d', 'main']);
  expect(generated.filter((c) => c.current).map((c) => c.name)).toEqual(['main']);
  // 每张卡都是真投影出来的页面，不是占位框
  for (const card of generated.filter((c) => c.name !== 'main')) {
    await expect(page.locator(`[data-variant-card="${card.id}"] [data-node-id]`).first()).toBeVisible();
  }
  // 每条方案都写下了自己的历史，且都挂在自己的分支上
  await page.click('[data-panel-tab="history"]');
  await expect(page.locator('[data-snapshot-item]').filter({ hasText: '生成方案' })).toHaveCount(4);
  await expect(page.locator('[data-branch]')).toHaveCount(5);

  // 回到比较板：生成没有动工作区
  await page.click('[data-view="variants"]');
  await page.click('[data-view="canvas"]');
  await expect(page.locator('[data-canvas-frame] [data-node-id]')).toHaveCount(8);
  await page.click('[data-panel-tab="layers"]');
  await page.click(`[data-node-id="${headlineId}"]`);
  await expect(page.locator('[data-prop="typography.fontSize"]')).toHaveValue('72');

  // Combine：A 的布局 + C 的视觉
  const byName = (name: string) => generated.find((c) => c.name === name)!.id;
  await page.click('[data-view="variants"]');
  await page.selectOption('[data-variant-layout]', byName('concept-a'));
  await page.selectOption('[data-variant-visual]', byName('concept-c'));
  await page.click('[data-variant-merge]');
  await expect(page.locator('[data-variant-card]')).toHaveCount(6, { timeout: 60_000 });
  // 合成本身要收工：按钮卡在"生成中…"说明 busy 状态没随刷新落回去
  await expect(page.locator('[data-variant-generate]')).toBeEnabled({ timeout: 30_000 });
  const merged = (await cardList()).find((c) => c.name === 'mix-a-c');
  expect(merged).toBeTruthy();
  expect(merged!.current).toBe(false);
  await expect(page.locator(`[data-variant-card="${merged!.id}"] [data-variant-desc]`)).toContainText('concept-a');

  // 采纳一条方案才会换掉工作区：B 是左右分栏，节点数会变
  await page.click(`[data-variant-adopt="${byName('concept-b')}"]`);
  await expect(page.locator(`[data-variant-card="${byName('concept-b')}"]`)).toHaveAttribute(
    'data-variant-current',
    'true',
    { timeout: 60_000 },
  );
  await page.click('[data-view="canvas"]');
  await expect(page.locator('[data-canvas-frame] [data-node-type="card"]')).toHaveCount(1);
  await expect(page.locator('[data-canvas-frame] [data-node-id]')).toHaveCount(11);
  // 采纳保留用户写过的内容，只换排布与配色
  await page.click('[data-panel-tab="layers"]');
  await page.click(`[data-node-id="${headlineId}"]`);
  await expect(page.locator('[data-prop="typography.fontSize"]')).toHaveValue('72');

  // 切回 main：手上那一版回来，方案 B 的东西留在它自己那条线上
  await page.click('[data-view="variants"]');
  const mainId = (await cardList()).find((c) => c.name === 'main')!.id;
  await page.click(`[data-variant-adopt="${mainId}"]`);
  await expect(page.locator(`[data-variant-card="${mainId}"]`)).toHaveAttribute('data-variant-current', 'true', {
    timeout: 60_000,
  });
  await page.click('[data-view="canvas"]');
  await expect(page.locator('[data-canvas-frame] [data-node-id]')).toHaveCount(8);
  // 刷新后仍然停在 main：采纳真的落了库
  await page.reload();
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-canvas-frame] [data-node-id]')).toHaveCount(8);
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

  // AI Diff（§151）：展开最新事务，看到人可读的字段级变更清单
  await page.click('[data-panel-tab="history"]');
  await page.locator('[data-history-toggle]').last().click();
  const diffList = page.locator('[data-history-diff-list]').last();
  await expect(diffList).toBeVisible();
  await expect(diffList).toContainText('增');

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

test('@smoke studio slice: code view is an editable projection of the same model', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await createProject(page, `代码 ${Date.now().toString(36)}`);
  const ctaId = await layerId(page, 'Primary CTA');
  const headlineId = await layerId(page, 'Headline');
  await page.click(`[data-node-id="${ctaId}"]`);
  await page.click('[data-view="code"]');

  // 选中的元素在代码里定位到自己那一行：两块投影同源（§16）
  await expect(page.locator('[data-code-line="selected"]')).toContainText(ctaId);
  // token 走 CSS 变量引用，不把值烤死（§12）
  await expect(page.locator('[data-code-view]')).toContainText('var(--nx-color-primary)');
  // 视图说明自己可以反向回写，同时讲清楚哪些改动回不去（§19）
  await expect(page.locator('[data-code-hint]')).toContainText('写回模型');

  // Code → Design：改类名，应用后画布与检查器立即跟着模型走（§19）
  await page.click('[data-code-edit]');
  const editor = page.locator('[data-code-editor]');
  await expect(editor).toBeVisible();
  const original = await editor.inputValue();
  await editor.fill(original.replace('text-[56px]', 'text-[40px]'));
  await page.click('[data-code-apply]');
  await expect(page.locator('[data-code-report-applied]')).toContainText('Headline → typography.fontSize');
  await expect(page.locator('[data-code-view]')).toContainText('text-[40px]');

  await page.click('[data-view="canvas"]');
  await page.click(`[data-node-id="${headlineId}"]`);
  await expect(page.locator('[data-prop="typography.fontSize"]')).toHaveValue('40');
  // 一次应用 = 一个可撤销事务（§149）
  await page.getByTitle('撤销（Ctrl+Z）').click();
  await expect(page.locator('[data-prop="typography.fontSize"]')).toHaveValue('56');

  // 结构性改动不回写：如实报告，代码里保留用户写的那一段（§19/§159）
  await page.click('[data-view="code"]');
  await page.click('[data-code-edit]');
  const withExtra = (await editor.inputValue()).replace(
    '<section',
    '<aside className="w-fit">临时插进来的元素</aside>\n      <section',
  );
  await editor.fill(withExtra);
  await page.click('[data-code-apply]');
  await expect(page.locator('[data-code-report-issues]')).toContainText('code-only');
  expect(errors).toEqual([]);
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
