import { expect, test, type Page } from '@playwright/test';
import { loginMemberIfPossible, registerMember } from './support/auth-session';
import { guestState, purgeStaleGuests, seedStaleGuests } from './support/stale-guest-fixture';

/**
 * 过期访客回收那块面板（ADR-0072）在真浏览器里的两格。
 *
 * 集成测试那两片证的是库里与路由里发生了什么；这里只证界面上的话与库里的事对得上。
 *
 * 两格各自的边界，写清楚是因为它们**故意不一样**：
 * - 第一格只看不动：三处数同源、那颗「重新数一遍」在网络上真是 dry run。
 *   它不点执行——那一下此刻会碰这一屏上所有够格的人，包括不属于这条用例的身份。
 * - 第二格点真执行，但**只点自己那两行**：先取消全选、再只勾这一趟造的访客，
 *   于是发出去的 `ids` 全在本用例的名单上（第三十片的点名回收正是为了这件事才存在的）。
 *   库里别人的 guest 一个都不会被这条用例收走。
 *
 * 前置：库里有那个审核员夹具（`npm run e2e:admin-fixture`，它只改 role 不建账号）。
 * 这一条要端点调用，那道桶是 **6 次/10 分钟/审核员**——短时间反复跑会撞 429，
 * 撞了就等窗口过去（两条用例都把界面上那句话一起报出来），**不为了跑得快去放宽它**。
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

async function reclaimResponse(page: Page, action: () => Promise<void>) {
  const resPromise = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/guests/reclaim', { timeout: 60_000 });
  await action();
  const res = await resPromise;
  if (res.status() !== 200) {
    // 429 是这两格里唯一会撞的码（闸按人 6 次/10 分钟，同一个夹具账号共用）。
    // 界面上那句话一并读出来：撞了就要等窗口过去，不放宽那道闸
    const shown = ((await page.locator('[data-reclaim-notice]').textContent().catch(() => '')) ?? '').trim();
    throw new Error(`回收端点回了 ${res.status()}${shown ? `，界面上那句话是「${shown}」` : ''}`);
  }
  return res.json();
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
  // 列表只列前 8 个，那颗按钮说的也只是这一屏——截断时那句"这一次收不到"必须跟着出现
  const shown = Math.min(eligible, 8);
  if (eligible > 8) {
    expect(rows).toBe(8);
    await expect(page.locator('[data-reclaim-truncated]')).toContainText(String(eligible));
    await expect(page.locator('[data-reclaim-truncated]')).toContainText('这一次收不到');
  } else {
    expect(rows).toBe(eligible);
  }
  await expect(page.locator('[data-reclaim-apply]')).toHaveText(`收走这 ${shown} 个`);
  if (shown === 0) {
    // 空清单没有勾选框那一行：界面该说的是"此刻没有够格的"，而不是给一颗永远点不动的按钮
    await expect(page.locator('[data-reclaim-empty]')).toHaveCount(1);
    await expect(page.locator('[data-reclaim-pick-all]')).toHaveCount(0);
    await expect(page.locator('[data-reclaim-apply]')).toBeDisabled();
  } else {
    await expect(page.locator('[data-reclaim-pick-all]')).toBeChecked();
  }
  await page.locator('[data-reclaim-root]').screenshot({ path: 'screenshots/e2e-guest-reclaim-panel.png' });

  // 「重新数一遍」：网络上必须真是 dry run，回执那句数必须与换上来的这份读数同源
  const body = await reclaimResponse(page, () => page.click('[data-recount-button]'));
  expect(body.dryRun, '面板上那颗「重新数一遍」发出去的居然不是 dry run').toBe(true);
  await expect(page.locator('[data-reclaim-notice]')).toContainText('一条都没写');
  const noticeNumber = Number(/够格的 (\d+) 个/.exec((await page.locator('[data-reclaim-notice]').textContent()) ?? '')?.[1]);
  expect(await countOf(page, '够格'), '回执那句数与读数那一行的够格数不是同一份快照').toBe(noticeNumber);
});

/**
 * 第二格：点名的那一次，界面上的行与库里的人一起走。
 *
 * 这条是第三十片存在的另一半理由。第二十九片的臂表里 A17 那一格点过名：
 * 面板接住 `router.refresh()` 送下来的新快照那两行 `useEffect` 没有常驻门——
 * 摘掉它，单元测的是纯函数、e2e 又不点真执行，两道门都还是绿的。
 * 现在它有了：这一条点真执行，而**执行回来的那份 `scan` 是删之前读的**（响应里那两个人还挂着），
 * 所以屏幕上那一行只能靠 refresh 送下来的新快照清掉。摘掉 `useEffect`，下面那句
 * `toHaveCount(0)` 就地变红。
 */
