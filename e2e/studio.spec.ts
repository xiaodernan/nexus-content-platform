import { deflateSync } from 'node:zlib';
import { expect, test, type Page, type Request } from '@playwright/test';

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

/**
 * §56 / §57 发布与分享：公开 URL 锁的是发布那一刻的快照，
 * 重新发布才换出去，取消发布立刻 404。全部用第二个标签页验证"别人看到的"。
 */
test('@smoke studio slice: publish pins the released snapshot behind a share URL', async ({ page }) => {
  test.setTimeout(240_000);
  const projectName = `发布 ${Date.now().toString(36)}`;
  await createProject(page, projectName);
  const visitor = await page.context().newPage();

  const headlineSize = async (target: Page) =>
    target.evaluate(() => {
      const hit = Array.from(document.querySelectorAll('[data-node-type="text"]')).find((el) =>
        el.textContent?.includes('从一句话到一个可发布的产品'),
      );
      return hit ? getComputedStyle(hit).fontSize : '';
    });

  const setSize = async (value: string) => {
    await page.click('[data-panel-tab="layers"]');
    const id = await layerId(page, 'Headline');
    await page.click(`[data-node-id="${id}"]`);
    await page.fill('[data-prop="typography.fontSize"]', value);
    await expect(page.locator('[data-save-state]')).toContainText('已保存', { timeout: 20_000 });
  };

  const openPublish = async () => {
    // 发布成功后面板不会自己收起：只在没打开时点一下，否则这一下会把面板关掉
    if (await page.locator('[data-publish-submit]').isVisible()) return;
    await page.click('[data-publish-open]');
    await expect(page.locator('[data-publish-submit]')).toBeVisible();
  };

  await setSize('66');
  await openPublish();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  const url = page.locator('[data-publish-url]');
  await expect(url).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-publish-gate]')).toContainText('门禁通过');
  // 没运行的门禁要如实列出来，不能显示成"全绿"
  await expect(page.locator('[data-gate-not-run]')).toContainText('未运行');
  const path = (await url.getAttribute('href'))!;
  expect(path).toMatch(/^\/n\/[^/]+\/发布-/);

  await visitor.goto(path);
  await expect(visitor.locator('[data-published-frame] [data-node-id]')).toHaveCount(8);
  await expect(visitor.locator('[data-published-title]')).toContainText(projectName);
  await expect.poll(() => headlineSize(visitor), { timeout: 20_000 }).toBe('66px');

  // 发布之后继续改：公开链接不该跟着动
  await setSize('22');
  await visitor.reload();
  await expect.poll(() => headlineSize(visitor), { timeout: 20_000 }).toBe('66px');

  // 重新发布才换出去，并且版本 +1、URL 不变
  await openPublish();
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-result]')).toContainText('第 2 版', { timeout: 30_000 });
  await visitor.reload();
  await expect.poll(() => headlineSize(visitor), { timeout: 20_000 }).toBe('22px');

  // 取消发布：同一个 URL 立刻 404
  await openPublish();
  await page.click('[data-publish-off]');
  await expect(page.locator('[data-publish-result]')).toHaveCount(0, { timeout: 30_000 });
  const gone = await visitor.goto(path);
  expect(gone?.status()).toBe(404);
  await visitor.close();
});

/**
 * §12 / §13 设计系统面板：token 是真值，改一处全线跟着动，而且和改节点一样可撤销。
 */
test('@smoke studio slice: design system panel edits tokens and the canvas follows', async ({ page }) => {
  test.setTimeout(150_000);
  await createProject(page, `设计系统 ${Date.now().toString(36)}`);

  await page.click('[data-panel-tab="design"]');
  await expect(page.locator('[data-token-row="color.primary"]')).toBeVisible();
  await expect(page.locator('[data-token-usage="color.primary"]')).toContainText('处引用');
  // 内置 token 不给删（改了值还能改回来，删了会留下断链）
  await expect(page.locator('[data-token-remove="color.primary"]')).toBeDisabled();

  const ctaColor = () =>
    page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('[data-canvas-frame] [data-node-type="button"]')).find((n) =>
        n.textContent?.includes('开始设计'),
      );
      return el ? getComputedStyle(el).backgroundColor : '';
    });
  const before = await ctaColor();
  expect(before).not.toBe('');

  await page.fill('[data-token-value="color.primary"]', '#ff0000');
  await page.press('[data-token-value="color.primary"]', 'Enter');
  // 只改了一个 token，绑定它的节点全部跟着变（§12）
  await expect.poll(ctaColor).toBe('rgb(255, 0, 0)');
  // 改 token 和改节点一样在撤销栈里（§148）
  await page.click('[data-view="canvas"]');
  await page.click('[data-canvas-surface]', { position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect.poll(ctaColor).toBe(before);

  // 几何走同一条路：起手页的圆角/间距绑的是 radius.* / space.*，所以改 token 画布就变（§12/§29）
  const ctaRadius = () =>
    page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('[data-canvas-frame] [data-node-type="button"]')).find((n) =>
        n.textContent?.includes('开始设计'),
      );
      return el ? getComputedStyle(el).borderTopLeftRadius : '';
    });
  expect(await ctaRadius()).toBe('10px');
  await page.fill('[data-token-value="radius.md"]', '26');
  await page.press('[data-token-value="radius.md"]', 'Enter');
  await expect.poll(ctaRadius).toBe('26px');
  await page.keyboard.press('Control+z');
  await expect.poll(ctaRadius).toBe('10px');
  // 撤销之后输入框必须回到真值：留着刚才那串草稿，面板就在说谎（§16）
  await expect(page.locator('[data-token-value="radius.md"]')).toHaveValue('10');

  // 自定义 token：加进来 → 删得掉；名字非法时如实拒绝
  await page.click('[data-token-add-open]');
  await page.fill('[data-token-new-key]', 'Bad Key');
  await page.fill('[data-token-new-value]', '#123456');
  await page.click('[data-token-new-submit]');
  await expect(page.locator('[data-token-form-error]')).toContainText('小写字母开头');
  await page.fill('[data-token-new-key]', 'color.brand');
  await page.click('[data-token-new-submit]');
  await expect(page.locator('[data-token-row="color.brand"]')).toBeVisible();
  await expect(page.locator('[data-token-usage="color.brand"]')).toHaveText('未使用');
  await page.click('[data-token-remove="color.brand"]');
  await expect(page.locator('[data-token-row="color.brand"]')).toHaveCount(0);

  // 加回来并刷新：token 表的改动会随自动保存落库
  await page.click('[data-token-add-open]');
  await page.fill('[data-token-new-key]', 'color.brand');
  await page.fill('[data-token-new-value]', '#123456');
  await page.click('[data-token-new-submit]');
  await expect(page.locator('[data-save-state]')).toContainText('已保存', { timeout: 20_000 });
  await page.reload();
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await page.click('[data-panel-tab="design"]');
  await expect(page.locator('[data-token-row="color.brand"]')).toBeVisible();
  await expect(page.locator('[data-token-value="color.brand"]')).toHaveValue('#123456');

  // §12 主题 mode：切到 dark 后刷新仍在——它以前只活在浏览器会话里，重载就退回默认值
  await page.selectOption('[data-theme-mode]', 'dark');
  await expect(page.locator('[data-save-state]')).toContainText('已保存', { timeout: 20_000 });
  await page.reload();
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-theme-mode]')).toHaveValue('dark');
});

