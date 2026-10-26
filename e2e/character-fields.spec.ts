import { expect, test, type Page } from '@playwright/test';

/**
 * §39 / §46：角色面板里所有"列表型"字段（目标 / 恐惧 / 口头禅 / 母题 / 色板 / 特征）
 * 都要能**逐键输入**。这条测试守的是一个真实回归：输入框原先每次按键都把数组 join 回去，
 * 刚敲下的逗号 / 换行 / 空格会被过滤掉，第二个条目永远开不了头（`目标A目标B`）。
 * 断言两层：敲完立刻还在；保存 + 重载后仍从服务端读回同一份。
 */

async function openStudio(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.fill('[data-project-name-input]', name);
  await page.click('[data-create-project]');
  await page.waitForURL(/\/studio\/[^/]+$/);
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
}

test('@smoke 角色列表字段：逐键输入的换行/逗号/空格不被吃掉，保存后重载仍在', async ({ page }) => {
  test.setTimeout(120_000);
  await openStudio(page, `角色字段 ${Date.now().toString(36)}`);
  const projectId = new URL(page.url()).pathname.split('/').pop()!;

  await page.click('[data-panel-tab="characters"]');
  await expect(page.locator('[data-character-panel]')).toBeVisible();
  await page.fill('[data-character-new-name]', '阿蓝');
  await page.click('[data-character-create]');
  await page.locator('[data-character-tab]').first().click();
  await expect(page.locator('[data-character-editor]')).toBeVisible({ timeout: 20_000 });

  const goals = page.locator('[data-character-list="goals"]');
  await goals.click();
  await goals.pressSequentially('目标A');
  await goals.press('Enter');
  await goals.pressSequentially('目标B');

  const motifs = page.locator('[data-character-visual="motifs"]');
  await motifs.click();
  await motifs.pressSequentially('母题A');
  await motifs.press(',');
  await motifs.pressSequentially(' 母题B');

  const traits = page.locator('[data-character-field="traits"]');
  await traits.click();
  await traits.pressSequentially('怕水');
  await traits.press(',');
  await traits.pressSequentially(' 话多');

  const palette = page.locator('[data-character-visual="palette"]');
  await palette.click();
  await palette.pressSequentially('#2e7d32');
  await palette.press(' ');
  await palette.pressSequentially('#b3e5fc');

  // 敲完立刻还在：这一层就是回归见证（旧代码这里是 `目标A目标B` / `母题A母题B`）
  await expect(goals).toHaveValue('目标A\n目标B');
  await expect(motifs).toHaveValue('母题A, 母题B');
  await expect(traits).toHaveValue('怕水, 话多');
  await expect(palette).toHaveValue('#2e7d32 #b3e5fc');
  await expect(page.locator('[data-character-save]')).toBeEnabled();

  await page.click('[data-character-save]');
  await expect(page.locator('[data-character-save]')).toBeDisabled({ timeout: 30_000 });
  await expect(page.locator('[data-character-save]')).toHaveText('没有改动');

  // 直接问服务端：保存下来的 traits 是数组，不是把原文塞进一个字符串
  const read = await page.request.get(`/api/projects/${projectId}/characters`);
  expect(read.status()).toBe(200);
  const body = (await read.json()) as { characters: { profile: { traits: string[]; goals: string[] } }[] };
  expect(body.characters[0]!.profile.traits).toEqual(['怕水', '话多']);
  expect(body.characters[0]!.profile.goals).toEqual(['目标A', '目标B']);

  // 重载后从服务端读回：面板重新挂载，选回同一个角色
  await page.reload();
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await page.click('[data-panel-tab="characters"]');
  await page.locator('[data-character-tab]').first().click();
  await expect(page.locator('[data-character-list="goals"]')).toHaveValue('目标A\n目标B');
  await expect(page.locator('[data-character-visual="motifs"]')).toHaveValue('母题A, 母题B');
  await expect(page.locator('[data-character-field="traits"]')).toHaveValue('怕水, 话多');
  await expect(page.locator('[data-character-visual="palette"]')).toHaveValue('#2e7d32 #b3e5fc');
  await page.screenshot({ path: 'screenshots/character-fields.png' });
});
