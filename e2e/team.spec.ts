import { expect, test, type Page } from '@playwright/test';

/**
 * §133 teamCollaboration（#201-203）的浏览器全链路：owner 发邀请 → editor 接受 → 名册多一个人。
 *
 * 这条链上每一个环节都可能是假的，所以整条走真浏览器：
 * ① 邀请链接**只在创建那一回出现**（token 是 secret，roster 永远不给）——链接文本从
 *    `[data-team-fresh-link]` 读，读不到就等于 UI 把 secret 吞了或压根没建邀请；
 * ② 满员拒绝经界面生效：free 档（1 人）再拉一个，错误话里带档位与数字；
 * ③ **换人接受**：登出 → 用 editor 的账号登录 → 打开链接 → 接受成功。token 证明邀请真、
 *    登录邮箱证明"是发给我的"——少了任何一半都到不了"已加入"；
 * ④ 回到 owner 视角名册多一个人：成员、邀请状态、名额计数三样都对上。
 */

const password = 'e2e-team-secret-123';

async function registerVia(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.click('[data-auth-tab="register"]');
  await page.fill('[data-auth-email]', email);
  await page.fill('[data-auth-password]', password);
  await page.click('[data-auth-submit]');
}

async function loginVia(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.click('[data-auth-tab="login"]');
  await page.fill('[data-auth-email]', email);
  await page.fill('[data-auth-password]', password);
  await page.click('[data-auth-submit]');
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });
}

test('@smoke §133 团队协作：owner 发邀请 → 换 editor 登录接受 → 名册多一个人', async ({ page }) => {
  test.setTimeout(360_000);
  const stamp = Date.now().toString(36);
  const ownerEmail = `team-owner-${stamp}@nexus.test`;
  const editorEmail = `team-editor-${stamp}@nexus.test`;

  // 先把 editor 账号注册出来，然后登出换 owner
  await registerVia(page, editorEmail);
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });
  await page.click('[data-auth-logout]');

  // owner 注册 → 建项目
  await registerVia(page, ownerEmail);
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });
  await page.fill('[data-project-name-input]', `团队项目 ${stamp}`);
  await page.click('[data-create-project]');
  await page.waitForURL(/\/studio\/[^/]+$/);
  const studioUrl = page.url();

  // ① 团队面板：名额从 roster 来（free 档 1 人，不含所有者）
  await page.click('[data-panel-tab="team"]');
  await expect(page.locator('[data-team-panel]')).toBeVisible();
  await expect(page.locator('[data-team-slots]')).toContainText('已占 0 / 1', { timeout: 20_000 });

  // 邀请 editor：链接只在创建这一回展示
  await page.fill('[data-team-invite-email]', editorEmail);
  await page.click('[data-team-invite]');
  await expect(page.locator('[data-team-notice]')).toContainText('邀请已创建', { timeout: 20_000 });
  const link = (await page.locator('[data-team-fresh-link] code').textContent())!.trim();
  expect(link).toMatch(/\/invites\/[0-9a-f-]+$/);
  await expect(page.locator('[data-team-invite-row]')).toHaveCount(1);
  await expect(page.locator('[data-team-slots]')).toContainText('已占 1 / 1');

  // ② 满员拒绝：再拉一个被挡，话里带档位与数字
  await page.fill('[data-team-invite-email]', `blocked-${stamp}@nexus.test`);
  await page.click('[data-team-invite]');
  await expect(page.locator('[data-team-error]')).toContainText('协作名额已满', { timeout: 20_000 });
  await expect(page.locator('[data-team-error]')).toContainText('Free 档每个项目除所有者外最多 1 人');

  // ③ 换 editor 登录 → 打开链接 → 接受（登出按钮只在首页，Studio 里没有）
  await page.goto('/');
  await page.click('[data-auth-logout]');
  await loginVia(page, editorEmail);
  await page.goto(link);
  await expect(page.locator('[data-invite-accept-page]')).toBeVisible();
  await page.click('[data-invite-accept]');
  await expect(page.locator('[data-invite-accepted]')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('已加入项目')).toBeVisible();

  // ④ 回 owner 视角：名册多一个人，邀请 accepted，名额仍 1/1
  //    登出按钮只在首页/Studio 顶栏——邀请落地页没有它，先回首页
  await page.goto('/');
  await page.click('[data-auth-logout]');
  await loginVia(page, ownerEmail);
  await page.goto(studioUrl);
  await page.click('[data-panel-tab="team"]');
  await expect(page.locator('[data-team-member]')).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator('[data-team-member]')).toContainText(editorEmail);
  await expect(page.locator('[data-team-invite-row]')).toContainText('已接受');
  await expect(page.locator('[data-team-slots]')).toContainText('已占 1 / 1');

  await page.screenshot({ path: 'screenshots/team-roster.png' });
});
