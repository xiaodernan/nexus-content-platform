import { expect, test, type Page } from '@playwright/test';
import { createProjectNamed, waitForAuthFormHydrated } from './support/auth-session';

/**
 * 认证竖向切片（§137 后半 + §80）：游客建项目 → 注册就地认领 → 登出换回新游客 → 重新登录找回项目。
 * 断言只看用户可见的身份/项目列表，不碰内部实现。口令与邮箱每次跑都用唯一值，避免撞限流与唯一索引。
 *
 * 这一条**故意不整段换成 `registerMember`／`loginMember`**：被测的就是登录／注册这条流程本身，
 * 借共享 helper 走一遍就等于不测它了。但水合屏障照用——那些界面是 SSR 出来的，
 * HTML 一 attach 就能点，可那一刻 React 还没接住点击（`support/auth-session.ts` 记着成因）。
 */

async function registerVia(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await waitForAuthFormHydrated(page); // 屏障结束时表单停在「注册」那一态，正是这里要的
  await page.fill('[data-auth-email]', email);
  await page.fill('[data-auth-password]', password);
  await page.click('[data-auth-submit]');
}

/** 登录这条腿自己驱动（测的就是它），但同样要先确认 React 接得住点击。 */
async function loginVia(page: Page, email: string, password: string): Promise<void> {
  await waitForAuthFormHydrated(page);
  await page.click('[data-auth-tab="login"]');
  await page.fill('[data-auth-email]', email);
  await page.fill('[data-auth-password]', password);
  await page.click('[data-auth-submit]');
}

test('@smoke 认证：游客认领项目 → 注册升级 → 登出 → 登录找回', async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-${Date.now().toString(36)}@nexus.test`;
  const password = 'e2e-secret-123';

  // 起点：免注册游客，能直接建项目
  await createProjectNamed(page, `游客作品 ${Date.now().toString(36)}`);
  await page.goto('/');
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'guest');
  await expect(page.locator('[data-project-row]')).toHaveCount(1);

  // 注册：就地升级为真实账号，并认领此前的游客项目
  await registerVia(page, email, password);
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });
  await expect(page.locator('[data-auth-notice]')).toContainText('已认领 1');
  await expect(page.locator('[data-project-row]')).toHaveCount(1);
  await page.screenshot({ path: 'screenshots/account-member.png' });

  // 登出：会话换发，落到一个全新的游客身份（名下没有项目）
  await page.click('[data-auth-logout]');
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'guest', { timeout: 20_000 });
  await expect(page.locator('[data-project-row]')).toHaveCount(0);

  // 重新登录同一邮箱：项目仍归那个真实账号，被找回
  await loginVia(page, email, password);
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });
  await expect(page.locator('[data-project-row]')).toHaveCount(1);
});

test('@smoke 认证：错误口令被拒且提示可读（不泄露邮箱是否存在）', async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-bad-${Date.now().toString(36)}@nexus.test`;

  await page.goto('/');
  await loginVia(page, email, 'definitely-wrong');
  await expect(page.locator('[data-auth-error]')).toContainText('邮箱或口令不正确', { timeout: 20_000 });
  // 仍是游客，没被误升级
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'guest');
});
