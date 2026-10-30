import { expect, test, type Page } from '@playwright/test';
import { loginOutcome, registerMember } from './support/auth-session';
import { guestState, purgeStaleGuests, seedStaleGuests } from './support/stale-guest-fixture';

/**
 * 过期访客回收那块面板（ADR-0072）在真浏览器里的四格。
 *
 * 集成测试那两片证的是库里与路由里发生了什么；这里只证界面上的话与库里的事对得上。
 *
 * 每一格各自的边界，写清楚是因为它们**故意不一样**：
 * - 第一格只看不动：三处数同源、那颗「重新数一遍」在网络上真是 dry run，而且它换的是**屏幕上的读数**
 *   （不是只有回执那句话）。它在页面加载之后往库里种一个人，于是"数换了没有"这件事有对照组。
 * - 第二格点真执行，但**只点自己那两行**：先取消全选、再只勾这一趟造的访客，
 *   于是发出去的 `ids` 全在本用例的名单上（第三十片的点名回收正是为了这件事才存在的）。
 *   库里别人的 guest 一个都不会被这条用例收走。
 * - 第三格（第四格那条）翻屏：够格的超过一屏时，屏号要说清楚这是第几屏、一共几个，
 *   而"全勾"只能指向站着的那一屏（决定九）。
 * - 最后一格是游客态对照：这块面板对非审核员根本不渲染。
 *
 * 前置：库里有那个审核员夹具（`npm run e2e:admin-fixture`，它只改 role 不建账号）。
 * 这一条要端点调用，那道桶是 **6 次/10 分钟/审核员**——跑满一次是 3 次（每格各一次），
 * 短时间反复跑会撞 429，撞了就等窗口过去（每条用例都把界面上那句话一起报出来），**不为了跑得快去放宽它**。
 */

const ADMIN = 'obs-admin+fixture@nexus.test';
const SECRET = 'e2e-secret-123';

