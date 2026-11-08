import { expect, test, type Page } from '@playwright/test';
import { createProjectNamed } from './support/auth-session';

/**
 * §47 的「跟角色说话」在真浏览器里点一遍。
 *
 * e2e 环境没有真 provider，所以这一条看到的是 §159 在界面上的样子：
 * 用户的话原样进对话记录；回复一个字都没有，有的是 DEMO MODE 409 的原话——
 * 不编一句"角色风"的模板话冒充它开口。反向：角色那边的气泡数必须是 0。
 */

async function openStudio(page: Page, name: string): Promise<void> {
  await createProjectNamed(page, name);
}

test('@smoke 角色对话：DEMO MODE 下诚实地说"需要真 provider"，不编一句假回复', async ({ page }) => {
  test.setTimeout(120_000);
  await openStudio(page, `角色对话 ${Date.now().toString(36)}`);

  await page.click('[data-panel-tab="characters"]');
  await expect(page.locator('[data-character-panel]')).toBeVisible();

  await page.fill('[data-character-new-name]', '守夜人');
  await page.click('[data-character-create]');
  const editor = page.locator('[data-character-editor]');
  await expect(editor).toBeVisible({ timeout: 20_000 });

  const chatSection = page.locator('[data-character-chat]');
  await expect(chatSection).toBeVisible();
  await expect(chatSection.locator('[data-character-chat-msg]')).toHaveCount(0);

  await page.fill('[data-character-chat-input]', '今晚的山口安静吗？');
  await page.click('[data-character-chat-send]');

  // 用户那句话立刻进对话记录——请求发出去之前就先认下是自己说的
  await expect(page.locator('[data-character-chat-msg="user"]').last()).toContainText('今晚的山口安静吗', {
    timeout: 10_000,
  });

  // DEMO MODE：没有回复，只有一句为什么没有（服务端 409 的原话）
  await expect(page.locator('[data-character-chat-error]')).toContainText('DEMO MODE', { timeout: 30_000 });
  await expect(page.locator('[data-character-chat-msg="character"]')).toHaveCount(0);

  // 输入框回来了，还能继续说（错误不是死局）
  await expect(page.locator('[data-character-chat-input]')).toBeEnabled();
  await page.screenshot({ path: 'screenshots/character-chat-demo.png' });
});
