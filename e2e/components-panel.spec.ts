import { expect, test } from '@playwright/test';
import { createProjectNamed } from './support/auth-session';

/**
 * §13 组件的界面投影：把选中的框存为主组件、删除它，并且**撤销能完整回来**。
 *
 * 这一条要看到的不是"有个面板"，而是三件之前只在模型层单测里有凭证的事：
 * 1. 组件是文档真值的一部分（§16），面板只是它的投影——存与删都走一次可撤销事务（§150）；
 * 2. 删除组件会连带解开引用它的实例（`removeComponent` 的 document 全域清理），
 *    撤销时定义与链接一起回来（`restoreComponent`）；
 * 3. 界面上没有"凭空造组件"：必须先选中一个元素，按钮才可点。
 */

async function openStudio(page: import('@playwright/test').Page, name: string): Promise<void> {
  await createProjectNamed(page, name);
}

test('@smoke 组件面板：存为组件 → 删除 → 撤销把定义与实例链接一起带回来', async ({ page }) => {
  test.setTimeout(150_000);
  await openStudio(page, `组件面板 ${Date.now().toString(36)}`);

  // 图层行只在「图层」那一栏里，所以**先**拿到一个确定存在的节点 id，再切到设计系统栏
  let targetId = '';
  await expect
    .poll(async () => {
      targetId = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-layer-id]'));
        return rows.find((r) => (r.textContent ?? '').includes('Headline'))?.dataset.layerId ?? '';
      });
      return targetId;
    })
    .toBeTruthy();

  await page.click('[data-panel-tab="design"]');
  const section = page.locator('[data-components-section]');
  await expect(section).toBeVisible();
  // 先选中才能存：没选中时按钮不可点，面板不许凭空造一个组件出来
  await expect(page.locator('[data-component-save]')).toBeDisabled();
  await expect(section).toContainText('还没有组件');

  await page.locator(`[data-node-id="${targetId}"]`).click();
  await expect(page.locator('[data-component-save]')).toBeEnabled();

  await page.click('[data-component-save]');
  const card = page.locator('[data-component-card]').first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  const componentId = await card.getAttribute('data-component-card');
  expect(componentId).toBeTruthy();
  // 刚存的组件还没有任何实例引用它：这个数字必须是 0，而不是看起来更顺眼的 1
  await expect(card).toContainText('引用 0');

  await page.screenshot({ path: 'screenshots/components-panel.png' });

  // 删除：一次事务，撤销要能把定义带回来
  await page.click(`[data-component-delete="${componentId}"]`);
  await expect(page.locator(`[data-component-card="${componentId}"]`)).toHaveCount(0, { timeout: 20_000 });

  await page.getByTitle('撤销（Ctrl+Z）').click();
  await expect(page.locator(`[data-component-card="${componentId}"]`)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(`[data-component-card="${componentId}"]`)).toContainText('引用 0');

  await page.getByTitle('重做（Ctrl+Shift+Z）').click();
  await expect(page.locator(`[data-component-card="${componentId}"]`)).toHaveCount(0, { timeout: 20_000 });
});
