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
 * ④ 回到 owner 视角名册多一个人：成员、邀请状态、名额计数三样都对上；
 * ⑤ **改角色是立刻生效的写**：owner 把 editor 降为 viewer → 刷新后仍是 viewer。
 *    只靠界面内存不算数——刷新会重新 GET 名册，值还在才说明落库了；
 *    名额计数同时不能动：改角色不是"换一个人"。
 * ⑥ 被降级的人再进 Studio：只读横幅出现（界面先说清），不是进去先改再被 403 打回。
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

/**
 * 登出必须等界面真的切回未登录态再走。
 * 登出是 fetch + router.refresh()；点完立刻 goto 会把还在飞的请求掐掉，
 * 下一页仍带着旧会话——注册页签永远不会出现（本轮实测：卡满 6 分钟超时）。
 */
async function logoutVia(page: Page): Promise<void> {
  await page.click('[data-auth-logout]');
  await expect(page.locator('[data-auth-tab="register"]')).toBeVisible({ timeout: 20_000 });
}

test('@smoke §133 团队协作：owner 发邀请 → 换 editor 登录接受 → 名册多一个人', async ({ page }) => {
  test.setTimeout(360_000);
  const stamp = Date.now().toString(36);
  const ownerEmail = `team-owner-${stamp}@nexus.test`;
  const editorEmail = `team-editor-${stamp}@nexus.test`;

  // 先把 editor 账号注册出来，然后登出换 owner
  await registerVia(page, editorEmail);
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });
  await logoutVia(page);

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
  await logoutVia(page);
  await loginVia(page, editorEmail);
  await page.goto(link);
  await expect(page.locator('[data-invite-accept-page]')).toBeVisible();
  await page.click('[data-invite-accept]');
  await expect(page.locator('[data-invite-accepted]')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('已加入项目')).toBeVisible();

  // ④ 回 owner 视角：名册多一个人，邀请 accepted，名额仍 1/1
  //    登出按钮只在首页/Studio 顶栏——邀请落地页没有它，先回首页
  await page.goto('/');
  await logoutVia(page);
  await loginVia(page, ownerEmail);
  await page.goto(studioUrl);
  await page.click('[data-panel-tab="team"]');
  await expect(page.locator('[data-team-member]')).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator('[data-team-member]')).toContainText(editorEmail);
  await expect(page.locator('[data-team-invite-row]')).toContainText('已接受');
  await expect(page.locator('[data-team-slots]')).toContainText('已占 1 / 1');

  await page.screenshot({ path: 'screenshots/team-roster.png' });

  // ⑤ 改角色：editor → 可查看。通知、名额、刷新后的持久化三样一起看
  const roleSelect = page.locator('[data-team-member] select[data-team-member-role]');
  await expect(roleSelect).toHaveValue('editor');
  await roleSelect.selectOption('viewer');
  await expect(page.locator('[data-team-notice]')).toContainText(`改为可查看`, { timeout: 20_000 });
  await expect(page.locator('[data-team-slots]')).toContainText('已占 1 / 1');
  // 刷新=重新 GET 名册；值还在才说明改的是库里的角色，不是组件内存
  await page.reload();
  await page.click('[data-panel-tab="team"]');
  await expect(page.locator('[data-team-member] select[data-team-member-role]')).toHaveValue('viewer', { timeout: 20_000 });

  await page.screenshot({ path: 'screenshots/team-role-changed.png' });

  // ⑥ 被降为 viewer 的 editor 再进 Studio：横幅先一步说清"能看不能改"
  //    服务端的 403 是最后一道，不该是用户第一次听说这件事（§159）。
  //    顺带证明 page.tsx 用的是写门三态：viewer 进得来（不是 404），只是壳体只读。
  await page.goto('/');
  await logoutVia(page);
  await loginVia(page, editorEmail);
  await page.goto(studioUrl);
  await expect(page.locator('[data-studio-read-only]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-studio-read-only]')).toContainText('查看者');
  await page.screenshot({ path: 'screenshots/team-viewer-read-only.png' });
});