test('点名只收勾着的行：收走的那个人从屏幕上消失，没被点名的那个还在', async ({ page }) => {
  test.setTimeout(300_000);
  const marker = `s30e2e${Date.now().toString(36)}`;
  const seeded = await seedStaleGuests(marker, 2);
  const [doomed, spared] = seeded;
  if (!doomed || !spared) throw new Error(`夹具只造出 ${seeded.length} 个访客`);

  try {
    await asAdmin(page);
    await expect(page.locator('[data-reclaim-root]')).toBeVisible({ timeout: 60_000 });
    // 这一趟造的两个人都要在这一屏上（账龄 100 天，候选按老到新排，他们必然在最前）
    await expect(page.locator(`[data-reclaim-row="${doomed.id}"]`)).toHaveCount(1);
    await expect(page.locator(`[data-reclaim-row="${spared.id}"]`)).toHaveCount(1);

    // 先把范围收到只有自己这两行：取消全选 → 只勾 doomed。这一趟之外的人一个都不碰
    await expect(page.locator('[data-reclaim-pick-all]')).toBeChecked();
    await page.click('[data-reclaim-pick-all]');
    await expect(page.locator('[data-reclaim-pick-all]')).not.toBeChecked();
    await expect(page.locator('[data-reclaim-apply]')).toBeDisabled();
    await expect(page.locator('[data-reclaim-apply]')).toHaveText('收走这 0 个');

    await page.click(`[data-reclaim-pick="${doomed.id}"]`);
    await expect(page.locator(`[data-reclaim-pick="${doomed.id}"]`)).toBeChecked();
    await expect(page.locator(`[data-reclaim-pick="${spared.id}"]`)).not.toBeChecked();
    await expect(page.locator('[data-reclaim-apply]')).toHaveText('收走这 1 个');
    // 勾了一半：那颗"全选"框必须是 indeterminate，不能读成"一个都没勾"
    await expect(page.locator('[data-reclaim-pick-all]')).toBeChecked({ indeterminate: true });
    await page.locator('[data-reclaim-root]').screenshot({ path: 'screenshots/e2e-guest-reclaim-named.png' });

    const eligibleBefore = await countOf(page, '够格');
    const body = await reclaimResponse(page, () => page.click('[data-reclaim-apply]'));

    // 报文层：点名的那一个，而且只有那一个
    expect(body.dryRun).toBe(false);
    expect(body.named).toBe(true);
    expect(body.requested).toBe(1);
    expect((body.reclaimed as { id: string }[]).map((r) => r.id)).toEqual([doomed.id]);
    // 库里没被点名的那个还挂着——响应里这份 scan 是**收之前**读的（这正是屏幕不能靠它清行的原因）
    expect((body.candidates as { id: string }[]).some((c) => c.id === spared.id)).toBe(true);

    // 界面上那句回执是服务端算的原文，界面不自己数第二遍
    await expect(page.locator('[data-reclaim-notice]')).toHaveText('点名的 1 个里收走了 1 个');

    // 这一句就是 A17 那一格的常驻门：refresh 送下来的新快照接住了，那一行才会没
    await expect(page.locator(`[data-reclaim-row="${doomed.id}"]`)).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator(`[data-reclaim-row="${spared.id}"]`)).toHaveCount(1);
    await expect(page.locator('[data-reclaim-counts]')).toContainText(`够格 ${eligibleBefore - 1} 个`);
    await expect(page.locator('[data-reclaim-apply]')).not.toBeDisabled();
    await page.locator('[data-reclaim-root]').screenshot({ path: 'screenshots/e2e-guest-reclaim-after-named.png' });

    // 库里的事与界面上的话对得上：走的人六件事齐活，没点名的那个一个字节都没动
    const gone = await guestState(doomed.id);
    expect(gone.deletedAt, '界面上那一行没了，可库里他还活着').not.toBeNull();
    expect(gone.sessionRows, '人收走了，会话行却还挂在库里').toBe(0);
    expect(gone.liveDrafts, '人收走了，草稿却还是活的').toBe(0);
    expect(gone.reclaimAuditRows).toBe(1);
    const kept = await guestState(spared.id);
    expect(kept.deletedAt).toBeNull();
    expect(kept.sessionRows).toBe(1);
    expect(kept.liveDrafts).toBe(1);
    expect(kept.reclaimAuditRows).toBe(0);
  } finally {
    const removed = await purgeStaleGuests(marker);
    // 软断言：这一句在 `finally` 里，硬抛会把上面真正的失败原因顶掉（`no-unsafe-finally`），
    // 但"库里留了这一趟的东西"必须一起看见——soft 记一条，测试末尾照样红
    expect.soft(removed, `回滚没删干净：${marker} 本该清掉 2 个身份，实际 ${removed} 个`).toBe(2);
  }
});

test('游客态对照：这块面板与那些数对非审核员一个字都不渲染', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/admin/users');
  await expect(page.locator('[data-admin-denied]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-reclaim-root]')).toHaveCount(0);
  await expect(page.locator('[data-reclaim-counts]')).toHaveCount(0);
  await expect(page.locator('[data-reclaim-pick-all]')).toHaveCount(0);
});