test('@smoke 属性面板的色标显示 token 解析后的真色（§12/§16）', async ({ page }) => {
  test.setTimeout(150_000);
  await createProject(page, `色标 ${Date.now().toString(36)}`);
  const id = await layerId(page, 'Primary CTA');
  const swatch = page.locator('[data-prop="style.fills.0.color"]');
  const toHex = (rgb: string) =>
    `#${(rgb.match(/\d+/g) ?? []).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  const canvasBg = () =>
    page.evaluate((nid) => {
      const el = document.querySelector(`[data-canvas-frame] [data-node-id="${nid}"]`);
      return el ? getComputedStyle(el).backgroundColor : '';
    }, id);
  // 每次都重新点选：选中态在自动保存的那一拍会掉，重试到稳定再断言（和图层面板那两处同法）
  const expectSwatch = (want: (rgb: string) => string) => async () => {
    await page.click(`[data-node-id="${id}"]`);
    const painted = await canvasBg();
    expect(painted).not.toBe('');
    await expect(swatch, '色标要和画布真实背景一致').toHaveValue(want(painted), { timeout: 2_000 });
  };
  // 以前喂给 resolveValue 的是剥掉花括号的裸 key，它不当引用，绑了 token 的填充永远显示成黑的
  await expect(expectSwatch(toHex)).toPass({ timeout: 30_000 });
  // 改 token 后色标要跟着走，不能停在第一次打开面板那一刻的值
  await page.click('[data-panel-tab="design"]');
  await page.fill('[data-token-value="color.primary"]', '#00ff00');
  await page.press('[data-token-value="color.primary"]', 'Enter');
  await expect(expectSwatch(() => '#00ff00')).toPass({ timeout: 30_000 });
});

test('@smoke studio slice: AI command bar runs in DEMO MODE as one undoable transaction', async ({ page }) => {
  test.setTimeout(120_000);
  await createProject(page, `AI ${Date.now().toString(36)}`);

  const before = await page.evaluate(() => document.querySelectorAll('[data-node-id]').length);

  // §68 要在 HTTP 边界上可核对，而不只是"面板上写着小"：截下真正发出去的那一份。
  // 浏览器发的只有 id：整份文档、选中节点的描述、设计系统摘要都不该出现在这里。
  const sent: {
    current: { bytes: number; uploadedContext: string[]; selectionIds: unknown } | null;
  } = { current: null };
  await page.route('**/api/ai/run', async (route) => {
    const raw = route.request().postData() ?? '';
    const body = JSON.parse(raw) as { context?: Record<string, unknown> };
    const context = body.context ?? {};
    sent.current = {
      bytes: raw.length,
      uploadedContext: Object.keys(context).filter(
        (key) => key === 'document' || key === 'selectionDigest' || key === 'designSystemDigest',
      ),
      selectionIds: context.selection,
    };
    await route.fallback();
  });

  await page.fill('[data-ai-input]', 'Add a section: 三档定价卡片');
  // §68：上下文由服务端从库里那份装配。故意在防抖（1.8s）之内改一个属性就提交 ——
  // 命令栏要先把它落库，所以网络顺序必须是"先 PUT 文档，再 POST AI"。
  const headlineId = await layerId(page, 'Headline');
  await page.click(`[data-node-id="${headlineId}"]`);
  await page.fill('[data-prop="typography.fontSize"]', '64');
  const writes: string[] = [];
  const onRequest = (req: Request): void => {
    const path = new URL(req.url()).pathname;
    if (req.method() === 'PUT' && path.startsWith('/api/projects/')) writes.push('put');
    if (req.method() === 'POST' && path === '/api/ai/run') writes.push('ai');
  };
  page.on('request', onRequest);
  await page.click('[data-ai-submit]');

  await expect(page.locator('[data-ai-result]')).toBeVisible({ timeout: 20_000 });
  page.off('request', onRequest);
  expect(writes).toContain('ai');
  expect(writes.slice(0, writes.indexOf('ai'))).toContain('put');
  // 客户端这一侧：只发 id。整份文档、"选中了什么"的描述、设计系统摘要都不在上传里，
  // 全部由服务端按库里那份权威文档回答（§68）。起手项目的整份文档本身就有约 9,900 字符，
  // 所以"请求体比文档还小"是"没带文档"的直接证据
  expect(sent.current?.uploadedContext).toEqual([]);
  expect(sent.current?.selectionIds).toEqual([headlineId]);
  expect(sent.current?.bytes).toBeLessThan(6_000);
  // 服务端那一侧：装配出的目录有多大，写在 Activity 里给人看（§68 的可核对版本）
  await expect(page.locator('[data-command-bar]')).toContainText('发给模型的是目录');
  await page.screenshot({ path: 'screenshots/ai-context-index.png' });
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
  await expect(page.locator('[data-node-type="button"]').first()).toHaveCSS('background-color', 'rgb(107, 79, 240)');
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

/** 手搓一张**真正可解码**的 PNG（正确 CRC + zlib 压缩像素），并带一个 eXIf 块 */
function pngWithExif(width = 40, height = 40): Buffer {
  const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    return table;
  })();
  const crc32 = (buf: Buffer): number => {
    let c = ~0;
    for (const byte of buf) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // 每行：1 字节 filter(0) + width*4 像素，填一个醒目的青色
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const px = rowStart + 1 + x * 4;
      raw[px] = 0x14;
      raw[px + 1] = 0xb8;
      raw[px + 2] = 0xa6;
      raw[px + 3] = 0xff;
    }
  }
  const exif = Buffer.from('Exif\x00\x00MM\x00*GPS:37.77,-122.41', 'binary');
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('eXIf', exif),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('@smoke 上传图片：落画布、剥元数据回执、可撤销、预览同源', async ({ page }) => {
  test.setTimeout(120_000);
  const projectId = await createProject(page, `图片 ${Date.now().toString(36)}`);

  // 用图层行的 onClick 选中（比画布命中测试确定）。刚建好项目时首击偶发被 hydration 抢掉，
  // 用 toPass 重试到属性面板确实挂出上传控件为止。
  const targetId = await layerId(page, 'Headline');
  await expect(async () => {
    await page.click(`[data-layer-id="${targetId}"]`);
    await expect(page.locator('[data-asset-upload]').first()).toBeAttached({ timeout: 4_000 });
  }).toPass({ timeout: 30_000 });
  const node = page.locator(`[data-node-id="${targetId}"]`);
  // 上传前这个节点没有图片背景
  await expect(node).not.toHaveCSS('background-image', /\/api\/assets\//);

  await page.setInputFiles('[data-asset-upload] input[type="file"]', {
    name: 'hero.png',
    mimeType: 'image/png',
    buffer: pngWithExif(),
  });

  // 上传即成为最上层图片，节点投影出真实资产 URL（不是破图占位）
  await expect(node).toHaveCSS('background-image', /\/api\/assets\/[^/]+\/file/, { timeout: 20_000 });
  // 剥离回执：告诉用户 eXIf 已被去掉
  await expect(page.locator('[data-asset-notice]')).toContainText('eXIf');
  // 填充区出现图片行，缩略图与画布同一资产
  const imageRow = page.locator('[data-fill-image="0"]');
  await expect(imageRow).toBeVisible();
  await expect(imageRow.locator('img')).toHaveAttribute('src', /\/api\/assets\/[^/]+\/file/);
  // 关键：证明剥离元数据后存下来的字节**真能被浏览器解码**（不是只挂了个 URL）
  await expect
    .poll(async () => imageRow.locator('img').evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 20_000 })
    .toBeGreaterThan(0);
  // §192 Inspect：把"图片已经落在画布上"这一刻截下来，供人眼复核
  await node.screenshot({ path: 'screenshots/asset-on-canvas.png' });

  // 撤销：一次上传 = 一个事务，图片层与清单条目一起消失
  await page.getByTitle('撤销（Ctrl+Z）').click();
  await expect(node).not.toHaveCSS('background-image', /\/api\/assets\//, { timeout: 20_000 });

  // 重做后保存，走预览路由（另一条投影，同一份模型）
  await page.getByTitle('重做（Ctrl+Shift+Z）').click();
  await expect(page.locator('[data-save-state]')).toContainText('已保存', { timeout: 20_000 });
  await page.goto(`/preview/${projectId}`);
  await expect(page.locator(`[data-node-id="${targetId}"]`)).toHaveCSS('background-image', /\/api\/assets\/[^/]+\/file/, { timeout: 20_000 });
});

test('@smoke 资产库：上传后可见、删除跨画布生效、撤销恢复引用', async ({ page }) => {
  test.setTimeout(150_000);
  await createProject(page, `资产库 ${Date.now().toString(36)}`);

  const targetId = await layerId(page, 'Headline');
  await expect(async () => {
    await page.click(`[data-layer-id="${targetId}"]`);
    await expect(page.locator('[data-asset-upload]').first()).toBeAttached({ timeout: 4_000 });
  }).toPass({ timeout: 30_000 });
  await page.setInputFiles('[data-asset-upload] input[type="file"]', {
    name: 'library.png',
    mimeType: 'image/png',
    buffer: pngWithExif(),
  });
  const node = page.locator(`[data-node-id="${targetId}"]`);
  await expect(node).toHaveCSS('background-image', /\/api\/assets\//, { timeout: 20_000 });
  // 记住这一个 assetId，删除/撤销都拿它做断言，避免"换了张图"混过测试
  const assetId = await node.evaluate((el) => {
    const match = /\/api\/assets\/([^/]+)\/file/.exec(getComputedStyle(el).backgroundImage);
    return match?.[1] ?? '';
  });
  expect(assetId).toMatch(/^[a-z0-9_-]+$/i);

  // 切到资产库标签：清单来自模型，投影出的卡片与画布引用同一个 assetId
  await page.click('[data-panel-tab="assets"]');
  const card = page.locator(`[data-asset-card="${assetId}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator('img')).toHaveAttribute('src', `/api/assets/${assetId}/file`);
  await expect
    .poll(async () => card.locator('img').evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 20_000 })
    .toBeGreaterThan(0);
  await expect(card).toContainText('引用 1');
  await page.screenshot({ path: 'screenshots/asset-library.png' });

  // 删除：一次事务同时清掉清单条目与画布上的图片填充（§149 跨页可达）
  await card.locator(`[data-asset-delete="${assetId}"]`).click();
  await expect(node).not.toHaveCSS('background-image', /\/api\/assets\//, { timeout: 20_000 });
  await expect(page.locator(`[data-asset-card="${assetId}"]`)).toHaveCount(0);
  // 回执必须明说撤销的边界，不假装撤销能找回字节（§159）。
  // 属性面板也用 data-asset-notice，所以限定在资产库面板内。
  await expect(page.locator('[data-assets-panel] [data-asset-notice]')).toContainText('不会回来');

  // 撤销：引用回来了，但文件已经不在存储里 —— 模型与存储的非对称要能被看见
  await page.getByTitle('撤销（Ctrl+Z）').click();
  await expect(page.locator(`[data-asset-card="${assetId}"]`)).toBeVisible();
  await expect(node).toHaveCSS('background-image', new RegExp(`/api/assets/${assetId}/file`), { timeout: 20_000 });
  const status = await page.request.get(`/api/assets/${assetId}/file`);
  expect(status.status()).toBe(404);

  await page.getByTitle('重做（Ctrl+Shift+Z）').click();
  await expect(node).not.toHaveCSS('background-image', /\/api\/assets\//, { timeout: 20_000 });
  await expect(page.locator('[data-save-state]')).toContainText('已保存', { timeout: 20_000 });
});

test('@smoke 参考图 → Visual DNA：提取、展示、约束生成、可撤销（§30/§174）', async ({ page }) => {
  test.setTimeout(180_000);
  const projectId = await createProject(page, `视觉语言 ${Date.now().toString(36)}`);
  expect(projectId).toBeTruthy();

  const targetId = await layerId(page, 'Headline');
  await expect(async () => {
    await page.click(`[data-layer-id="${targetId}"]`);
    await expect(page.locator('[data-asset-upload]').first()).toBeAttached({ timeout: 4_000 });
  }).toPass({ timeout: 30_000 });
  await page.setInputFiles('[data-asset-upload] input[type="file"]', {
    name: 'reference.png',
    mimeType: 'image/png',
    buffer: pngWithExif(),
  });
  const node = page.locator(`[data-node-id="${targetId}"]`);
  await expect(node).toHaveCSS('background-image', /\/api\/assets\//, { timeout: 20_000 });
  const assetId = await node.evaluate((el) => {
    const match = /\/api\/assets\/([^/]+)\/file/.exec(getComputedStyle(el).backgroundImage);
    return match?.[1] ?? '';
  });
  expect(assetId).toMatch(/^[a-z0-9_-]+$/i);

  // 提取：服务端只算不写，结果作为一个可撤销事务回到模型（§150）
  await page.click('[data-panel-tab="assets"]');
  await page.locator(`[data-asset-dna="${assetId}"]`).click();
  await expect(page.locator('[data-assets-panel] [data-asset-notice]')).toContainText('已提取视觉语言', { timeout: 20_000 });

  // 设计系统面板把 DNA 摊开：描述符必须能回指到实测统计，不是形容词
  await page.click('[data-panel-tab="design"]');
  const dnaBlock = page.locator('[data-visual-dna]');
  await expect(dnaBlock).toBeVisible();
  await expect(dnaBlock).toContainText('本地像素统计');
  await expect(dnaBlock.locator('[data-visual-dna-descriptors]')).toContainText('高饱和');
  await expect(dnaBlock.locator('[data-visual-dna-descriptors]')).toContainText('冷色倾向');
  await page.screenshot({ path: 'screenshots/visual-dna.png' });

  // §174：生成必须遵循它。提示词写 cinematic，但配色取自参考图，而不是内置配方。
  // 这一步同时验证 §68 的落地：发给服务端的上下文由库里那份装配，而"提取 DNA"的改动
  // 要先落库（studio.flushBeforeAi，顺序契约在 apps/web/test/studio-flush.test.ts 里钉住），
  // 否则这里会拿到内置配方的颜色。
  const backgroundValue = () => page.locator('[data-token-value="color.background"]').inputValue();
  const beforeColor = await backgroundValue();
  await page.fill('[data-ai-input]', 'make it cinematic');
  await page.click('[data-ai-submit]');
  await expect(page.locator('[data-ai-result]')).toBeVisible({ timeout: 20_000 });
  await expect.poll(backgroundValue).not.toBe(beforeColor);
  await expect(backgroundValue()).resolves.toMatch(/#14b8a6/i);

  // 撤销两次：先撤生成，再撤提取 —— DNA 面板随之消失，不留半套约束
  await page.getByTitle('撤销（Ctrl+Z）').click();
  await expect(backgroundValue()).resolves.toBe(beforeColor);
  await page.getByTitle('撤销（Ctrl+Z）').click();
  await expect(page.locator('[data-visual-dna]')).toHaveCount(0);

  await expect(page.locator('[data-save-state]')).toContainText('已保存', { timeout: 20_000 });
});

/**
 * §44 世界文档的第一条竖向切片：建骨架 → 填内容 → 刷新后还在。
 * 断言的是"库里那份"（reload 之后重读），不是内存里的临时状态。
 */
test('@smoke 世界：建骨架、填一条、加一条、刷新仍在（§44）', async ({ page }) => {
  test.setTimeout(150_000);
  await createProject(page, `世界 ${Date.now().toString(36)}`);

  await page.click('[data-panel-tab="world"]');
  // 第一次进这条路由，dev 模式要现编译：给足冷启动时间，别把编译等成失败
  await expect(page.locator('[data-world-empty]')).toBeVisible({ timeout: 40_000 });
  // 界面上明说这是模板、AI 生成还没接
  await expect(page.locator('[data-world-empty]')).toContainText('假生成');
  await page.click('[data-world-create]');
  await expect(page.locator('[data-world-group="lore"]')).toBeVisible();
  await expect(page.locator('[data-world-node]')).toHaveCount(9);
  await expect(page.locator('[data-world-state]')).toHaveText('已保存');

  const loreBody = page.locator('[data-world-group="lore"] [data-world-body]').first();
  const loreId = (await loreBody.getAttribute('data-world-body'))!;
  await loreBody.fill('王城在第七次日蚀下投降。');
  await page.click('[data-world-name]');
  await expect(page.locator('[data-world-state]')).toHaveText('已保存', { timeout: 20_000 });

  await page.selectOption('[data-world-new-kind]', 'characters');
  await page.click('[data-world-add="characters"]');
  await expect(page.locator('[data-world-node]')).toHaveCount(10);
  // 等这次写库落地再刷新：不靠"卸载时补发"那条路（那条由世界图那条用例专门验）
  await expect(page.locator('[data-world-pending]')).toHaveAttribute('data-world-pending', 'false', { timeout: 20_000 });

  await page.reload();
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await page.click('[data-panel-tab="world"]');
  await expect(page.locator(`[data-world-body="${loreId}"]`)).toHaveValue('王城在第七次日蚀下投降。');
  await expect(page.locator('[data-world-node]')).toHaveCount(10);
});

/**
 * §54 Game Design System：11 类实体、开放数值、实体之间的有向引用。
 * 断言全部在 reload 之后重读一遍——刷新能把面板清成"库里那份"，
 * 所以"刷新仍在"就是这条用例的正向对照：只活在内存里的编辑到这里一定会红。
 */
test('@smoke 游戏：建骨架、填数值、连引用、刷新仍在（§54）', async ({ page }) => {
  test.setTimeout(180_000);
  await createProject(page, `游戏 ${Date.now().toString(36)}`);

  await page.click('[data-panel-tab="game"]');
  // 第一次进这条路由，dev 模式要现编译：给足冷启动时间，别把编译等成失败
  await expect(page.locator('[data-game-empty]')).toBeVisible({ timeout: 40_000 });
  // 界面上明说这是模板骨架、AI 生成整套设计还没接
  await expect(page.locator('[data-game-empty]')).toContainText('假生成');
  await page.click('[data-game-create]');
  await expect(page.locator('[data-game-entity]')).toHaveCount(11);
  await expect(page.locator('[data-game-group="particle"]')).toBeVisible();
  await expect(page.locator('[data-game-state]')).toHaveText('已保存');

  const entityId = (group: string) =>
    page.locator(`[data-game-group="${group}"] [data-game-entity]`).first().getAttribute('data-game-entity');
  const weaponId = (await entityId('weapon'))!;
  const playerId = (await entityId('player'))!;

  // 数值：键名是开放的（§54 没规定每类有哪些属性），所以这里要能自己写一个键
  await page.fill(`[data-game-stat-key="${weaponId}"]`, 'damage');
  await page.fill(`[data-game-stat-value="${weaponId}"]`, '12');
  await page.click(`[data-game-stat-add="${weaponId}"]`);
  await expect(page.locator(`[data-game-stat="${weaponId}:damage"]`)).toHaveValue('12');

  // 引用：有向，从武器指向玩家，带一个自定的关系名
  await page.selectOption(`[data-game-ref-target="${weaponId}"]`, playerId);
  await page.fill(`[data-game-ref-role="${weaponId}"]`, '装备于');
  await page.click(`[data-game-ref-add="${weaponId}"]`);
  await expect(page.locator('[data-game-ref]')).toHaveCount(1);
  await expect(page.locator('[data-game-ref-label]')).toContainText('玩家（装备于）');

  // 设计说明也走同一条写库路径
  const notes = page.locator(`[data-game-entity-notes="${weaponId}"]`);
  await notes.fill('起手慢，但一下能打死人。');
  await page.click('[data-game-name]');
  await expect(page.locator('[data-game-state]')).toHaveText('已保存', { timeout: 20_000 });

  // 模型层拒掉的输入必须出声，不能静默丢掉（也不假装写进去了）：
  // 空键名 + 一个合法数字，落库的实体数与数值条数都不该变
  await page.fill(`[data-game-stat-key="${playerId}"]`, '   ');
  await page.fill(`[data-game-stat-value="${playerId}"]`, '9');
  await page.click(`[data-game-stat-add="${playerId}"]`);
  await expect(page.locator('[data-game-notice]')).toContainText('键名不能是空的');
  await expect(page.locator('[data-game-group="player"] [data-game-stat]')).toHaveCount(0);

  await page.selectOption('[data-game-new-kind]', 'enemy');
  await page.click('[data-game-add="enemy"]');
  await expect(page.locator('[data-game-entity]')).toHaveCount(12);
  await expect(page.locator('[data-game-progress]')).toContainText('1 条引用');
  // 回执是一次性的：下一次成功的编辑要把它擦掉，不然用户会以为刚加的那条也被拒了
  await expect(page.locator('[data-game-notice]')).toHaveCount(0);
  await expect(page.locator('[data-game-pending]')).toHaveAttribute('data-game-pending', 'false', { timeout: 20_000 });

  await page.reload();
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await page.click('[data-panel-tab="game"]');
  await expect(page.locator('[data-game-entity]')).toHaveCount(12);
  await expect(page.locator(`[data-game-stat="${weaponId}:damage"]`)).toHaveValue('12');
  await expect(notes).toHaveValue('起手慢，但一下能打死人。');
  await expect(page.locator('[data-game-ref-label]')).toContainText('玩家（装备于）');
});

/**
 * §54 的引用图：`referenceGraph` 那份投影画成一张图，连与摘都写回同一份文档。
 * 这条用例特意同时盯着左侧面板：图与面板读的是同一个 store，
 * 两处各存一份游戏真值就是 §16 要避免的事。
 */
test('@smoke 游戏图：点两个实体连引用、重复被拒、刷新仍在、摘掉归零（§54）', async ({ page }) => {
  test.setTimeout(180_000);
  await createProject(page, `游戏图 ${Date.now().toString(36)}`);
  await page.click('[data-panel-tab="game"]');
  await expect(page.locator('[data-game-empty]')).toBeVisible({ timeout: 40_000 });
  await page.click('[data-game-create]');
  await expect(page.locator('[data-game-entity]')).toHaveCount(11);

  await page.click('[data-view="gamegraph"]');
  await expect(page.locator('[data-game-graph-canvas]')).toBeVisible({ timeout: 40_000 });
  await expect(page.locator('[data-game-graph-node]')).toHaveCount(11);
  await expect(page.locator('[data-game-graph-edge]')).toHaveCount(0);
  // 11 类各一列，列标题就是 §54 那 11 个类
  await expect(page.locator('[data-game-graph-column]')).toHaveCount(11);
  // 模板骨架里的实体一条数值都没填：图上要看得出"只是个名字"
  await expect(page.locator('[data-game-graph-node]').first()).toHaveAttribute('data-game-graph-stats', '0');

  const nodeId = (kind: string) =>
    page.locator(`[data-game-graph-kind="${kind}"]`).first().getAttribute('data-game-graph-node');
  const weaponId = (await nodeId('weapon'))!;
  const playerId = (await nodeId('player'))!;

  // 点的顺序就是箭头方向：武器 → 玩家
  await page.click(`[data-game-graph-node="${weaponId}"]`);
  await page.click(`[data-game-graph-node="${playerId}"]`);
  await expect(page.locator('[data-game-graph-selection]')).toContainText('武器 → 玩家');
  // 选中的边在节点上也要有痕迹（工具条那句话不是唯一的信号）
  await expect(page.locator(`[data-game-graph-node="${playerId}"]`)).toHaveAttribute('data-game-graph-picked', 'true');
  await page.fill('[data-game-graph-role]', '装备于');
  await page.click('[data-game-graph-connect]');
  await expect(page.locator('[data-game-graph-edge]')).toHaveCount(1);
  await expect(page.locator('[data-game-graph-count]')).toHaveText('11 个实体 · 1 条引用');
  // 同一份真值的另一个投影：面板里那条引用要立刻跟着出现
  await expect(page.locator('[data-game-ref-label]')).toContainText('玩家（装备于）');

  // 同一对之间重复连同样的关系：模型层拒了，界面上必须出声，而不是点了没反应
  await page.click(`[data-game-graph-node="${weaponId}"]`);
  await page.click(`[data-game-graph-node="${playerId}"]`);
  await page.fill('[data-game-graph-role]', '装备于');
  await page.click('[data-game-graph-connect]');
  await expect(page.locator('[data-game-graph-notice]')).toContainText('已经这样引用着');
  await expect(page.locator('[data-game-graph-edge]')).toHaveCount(1);

  await expect(page.locator('[data-game-graph-pending]')).toHaveAttribute('data-game-graph-pending', 'false', { timeout: 20_000 });
  await page.reload();
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await page.click('[data-view="gamegraph"]');
  await expect(page.locator('[data-game-graph-edge]')).toHaveCount(1);
  await expect(page.locator('[data-game-graph-count]')).toHaveText('11 个实体 · 1 条引用');

  // 点弧顶的抓手 → 摘掉：引用归零，实体一个不少
  const edgeId = await page.evaluate(
    () => document.querySelector('[data-game-graph-edge]')!.getAttribute('data-game-graph-edge'),
  );
  await page.click(`[data-game-graph-handle="${edgeId}"]`);
  await expect(page.locator('[data-game-graph-remove-ref]')).toBeVisible();
  await page.click('[data-game-graph-remove-ref]');
  await expect(page.locator('[data-game-graph-edge]')).toHaveCount(0);
  await expect(page.locator('[data-game-graph-count]')).toHaveText('11 个实体 · 0 条引用');
  await expect(page.locator('[data-game-graph-node]')).toHaveCount(11);
});

/**
 * §45 World Graph：关系与位置存在世界文档里，拖完刷新还在。
 * 断言的是"库里那份图"（reload 之后重读），不是内存里的临时状态。
 */
test('@smoke 世界图：连线、拖拽、刷新后关系与位置都还在（§45）', async ({ page }) => {
  test.setTimeout(180_000);
  await createProject(page, `世界图 ${Date.now().toString(36)}`);
  await page.click('[data-panel-tab="world"]');
  await expect(page.locator('[data-world-empty]')).toBeVisible({ timeout: 40_000 });
  await page.click('[data-world-create]');
  await expect(page.locator('[data-world-node]')).toHaveCount(9);

  await page.click('[data-view="graph"]');
  await expect(page.locator('[data-graph-canvas]')).toBeVisible({ timeout: 40_000 });
  await expect(page.locator('[data-graph-node]')).toHaveCount(9);
  await expect(page.locator('[data-graph-edge]')).toHaveCount(0);

  const ids: string[] = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-graph-node]')).map((el) => el.dataset.graphNode!),
  );
  await page.click(`[data-graph-node="${ids[0]}"]`);
  await page.click(`[data-graph-node="${ids[3]}"]`);
  await page.fill('[data-graph-label]', '起源于');
  await page.click('[data-graph-connect]');
  await expect(page.locator('[data-graph-edge]')).toHaveCount(1);
  await expect(page.locator('[data-graph-count]')).toContainText('1 条关系');
  // 连线这一次写库要等它落地，否则后面的 reload 会把它和拖拽的写库挤掉
  await expect(page.locator('[data-graph-pending]')).toHaveAttribute('data-graph-pending', 'false', { timeout: 20_000 });

  const box = (await page.locator(`[data-graph-node="${ids[1]}"]`).boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 170, { steps: 8 });
  await page.mouse.up();
  const moved = await page.evaluate(
    (id) => document.querySelector(`[data-graph-node="${id}"]`)?.getAttribute('transform') ?? '',
    ids[1],
  );
  expect(moved).not.toBe('');
  // 拖一下不该顺手把节点选成连线端点：拖 ≠ 选
  await expect(page.locator(`[data-graph-node="${ids[1]}"]`)).toHaveAttribute('data-graph-picked', 'false');

  // 拖完立刻刷新：这次保存还在飞，keepalive 必须让它落库（否则用户看到"已保存"其实是丢的）
  await page.reload();
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await page.click('[data-view="graph"]');
  await expect(page.locator('[data-graph-edge]')).toHaveCount(1);
  await expect(page.locator('[data-graph-count]')).toContainText('1 条关系');
  await expect
    .poll(
      () =>
        page.evaluate(
          (id) => document.querySelector(`[data-graph-node="${id}"]`)?.getAttribute('transform') ?? '',
          ids[1],
        ),
      { timeout: 20_000 },
    )
    .toBe(moved);

  // 点边能删：删完关系归零，位置仍然留着
  await page.locator(`[data-graph-edge="${await page.evaluate(() => document.querySelector('[data-graph-edge]')!.getAttribute('data-graph-edge'))}"] line`).first().click({ force: true });
  await page.click('[data-graph-remove-edge]');
  await expect(page.locator('[data-graph-edge]')).toHaveCount(0);
  await expect(page.locator('[data-graph-count]')).toContainText('0 条关系');
});

/**
 * §46 Character System：建档只给名字，其余由用户填；关系指向世界条目。
 * 断言 reload 之后仍是库里那份，不是内存里的草稿。
 */
test('@smoke 角色：建档、填档案、连一条世界关系、刷新仍在（§46）', async ({ page }) => {
  test.setTimeout(180_000);
  await createProject(page, `角色 ${Date.now().toString(36)}`);

  // 先有世界，关系才有可指向的条目
  await page.click('[data-panel-tab="world"]');
  await expect(page.locator('[data-world-empty]')).toBeVisible({ timeout: 40_000 });
  await page.click('[data-world-create]');
  await expect(page.locator('[data-world-node]')).toHaveCount(9);
  await expect(page.locator('[data-world-pending]')).toHaveAttribute('data-world-pending', 'false', { timeout: 20_000 });

  await page.click('[data-panel-tab="characters"]');
  await expect(page.locator('[data-character-empty]')).toBeVisible();
  await page.fill('[data-character-new-name]', '守夜人');
  await page.click('[data-character-create]');
  await expect(page.locator('[data-character-count]')).toHaveText('1');
  // 建档不许替用户编性格：除了名字，其它字段都是空的
  await expect(page.locator('[data-character-field="personality"]')).toHaveValue('');
  await expect(page.locator('[data-character-save]')).toHaveText('没有改动');

  await page.fill('[data-character-field="personality"]', '话少，但记得每一条巡逻路。');
  await page.fill('[data-character-list="goals"]', '看到下一次日出\n把名字还给她');
  await page.fill('[data-character-voice="register"]', '低而平');
  await page.fill('[data-character-visual="palette"]', '#1b1205 #f5b451');
  await page.fill('[data-character-relationship-kind]', '效忠');
  await page.locator('[data-character-relationship-target]').selectOption({ index: 1 });
  await expect(page.locator('[data-character-relationship]')).toHaveCount(1);
  await expect(page.locator('[data-character-save]')).toHaveText('保存档案');
  await page.click('[data-character-save]');
  await expect(page.locator('[data-character-save]')).toHaveText('没有改动', { timeout: 20_000 });
  await expect(page.locator('[data-character-issues]')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await page.click('[data-panel-tab="characters"]');
  await expect(page.locator('[data-character-tab]')).toHaveCount(1);
  await page.click('[data-character-tab] >> nth=0');
  await expect(page.locator('[data-character-field="personality"]')).toHaveValue('话少，但记得每一条巡逻路。');
  await expect(page.locator('[data-character-list="goals"]')).toHaveValue('看到下一次日出\n把名字还给她');
  await expect(page.locator('[data-character-relationship]')).toHaveCount(1);
  await expect(page.locator('[data-character-relationship] >> nth=0')).toContainText('效忠');

  await page.click('[data-character-delete]');
  await expect(page.locator('[data-character-count]')).toHaveText('0');
  await expect(page.locator('[data-character-empty]')).toBeVisible();
});

/**
 * §48 记忆：四类都可查看、可删除。断言 reload 之后仍是库里那份，
 * 以及"清空这一类"只清那一类——不存在一键抹掉全部记忆的入口。
 */
test('@smoke 记忆：记三类、刷新仍在、按类清空（§48）', async ({ page }) => {
  test.setTimeout(180_000);
  await createProject(page, `记忆 ${Date.now().toString(36)}`);
  // 世界类记忆要有主体，先建世界骨架
  await page.click('[data-panel-tab="world"]');
  await expect(page.locator('[data-world-empty]')).toBeVisible({ timeout: 40_000 });
  await page.click('[data-world-create]');
  await expect(page.locator('[data-world-node]')).toHaveCount(9);

  await page.click('[data-panel-tab="memory"]');
  await expect(page.locator('[data-memory-panel]')).toBeVisible();
  // 没有搜索框：语义检索要真 provider，这里不假装能搜
  await expect(page.locator('[data-memory-note]')).toContainText('不假装能搜');
  await expect(page.locator('[data-memory-content]')).toBeVisible();

  await page.fill('[data-memory-content]', '王城在第七次日蚀下投降。');
  await page.click('[data-memory-add]');
  await expect(page.locator('[data-memory-entry]')).toHaveCount(1);
  await expect(page.locator('[data-memory-group="world"] [data-memory-entry]')).toHaveCount(1);

  await page.selectOption('[data-memory-scope]', 'user');
  await page.fill('[data-memory-content]', '回答一律用中文。');
  await page.click('[data-memory-add]');
  await expect(page.locator('[data-memory-entry]')).toHaveCount(2);
  await expect(page.locator('[data-memory-total]')).toHaveText('2');

  // 切走再切回来：世界类记忆的主体是推导出来的，不该出现"按钮永远点不动"
  await page.selectOption('[data-memory-scope]', 'world');
  await page.fill('[data-memory-content]', '第七次日蚀后再没有日出。');
  await page.click('[data-memory-add]');
  await expect(page.locator('[data-memory-group="world"] [data-memory-entry]')).toHaveCount(2);

  await page.reload();
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await page.click('[data-panel-tab="memory"]');
  await expect(page.locator('[data-memory-entry]')).toHaveCount(3);

  // 只清「我的偏好」这一类，世界类那条必须还留着
  await page.click('[data-memory-clear="user"]');
  await expect(page.locator('[data-memory-group="user"] [data-memory-entry]')).toHaveCount(0);
  await expect(page.locator('[data-memory-group="world"] [data-memory-entry]')).toHaveCount(2);
  await expect(page.locator('[data-memory-total]')).toHaveText('2');

  // 单条删除：删掉世界类两条之后就空了
  for (const _ of [0, 1]) {
    await page.click('[data-memory-group="world"] [data-memory-remove] >> nth=0');
  }
  await expect(page.locator('[data-memory-entry]')).toHaveCount(0);
  await expect(page.locator('[data-memory-empty="world"]')).toBeVisible();
});

/**
 * §49 检索面板：语料来自世界条目与记忆，命中方式如实标出，向量不可用时明说。
 */
test('@smoke 检索：世界条目进索引、中文子串命中、说明向量未接（§49）', async ({ page }) => {
  test.setTimeout(180_000);
  await createProject(page, `检索 ${Date.now().toString(36)}`);
  await page.click('[data-panel-tab="world"]');
  await expect(page.locator('[data-world-empty]')).toBeVisible({ timeout: 40_000 });
  await page.click('[data-world-create]');
  await expect(page.locator('[data-world-node]')).toHaveCount(9);

  const loreBody = page.locator('[data-world-group="lore"] [data-world-body]').first();
  await loreBody.fill('王城在第七次日蚀下投降，守钟人再没有敲响过。');
  await page.click('[data-world-name]');
  await expect(page.locator('[data-world-pending]')).toHaveAttribute('data-world-pending', 'false', { timeout: 20_000 });

  await page.click('[data-panel-tab="retrieve"]');
  await expect(page.locator('[data-retrieve-panel]')).toBeVisible();
  await expect(page.locator('[data-knowledge-total]')).not.toHaveText('0 块');
  await expect(page.locator('[data-retrieve-note]')).toContainText('向量检索未接');

  await page.fill('[data-retrieve-query]', '守钟人再没有敲响过');
  await page.click('[data-retrieve-run]');
  await expect(page.locator('[data-retrieve-hit]')).not.toHaveCount(0);
  const first = page.locator('[data-retrieve-hit]').first();
  await expect(first).toContainText('守钟人再没有敲响过');
  await expect(first.locator('[data-retrieve-matched]')).toContainText('substring');
  await expect(first.locator('[data-retrieve-source]')).toHaveText('传说');

  // 查一个不存在的东西：要如实说没有命中，而不是硬凑几条
  await page.fill('[data-retrieve-query]', '会说话的月亮桥');
  await page.click('[data-retrieve-run]');
  await expect(page.locator('[data-retrieve-empty]')).toBeVisible();

  // 重建索引：块数不该因为重跑而变化（幂等）
  const before = await page.locator('[data-knowledge-total]').textContent();
  await page.click('[data-retrieve-rebuild]');
  await expect(page.locator('[data-knowledge-total]')).toHaveText(before ?? '0 块', { timeout: 20_000 });
});

/**
 * §66-71 上下文面板：一次装配把画布本地状态与服务端目录拼在一起。
 * 断言的重点是"看得见的大小对比"和"没做的如实写着没做"，不是排版。
 */
test('@smoke 上下文：目录尺寸、预算裁剪与未索引分支都写在脸上（§66-71）', async ({ page }) => {
  test.setTimeout(180_000);
  await createProject(page, `上下文 ${Date.now().toString(36)}`);

  const headlineId = await layerId(page, 'Headline');
  await page.click(`[data-node-id="${headlineId}"]`);

  await page.click('[data-panel-tab="context"]');
  await expect(page.locator('[data-context-panel]')).toBeVisible();

  // §66 的三项来自画布：刚选中的节点要立刻体现在这里
  await expect(page.locator('[data-context-local]')).toContainText('当前页面');
  await expect(page.locator('[data-context-local]')).toContainText('1 个：Headline');

  // 目录与整份文档的尺寸对比：这是 §68 那句"别整个塞进去"的可核对版本
  await expect(page.locator('[data-context-chars]')).toContainText('字符（');
  await expect(page.locator('[data-context-page="Home"]')).toContainText('8 节点');
  // 刚起步的项目：世界确实还没有，面板不该拿一份空文档装作有
  await expect(page.locator('[data-context-panel]')).toContainText('还没有世界文档');

  // 把预算压到装不下：裁剪必须逐条交代，而不是静默变短
  await page.fill('[data-context-budget]', '300');
  await page.click('[data-context-apply-budget]');
  await expect(page.locator('[data-context-trimmed]').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-context-trimmed]').first()).toContainText('文字预览');

  // 放回宽裕预算：裁剪说明就该消失（同一份文档，两种预算，结论不同且都说得清）
  await page.fill('[data-context-budget]', '200000');
  await page.click('[data-context-apply-budget]');
  await expect(page.locator('[data-context-trimmed]')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('[data-context-panel]')).toContainText('这次没触发裁剪');

  // §69：代码目录的尺寸也在"尺寸"这一段里，报的是真实 AST 数出来的文件与符号
  await expect(page.locator('[data-context-code]')).toContainText('代码目录');
  await expect(page.locator('[data-context-code]')).toContainText(/\d+ 字符：\d+ 个文件/);
  await expect(page.locator('[data-context-code]')).toContainText(/\d+ 个符号/);
  await page.locator('[data-context-panel]').screenshot({ path: 'screenshots/context-code-index.png' });

  // §71 七个分支：做了什么写什么，没做的标未索引
  await expect(page.locator('[data-context-branch="Design"]')).toContainText('已索引');
  // §69 之后 Code 不再是空头支票：note 要说出它凭什么算已索引
  await expect(page.locator('[data-context-branch="Code"]')).toContainText('已索引');
  await expect(page.locator('[data-context-branch="Code"]')).toContainText('真实 AST');
  await expect(page.locator('[data-context-branch="Publishing"]')).toContainText('未索引');
  // 没带的信息逐条列出，读的人不必猜边界
  await expect(page.locator('[data-context-unavailable]').first()).toContainText('画布的本地状态');
  // 代码正文仍然取不到，这一条不能因为目录做完了就吞掉（§159）
  await expect(
    page.locator('[data-context-unavailable]').filter({ hasText: '代码正文' }),
  ).toBeVisible();
});

test('@smoke 发布机检与公开页举报：挡下要说清凭什么，举报要说清之后会发生什么（§131/§132）', async ({ page }) => {
  test.setTimeout(150_000);
  const projectName = `Moderation ${Date.now().toString(36)}`;
  await createProject(page, projectName);

  const openPublish = async (): Promise<void> => {
    for (let i = 0; i < 6; i += 1) {
      if (await page.locator('[data-publish-submit]').isVisible()) return;
      await page.click('[data-publish-open]');
      await expect(page.locator('[data-publish-submit]')).toBeVisible();
    }
  };

  // 干净的起手页：机检跑过并且如实说"这次没命中规则"，同时把覆盖不到的部分一起列出来
  await openPublish();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 30_000 });
  const scan = page.locator('[data-publish-scan]');
  await expect(scan).toBeVisible();
  await expect(scan.locator('[data-scan-decision]')).toHaveAttribute('data-scan-decision', 'clear');
  await expect(scan).toContainText('这次没命中规则');
  // §159：没命中不等于合规，limits 必须和结论一起出现
  await expect(scan.locator('[data-scan-limit]').first()).toContainText('换个说法');
  await page.screenshot({ path: 'screenshots/publish-scan-clear.png' });

  // 公开页上访客真能举报，而且回复说清了"不会立刻撤下"
  const publishedHref = (await page.locator('[data-publish-url]').getAttribute('href'))!;
  const visitor = await page.context().newPage();
  // baseURL 在 playwright.config 里，相对路径就够：不要在测试里再拼一个端口
  await visitor.goto(publishedHref);
  await visitor.waitForSelector('[data-published-frame] [data-node-id]', { timeout: 30_000 });
  await visitor.click('[data-report-open]');
  await visitor.selectOption('[data-report-reason]', 'other');
  await visitor.fill('[data-report-detail]', '测试举报：这一页像假冒的活动页');
  await visitor.click('[data-report-submit]');
  await expect(visitor.locator('[data-report-notice]')).toContainText('举报已记录', { timeout: 30_000 });
  await expect(visitor.locator('[data-report-notice]')).toContainText('需要人看完再决定');
  await visitor.screenshot({ path: 'screenshots/published-report.png' });
  await visitor.close();

  // 改成命中硬红线的文案后再发布：机检挡下，页面不更新版本号，原因写在错误里
  const headlineId = await layerId(page, 'Headline');
  await page.click('[data-view="canvas"]');
  await page.click(`[data-node-id="${headlineId}"]`);
  await page.fill('[data-prop="text"]', 'buy nude children now');
  await expect(page.locator('[data-save-state]')).toContainText('已保存', { timeout: 30_000 });
  await openPublish();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-error]')).toContainText('redline.minor_safety', { timeout: 30_000 });
  await expect(page.locator('[data-scan-decision]')).toHaveAttribute('data-scan-decision', 'blocked');
  await expect(page.locator('[data-scan-finding="redline.minor_safety"]')).toBeVisible();
  await page.screenshot({ path: 'screenshots/publish-scan-blocked.png' });
  // 挡下之后仍挂着上一次成功发布的那一版：不能因为"这次没发出去"就假装 URL 消失了
  await expect(page.locator('[data-publish-result]')).toContainText('第 1 版');

  // §131 的复核台默认拒绝：作者本人（guest/creator）看不到队列，连案子数都不给
  await page.goto('/admin/moderation');
  await expect(page.locator('[data-admin-denied]')).toHaveAttribute('data-admin-denied', 'not-admin');
  await expect(page.locator('[data-admin-queue]')).toHaveCount(0);
  await expect(page.locator('[data-queue-case]')).toHaveCount(0);
  await page.screenshot({ path: 'screenshots/admin-queue-denied.png' });
});

