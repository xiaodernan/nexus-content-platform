import { expect, test, type Page } from '@playwright/test';
import { loginMemberIfPossible, loginOutcome, registerMember } from './support/auth-session';

/**
 * §SEC 第三十五片：`/admin/rate-limit` 在**真浏览器**里的凭证。
 *
 * 单测与集成测能证明 `describe()` 的形状、线路状态与 counters 同源，证明不了这三件只有跑起来才知道的事：
 * 1. 页面真的把那份读数端出来了（不是停在"正在问这台实例…"——轮询没接上电时那也是一种"看着对"）；
 * 2. 两个"不适用"在界面上长成 `—` 而不是 `0`：把"这个驱动没有键空间"渲染成"前缀是空的"
 *    是这一格最容易犯的错，而它只有看 DOM 才抓得住；
 * 3. 门在浏览器之内的形状：拒绝页不给任何一个数字（`[data-ratelimit-driver]` 计数为 0），
 *    而不是"给了但藏起来"。
 *
 * 一处照实的边界：admin 那一格需要本地夹具（`npm run e2e:admin-fixture`）。没有它时这一张**红**并指路，
 * 不降级成"那就只量拒绝的那一半"。
 *
 * 这台跑的是哪一种驱动由 dev server 的环境决定（`NEXUS_REDIS_URL` 设没设），不由本文件决定——
 * 所以断言按形状走，同时把读到的那一串原样打到 stdout 进文档。两种驱动各跑一轮才是完整覆盖，
 * 这一点写在 `docs/ENVIRONMENT.md`，不在这里假装这一张测了两台。
 */

const MEMBER = 'obs-member+fixture@nexus.test';
const ADMIN = 'obs-admin+fixture@nexus.test';
const SECRET = 'e2e-secret-123';

/** 已存在就登录（不烧注册名额），不存在才注册；登不上要说清是闸满了还是账号没了。 */
async function asSession(page: Page, email: string): Promise<void> {
  const attempt = await loginOutcome(page, email, SECRET);
  if (!attempt.upgraded) {
    if (attempt.status === 429) {
      throw new Error(`登录被「10 次/15 分钟/邮箱」挡住（${email}）：等窗口过去再来，别为了跑过这一张放宽那道闸`);
    }
    await registerMember(page, email, SECRET);
  }
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });
}

test('游客与 member：拒绝页不给任何一个数字，接口 401 / 403', async ({ page }) => {
  // 默认 30 秒在 dev 模式下不够用：这台 dev server 第一次编译 `/admin/rate-limit` 与
  // `/api/auth/login` 各要 10 秒上下（冷编译，不是闸在挡人）。真撞限流时 `loginOutcome` 会带着
  // 429 回来，那一支有专门的报错话术，不会靠这条超时冒充"过了"。
  test.setTimeout(120_000);
  const guest = await page.request.get('/api/admin/rate-limit');
  expect(guest.status()).toBe(401);
  await page.goto('/admin/rate-limit');
  await expect(page.locator('[data-admin-denied="anonymous"]')).toBeVisible();
  await expect(page.locator('[data-ratelimit-admin-root]')).toHaveCount(0);

  if (!(await loginMemberIfPossible(page, MEMBER, SECRET))) {
    await registerMember(page, MEMBER, SECRET);
  }
  const member = await page.request.get('/api/admin/rate-limit');
  expect(member.status()).toBe(403);
  expect((await member.json()).error).toBe('forbidden');

  await page.goto('/admin/rate-limit');
  await expect(page.locator('[data-admin-denied="not-admin"]')).toBeVisible();
  // "给了但藏起来"与"一个都不给"在截图上看着一样，所以这一格要靠计数钉死
  for (const selector of ['[data-ratelimit-driver]', '[data-ratelimit-ceiling]', '[data-ratelimit-stats]']) {
    await expect(page.locator(selector)).toHaveCount(0);
  }
});

