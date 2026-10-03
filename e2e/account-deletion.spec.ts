import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * §144 最后一格（注销账号 / ADR-0025 的六件事）在真浏览器里的那一格。
 *
 * 集成测试那一片证的是库里发生了什么；这里证的是**人说的那句话对不对得上**：
 * 面板上的四个数确实是从 `GET /api/account` 来的（不是客户端自己数的），
 * 打错确认词时那句拒绝真的显形在界面上（不是靠禁用按钮把这道门藏起来），
 * 逐字确认之后收据里的四个数与预览时的四个数是同一份，
 * 而注销之后那个已发布作品还在公网上传着、只是作者名换成了「已注销的用户」。
 *
 * 一次跑用唯一邮箱与唯一项目名，避免撞限流（注销尝试 5 次/10 分钟）与 `users_email_key`。
 */

async function createProject(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.fill('[data-project-name-input]', name);
  await page.click('[data-create-project]');
  await page.waitForURL(/\/studio\/[^/]+$/);
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 60_000 });
}

/** 发布到公网：拿到 `/n/<handle>/<slug>`，作者名也从这一页的标题栏读，不在测试里重打一遍 */
async function publishPublic(page: Page): Promise<string> {
  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-submit]')).toBeVisible();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 60_000 });
  return (await page.locator('[data-publish-url]').getAttribute('href'))!;
}

/** 数在某句中文的最前面：`3 个已发布作品留在公网…` → 3。读的是界面那一行的原文，不是另算一份 */
async function leadingNumber(locator: Locator): Promise<number> {
  const text = (await locator.textContent()) ?? '';
  const n = /^\s*(\d+)/.exec(text);
  if (!n) throw new Error(`这一行开头没有数字：${text}`);
  return Number(n[1]);
}

