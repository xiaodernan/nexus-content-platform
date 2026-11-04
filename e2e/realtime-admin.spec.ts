import { expect, test, type Page } from '@playwright/test';
import { loginOutcome } from './support/auth-session';

/**
 * §163 表盘那两行在**真浏览器**里的凭证（§SEC 第三十七片）。
 *
 * 单测与集成能证明 `stats()` 的形状、措辞与"活读数不来自闩"，证明不了这三件只有看 DOM 才知道的事：
 * 1. 轮询真的接上电——停在"正在问这台实例…"也是一种"看着对"；
 * 2. 两行各自挂在各自的格子上。把下面那行写成上面那行的别名、或者两行挤进一格，
 *    纯函数测全是绿的：它判的是措辞，不是 DOM；
 * 3. 进程内那台的两行都长成"这个驱动没有线路"，而不是"断了"或"还在路上"。
 *
 * 后两段用 `page.route` 喂手工回执。它们证的是**界面拿到这种形状怎么说人话**，
 * 不证那台真处于那个现场——后者由 `apps/web/test/realtime.redis.integration.test.ts`
 * 的「线路比这台晚起来」负责（真 ioredis、真 Redis、真投递）。
 * 这里为什么不换真驱动跑：`NEXUS_REDIS_URL` 同时管着限流闸，不为一张图去改共享 dev server 的环境。
 *
 * 三段共用**一次登录**（`storageState` 传下去）：登录那道闸是 10 次/15 分钟/邮箱，
 * 一个文件三个各自登录的用例，跑到第三轮就会自己把名额吃光——那不是这一片要测的东西，
 * 而它会把真正的红挤成"登不上"。闸不放宽，改的是仪器。
 *
 * admin 那一格需要本地夹具（`npm run e2e:admin-fixture`）；没有它这一张**红并指路**，
 * 不降级成"那就只量游客那一半"。
 */

const ADMIN = 'obs-admin+fixture@nexus.test';
const SECRET = 'e2e-secret-123';

/** 喂给表盘的一份回执；`overrides` 就是这一段要的那个现场 */
function receipt(overrides: Record<string, unknown>) {
  return {
    driver: 'redis',
    instance: 'e2e-喂出来的那台',
    subscriberCount: 2,
    wireReady: true,
    wire: 'up',
    wireErrorCount: 0,
    ...overrides,
  };
}

async function stub(page: Page, body: Record<string, unknown>): Promise<void> {
  await page.route('**/api/admin/realtime', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  );
}

test('§163 表盘两行：真驱动那台 + 两份只有界面才知道的形状', async ({ page, browser }) => {
  // dev 冷编译这一页要 10 秒上下，30 秒默认不够（不是闸在挡人）
  test.setTimeout(180_000);

  const attempt = await loginOutcome(page, ADMIN, SECRET);
  if (!attempt.upgraded) {
    if (attempt.status === 429) {
      throw new Error(
        `登录被「10 次/15 分钟/邮箱」挡住（status=429，界面上是"${attempt.shown ?? '—'}"）：` +
          '等窗口过去再来，别为了跑过这一张放宽那道闸'
      );
    }
    throw new Error(
      `admin 夹具账号登不上（status=${attempt.status}，界面"${attempt.shown ?? '—'}"）：先跑 npm run e2e:admin-fixture`
    );
  }
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });
  const state = await page.context().storageState();

  // ── 第一段：这台自己的回执（驱动由 dev server 的环境决定，不由本文件决定，所以断言按形状走）
  await page.goto('/admin/realtime');
  await expect(page.locator('[data-realtime-stats="ready"]')).toBeVisible({ timeout: 20_000 });
  // 两行都得在场，先点名再取值：少了哪一行要说得出是谁，而不是让取值等到整条用例超时
  await expect(page.locator('[data-realtime-wire]'), '此刻那一行没渲染').toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-realtime-wire-boot]'), '启动那次那一行没渲染').toBeVisible({ timeout: 20_000 });

  const driver = await page.locator('[data-realtime-driver]').getAttribute('data-realtime-driver');
  const wire = await page.locator('[data-realtime-wire]').getAttribute('data-realtime-wire');
  const boot = await page.locator('[data-realtime-wire-boot]').getAttribute('data-realtime-wire-boot');
  const errors = await page.locator('[data-realtime-errors]').innerText();
  expect(['in-process', 'redis']).toContain(driver);
  expect(['up', 'pending', 'down', 'na']).toContain(wire);
  expect(['up', 'pending', 'down', 'na']).toContain(boot);
  if (driver === 'in-process') {
    // 这一族断言是本文件的主格：没有线路 ≠ 线路断了 ≠ 还在路上
    expect(wire, '进程内驱动没有跨实例这回事，报 down 是给一台单实例判了个故障').toBe('na');
    expect(boot).toBe('na');
    expect(errors).toContain('—（没有线路，不适用）');
  }
  // DOM 与接口同读一份：两行必须来自同一份自报，不是页面自己推的
  const api = await (await page.request.get('/api/admin/realtime')).json();
  expect(api.driver).toBe(driver);
  expect(api.wire).toBe(wire);
  expect(api.wireReady === null ? 'na' : api.wireReady ? 'up' : 'down').toBe(boot);
  console.log(
    `\n== §SEC 第三十七片 浏览器读数（真驱动那一台）==\n` +
      `  驱动=${driver} 此刻=${wire} 启动那次=${boot} 失败累计=${errors.trim()}`
  );
  await page.screenshot({ path: `.scratch/shots/61-admin-realtime-two-rows-${driver}.png`, fullPage: true });

  // ── 第二段：Redis 比这台晚起来。启动那次落定成"没接上"，而此刻两条连接都 ready
  const late = await browser.newPage({ storageState: state });
  await stub(late, receipt({ wireReady: false, wire: 'up', wireErrorCount: 3 }));
  await late.goto('/admin/realtime');
  await expect(late.locator('[data-realtime-wire="up"]')).toBeVisible({ timeout: 20_000 });
  await expect(late.locator('[data-realtime-wire-boot="down"]')).toBeVisible();
  const liveText = (await late.locator('[data-realtime-wire]').innerText()).trim();
  const bootText = (await late.locator('[data-realtime-wire-boot]').innerText()).trim();
  // 改之前这两行是同一句话，而且说的是"没接上"——界面在一台早就通了线的实例上永远判死
  expect(liveText).not.toBe(bootText);
  expect(liveText).toContain('两条连接都 ready');
  expect(bootText).toContain('没接上');
  expect(bootText, '并成一句的写法会把"现在通不通"这半句丢掉').toContain('现在通不通');
  // 失败累计有数时那句"不补发"要跟着出来：3 这个数字本身不解释自己
  await expect(late.locator('[data-realtime-error-note]')).toContainText('不补发');
  console.log(`\n== 晚起来那份回执 ==\n  此刻=${liveText}\n  启动那次=${bootText}`);
  await late.screenshot({ path: '.scratch/shots/62-admin-realtime-two-rows-late-redis.png', fullPage: true });
  await late.close();

  // ── 第三段：回执里那一档不认识时不许猜。'READY' 不在四档里：猜 up 是把没证据的这台画成健康，
  //    猜 down 是给它判死
  const odd = await browser.newPage({ storageState: state });
  await stub(odd, receipt({ wire: 'READY' }));
  await odd.goto('/admin/realtime');
  await expect(odd.locator('[data-realtime-wire="na"]')).toBeVisible({ timeout: 20_000 });
  await expect(odd.locator('[data-realtime-wire]')).toContainText('没有线路');
  await odd.close();
});
