import { expect, test, type Page } from '@playwright/test';
import { loginMemberIfPossible, registerMember } from './support/auth-session';

/**
 * 过期访客回收那块面板（ADR-0072）在真浏览器里的那一格。
 *
 * 集成测试那两片证的是库里与路由里发生了什么；这里只证**界面上那三句数说的是同一件事**：
 * 读数那一行的「够格 N 个」、列表里的行数、执行按钮上那句「收走这 N 个」必须来自同一份快照，
 * 而「重新数一遍」在网络上真的是一次 dry run（响应体里 `dryRun` 为真）。
 *
 * 两件刻意的不做：
 * - **这一条不点「收走这 N 个」**。那一下会把此刻够格的**所有**访客收走——包括不属于这条用例的
 *   身份（本地库里别人的 guest 也算）。真执行那一格由集成测试自己造夹具来证，加上
 *   `scripts/capture-guest-reclaim.mts` 的手跑见证；写库的动作不进常驻用例。
 * - **不自己造沉默访客**：判据是"最后一条会话过期再往后 30 天"，把时钟回拨要直接写库，
 *   那在 e2e 这一侧等于绕过所有链路。所以这一条只判"界面会不会说谎"，不判"数得对不对"。
 *
 * 前置：库里有那个审核员夹具（`npm run e2e:admin-fixture`，它只改 role 不建账号）。
 * 这一条要端点一次调用，那道桶是 **6 次/10 分钟/审核员**——短时间反复跑会撞 429，
 * 撞了就等窗口过去（下面把界面上那句话一起报出来），不为了跑得快去放宽它。
 */

const ADMIN = 'obs-admin+fixture@nexus.test';
const SECRET = 'e2e-secret-123';

async function asAdmin(page: Page): Promise<void> {
  if (!(await loginMemberIfPossible(page, ADMIN, SECRET))) await registerMember(page, ADMIN, SECRET);
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });
  // 夹具账号在库里不是 admin 的话，这个页面根本不放行——先把原因说清楚，别让人去猜界面坏了
  await page.goto('/admin/users');
  await expect(page.locator('[data-admin-denied]')).toHaveCount(0);
}

/** 从"沉默到线 3 个 · 够格 2 个 · …"那一行里取一个数；读的是界面原文，不在测试里另算一份 */
async function countOf(page: Page, label: string): Promise<number> {
  const text = ((await page.locator('[data-reclaim-counts]').textContent()) ?? '').replace(/\s+/g, ' ');
  const hit = new RegExp(`${label} (\\d+) 个`).exec(text);
  if (!hit) throw new Error(`读数那一行里没有「${label} N 个」：${text}`);
  return Number(hit[1]);
}

test('审核员看到的回收面板：三处数同源，且「重新数一遍」在网络上就是 dry run', async ({ page }) => {
  test.setTimeout(300_000);
  await asAdmin(page);
  await expect(page.locator('[data-reclaim-root]')).toBeVisible({ timeout: 60_000 });

  // 规则那句话要在：判据、两道护身符、以及"走的是注销那六件事不是抹行"
  const rule = (await page.locator('[data-reclaim-rule]').textContent()) ?? '';
  expect(rule).toContain('30 天');
  expect(rule).toContain('两个月');
  expect(rule).toContain('已发布作品');
  expect(rule).toContain('API 令牌');
  expect(rule).toContain('ADR-0025');

  const eligible = await countOf(page, '够格');
  const rows = await page.locator('[data-reclaim-row]').count();
  if (eligible > 8) {
    // 列表只列前 8 个，那句"只列了 N 个"必须跟着出现，不然人会把截过的清单当成全部
    expect(rows).toBe(8);
    await expect(page.locator('[data-reclaim-truncated]')).toContainText(String(eligible));
  } else {
    expect(rows).toBe(eligible);
  }
  await expect(page.locator('[data-reclaim-apply]')).toHaveText(`收走这 ${eligible} 个`);
  await page.locator('[data-reclaim-root]').screenshot({ path: 'screenshots/e2e-guest-reclaim-panel.png' });

  // 「重新数一遍」：网络上必须真是 dry run，回执那句数必须与换上来这份读数同源
  const resPromise = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/guests/reclaim', { timeout: 60_000 });
  await page.click('[data-recount-button]');
  const res = await resPromise;
  if (res.status() !== 200) {
    // 429 是这里唯一会撞的码（6 次/10 分钟/审核员，同一个夹具账号共用）。
    // 界面上那句话一并读出来：撞了就要等窗口过去，**不放宽那道闸**
    const shown = ((await page.locator('[data-reclaim-notice]').textContent().catch(() => '')) ?? '').trim();
    throw new Error(`回收端点回了 ${res.status()}${shown ? `，界面上那句话是「${shown}」` : ''}`);
  }
  const body = await res.json();
  expect(body.dryRun, '面板上那颗「重新数一遍」发出去的居然不是 dry run').toBe(true);
  await expect(page.locator('[data-reclaim-notice]')).toContainText('一条都没写');
  const noticeNumber = Number(/够格的 (\d+) 个/.exec((await page.locator('[data-reclaim-notice]').textContent()) ?? '')?.[1]);
  expect(await countOf(page, '够格'), '回执那句数与读数那一行的够格数不是同一份快照').toBe(noticeNumber);
});

test('游客态对照：这块面板与那些数对非审核员一个字都不渲染', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/admin/users');
  await expect(page.locator('[data-admin-denied]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-reclaim-root]')).toHaveCount(0);
  await expect(page.locator('[data-reclaim-counts]')).toHaveCount(0);
});