test('@smoke 社区：公开页能点赞、评论、改编；发现页只排排得出来的排序（§59/§61）', async ({ page }) => {
  test.setTimeout(180_000);
  const projectName = `Community ${Date.now().toString(36)}`;
  const projectId = await createProject(page, projectName);

  for (let i = 0; i < 6; i += 1) {
    if (await page.locator('[data-publish-submit]').isVisible()) break;
    await page.click('[data-publish-open]');
  }
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await page.waitForSelector('[data-publish-url]', { timeout: 30_000 });
  const publishedHref = (await page.locator('[data-publish-url]').getAttribute('href'))!;

  const visitor = await page.context().newPage();
  await visitor.goto(publishedHref);
  await visitor.waitForSelector('[data-published-frame] [data-node-id]', { timeout: 30_000 });

  await visitor.click('[data-action-like]');
  await expect(visitor.locator('[data-action-like]')).toHaveAttribute('data-action-like', 'on');
  await expect(visitor.locator('[data-action-like]')).toContainText('· 1');

  await visitor.fill('[data-comment-input]', '这个配色挺舒服的');
  await visitor.click('[data-comment-submit]');
  await expect(visitor.locator('[data-comment="这个配色挺舒服的"], [data-comment-list] li:has-text("这个配色挺舒服的")').first()).toBeVisible({ timeout: 30_000 });
  // §159：评论发出去时也要看到机检的限度
  await expect(visitor.locator('[data-action-notice]')).toContainText('没命中不等于内容合规');

  // 红线评论不该发出去，而且界面说清是机检挡的
  await visitor.fill('[data-comment-input]', 'buy nude children now');
  await visitor.click('[data-comment-submit]');
  await expect(visitor.locator('[data-action-notice]')).toContainText('机检挡下', { timeout: 30_000 });
  // 列表里仍然只有那一条真评论：被挡下的没进去，也没留下空位
  await expect(visitor.locator('[data-comment-list] li')).toHaveCount(1);
  await expect(visitor.locator('[data-comment-list]')).not.toContainText('nude');
  await visitor.screenshot({ path: 'screenshots/community-published.png' });

  // Remix：分叉成自己的改编，进去的是副本而不是原作品
  await visitor.click('[data-action-remix]');
  await visitor.waitForURL(/\/studio\/[^/]+$/, { timeout: 60_000 });
  await visitor.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 60_000 });
  await expect(visitor.locator('[data-project-name]')).toContainText('的改编');
  const forkPath = new URL(visitor.url()).pathname;
  await visitor.screenshot({ path: 'screenshots/community-remix.png' });
  await visitor.close();

  // 发现页：计数是真的，排不出来的排序写在页面上。
  // 这台开发库里还有别的项目留下的公开版本，所以断言只盯自己这一张卡，不假设世界是空的
  await page.goto('/discover');
  const card = page.locator(`[data-discover-card="${publishedHref}"]`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText(projectName);
  await expect(card.locator('[data-discover-counts]')).toContainText('1 赞');
  await expect(card.locator('[data-discover-counts]')).toContainText('1 评论');
  await expect(card.locator('[data-discover-counts]')).toContainText('1 改编');
  // Trending 已经从"排不出来"那张单子上摘下来了：按天的互动序列现在真的在库里
  await expect(page.locator('[data-discover-gap="Trending"]')).toHaveCount(0);
  await expect(page.locator('[data-discover-gap="AI Picks"]')).toContainText('provider');
  // 「最近最热」这一栏要把算法与候选集上限写在页面上，而不是只给一个序
  await page.click('[data-discover-tab="trending"]');
  await expect(page.locator('[data-discover-method]')).toContainText('半衰期');
  const ranked = page.locator(`[data-discover-card="${publishedHref}"]`);
  await expect(ranked).toBeVisible({ timeout: 30_000 });
  await expect(ranked.locator('[data-discover-score]')).toBeVisible();
  await page.screenshot({ path: 'screenshots/discover.png' });
  await page.click('[data-discover-tab="new"]');

  // Remix 不该动原作品：回到首页，原项目还在，副本是另一条
  await page.goto('/');
  await expect(page.locator(`a:has-text("${projectName}")`).first()).toBeVisible();
  await expect(page.locator('a:has-text("的改编")').first()).toBeVisible();
  expect(forkPath).toMatch(/^\/studio\//);

  // §59 Save：访客在公开页收下这一版，首页的收藏列表里要看到它
  const saver = await page.context().newPage();
  await saver.goto(publishedHref);
  await saver.waitForSelector('[data-action-save]', { timeout: 30_000 });
  await saver.click('[data-action-save]');
  await expect(saver.locator('[data-action-save]')).toHaveAttribute('data-action-save', 'on');
  await saver.goto('/');
  await expect(saver.locator('[data-saved-list]')).toContainText(projectName, { timeout: 30_000 });
  await saver.screenshot({ path: 'screenshots/profile-saved.png' });

  // §60 简介：写进主页，公开主页上就要读得到；命中红线的简介不保存
  await saver.fill('[data-bio-input]', '做互动世界与像素字体的人');
  await saver.click('[data-bio-save]');
  await expect(saver.locator('[data-bio-notice]')).toContainText('简介已更新');
  const profileHref = await saver.locator('[data-my-profile-link]').getAttribute('href');
  expect(profileHref).toMatch(/^\/u\//);
  await saver.goto(profileHref!);
  await expect(saver.locator('[data-profile-bio]')).toContainText('做互动世界与像素字体的人');
  await expect(saver.locator('[data-profile-works]')).toContainText(projectName);
  // 主页上只给名字与摘要：世界文档不该出现在这一页的任何文本里
  await expect(saver.locator('[data-profile-root]')).toContainText('只列出公网上传着的内容');
  await saver.screenshot({ path: 'screenshots/creator-profile.png' });

  await saver.goto('/'); // 简介编辑器在首页，不在公开主页上
  await saver.fill('[data-bio-input]', 'buy nude children now');
  await saver.click('[data-bio-save]');
  await expect(saver.locator('[data-bio-notice]')).toContainText('没保存');
  await saver.goto(profileHref!);
  await expect(saver.locator('[data-profile-bio]')).toContainText('做互动世界与像素字体的人');

  // §49 项目简介走同一份词表（§129）：命中就不保存。bio 那个入口已经是这个口径，这里补上另一个
  await saver.goto('/');
  await saver.click(`[data-project-desc-edit="${projectId}"]`);
  await saver.fill(`[data-project-desc-input="${projectId}"]`, 'buy nude children now');
  await saver.click(`[data-project-desc-save="${projectId}"]`);
  await expect(saver.locator(`[data-project-desc-notice="${projectId}"]`)).toContainText('没保存', { timeout: 30_000 });
  await saver.screenshot({ path: 'screenshots/project-description-rejected.png' });
  // 反向对照：同一个框换个合法的句子就存得下，说明"没保存"不是这条链根本没通
  await saver.fill(`[data-project-desc-input="${projectId}"]`, '一次关于雨与钟声的演示');
  await saver.click(`[data-project-desc-save="${projectId}"]`);
  await expect(saver.locator(`[data-project-desc-row="${projectId}"]`)).toContainText('一次关于雨与钟声的演示', { timeout: 30_000 });

  // §60 头像：这一段用真字节走完整条链——浏览器选文件 → multipart → magic bytes → 剥元数据 → 落存储 → 写列。
  // 造假的上传框（只换个 <img src>）在这些断言下会当场露馅
  await saver.goto('/');
  await expect(saver.locator('[data-avatar-none]')).toBeVisible();
  await saver
    .locator('[data-avatar-file]')
    .setInputFiles({ name: '冒充头像.png', mimeType: 'image/png', buffer: Buffer.from('这只是一段文字，不是位图') });
  await expect(saver.locator('[data-avatar-notice]')).toContainText('没换上');
  // 反向对照：被拒的字节没有变成头像，列里仍然是空
  await expect(saver.locator('[data-avatar-url]')).toHaveCount(0);
  await expect(saver.locator('[data-avatar-none]')).toBeVisible();

  const AVATAR_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOoOKEBAAMkAWmidwfJAAAAAElFTkSuQmCC',
    'base64',
  );
  await saver.locator('[data-avatar-file]').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: AVATAR_PNG });
  await expect(saver.locator('[data-avatar-notice]')).toContainText('头像已更新');
  const avatarUrl = await saver.locator('[data-avatar-url]').getAttribute('data-avatar-url');
  // 地址里带用户 id 与字节摘要：摘要换了地址就换，这是 immutable 缓存一整年的前提
  expect(avatarUrl).toMatch(/^\/api\/avatar\/[0-9a-f-]{36}\/avatar-[0-9a-f]{8}\.png$/);
  const fetched = await saver.request.get(new URL(avatarUrl!, saver.url()).toString());
  expect(fetched.status()).toBe(200);
  expect(fetched.headers()['content-type']).toBe('image/png');
  expect(fetched.headers()['cache-control']).toContain('public');
  expect(fetched.headers()['x-content-type-options']).toBe('nosniff');
  await saver.goto(profileHref!);
  await expect(saver.locator('[data-profile-avatar="url"]')).toBeVisible();
  await saver.screenshot({ path: 'screenshots/avatar-on-profile.png' });

  // 摘掉：列回到 null，公开主页回到首字母，刚才那个地址读不到东西
  await saver.goto('/');
  await saver.click('[data-avatar-remove]');
  await expect(saver.locator('[data-avatar-notice]')).toContainText('头像已摘掉');
  expect((await saver.request.get(new URL(avatarUrl!, saver.url()).toString())).status()).toBe(404);
  await expect(saver.locator('[data-avatar-none]')).toBeVisible();
  await saver.goto(profileHref!);
  await expect(saver.locator('[data-profile-avatar="initial"]')).toBeVisible();
  // 对照：摘掉只是清空这一列，简介那些内容还在——否则上面的 404 分不清是规则还是页面坏了
  await expect(saver.locator('[data-profile-bio]')).toContainText('做互动世界与像素字体的人');
  await saver.close();
});