async function asAdmin(page: Page): Promise<void> {
  const attempt = await loginOutcome(page, ADMIN, SECRET);
  if (!attempt.upgraded) {
    // 夹具账号在库里一直是存在的（`npm run e2e:admin-fixture` 只改 role 不建账号），所以登不上
    // 十次有九次是「10 次/15 分钟/邮箱」那道闸被自己反复跑喂满了。这时候退回去注册，
    // 只会看见一句"该邮箱已被注册"——那句话是真的，但它把人引向"账号没了"那条错路。
    // 2026-10-30 12:53 那一次就是这样：红的其实不是面板，是我自己喂满的额度。
    if (attempt.status === 429) {
      throw new Error(
        `登录被限流（HTTP 429${attempt.shown ? ` · 界面上写：${attempt.shown}` : ''}）：` +
          '连着跑多轮 e2e 会把「10 次/15 分钟/邮箱」喂满。等窗口过去再跑，不放宽那道闸。',
      );
    }
    await registerMember(page, ADMIN, SECRET);
  }
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

test('审核员看到的回收面板：三处数同源，「重新数一遍」换的不只是那句回执', async ({ page }) => {
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

  const eligibleAtLoad = await countOf(page, '够格');
  const rows = await page.locator('[data-reclaim-row]').count();
  // 一屏只列 8 行；不足一屏时列出来的就是全部
  expect(rows).toBe(Math.min(eligibleAtLoad, 8));
  await expect(page.locator('[data-reclaim-apply]')).toHaveText(`收走这 ${Math.min(eligibleAtLoad, 8)} 个`);
  if (eligibleAtLoad === 0) {
    // 空清单没有勾选框那一行：界面该说的是"此刻没有够格的"，而不是给一颗永远点不动的按钮
    await expect(page.locator('[data-reclaim-empty]')).toHaveCount(1);
    await expect(page.locator('[data-reclaim-pick-all]')).toHaveCount(0);
    await expect(page.locator('[data-reclaim-apply]')).toBeDisabled();
  } else {
    await expect(page.locator('[data-reclaim-pick-all]')).toBeChecked();
  }
  await page.locator('[data-reclaim-root]').screenshot({ path: 'screenshots/e2e-guest-reclaim-panel.png' });

  // 页面加载之后库里再多一个够格的访客。这一趟之后的数只有「重新数一遍」能带上屏幕——
  // 第三十一片之前它带不上：那颗按钮发的是 dry run，回执里的读数压根没进响应体，
  // 于是屏幕上那句话停在加载那一刻，而回执已经在说另一个数（旧的那句断言两边读的是同一份初始渲染，所以它一直绿）
  const marker = `s31rc${Date.now().toString(36)}`;
  try {
    const [late] = await seedStaleGuests(marker, 1);
    if (!late) throw new Error(`夹具没造出访客：${marker}`);
    await expect(page.locator('[data-reclaim-counts]')).toContainText(`够格 ${eligibleAtLoad} 个`);

    const body = await reclaimResponse(page, () => page.click('[data-recount-button]'));
    expect(body.dryRun, '面板上那颗「重新数一遍」发出去的居然不是 dry run').toBe(true);
    expect((body.scan.candidates as { id: string }[]).some((c) => c.id === late.id)).toBe(true);
    await expect(page.locator('[data-reclaim-notice]')).toContainText('一条都没写');

    const noticeNumber = Number(/够格的 (\d+) 个/.exec((await page.locator('[data-reclaim-notice]').textContent()) ?? '')?.[1]);
    expect(noticeNumber, `回执那句数不是刚种下去之后的那份：${noticeNumber}`).toBe(eligibleAtLoad + 1);
    // 屏幕上的读数与回执同源，而且这一条**新**：库里刚多了一个人，屏幕上那一行也得跟着多出来
    await expect(page.locator('[data-reclaim-counts]')).toContainText(`够格 ${eligibleAtLoad + 1} 个`);
    await expect(page.locator(`[data-reclaim-row="${late.id}"]`)).toHaveCount(1);
    expect(await countOf(page, '够格'), '回执与读数那一行不是同一份快照').toBe(noticeNumber);
  } finally {
    const removed = await purgeStaleGuests(marker);
    expect.soft(removed, `回滚没删干净：${marker} 本该清掉 1 个身份，实际 ${removed} 个`).toBe(1);
  }
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
    expect((body.scan.candidates as { id: string }[]).some((c) => c.id === spared.id)).toBe(true);

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

/**
 * 第四格：一屏之外还有几屏（ADR-0072 决定九）。
 *
 * 第三十片那一版只列前 8 行、没有第二屏，于是「全选（8/8）」读起来像"全部"，
 * 而"这一屏之外还有"写在另一句话里。这一格往库里种 9 个自己人，要求屏号那一行同时说出
 * 第几屏、这一屏几行、一共几个；翻到第二屏之后"全勾"指的是**这一屏的那一行**，
 * 所以点名下发的 `ids` 只可能属于站着的那一屏；收完之后清单短到只剩一屏，屏号那一行自己消失。
 *
 * 这一格会真点一次执行，所以它先把前提钉死：屏幕上的候选必须正好就是自己那 9 个。
 * 别人的够格访客混进来时它先红在这一句上，而不是把别人的行一起收走（第二十七片那条纪律在这儿的样子）。
 */
test('第二屏：屏号说清这是第几屏，翻过去之后点名只收站着的那一屏', async ({ page }) => {
  test.setTimeout(300_000);
  const marker = `s31pg${Date.now().toString(36)}`;
  const seeded = await seedStaleGuests(marker, 9);
  const ninth = seeded[8];
  if (!ninth) throw new Error(`夹具只造出 ${seeded.length} 个访客`);

  try {
    await asAdmin(page); // 加载时那一份服务端读数已经带着这 9 个人，不需要额外点「重新数一遍」
    await expect(page.locator('[data-reclaim-root]')).toBeVisible({ timeout: 60_000 });
    expect(
      await countOf(page, '够格'),
      `这一格要点真执行，前提是屏幕上的候选全是它自己造的：此刻够格的不是 9 个，库里躺着别人的访客`,
    ).toBe(9);

    // 第一屏：8 行 + 屏号那一行把"一共几个"一起说出来
    await expect(page.locator('[data-reclaim-row]')).toHaveCount(8);
    await expect(page.locator('[data-reclaim-page]')).toContainText('第 1/2 屏');
    await expect(page.locator('[data-reclaim-page]')).toContainText('够格的一共 9 个');
    await expect(page.locator('[data-reclaim-prev]')).toBeDisabled();
    await expect(page.locator('[data-reclaim-pick-all]')).toBeChecked();
    await expect(page.locator('[data-reclaim-apply]')).toHaveText('收走这 8 个');
    await page.locator('[data-reclaim-root]').screenshot({ path: 'screenshots/e2e-guest-reclaim-page1.png' });

    // 第一屏上先把勾全取消，再翻到第二屏：范围是**跟着屏走的**，不能把上一屏那个"一个都不勾"带过来，
    // 否则翻过去看见的是禁用的"收走这 0 个"，而这一屏明明有一行摆在那儿
    await page.click('[data-reclaim-pick-all]');
    await expect(page.locator('[data-reclaim-apply]')).toBeDisabled();
    await expect(page.locator('[data-reclaim-apply]')).toHaveText('收走这 0 个');

    // 翻到第二屏：只剩这一行，而"全勾"跟着换成这一屏的范围（不是上一屏带过来的 8 个）
    await page.click('[data-reclaim-next]');
    await expect(page.locator('[data-reclaim-page]')).toContainText('第 2/2 屏');
    await expect(page.locator('[data-reclaim-row]')).toHaveCount(1);
    await expect(page.locator(`[data-reclaim-row="${ninth.id}"]`)).toHaveCount(1);
    await expect(page.locator('[data-reclaim-pick-all]')).toBeChecked();
    await expect(page.locator('[data-reclaim-apply]')).toHaveText('收走这 1 个');
    await expect(page.locator('[data-reclaim-next]')).toBeDisabled();
    await page.locator('[data-reclaim-root]').screenshot({ path: 'screenshots/e2e-guest-reclaim-page2.png' });

    const body = await reclaimResponse(page, () => page.click('[data-reclaim-apply]'));
    expect(body.requested).toBe(1);
    expect((body.reclaimed as { id: string }[]).map((r) => r.id)).toEqual([ninth.id]);
    await expect(page.locator('[data-reclaim-notice]')).toHaveText('点名的 1 个里收走了 1 个');

    // 收完这一屏：清单短到只剩一屏，站着的那一屏被拉回第一屏，屏号那一行不再出现
    await expect(page.locator(`[data-reclaim-row="${ninth.id}"]`)).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator('[data-reclaim-counts]')).toContainText('够格 8 个');
    await expect(page.locator('[data-reclaim-page]')).toHaveCount(0);
    await expect(page.locator('[data-reclaim-row]')).toHaveCount(8);
    await page.locator('[data-reclaim-root]').screenshot({ path: 'screenshots/e2e-guest-reclaim-after-page.png' });

    // 库里的事：走的是站着的那一屏，第一屏那 8 个一个都没动
    const gone = await guestState(ninth.id);
    expect(gone.deletedAt).not.toBeNull();
    expect(gone.reclaimAuditRows).toBe(1);
    for (const kept of seeded.slice(0, 8)) {
      expect((await guestState(kept.id)).deletedAt, `第二屏那一次碰了第一屏的 ${kept.name}`).toBeNull();
    }
  } finally {
    const removed = await purgeStaleGuests(marker);
    expect.soft(removed, `回滚没删干净：${marker} 本该清掉 9 个身份，实际 ${removed} 个`).toBe(9);
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
