import { expect, test, type Page } from '@playwright/test';

/**
 * §188 M8 第一片的真浏览器那一寸：凭据不是"看起来配好了"，而是**真发一次 HTTP 拿回真 JSON**。
 *
 * 三条只有浏览器能证明的事：
 * - 页面上那两个"试一下"按钮打的是真 `/api/v1/*`（不是把 fetch 换成读本地状态），
 *   所以断言的是 HTTP 状态码与真读回来的项目名/节点数；
 * - 明文只给一次：刷新之后整页文本里再也找不到那串凭据（库里存的是哈希，界面不能假装还能看）；
 * - 吊销是真生效的：吊销之后再拿同一串明文去问，服务端答 401 `revoked_token`，不是"界面上标灰了"。
 *
 * scope 的边界也在真 HTTP 上量：只给 `projects:read` 的凭据问 `/design` 得到 403，
 * 与"没这枚凭据"的 401 是两句不同的话——这两句混起来，配置错误就没法自证。
 */

async function createProjectAsGuest(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.fill('[data-project-name-input]', name);
  await page.click('[data-create-project]');
  await page.waitForURL(/\/studio\/[^/]+$/);
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
}

async function register(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.fill('[data-auth-email]', email);
  await page.fill('[data-auth-password]', password);
  await page.click('[data-auth-submit]');
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });
}

/** 在页面上下文里真发一次带 Bearer 的请求，返回状态码与报文里的 error（不是 fetch 的模拟） */
async function getV1(page: Page, path: string, token: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return page.evaluate(
    async ([p, t]) => {
      const res = await fetch(p as string, { headers: { authorization: `Bearer ${t as string}` }, cache: 'no-store' });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body };
    },
    [path, token],
  );
}

/** 面板里签发一枚凭据并返回页面上显示的那串明文 */
async function issue(page: Page, name: string, scopes: string[]): Promise<string> {
  await page.fill('[data-token-name]', name);
  for (const scope of ['projects:read', 'design:read']) {
    const box = page.locator(`[data-token-scope="${scope}"]`);
    if (scopes.includes(scope) !== (await box.isChecked())) await box.click();
  }
  await page.click('[data-token-create]');
  await expect(page.locator('[data-token-issued]')).toBeVisible({ timeout: 20_000 });
  return (await page.locator('[data-token-plain]').innerText()).trim();
}

test('@smoke 凭据：签发 → 真 HTTP 读到项目 → scope 不够 403 → 吊销后 401 → 明文不再可见', async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-api-${Date.now().toString(36)}@nexus.test`;
  await createProjectAsGuest(page, `凭据样本 ${Date.now().toString(36)}`);
  await register(page, email, 'e2e-secret-123');

  await page.goto('/api-tokens');
  await expect(page.locator('[data-api-tokens-page]')).toBeVisible();
  // 新账号：这里说的是"还没有发过"，不是读失败
  await expect(page.locator('[data-token-empty]')).toBeVisible({ timeout: 20_000 });

  // 1) 只给 projects:read 的一枚：清单读得到，设计文档那一格是 403
  const narrow = await issue(page, 'CI 只读清单', ['projects:read']);
  expect(narrow.startsWith('nexus_pat_')).toBe(true);
  const list = await getV1(page, '/api/v1/projects', narrow);
  expect(list.status).toBe(200);
  const projects = (list.body.projects ?? []) as { id: string; name: string }[];
  expect(projects.length).toBeGreaterThanOrEqual(1);
  expect(projects[0]!.name).toContain('凭据样本');
  expect(JSON.stringify(list.body)).not.toContain(narrow); // 响应里不回带凭据

  const design = await getV1(page, `/api/v1/projects/${projects[0]!.id}/design`, narrow);
  expect(design.status).toBe(403);
  expect(design.body.error).toBe('insufficient_scope');
  expect(String(design.body.message)).toContain('design:read');

  // 2) 两格都给的一枚：页面上那两个"试一下"按钮发的是真请求，状态码原样贴出来
  const wide = await issue(page, 'CI 读文档', ['projects:read', 'design:read']);
  await page.click('[data-try-list]');
  await expect(page.locator('[data-try-status]')).toHaveAttribute('data-try-status', '200', { timeout: 20_000 });
  await expect(page.locator('[data-try-status]')).toContainText('凭据样本');

  await page.click('[data-try-design]');
  await expect(page.locator('[data-try-status]')).toHaveAttribute('data-try-status', '200', { timeout: 20_000 });
  await expect(page.locator('[data-try-status]')).toContainText('个节点（库里那一份）');
  const wideDesign = await getV1(page, `/api/v1/projects/${projects[0]!.id}/design`, wide);
  expect(wideDesign.status).toBe(200);
  expect(wideDesign.body.source).toBe('database');
  expect(Number(wideDesign.body.nodeCount)).toBeGreaterThanOrEqual(1);

  await page.screenshot({ path: 'screenshots/api-tokens-issued.png', fullPage: true });

  // 3) 吊销那枚宽 scope 的凭据：行留着并标"已吊销"，而真 HTTP 从此只给 401
  const revokedRow = page.locator('[data-token-row]').filter({ hasText: 'CI 读文档' }).first();
  await revokedRow.locator('[data-token-revoke]').click();
  await expect(revokedRow.locator('[data-token-status]')).toHaveAttribute('data-token-status', 'revoked', { timeout: 20_000 });
  await expect(page.locator('[data-token-note]')).toContainText('401 revoked_token');
  const afterRevoke = await getV1(page, '/api/v1/projects', wide);
  expect(afterRevoke.status).toBe(401);
  expect(afterRevoke.body.error).toBe('revoked_token');
  // 没吊销的那一枚不受影响：吊销是按枚，不是按人
  expect((await getV1(page, '/api/v1/projects', narrow)).status).toBe(200);

  // 4) 刷新之后，页面上任何地方都不该再出现那两串明文（库里只有哈希，界面不能假装还能看）
  await page.reload();
  await expect(page.locator('[data-api-tokens-page]')).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).not.toContain(wide.slice(-12));
  expect(body).not.toContain(narrow.slice(-12));
  // 而列表读得回来：两行都在，其中一行是吊销状态
  await expect(page.locator('[data-token-row]')).toHaveCount(2);
  await expect(page.locator('[data-token-status="revoked"]')).toHaveCount(1);
  await page.screenshot({ path: 'screenshots/api-tokens-after-reload.png', fullPage: true });
});

test('@smoke 凭据页对游客不可达（账号还没认出来，就没有可管的凭据）', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/api-tokens');
  // 服务端把游客退回首页：这里断言的是"落到了首页且身份仍是游客"，不是一句 302
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'guest', { timeout: 20_000 });
  await expect(page.locator('[data-api-tokens-page]')).toHaveCount(0);
});