test('@smoke 画布批注：钉在元素上、刷新还在、位置由服务端算（§111）', async ({ page }) => {
  test.setTimeout(150_000);
  await createProject(page, `Annotate ${Date.now().toString(36)}`);

  const headlineId = await layerId(page, 'Headline');
  await page.click(`[data-node-id="${headlineId}"]`);
  await page.click('[data-annotations-toggle]');
  await expect(page.locator('[data-annotations-panel]')).toBeVisible();
  // 面板要说清这条会钉在哪个元素上——包括它的 id，出问题时这是唯一能核对的东西
  await expect(page.locator('[data-annotations-panel]')).toContainText(headlineId);

  await page.fill('[data-annotation-input]', '这个标题太大，压到下面的卡片了');
  await page.click('[data-annotation-submit]');
  await expect(page.locator(`[data-annotation="${headlineId}"]`)).toContainText('这个标题太大');
  await expect(page.locator(`[data-annotation-badge="${headlineId}"]`)).toBeVisible();
  await page.screenshot({ path: 'screenshots/canvas-annotation.png' });

  // 刷新：批注来自库里，不是内存里的临时状态
  await page.reload();
  await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 30_000 });
  await expect(page.locator(`[data-annotation-badge="${headlineId}"]`)).toBeVisible({ timeout: 30_000 });
  await page.click('[data-annotations-toggle]');
  await expect(page.locator('[data-annotations-toggle]')).toContainText('批注 1 条');

  // 刷新后**在画布上点元素**仍然要能选中（面板收起时点节点 → 打开面板 → 说清钉在哪个 id 上）。
  // 这条不是多余的：这块浮层压在画布上，一旦它的 pointerdown 冒泡到画布，
  // 点面板里的控件就会被当成"点了空白处"而清空选中，批注就没地方钉了。
  // 面板上一步已经打开了，这里只点画布上的元素：选中态要立刻反映到"钉在哪个 id 上"
  await page.click(`[data-node-id="${headlineId}"]`);
  await expect(page.locator('[data-annotations-panel]')).toContainText(headlineId);
  // 已存在的那条批注仍然列着，且写明它钉在 Headline 上
  await expect(page.locator(`[data-annotation="${headlineId}"]`)).toContainText('Headline · Home');
});