test('admin：表盘真的动起来，两个"不适用"在界面上是 — 而不是 0', async ({ page }) => {
  test.setTimeout(180_000);
  await asSession(page, ADMIN);
  await page.goto('/admin/rate-limit');

  await expect(page.locator('[data-ratelimit-admin-root]'), '这一张需要 admin 夹具：先跑 npm run e2e:admin-fixture').toBeVisible();
  // 轮询真的接上电：停在 loading 也算"看着对"，所以这一等是本文件的骨架
  await expect(page.locator('[data-ratelimit-stats="ready"]')).toBeVisible({ timeout: 20_000 });

  const driver = await page.locator('[data-ratelimit-driver]').getAttribute('data-ratelimit-driver');
  const wire = await page.locator('[data-ratelimit-wire]').getAttribute('data-ratelimit-wire');
  const scope = await page.locator('[data-ratelimit-window-scope]').getAttribute('data-ratelimit-window-scope');
  const ceiling = Number.parseInt(await page.locator('[data-ratelimit-ceiling]').innerText(), 10);
  const prefixText = await page.locator('[data-ratelimit-prefix]').innerText();
  const fallbackText = await page.locator('[data-ratelimit-fallback]').innerText();
  const trackedText = await page.locator('[data-ratelimit-tracked]').innerText();
  const deployment = await page.locator('[data-ratelimit-deployment]').getAttribute('data-ratelimit-deployment');

  expect(['in-process', 'redis']).toContain(driver);
  expect(scope, '驱动与窗口归属写反过一次，页面就会把每台各数各的说成共享').toBe(
    driver === 'redis' ? 'shared-across-instances' : 'this-process',
  );
  expect(Number.isFinite(ceiling) && ceiling > 0).toBe(true);
  expect(['up', 'pending', 'down', 'na']).toContain(wire);

  if (driver === 'in-process') {
    // 这一族断言是本文件存在的理由：三格"不适用"必须在界面上长成"不适用"那句话
    expect(prefixText).toContain('—（这个驱动没有键空间）');
    expect(fallbackText).toContain('进程内驱动没有');
    expect(wire).toBe('na');
    expect(trackedText).toContain('就是权威');
  } else {
    expect(prefixText).toBeTruthy();
    expect(prefixText).not.toBe('0');
    expect(trackedText).toContain('ZCARD');
    expect(fallbackText).toMatch(/\d+ 次/);
  }
  expect(['configured', 'unset']).toContain(deployment);

  // 接口与 DOM 各读一次：稳定的那几格必须同值（bucketsTracked / fallbackCount 允许差一个轮询周期，
  // 那是"这台最近一次判定带回的数"的定义，不是缺陷）
  const api = await (await page.request.get('/api/admin/rate-limit')).json();
  expect(api.driver).toBe(driver);
  expect(api.windowScope).toBe(scope);
  expect(api.bucketCeiling).toBe(ceiling);
  expect(api.deployment.envVar).toBe('NEXUS_REDIS_URL');
  expect(api.deployment.redisUrlConfigured).toBe(deployment === 'configured');
  expect(JSON.stringify(api)).not.toContain('@nexus.test');

  const scopeNote = await page.locator('[data-ratelimit-scope]').innerText();
  expect(scopeNote).toContain('这台实例');
  const updated = await page.locator('[data-ratelimit-updated]').innerText();
  expect(updated).toContain('这只回答');
  console.log(
    `\n== §SEC 第三十五片 浏览器读数 ==\n` +
      `  驱动=${driver} 窗口=${scope} 线路=${wire} 上界=${ceiling} 部署=${deployment}\n` +
      `  键前缀=${prefixText}\n  数到的桶=${trackedText}\n  交给本机窗口判=${fallbackText}`,
  );

  // 导航入口：从别一页点得到这里，且当前页不再链自己（aria-current 那一句）
  await page.goto('/admin/realtime');
  await page.locator('[data-admin-link="rate-limit"]').click();
  await expect(page).toHaveURL(/\/admin\/rate-limit$/);
  await expect(page.locator('[data-admin-link="rate-limit"]')).toHaveAttribute('aria-current', 'page');

  // 从导航点过来会重新挂载表盘：截图要等它再问出一次读数，否则图里只有"正在问这台实例…"，
  // 而"页面真的端出了读数"正是这张图要证的那件事
  await expect(page.locator('[data-ratelimit-stats="ready"]')).toBeVisible({ timeout: 20_000 });
  // 两张各留各的图：文件名带上驱动，否则后跑的那一轮会把前一轮的凭证盖掉
  await page.screenshot({ path: `.scratch/shots/60-admin-rate-limit-${driver}.png`, fullPage: true });
});
