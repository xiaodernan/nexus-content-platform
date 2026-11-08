import { expect, test, type Page } from '@playwright/test';
import { loginMemberIfPossible, registerMember } from './support/auth-session';

/**
 * §85 第十一片：观测这一格在**真浏览器**里的凭证（`server/observability.ts` + `/api/admin/metrics` + `/admin/observability`）。
 *
 * 补的是 `docs/ROADMAP.md` 里"metrics/tracing 也没接，所以『线上发生了什么』只能靠审计表 + stderr"那一格。
 * 单测能证明算术对，证明不了三件只有跑起来才知道的事：
 * 1. 中间件真的把 `x-nexus-trace` 挂在了**每一条**响应上（包括 HTML 与 API）；
 * 2. 计数器涨的是**这个进程**刚刚服务过的那几次——不是测试自己喂出来的数；
 * 3. 管理员页与原始读数里**没有**邮箱与 IP（标签按名单封顶是纸面纪律，读出来才叫做到）。
 *
 * 第 2 条是这一张的骨架，顺序因此是判据：先跑一次 member 登录（它一定写一行 `auth.login` 审计、
 * 一定过一次登录限流闸），再让 admin 去读同一进程的账。反过来先读后写，这一格就会绿得没有内容。
 *
 * 一处照实的边界：admin 那个账号是**本地夹具**，需要先注册再在库里把 role 提成 admin
 * （`npm run e2e:admin-fixture`）。没有它时这一张红并说清去跑哪条命令，不降级成"那就只测拒绝的那一半"。
 */

const MEMBER = 'obs-member+fixture@nexus.test';
const ADMIN = 'obs-admin+fixture@nexus.test';
const SECRET = 'e2e-secret-123';
const TRACE = /^[0-9a-f]{16}$/;

/** 拿一个 member 会话：已存在就登录（不烧注册名额），不存在才注册。建项目那道闸这一片完全不碰。 */
async function asSession(page: Page, email: string): Promise<void> {
  if (!(await loginMemberIfPossible(page, email, SECRET))) await registerMember(page, email, SECRET);
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });
}

test('游客：每一次响应都带追踪 id，进来的 id 能续上、形状不对的被换掉', async ({ page }) => {
  const res = await page.goto('/');
  expect(res, '首页没返回响应').not.toBeNull();
  const trace = res!.headers()['x-nexus-trace'];
  expect(trace, '首页的响应头里没有 x-nexus-trace').toMatch(TRACE);

  // 沿用来路正确的 id：跨进程排障要的正是"客户端记的那个 id 在服务端日志里也是同一个"
  const carried = await page.request.get('/discover', { headers: { 'x-nexus-trace': 'abcdef0123456789' } });
  expect(carried.headers()['x-nexus-trace']).toBe('abcdef0123456789');

  // 不可信输入不许原样回显：这是响应头注入的一条实际路径，形状门在中间件里，不靠调用方自觉
  const junk = await page.request.get('/discover', { headers: { 'x-nexus-trace': '../../etc/passwd' } });
  expect(junk.headers()['x-nexus-trace']).toMatch(TRACE);
  expect(junk.headers()['x-nexus-trace']).not.toContain('/');
});

test('游客与 member 读不到观测：401 / 403，页面上一个格子都不给', async ({ page }) => {
  const guest = await page.request.get('/api/admin/metrics');
  expect(guest.status()).toBe(401);

  await asSession(page, MEMBER);
  const member = await page.request.get('/api/admin/metrics');
  expect(member.status()).toBe(403);
  const body = await member.json();
  expect(body.error).toBe('forbidden');

  await page.goto('/admin/observability');
  await expect(page.locator('[data-admin-denied="not-admin"]')).toBeVisible();
  await expect(page.locator('[data-observability-root]')).toHaveCount(0);
  await expect(page.locator('[data-metric-row]')).toHaveCount(0);
});

test('管理员页读到的是这台服务器刚才真服务过的那几次（顺序即判据）', async ({ page }) => {
  test.setTimeout(180_000);

  // ① 先制造真流量：一次 member 登录必然过一次登录限流闸，也必然写一行 auth.login 审计
  await asSession(page, MEMBER);

  // ② 换 admin 会话（新 context，免得两个身份的 cookie 互相盖）
  const baseURL = process.env.NEXUS_WEB_URL ?? 'http://localhost:3100';
  const adminContext = await page.context().browser()!.newContext({ baseURL });
  const adminPage = await adminContext.newPage();
  await adminPage.goto('/');
  await asSession(adminPage, ADMIN);
  await adminPage.goto('/admin/observability');

  await expect(adminPage.locator('[data-observability-root]'), '这一张需要 admin 夹具：先跑 npm run e2e:admin-fixture').toBeVisible();

  // 登录这条路上一定有过限流判定与审计决定；读不到就说明插桩在真请求里没生效
  await expect(adminPage.locator('[data-metric-row="nexus_rate_limit_decisions_total"]').first()).toBeVisible();
  await expect(adminPage.locator('[data-metric-row="nexus_audit_decisions_total"]').first()).toBeVisible();
  // 库那半也在同一页上：窗口里的审计行数不该比 0
  await expect(adminPage.locator('[data-ledger-row="audit"]').first()).toBeVisible();

  const rows = await adminPage.locator('[data-metric-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-metric-row')!));
  const scope = await adminPage.locator('[data-observability-scope]').innerText();
  console.log(`\n== §85 第十一片 浏览器读数 ==\n  页头：${scope}\n  进程内序列 ${rows.length} 条：${[...new Set(rows)].join(' / ')}`);

  // ③ 原始读数：抓取端要的 MIME 与格式头
  const raw = await adminPage.request.get('/api/admin/metrics?format=text');
  expect(raw.status()).toBe(200);
  expect(raw.headers()['content-type']).toContain('text/plain');
  const text = await raw.text();
  expect(text).toContain('# TYPE nexus_audit_decisions_total counter');
  expect(text).toContain('# TYPE nexus_rate_limit_decisions_total counter');

  // ④ JSON 那一版的口径声明与隐私：scope.kind 必须是 single-process，正文里不许出现邮箱
  const json = await (await adminPage.request.get('/api/admin/metrics')).json();
  expect(json.scope.kind).toBe('single-process');
  expect(typeof json.scope.pid).toBe('number');
  expect(JSON.stringify(json)).not.toContain('@nexus.test');
  console.log(`  exposition ${text.split('\n').length} 行 · ledger 审计分组 ${json.ledger.audit.length} 组 · 任务分组 ${json.ledger.tasks.length} 组`);

  await adminPage.screenshot({ path: '.scratch/shots/41-admin-observability.png', fullPage: true });
  await adminPage.context().close();
});