test('@smoke §144 注销：数从服务端来 → 打错字看得见 → 收据四个数 → 公开页换作者名', async ({ page, browser }) => {
  test.setTimeout(420_000);
  const tag = Date.now().toString(36);
  const email = `e2e-del-${tag}@nexus.test`;
  const password = 'e2e-secret-123';
  const publishedName = `留下的作品 ${tag}`;
  const draftName = `收走的草稿 ${tag}`;

  // 1) 注册成真实账号——"注销"这件事只有对登录得进来的账号才做得成
  await page.goto('/');
  await page.fill('[data-auth-email]', email);
  await page.fill('[data-auth-password]', password);
  await page.click('[data-auth-submit]');
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });

  // 2) 一个发布过的作品（留下）+ 一个从没发布过的草稿（收进回收站）
  await createProject(page, publishedName);
  const publishedPath = await publishPublic(page);
  const handle = decodeURIComponent(new URL(publishedPath, page.url()).pathname.split('/')[2]!);

  // 公开页此刻挂的是真名——下面要跟"换成「已注销的用户」"对照，所以先把这句原文读下来
  const visitor = await browser.newContext().then((ctx) => ctx.newPage());
  await visitor.goto(new URL(publishedPath, page.url()).href);
  await expect(visitor.locator('[data-published-title]')).toContainText(publishedName);
  const authorBefore = ((await visitor.locator('[data-published-title]').textContent()) ?? '').split(' / ')[0]!.trim();
  expect(authorBefore.length).toBeGreaterThan(0);
  expect(authorBefore).not.toBe('已注销的用户');

  // 注销**之前**先把"这些入口本来是在的"记下来：下面那几句"不再显示"要有对照，
  // 否则一句"页面压根没渲染这一栏"也能让断言变绿
  await visitor.goto(new URL(`/u/${handle}`, page.url()).href);
  await expect(visitor.locator('[data-follow-button]')).toBeVisible();
  await expect(visitor.locator('[data-profile-bio]')).toBeVisible();
  await expect(visitor.locator('[data-profile-deleted-banner]')).toHaveCount(0);

  await createProject(page, draftName);

  // 3) 打开注销面板：四个数与确认词都来自服务端那份清单
  await page.goto('/');
  await page.click('[data-account-delete-open]');
  await expect(page.locator('[data-account-private]')).toBeVisible({ timeout: 20_000 });
  const privateCount = await leadingNumber(page.locator('[data-account-private]'));
  const publishedCount = await leadingNumber(page.locator('[data-account-published]'));
  const sessionCount = await leadingNumber(page.locator('[data-account-sessions]'));
  const tokenCount = await leadingNumber(page.locator('[data-account-tokens]'));
  // 这两个数是我在这儿亲手造的，能当场核对；会话至少一个（就是这次登录），凭据一个没建
  expect(privateCount).toBe(1);
  expect(publishedCount).toBe(1);
  expect(sessionCount).toBeGreaterThanOrEqual(1);
  expect(tokenCount).toBe(0);

  // 发布过 → 确认词是 handle；导出那一格给出草稿的 Studio 链接，不强制
  await expect(page.locator('[data-account-delete-card]')).toContainText('主页地址（handle）');
  const confirmWord = (await page.locator('[data-account-delete-expected]').textContent())!.trim();
  expect(confirmWord).toBe(handle);
  await expect(page.locator('[data-account-export-offer]')).toBeVisible();
  await expect(page.locator('[data-account-export-draft]')).toHaveCount(1);
  await expect(page.locator('[data-account-export-draft]')).toHaveText(draftName);
  await page.locator('[data-account-delete-card]').screenshot({ path: 'screenshots/account-deletion-preview.png' });

  // 4) 打错确认词：拒绝那句要看得见，账号一个字都没动
  await page.fill('[data-account-delete-input]', `${confirmWord}-才怪`);
  await page.click('[data-account-delete-confirm]');
  await expect(page.locator('[data-account-delete-notice]')).toContainText('一个字都没动', { timeout: 20_000 });
  await page.locator('[data-account-delete-card]').screenshot({ path: 'screenshots/account-deletion-refused.png' });
  // 没动＝还登得进来、公开页还挂着真名
  await visitor.goto(new URL(publishedPath, page.url()).href);
  await expect(visitor.locator('[data-published-title]')).toContainText(authorBefore);

  // 5) 逐字输入确认词：收据里的四个数与预览那四个是同一份
  await page.fill('[data-account-delete-input]', confirmWord);
  await page.click('[data-account-delete-confirm]');
  const receipt = page.locator('[data-account-deleted-receipt]');
  await expect(receipt).toBeVisible({ timeout: 30_000 });
  await expect(receipt).toContainText(`收起来了 ${privateCount} 个私有草稿`);
  await expect(receipt).toContainText(`留着 ${publishedCount} 个已发布作品`);
  await expect(receipt).toContainText(`吊销了 ${sessionCount} 个登录会话`);
  await expect(receipt).toContainText(`${tokenCount} 个 API 凭据`);
  await page.screenshot({ path: 'screenshots/account-deletion-receipt.png' });

  // 6) 「知道了」：换回一个全新的游客身份，名下没有那个已注销账号的东西
  await page.click('[data-account-deleted-done]');
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'guest', { timeout: 30_000 });
  await expect(page.locator('[data-account-deleted-receipt]')).toHaveCount(0);
  await expect(page.locator('[data-project-row]')).toHaveCount(0);

  // 7) 注销之后：作品还在公网，作者名换成「已注销的用户」；主页挂着那句横幅，作品照旧列着
  await visitor.goto(new URL(publishedPath, page.url()).href);
  await expect(visitor.locator('[data-published-title]')).toContainText('已注销的用户');
  await expect(visitor.locator('[data-published-title]')).toContainText(publishedName);
  await expect(visitor.locator('[data-published-frame]')).toBeVisible({ timeout: 30_000 });
  await visitor.screenshot({ path: 'screenshots/published-after-deletion.png' });

  await visitor.goto(`/u/${handle}`);
  await expect(visitor.locator('[data-profile-deleted-banner]')).toBeVisible();
  await expect(visitor.locator('[data-profile-name]')).toHaveText('已注销的用户');
  await expect(visitor.locator('[data-profile-bio]')).toHaveCount(0);
  // 关注这个入口收掉了（上面注销之前那句是它的对照）；屏蔽/拉黑照旧留着——那是读者一侧的保护
  await expect(visitor.locator('[data-follow-button]')).toHaveCount(0);
  await expect(visitor.locator('[data-block-control]')).toBeVisible();
  await expect(visitor.locator('[data-profile-work-name]')).toContainText(publishedName);
  await visitor.screenshot({ path: 'screenshots/profile-after-deletion.png', fullPage: true });

  await visitor.close();
});
