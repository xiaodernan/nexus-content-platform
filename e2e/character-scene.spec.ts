import { expect, test, type Page } from '@playwright/test';

/**
 * §39 / §40 的 Character → Scene 在真浏览器里点一遍。
 *
 * 服务端那一格已经证明"同一角色的不同场景共享色相锚点"（集成用例），这一条要看到的是用户那一半：
 * 角色面板上填了视觉标识 → 生成它在另一个场景里 → 图进的是**同一份资产清单**（§16），
 * 卡片带着 DEMO 角标（§160），回执上写着它是**这个角色的场景**而不是随便一张图。
 * 反面也要看到：palette 还没填时那个按钮不可点——不让人点出一张与角色无关的图冒充它的场景。
 */

async function openStudio(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.fill('[data-project-name-input]', name);
  await page.click('[data-create-project]');
  await page.waitForURL(/\/studio\/[^/]+$/);
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
}

test('@smoke 角色 → 场景：填了视觉标识才点得动，生成物进同一份清单并带 DEMO 角标', async ({ page }) => {
  test.setTimeout(180_000);
  await openStudio(page, `角色场景 ${Date.now().toString(36)}`);

  await page.click('[data-panel-tab="characters"]');
  await expect(page.locator('[data-character-panel]')).toBeVisible();

  await page.fill('[data-character-new-name]', '阿蓝');
  await page.click('[data-character-create]');
  const editor = page.locator('[data-character-editor]');
  await expect(editor).toBeVisible({ timeout: 20_000 });

  // 视觉标识是空的：两个按钮都必须不可点（服务端同一口径会拒绝，界面不给人点了才报错）
  await expect(page.locator('[data-character-scene]')).toBeDisabled();
  await expect(page.locator('[data-character-portrait]')).toBeDisabled();

  // 下一步实验（ROADMAP 里写死的那条）：建完角色后**显式点一次角色标签页**，
  // 那里才有 setDraft(character.profile)；不点就是赌 create() 里那次 setSelectedId 已经把草稿带上
  await page.locator('[data-character-tab]').first().click();
  await page.fill('[data-character-visual="palette"]', '#2e7d32 #b3e5fc');
  await page.click('[data-character-save]');
  // 肖像只读档案、不读场景输入框：色板一存它就该活，而此时场景那一栏还是空的。
  // 这一对断言钉的是"由档案驱动"在界面上真的成立，不是顺手多写的两行
  await expect(page.locator('[data-character-portrait]')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('[data-character-scene]')).toBeDisabled();
  // 保存已经点下去了：这时"保存档案"必然变成 disabled（saving）。要等的是**下一次能点**的那个东西——
  // 生成场景按钮，它的可用条件是**已存档**的色板。
  // 场景那一栏还空着时它本来就该不可点——先给它一句话，再断言按钮活了
  await page.fill('[data-scene-prompt]', '在雪地里');
  await expect(page.locator('[data-character-scene]')).toBeEnabled({ timeout: 30_000 });

  await page.click('[data-character-scene]');

  // 回执：说的是"这个角色的场景"，不是一句含糊的"生成成功"
  await expect(page.locator('[data-character-notice]')).toContainText('那个角色的一个场景', {
    timeout: 40_000,
  });

  // 图进了同一份资产清单：切到资产库，最后一张卡片带 DEMO 角标且缩略图解得码
  await page.click('[data-panel-tab="assets"]');
  const card = page.locator('[data-asset-card]').last();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator('[data-asset-demo-badge]')).toHaveText('DEMO');
  // 库里那一列（assets.character_id）现在读得进清单、也画得进卡片：
  // 只写不读的真值在界面上等于不存在，这一条是那一半的浏览器凭证
  await expect(card.locator('[data-asset-character]')).toHaveText('角色场景');
  await expect
    .poll(async () => card.locator('img').evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 20_000 })
    .toBeGreaterThan(0);
  await page.screenshot({ path: 'screenshots/character-scene.png' });

  // 第二档：为这个角色生成**它自己的参考图**（肖像）。清单里它是同一条链上的又一张，
  // 但回执必须说"那是那个角色自己的参考图"而不是"一个场景"——把肖像说成场景，就是给用户一个与事实不符的交代
  const cardsBeforePortrait = await page.locator('[data-asset-card]').count();
  await page.click('[data-panel-tab="characters"]');
  // 切走再切回来，面板是重新挂载的：编辑器不会自己回到"选中那个角色"，得再点一次角色标签
  // （上面生成场景之前那一步是同一条规矩，这里不是重复劳动，是同一个 remount 行为的第二次命中）
  await page.locator('[data-character-tab]').first().click();
  await page.click('[data-character-portrait]');
  await expect(page.locator('[data-character-notice]')).toContainText('那个角色自己的参考图', {
    timeout: 40_000,
  });
  await page.click('[data-panel-tab="assets"]');
  await expect
    .poll(async () => page.locator('[data-asset-card]').count(), { timeout: 30_000 })
    .toBe(cardsBeforePortrait + 1);
  const portrait = page.locator('[data-asset-card]').last();
  await expect(portrait.locator('[data-asset-demo-badge]')).toHaveText('DEMO');
  // 卡片自己也要说清这是肖像不是场景：这一格真值走的是清单投影（AssetRef.characterPortrait）
  await expect(portrait.locator('[data-asset-character]')).toHaveText('角色肖像');
  await expect(page.locator('[data-asset-card]').first().locator('[data-asset-character]')).toHaveText('角色场景');
  await expect
    .poll(
      async () => portrait.locator('img').evaluate((el) => (el as HTMLImageElement).naturalWidth),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  await page.screenshot({ path: 'screenshots/character-portrait.png' });
});
