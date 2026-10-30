import { expect, test } from '@playwright/test';

/**
 * §165 搜索建议与历史（ADR-0075）的浏览器那一寸。
 *
 * 三条断言各自对应一句产品承诺：
 * 1. **建议就是真实命中**：键入夹具项目名的一段，建议里必须出现那条公开项目；
 *    点开之后到的是它能打开的地址（不是一条 404 的漂亮标题）。
 * 2. **键盘可用**：combobox 语义（`aria-expanded` / `aria-controls`）+ ↓/Enter 打开、
 *    Esc 收起——建议不是只能用鼠标点的装饰。
 * 3. **历史只在这台设备**：搜过一次后刷新仍在；点一下能回到那组结果；清空之后真的没有了。
 *
 * 载体用**已发布的公开项目**（sitemap 里的夹具），匿名即可，不占注册/建项目两道限流。
 */

const QUERY = 'mvsj0rjc';
const PUBLIC_TITLE = '查看器夹具mvsj0rjc';

test('@smoke §165 搜索建议：键入给真实命中、键盘可开、点开即到', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/search');
  const input = page.locator('[data-search-input]');
  await expect(input).toBeVisible({ timeout: 30_000 });
  await expect(input).toHaveAttribute('role', 'combobox');

  await input.fill(QUERY);
  const listbox = page.locator('[data-search-suggest]');
  await expect(listbox, '键入两个字符起应当给出建议').toBeVisible({ timeout: 30_000 });
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  const controls = await input.getAttribute('aria-controls');
  expect(controls, 'combobox 要指向它控制的那个 listbox').toBe('search-suggestions');
  await expect(page.locator('#search-suggestions')).toHaveAttribute('role', 'listbox');

  const first = page.locator('[data-search-suggestion]').first();
  await expect(first, `建议里应当有那条公开项目（搜的是 ${QUERY}）`).toContainText(PUBLIC_TITLE);
  // 建议行自己报组名：同一串可能在多组命中，"这是哪一类"是建议的一部分
  await expect(first.locator('span').last()).toHaveText('项目');

  // Esc 收起（aria-expanded 跟着翻，不能只是视觉上藏起来）
  await input.press('Escape');
  await expect(listbox).toBeHidden();
  await expect(input).toHaveAttribute('aria-expanded', 'false');

  // 键盘：↓ 选中第一条，Enter 打开
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', 'search-suggestion-0');
  await input.press('Enter');
  await expect(page, 'Enter 应当打开选中的那条建议').not.toHaveURL(/\/search/, { timeout: 30_000 });
  const landed = new URL(page.url());
  expect(landed.pathname === '/' ? '' : landed.pathname, `建议打开的是 ${page.url()}`).not.toBe('/search');
  await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });
});

test('@smoke §165 搜索历史：刷新还在、点一下回到结果、清空真的没了', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/search');
  const input = page.locator('[data-search-input]');
  await expect(input).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-search-history]'), '全新浏览器里不该有历史').toHaveCount(0);

  // 用最普通的路径搜一次：填词 + 点「搜」（原生 GET 表单）
  await input.fill(QUERY);
  await page.click('[data-search-submit]');
  await expect(page).toHaveURL(new RegExp(`/search\\?q=${QUERY}`));
  await expect(page.locator('[data-search-results]')).toBeVisible({ timeout: 30_000 });

  // 回到空搜索页：历史芯片应当出现
  await page.goto('/search');
  const chip = page.locator(`[data-search-history-item="${QUERY}"]`);
  await expect(chip, '刚搜过的词应当出现在这台设备的历史里').toBeVisible({ timeout: 30_000 });

  // 刷新仍然在（localStorage，不是内存状态）
  await page.reload();
  await expect(chip).toBeVisible({ timeout: 30_000 });

  // 点芯片回到那组结果
  await chip.click();
  await expect(page).toHaveURL(new RegExp(`/search\\?q=${QUERY}`));
  await expect(page.locator('[data-search-results]')).toBeVisible({ timeout: 30_000 });

  // 清空
  await page.goto('/search');
  await expect(page.locator('[data-search-history]')).toBeVisible({ timeout: 30_000 });
  await page.click('[data-search-history-clear]');
  await expect(page.locator('[data-search-history]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-search-history]'), '清空之后刷新不该再冒出来').toHaveCount(0);
});
