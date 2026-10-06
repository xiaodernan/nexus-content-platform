import { expect, test, type Page } from '@playwright/test';

/**
 * §140 的 talk 在真浏览器里点一遍：3D 世界的 HUD 上「跟角色说话」展开的是
 * §46 角色档案的对话（与角色面板共用 CharacterChat），DEMO 环境下服务端 409
 * 的原话亮在面板里——不编一句假的。世界条目不是对话目标，这条边界写在 HUD 文案里。
 */

async function createProject(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.fill('[data-project-name-input]', name);
  await page.click('[data-create-project]');
  await page.waitForURL(/\/studio\/[^/]+$/);
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  return page.url().split('/').pop()!;
}

test('@smoke 世界 talk：HUD 上跟 §46 角色档案说话，DEMO 下诚实 409', async ({ page }) => {
  test.setTimeout(180_000);
  const projectId = await createProject(page, `世界对话 ${Date.now().toString(36)}`);

  // 先有角色档案：对话跟的是档案，没有档案时界面要明说
  await page.click('[data-panel-tab="characters"]');
  await page.fill('[data-character-new-name]', '守夜人');
  await page.click('[data-character-create]');
  await expect(page.locator('[data-character-editor]')).toBeVisible({ timeout: 20_000 });

  // 再有世界：建骨架（九类各一条），世界页才有场景可走
  await page.click('[data-panel-tab="world"]');
  await page.click('[data-world-create]');
  await expect(page.locator('[data-world-group="lore"]')).toBeVisible({ timeout: 20_000 });

  await page.goto(`/world/${projectId}`);
  const live = page.locator('[data-world3d="live"]');
  const unavailable = page.locator('[data-world3d="unavailable"]');
  await expect(live.or(unavailable)).toBeVisible({ timeout: 60_000 });

  // WebGL 起不来时页面明说进不去——那一格的诚实路径不是本条的断言范围
  test.skip(await unavailable.isVisible(), '这台设备的 headless Chrome 给不出 WebGL 上下文');

  await page.click('[data-world-talk-toggle]');
  const talk = page.locator('[data-world-talk]');
  await expect(talk).toBeVisible();

  // 名册来自 §46：下拉里是"守夜人"，不是世界骨架里那些同名的角色类条目
  await expect(page.locator('[data-world-talk-target]')).toContainText('守夜人');

  await page.fill('[data-character-chat-input]', '今晚的山口安静吗？');
  await page.click('[data-character-chat-send]');
  await expect(page.locator('[data-character-chat-msg="user"]').last()).toContainText('今晚的山口安静吗', {
    timeout: 10_000,
  });
  await expect(page.locator('[data-character-chat-error]')).toContainText('DEMO MODE', { timeout: 30_000 });
  await expect(page.locator('[data-character-chat-msg="character"]')).toHaveCount(0);
  await page.screenshot({ path: 'screenshots/world-talk-demo.png' });
});