test('@smoke 3D 世界：图上摆过的位置就是地面布局，走近才展开正文（§140）', async ({ page }) => {
  test.setTimeout(180_000);
  await createProject(page, `World 3D ${Date.now().toString(36)}`);

  // 世界骨架 + 一条正文（§44）。落库要等 world-state，不是画布的 save-state
  await page.click('[data-panel-tab="world"]');
  await expect(page.locator('[data-world-empty]')).toBeVisible({ timeout: 40_000 });
  await page.click('[data-world-create]');
  await expect(page.locator('[data-world-node]')).toHaveCount(9);
  await page.locator('[data-world-group="lore"] [data-world-body]').first().fill('三座浮岛与一条会说谎的河。');
  await page.click('[data-world-name]');
  await expect(page.locator('[data-world-state]')).toHaveText('已保存', { timeout: 20_000 });

  await page.click('[data-view="graph"]');
  await page.waitForSelector('[data-graph-count]', { timeout: 30_000 });

  // 在世界图上摆一个位置，再进 3D：§45 与 §140 用的是同一份坐标，
  // 这里要的是"图里拖过的那一个，走进世界就是它摆的位置"这条端到端连续性
  const dragged = page.locator('[data-graph-node]').first();
  const draggedId = (await dragged.getAttribute('data-graph-node'))!;
  const box = (await dragged.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 60, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('[data-graph-pending]')).toHaveAttribute('data-graph-pending', 'false', { timeout: 20_000 });

  await page.click('[data-enter-world3d]');
  await page.waitForURL(/\/world\/[^/]+$/, { timeout: 30_000 });

  // 这台设备给不出 WebGL 时，页面必须明说，而不是一片黑屏或假装进了世界
  const mode = await page.waitForSelector('[data-world3d="live"], [data-world3d="unavailable"]', { timeout: 30_000 });
  const kind = await mode.getAttribute('data-world3d');
  console.log(`3D 世界渲染模式：${kind}`);
  await page.screenshot({ path: 'screenshots/world3d.png' });
  expect(['live', 'unavailable']).toContain(kind as string);

  if (kind === 'live') {
    await expect(page.locator('[data-world-hud]')).toContainText('来自《World 3D');
    // HUD 必须说清哪些位置是作者摆过的、哪些是规则排的——这是这份场景最容易骗人的一处
    await expect(page.locator('[data-world-hud]')).toContainText('1 个来自你在世界图上摆过的坐标');
    await expect(page.locator('[data-world-hud]')).toContainText('8 个按文档顺序排在同心环上');
    await expect(page.locator(`[data-world-label="${draggedId}"]`)).toHaveAttribute('data-placed', 'authored');
    await expect(page.locator('[data-scene-limits]')).toContainText('碰撞');
    await expect(page.locator('[data-world-legend]')).toContainText('传说 · 1');

    // 名字标签：DOM 层能断言、能点。点标签等于读那一条，不会把人搬过去
    const loreLabel = page.locator('[data-world-label]').filter({ hasText: '传说' }).first();
    await expect(loreLabel).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-world-labels]')).toContainText('历史');
    await loreLabel.click();
    await expect(page.locator('[data-nearby-focus]')).toBeVisible();
    await expect(page.locator('[data-nearby-focus]')).toContainText('三座浮岛与一条会说谎的河');

    const first = page.locator('[data-read-entity]').first();
    await first.click();
    await expect(page.locator('[data-nearby-focus]')).toBeVisible();
    // 展开的是那条正文本身，不是"已为你生成"之类的空话
    await expect(page.locator('[data-nearby-focus]')).toContainText('三座浮岛与一条会说谎的河');
    await page.screenshot({ path: 'screenshots/world3d-focus.png' });
  }
});

test('@smoke 全平台搜索：命中的都打得开，搜不到的要说清为什么（§165）', async ({ page }) => {
  test.setTimeout(150_000);
  const suffix = Date.now().toString(36);
  const projectId = await createProject(page, `搜索切片${suffix}`);

  // 项目名命中，结果链接指向这个项目自己的编辑器
  await page.goto(`/search?q=${encodeURIComponent(suffix)}`);
  await expect(page.locator('[data-search-group="projects"]')).toContainText(`搜索切片${suffix}`);
  await page.click(`[data-search-hit="${projectId}"]`);
  await page.waitForURL(/\/studio\/[^/]+$/, { timeout: 30_000 });
  await waitForCanvas(page);

  // 画布元素名也在八类里：Hero 是起手文档自己的节点，不是为这条用例造的
  await page.goto('/search?q=Hero');
  await expect(page.locator('[data-search-group="designs"]')).toContainText('Hero');
  await expect(page.locator('[data-search-group="designs"] a')).toHaveAttribute('href', new RegExp(`/studio/${projectId}`));
  await page.screenshot({ path: 'screenshots/platform-search.png' });

  // 没搜到的词要说清"没有匹配"，而不是空白页或假结果
  await page.goto(`/search?q=${encodeURIComponent(`查无此词${suffix}`)}`);
  await expect(page.locator('[data-search-empty]')).toBeVisible();
  // 一个字符不发查询：一个汉字能命中半个平台
  await page.goto('/search?q=搜');
  await expect(page.locator('[data-search-too-short]')).toBeVisible();
  await expect(page.locator('[data-search-results]')).toHaveCount(0);
  // 范围写在页面上：正文与相关度排序没做，就直说
  await expect(page.locator('[data-search-scope]')).toContainText('相关度排序');

  // 换一个没有登录态的访客搜同一个关键词：内容组只认所有权，必须一无所获。
  // 用新 context 而不是新 page——同一个 context 会带着这个 guest 的会话 cookie
  const browser = page.context().browser();
  if (!browser) throw new Error('这条用例需要一个可派生上下文的浏览器');
  const anonContext = await browser.newContext();
  const visitor = await anonContext.newPage();
  await visitor.goto(new URL(`/search?q=${encodeURIComponent(suffix)}`, page.url()).href);
  await expect(visitor.locator('[data-search-empty]')).toBeVisible();
  await expect(visitor.locator('[data-search-group="projects"]')).toHaveCount(0);
  await anonContext.close();
});

/**
 * §166 SEO：抓取端多数不执行 JS，所以 head 里的东西必须在服务端就出得来。
 * 这条用例只站在爬虫视角看：标题 / og / canonical / 收录开关 / JSON-LD，
 * 外加 robots.txt 与 sitemap.xml 两份文件说的是不是同一套可见性规则。
 */
test('@smoke §166 SEO：公开页 head、sitemap 与 robots 用的是同一套可见性判断', async ({ page, request }) => {
  test.setTimeout(240_000);
  const projectName = `SEO 作品${Date.now().toString(36)}`;
  const projectId = await createProject(page, projectName);

  // §49：作者写的这一句简介要一路走到 og:description。
  // 在这一版之前 projects.description 没有写入方，所以这条断言只能落在"从快照文字里摘一句"那一级。
  const summary = '一座会下雨的王城，雨季从三月的第一次钟声开始';
  await page.goto('/');
  await page.click(`[data-project-desc-edit="${projectId}"]`);
  await page.fill(`[data-project-desc-input="${projectId}"]`, summary);
  await page.click(`[data-project-desc-save="${projectId}"]`);
  await expect(page.locator(`[data-project-desc-row="${projectId}"]`)).toContainText(summary, { timeout: 30_000 });
  await page.goto(`/studio/${projectId}`);
  await expect(page.locator('[data-publish-open]')).toBeVisible({ timeout: 30_000 });

  const openPublish = async () => {
    // 发布成功后面板不会自己收起：只在没打开时点一下，否则这一下会把面板关掉
    if (await page.locator('[data-publish-submit]').isVisible()) return;
    await page.click('[data-publish-open]');
    await expect(page.locator('[data-publish-submit]')).toBeVisible();
  };

  await openPublish();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 30_000 });
  const path = (await page.locator('[data-publish-url]').getAttribute('href'))!;
  const origin = new URL(page.url()).origin;

  const visitor = await page.context().newPage();
  await visitor.goto(path);
  await expect(visitor.locator('[data-published-frame]')).toBeVisible({ timeout: 30_000 });
  expect(await visitor.title()).toContain(projectName);
  await expect(visitor.locator('meta[property="og:title"]')).toHaveAttribute('content', projectName);
  // 同一句简介要出现在三处：普通 description、og、JSON-LD。它们由同一个变量拼出来，
  // 但"同一个变量"正是最容易在重构时断掉的东西
  await expect(visitor.locator('meta[property="og:description"]')).toHaveAttribute('content', summary);
  await expect(visitor.locator('meta[name="description"]')).toHaveAttribute('content', summary);
  await expect(visitor.locator('meta[name="twitter:description"]')).toHaveAttribute('content', summary);
  await expect(visitor.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}${path}`);
  const publicRobots = (await visitor.locator('meta[name="robots"]').getAttribute('content')) ?? '';
  expect(publicRobots).toContain('index');
  expect(publicRobots).not.toContain('noindex');
  // 这一版没有画到图片资产：宁可不给封面，也不放一张爬虫取不到字节的占位图
  await expect(visitor.locator('meta[property="og:image"]')).toHaveCount(0);

  const jsonLd = await visitor.locator('script[type="application/ld+json"]').textContent();
  const schema = JSON.parse(jsonLd ?? '{}') as Record<string, unknown>;
  expect(schema).toMatchObject({ '@type': 'CreativeWork', name: projectName, url: `${origin}${path}`, description: summary });
  // 没跑过的评分、没编出来的关键词，一个都不该出现（§159）
  expect(JSON.stringify(schema)).not.toMatch(/aggregateRating|keywords/i);
  await visitor.screenshot({ path: 'screenshots/published-seo-public.png' });

  // robots.txt：公开路径放行，私有面挡掉，并指向清单
  const robotsText = await (await request.get('/robots.txt')).text();
  expect(robotsText).toContain('Disallow: /studio');
  expect(robotsText).toContain(`Sitemap: ${origin}/sitemap.xml`);
  const sitemapText = async () => await (await request.get('/sitemap.xml')).text();
  expect(await sitemapText()).toContain(`${origin}${path}`);

  // 换成"仅链接"再发布：URL 照旧打得开，但不该再被收录，清单里也要消失
  await openPublish();
  await page.click('[data-publish-choice="unlisted"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-result]')).toContainText('第 2 版', { timeout: 30_000 });
  await visitor.reload();
  expect((await visitor.locator('meta[name="robots"]').getAttribute('content')) ?? '').toContain('noindex');
  expect(await sitemapText()).not.toContain(path);
  // 反向对照：仅链接 ≠ 打不开，它只是不进清单——否则这条断言分不清是规则挡的还是页面坏了
  await expect(visitor.locator('[data-published-frame]')).toBeVisible();
  await expect(visitor.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}${path}`);
});

/**
 * §168 创作数据：作者页上的每个数都必须能追到"真有人做过这件事"。
 * 这条用例走的是完整链路——真人（浏览器）打开公开页 → 客户端心跳进库 → 作者侧读出来，
 * 中间任何一环假了都会在这里露馅：假采集器不会发请求，假展示面不会有非零数。
 */
test('@smoke §168 创作数据：访客真的来过，作者那一页才有真的数', async ({ page }) => {
  // 链路里有一次 15 秒心跳和两次真发布（第二次前面要过一遍 save），预算给足
  test.setTimeout(360_000);
  const projectName = `数据作品${Date.now().toString(36)}`;
  const projectId = await createProject(page, projectName);

  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-submit]')).toBeVisible();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 30_000 });
  const path = (await page.locator('[data-publish-url]').getAttribute('href'))!;
  const visitApi = /\/api\/published\/visit$/;

  const cell = (col: string) => page.locator(`[data-analytics-row="${path}"] [data-analytics-value="${col}"]`);

  // 刚发布、还没有人来过：计数是 0，没采到的两项写"未采集"
  await page.goto('/analytics');
  await expect(page.locator('[data-analytics-page]')).toBeVisible();
  await expect(page.locator(`[data-analytics-row="${path}"]`)).toBeVisible();
  await expect(cell('visitors')).toHaveText('0');
  await expect(cell('play_time')).toHaveText('未采集');
  await expect(cell('completion')).toHaveText('未采集');
  // 口径写在页面上，不是只写在代码注释里
  await expect(page.locator('[data-analytics-page]')).toContainText('这台浏览器 × 这一天');

  // 一个不带任何登录态的访客：新 context，同一个 browser context 会带着这个 guest 的会话
  const browser = page.context().browser();
  if (!browser) throw new Error('这条用例需要一个可派生上下文的浏览器');
  const anonContext = await browser.newContext();
  const visitor = await anonContext.newPage();
  const opened = visitor.waitForResponse((res) => visitApi.test(new URL(res.url()).pathname) && res.status() === 200);
  await visitor.goto(new URL(path, page.url()).href);
  await expect(visitor.locator('[data-published-frame]')).toBeVisible({ timeout: 30_000 });
  // 统计这件事写在页面上，不执行 JS 的访客也看得见
  await expect(visitor.locator('[data-visit-notice]')).toBeVisible();
  await opened;

  // 滚到底再等一次心跳：时长与"最远到达比例"是这一拍带回来的
  await visitor.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const heartbeat = await visitor.waitForResponse((res) => {
    if (!visitApi.test(new URL(res.url()).pathname) || res.status() !== 200) return false;
    const body = res.request().postDataJSON() as { visibleMs?: number };
    return (body.visibleMs ?? 0) > 0;
  }, { timeout: 40_000 });
  const reported = heartbeat.request().postDataJSON() as {
    path: string;
    visitorKey: string;
    open: boolean;
    visibleMs: number;
    completionPct: number;
  };
  expect(reported.path).toBe(path);
  expect(reported.visitorKey).toMatch(/^[0-9a-f]{32}$/);
  expect(reported.open).toBe(false);
  expect(reported.completionPct).toBeGreaterThan(50);

  await page.goto('/analytics');
  await expect(cell('visitors')).toHaveText('1');
  await expect(cell('opens_today')).toHaveText('1');
  // 服务端渲染计数是真的：访客点开过一次，views 就不是 0
  await expect(cell('views')).not.toHaveText('0');
  await expect(cell('play_time')).toHaveText(/\d+ 秒/);
  await expect(cell('completion')).toContainText('%');
  // 这是个真人（匿名访客），不是作者自己刷新出来的数
  await expect(page.locator(`[data-analytics-row="${path}"] [data-analytics-selfonly]`)).toHaveCount(0);
  await page.screenshot({ path: 'screenshots/creator-analytics.png' });

  // 没有登录态的人打不开别人的数据：页面上一个数字都不该出现
  const anonAnalytics = await anonContext.newPage();
  await anonAnalytics.goto(new URL('/analytics', page.url()).href);
  await expect(anonAnalytics.locator('[data-analytics-denied]')).toBeVisible();
  await expect(anonAnalytics.locator('[data-analytics-value]')).toHaveCount(0);

  // 这个接口是匿名可写的，所以 CSRF 双提交必须真的挡事：只带 cookie 不带头的上报进不来
  const visitUrl = new URL('/api/published/visit', page.url()).href;
  const payload = (over: Record<string, unknown>) => ({
    path,
    visitorKey: reported.visitorKey,
    open: true,
    visibleMs: 5_000,
    completionPct: 100,
    ...over,
  });
  expect((await visitor.request.post(visitUrl, { data: payload({}) })).status()).toBe(403);
  // 反向对照：同一个访客、同一个 body，补上 cookie 里那份 token 就通得过去
  const token = (await anonContext.cookies()).find((cookie) => cookie.name === 'nexus_csrf')?.value;
  if (!token) throw new Error('访客上下文里没有 CSRF cookie，这条用例的前提不成立');
  const csrf = { 'x-csrf-token': token };
  expect((await visitor.request.post(visitUrl, { data: payload({}), headers: csrf })).status()).toBe(200);
  await page.reload();
  // 同一个人当天再来一次：访客数还是 1，只有"今天打开"加了一次
  await expect(cell('opens_today')).toHaveText('2');
  await expect(cell('visitors')).toHaveText('1');

  // 一个不存在的公开路径：404，并且不会往任何一行上写数据。
  // 这里只看"次数"类指标：访客页面还在每 15 秒心跳一次，时长本来就在动
  const bogus = await visitor.request.post(
    visitUrl,
    { data: payload({ path: '/n/nobody/never-published', visibleMs: 60_000 }), headers: csrf },
  );
  expect(bogus.status()).toBe(404);
  await page.reload();
  await expect(cell('opens_today')).toHaveText('2');
  await expect(cell('visitors')).toHaveText('1');

  // 作者下架（切成私有）之后再上报：接口 404，已经存在的历史计数一行都不加
  await page.goto(`/studio/${projectId}`);
  await expect(page.locator('[data-studio-root]')).toBeVisible({ timeout: 30_000 });
  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-submit]')).toBeVisible();
  await page.click('[data-publish-choice="private"]');
  await page.click('[data-publish-submit]');
  // 断言挂在触发按钮上：`data-publish-result` 在切成私有后会整块收起，等不到"第 2 版"这句话。
  // 60 秒的预算是给发布前那一次 save() 的——docs/TESTING.md 记过它偶发超过 30 秒，不是断言写宽了
  await expect(page.locator('[data-publish-open]')).toContainText('已停 v2', { timeout: 60_000 });

  const afterUnpublish = await visitor.request.post(
    visitUrl,
    { data: payload({ visibleMs: 60_000 }), headers: csrf },
  );
  expect(afterUnpublish.status()).toBe(404);
  await page.goto('/analytics');
  // 下架不删历史：这一行还在，只是"不再收新的"
  await expect(cell('opens_today')).toHaveText('2');
  await expect(page.locator(`[data-analytics-row="${path}"]`)).toContainText('已停');
  await anonContext.close();
});

test('@smoke §164 通知：别人真的动过，作者的收件箱里才有那一条', async ({ page }) => {
  // 一次真发布 + 三个访客动作 + 两次标已读的回车确认，都跑在同一个开发服务上
  test.setTimeout(300_000);
  const projectName = `收件箱作品${Date.now().toString(36)}`;
  const projectId = await createProject(page, projectName);

  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-submit]')).toBeVisible();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 60_000 });
  const path = (await page.locator('[data-publish-url]').getAttribute('href'))!;

  const header = page.locator('[data-notification-page] p').first();
  const row = (kind: string) => page.locator(`[data-notification-kind="${kind}"]`);
  /** 标已读的界面回话会被 router.refresh() 收掉，所以那句"标了几条"从网络响应里取证 */
  const markReadCall = () =>
    page.waitForResponse((res) => res.url().endsWith('/api/notifications/read') && res.status() === 200);

  // 作者自己：只有"发布完成"那一条，指向刚拿到的公开地址
  await page.goto('/notifications');
  await expect(page.locator('[data-notification-page]')).toBeVisible();
  await expect(page.locator('[data-notification-item]')).toHaveCount(1);
  await expect(row('publish')).toContainText(projectName);
  expect(await row('publish').locator('[data-notification-link]').getAttribute('href')).toBe(path);
  // 首页顶栏的铃铛与这一页说的是同一个数
  await page.goto('/');
  await expect(page.locator('[data-notification-bell="ready"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-notification-unread]')).toHaveAttribute('data-notification-unread', '1');

  // 另一个身份：必须是新 context——同一个 context 的多个 page 共用那份 guest 会话，
  // 用同一身份自赞自评只会测出"自己给自己发通知"这条规则没生效
  const browser = page.context().browser();
  if (!browser) throw new Error('这条用例需要一个可派生上下文的浏览器');
  const visitorCtx = await browser.newContext();
  const visitor = await visitorCtx.newPage();
  await visitor.goto(new URL(path, page.url()).href);
  await visitor.waitForSelector('[data-published-frame] [data-node-id]', { timeout: 30_000 });

  await visitor.click('[data-action-like]');
  await expect(visitor.locator('[data-action-like]')).toHaveAttribute('data-action-like', 'on', { timeout: 30_000 });
  await visitor.fill('[data-comment-input]', '这一段的节奏挺舒服的');
  await visitor.click('[data-comment-submit]');
  await expect(visitor.locator('[data-comment-list] li')).toHaveCount(1, { timeout: 30_000 });
  await visitor.click('[data-action-follow]');
  await expect(visitor.locator('[data-action-follow]')).toHaveAttribute('data-action-follow', 'on', { timeout: 30_000 });

  // 作者这边：铃铛从 1 变 4，未读的三条各说清是谁、对哪件作品做了什么
  await page.goto('/');
  await expect(page.locator('[data-notification-unread]')).toHaveAttribute('data-notification-unread', '4', {
    timeout: 30_000,
  });
  await page.goto('/notifications');
  await expect(header).toContainText('共 4 条');
  await expect(header).toContainText('未读 4 条');
  await expect(row('like')).toContainText('点赞了');
  await expect(row('comment')).toContainText('这一段的节奏挺舒服的');
  await expect(row('follow')).toContainText('开始关注你');
  expect(await row('like').locator('[data-notification-link]').getAttribute('href')).toBe(path);
  // 访客是没认领过的 guest，没有 /u/<handle> 这一页：那条不给链接，而是把原因写在行上
  await expect(row('follow').locator('[data-notification-unavailable]')).toHaveText('没有可跳转的页面');
  await page.screenshot({ path: 'screenshots/notifications-inbox.png' });

  // 逐条标已读：只有点下去那一条变已读，其余三条仍然未读
  const one = markReadCall();
  await row('like').locator('[data-notification-mark-read]').click();
  expect(((await (await one).json()) as { marked: number }).marked).toBe(1);
  await expect(row('like')).toHaveAttribute('data-notification-read', 'yes');
  await expect(page.locator('[data-notification-read="no"]')).toHaveCount(3);

  // 全部标已读：标的是"读过"，不是把行删掉
  const all = markReadCall();
  await page.click('[data-notification-mark-read="all"]');
  expect(((await (await all).json()) as { marked: number }).marked).toBe(3);
  await expect(page.locator('[data-notification-read="no"]')).toHaveCount(0);
  await expect(page.locator('[data-notification-item]')).toHaveCount(4);
  await expect(header).toContainText('共 4 条 · 未读 0 条');
  await page.goto('/');
  // 已读之后铃铛报的是总条数而不是"没有消息"
  await expect(page.locator('[data-notification-unread]')).toHaveAttribute('data-notification-unread', '0');
  await expect(page.locator('[data-notification-bell="ready"]')).toContainText('4 条');

  // 动手的那个人自己：他做的三件事一条也没进自己的收件箱（收件箱按人存放，不漏给别人）
  await visitor.goto('/notifications');
  await expect(visitor.locator('[data-notification-empty]')).toBeVisible();

  // 没有身份的人：接口 401，这一页一个数字都不出现
  const anonCtx = await browser.newContext();
  const anonSummary = await anonCtx.request.get(new URL('/api/notifications', page.url()).href);
  expect(anonSummary.status()).toBe(401);
  const anon = await anonCtx.newPage();
  await anon.goto(new URL('/notifications', page.url()).href);
  await expect(anon.locator('[data-notification-denied]')).toBeVisible();
  await expect(anon.locator('[data-notification-item]')).toHaveCount(0);

  // §112 / §164：跑一次真 AI 请求（本机没有 provider，走 DEMO 模板），
  // 这一次要在账本与收件箱里都留下东西——"Generation complete"以前挂在"没有来源"那张单子上。
  // 指令要挑 Mock 实现得了的那种：带 error 的 200 现在记的是失败，
  // 拿一条它没实现的指令来断言"生成完成"，测的就是刚修掉的那个假终态
  await page.goto(`/studio/${projectId}`);
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await page.fill('[data-ai-input]', 'Make the hero 30% taller.');
  await page.click('[data-ai-submit]');
  await expect(page.locator('[data-ai-task]')).toBeVisible({ timeout: 90_000 });
  await page.goto('/notifications');
  await expect(header).toContainText('共 5 条', { timeout: 30_000 });
  await expect(row('generation')).toContainText('DEMO 模板生成完成');
  await page.screenshot({ path: 'screenshots/notifications-unbacked.png' });

  // 没有来源的那两类仍然要挂在页面上；Generation complete 已经不在那张单子上了（有真写入方）
  await expect(page.locator('[data-notification-unbacked="Generation complete"]')).toHaveCount(0);
  await expect(page.locator('[data-notification-unbacked="Build complete"]')).toBeVisible();
  await expect(page.locator('[data-notification-unbacked="Agent task complete"]')).toBeVisible();

  // §112 的账本：这一页列的就是刚才那一行任务
  await page.goto(`/tasks/${projectId}`);
  await expect(page.locator('[data-task-row]')).toHaveCount(1);
  await expect(page.locator('[data-task-status="succeeded"]')).toBeVisible();
  await expect(page.locator('[data-task-capability="demo"]')).toContainText('DEMO 模板');
  await page.screenshot({ path: 'screenshots/agent-task-ledger.png' });

  await anonCtx.close();
  await visitorCtx.close();
});

test('@smoke §132 拉黑与屏蔽：挡住的是互动，过滤的是自己看到的那一份', async ({ page }) => {
  // 两个真身份 + 一个匿名旁观者：block 的三条规则（挡住对方、只改自己看到的、不追溯历史）
  // 必须三种视角都看一次才分得清，只测作者那一侧的话，"全站删帖"这个错误实现也能过
  test.setTimeout(300_000);
  const stamp = Date.now().toString(36);

  const publishPublic = async (p: Page): Promise<string> => {
    await p.click('[data-publish-open]');
    await expect(p.locator('[data-publish-submit]')).toBeVisible();
    await p.click('[data-publish-choice="public"]');
    await p.click('[data-publish-submit]');
    await expect(p.locator('[data-publish-url]')).toBeVisible({ timeout: 60_000 });
    return (await p.locator('[data-publish-url]').getAttribute('href'))!;
  };

  const projectName = `拉黑测试作品${stamp}`;
  await createProject(page, projectName);
  const authorPath = await publishPublic(page);
  const authorUrl = new URL(authorPath, page.url()).href;

  // 访客也要发布一次：handle 是首次发布时按 id 补的（§56），没有 handle 就没有 /u/<handle> 这一页，
  // 也就没有可以点"拉黑"的地方——这一步不是凑数，是这条路径的前提
  const browser = page.context().browser();
  if (!browser) throw new Error('这条用例需要一个可派生上下文的浏览器');
  const visitorCtx = await browser.newContext();
  const visitor = await visitorCtx.newPage();
  await createProject(visitor, `访客作品${stamp}`);
  const visitorPath = await publishPublic(visitor);
  const visitorHandle = new URL(visitorPath, visitor.url()).pathname.split('/')[2]!;
  expect(visitorHandle).toBeTruthy();

  // 基线：拉黑之前，访客的动静真的会送达到作者那里（不成立的话后面所有"没送达到"都毫无意义）
  await visitor.goto(authorUrl);
  await visitor.waitForSelector('[data-published-frame] [data-node-id]', { timeout: 30_000 });
  await visitor.fill('[data-comment-input]', '拉黑之前留下的那句');
  await visitor.click('[data-comment-submit]');
  await expect(visitor.locator('[data-comment-list] [data-comment]')).toHaveCount(1, { timeout: 30_000 });
  await visitor.click('[data-action-like]');
  await expect(visitor.locator('[data-action-like]')).toHaveAttribute('data-action-like', 'on', { timeout: 30_000 });

  await page.goto('/notifications');
  const header = page.locator('[data-notification-page] p').first();
  await expect(header).toContainText('共 3 条', { timeout: 30_000 });

  // 作者在访客主页上拉黑
  await page.goto(`/u/${visitorHandle}`);
  await expect(page.locator('[data-block-control]')).toBeVisible();
  await page.click('[data-block-set="block"]');
  await expect(page.locator('[data-block-state]')).toHaveAttribute('data-block-state', 'block', { timeout: 30_000 });
  await expect(page.locator('[data-block-note]')).toContainText('互相都不能评论');
  // 拉黑之后连"关注"按钮都不该再摆着——它只会回一句拒绝
  await expect(page.locator('[data-follow-button]')).toHaveCount(0);
  await page.screenshot({ path: 'screenshots/profile-blocked.png' });

  // 名单页列得出来：解除是这条关系的第二条路（不是只有当初那个按钮）
  await page.goto('/blocks');
  await expect(page.locator('[data-block-row]')).toHaveCount(1);
  await expect(page.locator('[data-block-row]')).toContainText(visitorHandle);

  // 规则一：挡住的是往后的互动，界面说的是原因而不是"发送失败"
  await visitor.goto(authorUrl);
  await visitor.fill('[data-comment-input]', '拉黑之后还想说一句');
  await visitor.click('[data-comment-submit]');
  await expect(visitor.locator('[data-action-notice]')).toContainText('对方不接受你的互动', { timeout: 30_000 });
  // 规则二：不追溯历史——之前那条还在（对发帖的访客自己也是原样）
  await expect(visitor.locator('[data-comment-list] [data-comment]')).toHaveCount(1);
  // 关注同样被挡住，走的是另一条路由（/api/follow），所以单独试一次
  await visitor.click('[data-action-follow]');
  await expect(visitor.locator('[data-action-notice]')).toContainText('对方不接受你的互动', { timeout: 30_000 });

  // 规则三（反向对照）：匿名旁观者看同一页仍然有那一条评论——拉黑不是全站删帖
  const anonCtx = await browser.newContext();
  const anon = await anonCtx.newPage();
  await anon.goto(authorUrl);
  await anon.waitForSelector('[data-published-frame] [data-node-id]', { timeout: 30_000 });
  await expect(anon.locator('[data-comment-list] [data-comment]')).toHaveCount(1);
  // 而且旁观者的收件箱与作者无关：他的这一页看到的是作者那边公开的样子，不是作者看到的样子
  await anon.click('[data-action-like]');
  await expect(anon.locator('[data-action-like]')).toHaveAttribute('data-action-like', 'on', { timeout: 30_000 });

  // 作者自己看同一页：那条被过滤掉了，而且界面把"滤掉了 1 条"写在脸上
  await page.goto(authorUrl);
  await expect(page.locator('[data-comment-list] [data-comment]')).toHaveCount(0);
  await expect(page.locator('[data-hidden-comments]')).toContainText('另有 1 条');
  await page.screenshot({ path: 'screenshots/blocked-comment-hidden.png' });

  // 拉黑只挡住那一个人，不是把整个收件箱关掉：旁观者刚才那一下（第 4 条）照样进来了，
  // 而被拉黑的访客在此之后一条新动静都造不出来（评论/点赞/关注全被挡）
  await page.goto('/notifications');
  await expect(header).toContainText('共 4 条');

  // 解除：名单空了，访客的评论又能发出去了——这条路要真能走回来
  await page.goto('/blocks');
  await page.click('[data-unblock]');
  await expect(page.locator('[data-blocks-empty="block"]')).toBeVisible({ timeout: 30_000 });
  await visitor.goto(authorUrl);
  await visitor.fill('[data-comment-input]', '解除之后再试一次');
  await visitor.click('[data-comment-submit]');
  await expect(visitor.locator('[data-comment-list] [data-comment]')).toHaveCount(2, { timeout: 30_000 });

  await anonCtx.close();
  await visitorCtx.close();
});

test('@smoke §50 试玩：§54 那份设计文档真的跑成一关，能走动、能打赢、能通关', async ({ page }) => {
  test.setTimeout(300_000);
  const stamp = Date.now().toString(36);
  const projectName = `可玩关卡 ${stamp}`;
  const projectId = await createProject(page, projectName);

  await page.click('[data-panel-tab="game"]');
  await expect(page.locator('[data-game-empty]')).toBeVisible({ timeout: 40_000 });
  await page.click('[data-game-create]');
  await expect(page.locator('[data-game-entity]')).toHaveCount(11);

  const entityId = (group: string) =>
    page.locator(`[data-game-group="${group}"] [data-game-entity]`).first().getAttribute('data-game-entity');
  const playerId = (await entityId('player'))!;
  const enemyId = (await entityId('enemy'))!;
  const itemId = (await entityId('item'))!;
  const questId = (await entityId('quest'))!;

  const addStat = async (id: string, key: string, value: string): Promise<void> => {
    await page.fill(`[data-game-stat-key="${id}"]`, key);
    await page.fill(`[data-game-stat-value="${id}"]`, value);
    await page.click(`[data-game-stat-add="${id}"]`);
    await expect(page.locator(`[data-game-stat="${id}:${key}"]`)).toHaveValue(value);
  };
  await addStat(playerId, 'health', '20');
  await addStat(playerId, 'attackPower', '10');
  await addStat(enemyId, 'health', '10');
  await addStat(enemyId, 'damage', '1');
  await addStat(enemyId, 'speed', '0');

  // 任务的完成条件来自引用：讨伐这个敌人 + 收集这个物品，两条都可判定
  const addRef = async (from: string, to: string, role: string): Promise<void> => {
    await page.selectOption(`[data-game-ref-target="${from}"]`, to);
    await page.fill(`[data-game-ref-role="${from}"]`, role);
    await page.click(`[data-game-ref-add="${from}"]`);
  };
  await addRef(questId, enemyId, '讨伐');
  await addRef(questId, itemId, '收集');
  await expect(page.locator('[data-game-ref]')).toHaveCount(2);
  await expect(page.locator('[data-game-state]')).toHaveText('已保存', { timeout: 20_000 });

  // 试玩入口指向的就是这份文档的投影，不另存一份"关卡文件"（§16）
  expect(await page.locator('[data-game-play]').getAttribute('href')).toBe(`/game/${projectId}`);
  const [game] = await Promise.all([page.context().waitForEvent('page'), page.click('[data-game-play]')]);
  await game.waitForURL(new RegExp(`/game/${projectId}`), { timeout: 60_000 });
  await expect(game.locator('[data-game-root]')).toBeVisible({ timeout: 60_000 });
  // 标题用的是项目名（loadGame 建骨架时按项目命名），不是文档里的占位名
  await expect(game.locator('[data-game-title]')).toContainText(projectName);

  // 限度写在脸上，而不是只写在代码注释里
  await expect(game.locator('[data-game-note]').first()).toContainText('位置是投影');
  await expect(game.locator('[data-game-provenance]')).toContainText('兜底');
  await expect(game.locator('[data-game-quest="judgeable"]')).toHaveCount(1);
  await expect(game.locator('[data-game-quest="judgeable"]').first()).toContainText('打倒');
  await expect(game.locator('[data-game-quest="judgeable"]').first()).toContainText('拾取');
  await expect(game.locator('[data-game-status]')).toHaveText('进行中');
  await expect(game.locator('[data-game-health]')).toHaveAttribute('data-game-health', '20');
  await game.screenshot({ path: 'screenshots/game-play-start.png' });

  // 往右走：路上先踩过物品，再和敌人接触；空格挥击（按住 200ms，别把一次按键丢在帧之间）
  await game.keyboard.down('ArrowRight');
  for (let i = 0; i < 6; i += 1) {
    await game.keyboard.press(' ', { delay: 250 });
    await game.waitForTimeout(300);
  }
  await game.keyboard.up('ArrowRight');
  await expect(game.locator('[data-game-status]')).toHaveText('通关', { timeout: 20_000 });
  await expect(game.locator('[data-game-outcome]')).toContainText('任务全部完成');
  await expect(game.locator('[data-game-items]')).toHaveAttribute('data-game-items', '1');
  await expect(game.locator('[data-game-enemies]')).toHaveAttribute('data-game-enemies', '0');
  // 打死了敌人这件事要能追到具体事件，而不是只看到一个数字变了
  await expect(game.locator('[data-game-event]').first()).toContainText('完成任务');
  await game.screenshot({ path: 'screenshots/game-play-won.png' });

  // §53：不靠人玩也能问出结果——四种走法各跑一遍，报告要读得出来
  await game.click('[data-playtest-run]');
  await expect(game.locator('[data-playtest-run-row="beeline"]')).toBeVisible({ timeout: 30_000 });
  await expect(game.locator('[data-playtest-run-row="beeline"] [data-playtest-status]')).toHaveText('通关');
  await expect(game.locator('[data-playtest-run-row="idle"] [data-playtest-status]')).toHaveText('跑到时间上限');
  await expect(game.locator('[data-playtest-finding]').first()).toContainText('种走法里有');
  await expect(game.locator('[data-playtest-limits]')).toContainText('不是穷举');
  await game.screenshot({ path: 'screenshots/game-playtest-report.png' });

  // 重新开始：回到初始状态，读数是设计里那两个数而不是上一次跑完的残留
  await game.click('[data-game-restart]');
  await expect(game.locator('[data-game-status]')).toHaveText('进行中');
  await expect(game.locator('[data-game-health]')).toHaveAttribute('data-game-health', '20');
  await expect(game.locator('[data-game-enemies]')).toHaveAttribute('data-game-enemies', '1');
  await expect(game.locator('[data-game-summary]')).toContainText('敌人剩 1/1');

  // 改一个设计里的数，试玩这一页跟着变（同一份真值的两面）
  await addStat(enemyId, 'health', '999');
  await expect(page.locator('[data-game-state]')).toHaveText('已保存', { timeout: 20_000 });
  await game.reload();
  await expect(game.locator('[data-game-root]')).toBeVisible({ timeout: 60_000 });
  await game.keyboard.down('ArrowRight');
  await game.keyboard.press(' ', { delay: 400 });
  await game.waitForTimeout(1_500);
  await game.keyboard.up('ArrowRight');
  await expect(game.locator('[data-game-enemies]')).toHaveAttribute('data-game-enemies', '1');
  await expect(game.locator('[data-game-status]')).not.toHaveText('通关');

  await game.close();
});

test('@smoke §50 公开可玩：分享出去的链接玩的是发布那一刻钉住的那一版', async ({ page }) => {
  // ADR-0009 的浏览器版：作者改工作稿不重新发布，公开那一份必须一动不动。
  // 这条只在"发布之后又改了"这个时刻才分得清对错，所以整条按那个顺序走
  test.setTimeout(420_000);
  const stamp = Date.now().toString(36);
  const projectId = await createProject(page, `公开关卡 ${stamp}`);

  await page.click('[data-panel-tab="game"]');
  await expect(page.locator('[data-game-empty]')).toBeVisible({ timeout: 40_000 });
  await page.click('[data-game-create]');
  await expect(page.locator('[data-game-entity]')).toHaveCount(11);
  const entityId = (group: string) =>
    page.locator(`[data-game-group="${group}"] [data-game-entity]`).first().getAttribute('data-game-entity');
  const playerId = (await entityId('player'))!;
  const enemyId = (await entityId('enemy'))!;
  const addStat = async (id: string, key: string, value: string): Promise<void> => {
    await page.fill(`[data-game-stat-key="${id}"]`, key);
    await page.fill(`[data-game-stat-value="${id}"]`, value);
    await page.click(`[data-game-stat-add="${id}"]`);
    await expect(page.locator(`[data-game-stat="${id}:${key}"]`)).toHaveValue(value);
  };
  await addStat(playerId, 'attackPower', '10');
  await addStat(playerId, 'health', '30');
  await addStat(enemyId, 'health', '10');
  await addStat(enemyId, 'damage', '0');
  // 敌人会走过来：公开页这一条要的是"能打死"，把位置交给追击而不是靠按键卡在接触的那两帧上
  await addStat(enemyId, 'speed', '60');
  await addStat(enemyId, 'detectionRange', '900');
  await expect(page.locator('[data-game-state]')).toHaveText('已保存', { timeout: 20_000 });

  await page.click('[data-publish-open]');
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 60_000 });
  const publishedHref = new URL((await page.locator('[data-publish-url]').getAttribute('href'))!, page.url()).href;

  // 作品页上有入口，且说清玩的是钉住的那一版
  await page.goto(publishedHref);
  await expect(page.locator('[data-published-frame]')).toBeVisible({ timeout: 30_000 });
  const playLink = page.locator('[data-published-play] a');
  await expect(playLink).toHaveAttribute('href', new RegExp(`/play$`));
  await page.screenshot({ path: 'screenshots/published-play-entry.png' });

  // 一个没登录过的访客真的能玩通
  const browser = page.context().browser();
  if (!browser) throw new Error('这条用例需要一个可派生上下文的浏览器');
  const visitorCtx = await browser.newContext();
  const visitor = await visitorCtx.newPage();
  await visitor.goto(`${publishedHref}/play`);
  await expect(visitor.locator('[data-play="live"]')).toBeVisible({ timeout: 60_000 });
  await expect(visitor.locator('[data-play-pinned]')).toContainText('第 1 版');
  for (let i = 0; i < 10; i += 1) {
    await visitor.keyboard.press(' ', { delay: 250 });
    await visitor.waitForTimeout(250);
  }
  await expect(visitor.locator('[data-game-enemies]')).toHaveAttribute('data-game-enemies', '0', { timeout: 20_000 });
  await expect(visitor.locator('[data-game-event]').first()).toContainText('打倒');
  await visitor.screenshot({ path: 'screenshots/public-play-won.png' });

  // 作者把敌人调到 999，但**不重新发布**：访客刷新后玩的还是第 1 版，照样能打通
  await page.goto(`/studio/${projectId}`);
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await page.click('[data-panel-tab="game"]');
  await expect(page.locator(`[data-game-stat="${enemyId}:health"]`)).toHaveValue('10');
  await addStat(enemyId, 'health', '999');
  await expect(page.locator('[data-game-state]')).toHaveText('已保存', { timeout: 20_000 });
  await visitor.goto(`${publishedHref}/play`);
  await expect(visitor.locator('[data-play-pinned]')).toContainText('第 1 版');
  for (let i = 0; i < 12; i += 1) {
    await visitor.keyboard.press(' ', { delay: 250 });
    await visitor.waitForTimeout(250);
  }
  await expect(visitor.locator('[data-game-enemies]')).toHaveAttribute('data-game-enemies', '0', { timeout: 20_000 });

  // 重新发布才换：同一套按键打不动 999 血的敌人了（作者此刻已经在 Studio 里）
  await page.click('[data-publish-open]');
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  // 发布是异步的：等顶栏那枚徽章真的变成 v2 再去刷新访客那一页。
  // 早一步 goto 拿到的是 v1，而 DOM 轮询等不来一次没有重新加载的页面——这条我自己踩过
  await expect(page.getByText('已发布 v2')).toBeVisible({ timeout: 120_000 });
  await visitor.goto(`${publishedHref}/play`);
  await expect(visitor.locator('[data-play-pinned]')).toContainText('第 2 版', { timeout: 30_000 });
  for (let i = 0; i < 12; i += 1) {
    await visitor.keyboard.press(' ', { delay: 250 });
    await visitor.waitForTimeout(250);
  }
  await visitor.waitForTimeout(1_500);
  await expect(visitor.locator('[data-game-enemies]')).toHaveAttribute('data-game-enemies', '1');
  await expect(visitor.locator('[data-game-status]')).not.toHaveText('通关');

  await visitorCtx.close();
});

test('@smoke §163 实时通道：别人刚做完的那件事，作者这一端不用刷新就亮', async ({ page }) => {
  // 这条用例的唯一卖点是"没有 reload"：所以下面每一次断言都停在同一个 page 上等，
  // 而不是 goto 一次再去看——goto 之后的数是服务端渲染出来的，那就退回 §164 的老路了
  test.setTimeout(300_000);
  const projectId = await createProject(page, `实时作品${Date.now().toString(36)}`);

  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-submit]')).toBeVisible();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 60_000 });
  const path = (await page.locator('[data-publish-url]').getAttribute('href'))!;

  // 作者停在首页。铃铛先读到 1 条（发布那条），确认读到数之后才开实时连接
  await page.goto('/');
  await expect(page.locator('[data-notification-bell="ready"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-notification-unread]')).toHaveAttribute('data-notification-unread', '1');
  await expect(page.locator('[data-realtime="open"]')).toBeVisible({ timeout: 30_000 });

  // 收件箱接口的请求次数：挂载时读一次，实时事件到了再读一次。
  // 数请求而不是数"有没有轮询定时器"——轮询也会让数变对，但请求条数会一路涨
  let summaryCalls = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/api/notifications?limit=1')) summaryCalls += 1;
  });
  const baseline = summaryCalls;

  const browser = page.context().browser();
  if (!browser) throw new Error('这条用例需要一个可派生上下文的浏览器');
  const visitorCtx = await browser.newContext();
  const visitor = await visitorCtx.newPage();
  await visitor.goto(new URL(path, page.url()).href);
  await visitor.waitForSelector('[data-published-frame] [data-node-id]', { timeout: 30_000 });

  await visitor.click('[data-action-like]');
  await expect(visitor.locator('[data-action-like]')).toHaveAttribute('data-action-like', 'on', { timeout: 30_000 });

  // 未读从 1 变 2，全程作者这一页没有 reload
  await expect(page.locator('[data-notification-unread]')).toHaveAttribute('data-notification-unread', '2', {
    timeout: 30_000,
  });
  const afterPush = summaryCalls;
  // 这一次读数换回来只多了一条请求：实时推一次、客户端查一次，而不是反复查
  expect(afterPush).toBe(baseline + 1);
  await page.waitForTimeout(4_000);
  // 之后就静住了——真有轮询的话这里一定涨
  expect(summaryCalls).toBe(afterPush);
  await page.screenshot({ path: 'screenshots/realtime-bell.png' });

  // 这条连接是别人的项目：拿访客身份订作者的项目频道，一律 404（与其它入口同一口径）
  const stranger = await visitorCtx.request.get(new URL(`/api/realtime?projectId=${projectId}`, page.url()).href);
  expect(stranger.status()).toBe(404);

  // Studio 的项目频道：跑一次真 AI 请求，开始与结束各推一条进度
  await page.goto(`/studio/${projectId}`);
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-realtime="open"]')).toBeVisible({ timeout: 30_000 });
  await page.fill('[data-ai-input]', 'Make the hero 30% taller.');
  await page.click('[data-ai-submit]');
  // 进度行来自事件流本身，不是 HTTP 响应：等到它就等于证明了这条通道在推真事件
  await expect(page.locator('[data-generation-progress]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('[data-generation-progress]')).toContainText('任务');
  await expect(page.locator('[data-generation-progress]')).toContainText('完成', { timeout: 30_000 });
  await expect(page.locator('[data-realtime]').first()).toContainText('已收到');
  await page.screenshot({ path: 'screenshots/realtime-studio.png' });

  // 失败也要推：一条 Mock 没实现的指令，界面上那句"正在生成"得自己停下来，
  // 而不是跟着 HTTP 200 一起显示"完成"（带 error 的 200 记的是失败终态）
  await page.fill('[data-ai-input]', '把主视觉调暗一点');
  await page.click('[data-ai-submit]');
  await expect(page.locator('[data-ai-error]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('[data-generation-progress]')).toContainText('失败：provider-unavailable', { timeout: 30_000 });
  await page.screenshot({ path: 'screenshots/realtime-studio-failed.png' });

  // 通道只读：写请求一律挡掉（别让人把它当 RPC 端点）
  const post = await page.request.post(new URL('/api/realtime', page.url()).href);
  expect(post.status()).toBe(405);

  await visitorCtx.close();
});

test('@smoke §74 删除项目：确认词打不动接口，删掉的公开页与互动一起关门', async ({ page }) => {
  // 这条用例的卖点是"审批真的在服务端"，所以关键一步是绕过界面直接打接口：
  // 只测界面上的确认卡片，测到的是一个恰好长得像审批门的输入框
  test.setTimeout(300_000);
  const projectName = `删除审批${Date.now().toString(36)}`;
  const projectId = await createProject(page, projectName);

  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-submit]')).toBeVisible();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 60_000 });
  const publishedHref = (await page.locator('[data-publish-url]').getAttribute('href'))!;
  // 存进库的 path 里是中文原样，而 URL 的 pathname 会把它百分号编码——
  // 不 decode 回来，这条请求打到接口上就是"没有这个作品"（界面上的按钮不会犯这个错：
  // 它发的是服务端给的 state.path，只有测试是自己拼 path）
  const path = decodeURIComponent(new URL(publishedHref, page.url()).pathname);
  const apiUrl = new URL(`/api/projects/${projectId}`, page.url()).href;

  // 一个真·路人：陌生 context（新的 guest 身份），公开页此刻对他开着
  const browser = page.context().browser();
  if (!browser) throw new Error('这条用例需要一个可派生上下文的浏览器');
  const visitorCtx = await browser.newContext();
  const visitor = await visitorCtx.newPage();
  const openPage = await visitor.goto(publishedHref);
  expect(openPage?.status()).toBe(200);
  await visitor.waitForSelector('[data-published-frame] [data-node-id]', { timeout: 30_000 });

  // 路人的点赞：删除之前收（200），删除之后同一个接口必须换答案。
  // 公开页挡了页面，互动接口是另一条链——§74 之前那条链没挡 deletedAt
  const csrf = (await visitorCtx.cookies()).find((c) => c.name === 'nexus_csrf')?.value ?? '';
  const interactUrl = new URL('/api/published/interact', page.url()).href;
  const likeBefore = await visitorCtx.request.post(interactUrl, {
    data: { path, action: 'like' },
    headers: { 'x-csrf-token': csrf },
  });
  expect(likeBefore.status()).toBe(200);

  await page.goto('/');
  await expect(page.locator(`[data-project-row="${projectId}"]`)).toBeVisible({ timeout: 30_000 });

  // ① 绕过界面：没有 CSRF 头的删除先挡掉（这条链和别的写链同一个口径）
  const noCsrf = await page.request.delete(apiUrl, { data: { confirm: projectName } });
  expect(noCsrf.status()).toBe(403);

  // ② 绕过界面：带齐 CSRF 与身份，但确认词打错——400，而且库里没动
  const wrongCsrf = (await page.context().cookies()).find((c) => c.name === 'nexus_csrf')?.value ?? '';
  const wrongWord = await page.request.delete(apiUrl, {
    data: { confirm: `${projectName} 的隔壁` },
    headers: { 'x-csrf-token': wrongCsrf },
  });
  expect(wrongWord.status()).toBe(400);
  expect(((await wrongWord.json()) as { error?: string }).error).toBe('approval_required');
  await expect(page.locator(`[data-project-row="${projectId}"]`)).toBeVisible();

  // ③ 界面上同样打错一次：拒绝要在卡片里看得见，而不是按钮点不动
  await page.click(`[data-project-delete="${projectId}"]`);
  await expect(page.locator(`[data-project-delete-card="${projectId}"]`)).toBeVisible();
  await expect(page.locator(`[data-project-delete-expected="${projectId}"]`)).toHaveText(projectName);
  await page.fill(`[data-project-delete-input="${projectId}"]`, '名字好像打错了');
  await page.click(`[data-project-delete-confirm="${projectId}"]`);
  await expect(page.locator(`[data-project-delete-notice="${projectId}"]`)).toContainText('不一致', { timeout: 30_000 });
  await expect(page.locator(`[data-project-row="${projectId}"]`)).toBeVisible();
  await page.screenshot({ path: 'screenshots/project-delete-refused.png' });

  // ④ 逐字打对：这一行从列表里走，进回收站（列表的变化来自服务端重新读，不是本地藏起来）
  await page.fill(`[data-project-delete-input="${projectId}"]`, projectName);
  await page.click(`[data-project-delete-confirm="${projectId}"]`);
  await expect(page.locator(`[data-project-row="${projectId}"]`)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator(`[data-deleted-row="${projectId}"]`)).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'screenshots/project-trash.png' });

  // ⑤ 对路人：公开页 404，Studio 也是 404，点赞接口一起关门
  const gonePage = await visitor.goto(publishedHref);
  expect(gonePage?.status()).toBe(404);
  const likeAfter = await visitorCtx.request.post(interactUrl, {
    data: { path, action: 'like' },
    headers: { 'x-csrf-token': csrf },
  });
  expect(likeAfter.status()).toBe(404);
  const studioGone = await page.goto(`/studio/${projectId}`);
  expect(studioGone?.status()).toBe(404);

  // ⑥ 回收站那一侧：恢复之后同一批答案全部翻回来——
  // 这一步证明"软"不是注释里的承诺：公开页吃的是删之前钉住的那一版快照
  await page.goto('/');
  await expect(page.locator(`[data-restore-project="${projectId}"]`)).toBeVisible({ timeout: 30_000 });
  await page.click(`[data-restore-project="${projectId}"]`);
  await expect(page.locator(`[data-deleted-row="${projectId}"]`)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator(`[data-project-row="${projectId}"]`)).toBeVisible({ timeout: 30_000 });

  const backPage = await visitor.goto(publishedHref);
  expect(backPage?.status()).toBe(200);
  await visitor.waitForSelector('[data-published-frame] [data-node-id]', { timeout: 30_000 });
  await page.screenshot({ path: 'screenshots/project-restored.png' });

  await visitorCtx.close();
});

test('@smoke §74 AI 的删除结果先过人工审批：扣住时画布不动，批准交回的是看过的那一版', async ({ page }) => {
  // 这条用例的关键一步是绕过界面直接打接口：只点卡片的话，测到的是一个恰好长得像审批门的输入框。
  // §74 要的是"补丁在批准之前进不了工作区"，所以每一档都用画布上的节点数说话。
  // 300 秒：这条要跑两次 AI 生成、四次页面载入和三次裁决请求，开发模式下单次请求实测 8~9 秒，
  // 180 秒会在最后一步之前就把整条用例掐断（报的是 timeout，不是哪一句断言）。
  test.setTimeout(300_000);
  const projectId = await createProject(page, `审批门${Date.now().toString(36)}`);
  const nodeCount = (): Promise<number> => page.evaluate(() => document.querySelectorAll('[data-node-id]').length);
  const before = await nodeCount();
  const csrf = (await page.context().cookies()).find((c) => c.name === 'nexus_csrf')?.value ?? '';

  // ① 绕过界面：请求方自己把 approvalPolicy 填成空数组——这一栏不由请求方定义（§74/§68）
  const runUrl = new URL('/api/ai/run', page.url()).href;
  const bypass = await page.request.post(runUrl, {
    data: {
      requestId: `req_bypass_${Date.now().toString(36)}`,
      intent: 'design-edit',
      prompt: '删除 Hero 区块',
      modelClass: 'balanced',
      variants: 1,
      approvalPolicy: [],
      context: { projectId, selection: [] },
    },
    headers: { 'x-csrf-token': csrf, 'content-type': 'application/json' },
  });
  expect(bypass.status()).toBe(200);
  const heldBody = (await bypass.json()) as {
    patches: unknown[];
    approvals: { action: string; reason: string }[];
    error?: { code?: string };
  };
  expect(heldBody.patches).toEqual([]);
  expect(heldBody.approvals.length).toBeGreaterThan(0);
  expect(heldBody.error?.code).toBe('approval-required');
  const bypassTaskId = bypass.headers()['x-nexus-task'] ?? '';
  expect(bypassTaskId).toMatch(/^[0-9a-f-]{36}$/);

  // 读侧只给"要决定什么"，不给能落地的正文：被扣下的补丁不在这里
  const peek = await page.request.get(new URL(`/api/ai/tasks/${bypassTaskId}/approval`, page.url()).href);
  expect(peek.status()).toBe(200);
  const peekText = await peek.text();
  expect(peekText).toContain('awaiting_approval');
  expect(peekText).not.toContain('"ops"');
  expect(peekText).not.toContain('"held"');

  // ② 刷新之后卡片还在：审批现场来自账本，不是 React 状态里的一次性记忆
  await page.goto(`/studio/${projectId}`);
  await waitForCanvas(page);
  await expect(page.locator('[data-approval-card]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-approval-title]')).toContainText('画布还没有被改动');
  await expect(page.locator('[data-approval-reason]').first()).toContainText('Hero');
  expect(await nodeCount()).toBe(before);
  // 任务页那一侧同一件事：这一行现在是"等审批"，不是"完成"也不是"在跑"
  await page.goto(`/tasks/${projectId}`);
  await expect(page.locator('[data-tasks-root]')).toContainText('等审批', { timeout: 30_000 });

  // ③ 放弃：什么都不动，而且等待态就此结束（刷新不会再冒回来）
  await page.goto(`/studio/${projectId}`);
  await waitForCanvas(page);
  await expect(page.locator('[data-approval-card]')).toBeVisible({ timeout: 30_000 });
  await page.click('[data-approval-reject]');
  // 30 秒不是给竞态留的余量：开发模式下这条路由的首个 POST 实测要 8~9 秒（按需编译 + 建连接），
  // 默认 5 秒的断言会稳定误报"按钮没反应"。见 docs/BUGS.md 里那条 dev 延迟。
  await expect(page.locator('[data-approval-note]')).toContainText('删除也没有发生', { timeout: 30_000 });
  expect(await nodeCount()).toBe(before);
  await page.reload();
  await waitForCanvas(page);
  await expect(page.locator('[data-approval-card]')).toHaveCount(0);
  // 同一任务再决定一次：服务端不给第二次机会（第一次就是终态）
  const twice = await page.request.post(new URL(`/api/ai/tasks/${bypassTaskId}/approval`, page.url()).href, {
    data: { decision: 'approve' },
    headers: { 'x-csrf-token': csrf, 'content-type': 'application/json' },
  });
  expect(twice.status()).toBe(409);
  expect(((await twice.json()) as { message?: string }).message ?? '').toContain('第一次决定算数');

  // ④ 走界面那一路：批准之后补丁才落地，而且是一次可整体撤销的事务
  await page.fill('[data-ai-input]', '删除 Hero 区块');
  await page.click('[data-ai-submit]');
  await expect(page.locator('[data-approval-card]')).toBeVisible({ timeout: 30_000 });
  expect(await nodeCount()).toBe(before);
  // 同一屏不许出现两句话："画布还没有被改动"与 provider 活动流里那句"1 个 op 已落地"。
  // 门改的是说法而不是事实：被扣下的补丁仍然原样存在任务行里，界面上那句"已落地"换成了"批准之前不会落地"
  await expect(page.locator('main')).toContainText('批准之前不会落地');
  await expect(page.locator('main')).not.toContainText('已落地');
  await page.screenshot({ path: 'screenshots/ai-approval-held.png' });
  await page.click('[data-approval-approve]');
  await expect(page.locator('[data-approval-note]')).toContainText('交回编辑区', { timeout: 30_000 });
  await expect
    .poll(nodeCount, { timeout: 20_000 })
    .toBeLessThan(before);
  const afterDelete = await nodeCount();
  await page.screenshot({ path: 'screenshots/ai-approval-applied.png' });

  // 撤销与一次普通生成同形：一次 Ctrl+Z 回到 AI 动手之前（§149/§150）
  await page.getByTitle('撤销（Ctrl+Z）').click();
  await expect.poll(nodeCount, { timeout: 20_000 }).toBe(before);
  expect(afterDelete).toBeLessThan(before);
});

test('@smoke §162 异步作业入口：DEMO MODE 下拒收就是拒收，不替它演一个"在跑的作业"', async ({ page }) => {
  // 这一条要跑两次 AI 提交（一次被 409 拒掉、一次走完同步那一路的审批），开发模式下单次请求实测 8~9 秒。
  // 它证明的是两件事：① 没有真 provider 时异步这条路明确拒，而且拒了之后界面上不留下任何"已经交给队列"的痕迹；
  // ② 多出来的这个入口没有开出第二条绕过 §74 的路——同一句话换个入口，照样要过同一道门。
  test.setTimeout(240_000);
  // createProject 已经把这个项目打开在工作台里，这一条不需要它的 id：所有断言都在界面上
  await createProject(page, `异步入口${Date.now().toString(36)}`);
  const nodeCount = (): Promise<number> => page.evaluate(() => document.querySelectorAll('[data-node-id]').length);
  const before = await nodeCount();

  await page.check('[data-ai-async]');
  await page.fill('[data-ai-input]', '删除 Hero 区块');
  await page.click('[data-ai-submit]');
  await expect(page.locator('[data-ai-error]')).toContainText('异步作业要有一个接上真 provider 的 AI Service', { timeout: 60_000 });
  // 409 就是没提交：那一句拒收的话原样报出来，而"已交给队列 · 作业 job-…"一行不许出现
  await expect(page.locator('[data-async-status]')).toHaveCount(0);
  await expect(page.locator('[data-approval-card]')).toHaveCount(0);
  expect(await nodeCount()).toBe(before);
  await page.screenshot({ path: 'screenshots/ai-async-refused.png' });

  // 反向对照：取消勾选，同一句话走同步那一路——门还在，卡片还在，画布还是没动
  await page.uncheck('[data-ai-async]');
  await page.click('[data-ai-submit]');
  await expect(page.locator('[data-approval-card]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-approval-title]')).toContainText('画布还没有被改动');
  expect(await nodeCount()).toBe(before);
  await page.click('[data-approval-reject]');
  await expect(page.locator('[data-approval-note]')).toContainText('删除也没有发生', { timeout: 30_000 });
  expect(await nodeCount()).toBe(before);
});
