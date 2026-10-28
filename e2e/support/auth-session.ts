import { expect, type Page } from '@playwright/test';

/**
 * 会话与建项目的两条腿，都带**水合屏障**。
 *
 * 为什么需要这一份：这些界面是 SSR 出来的——HTML 一 attach 就能 `fill`／`click`，
 * 可那一刻 React 的委托监听还没挂上，点下去是**静默丢掉**的。2026-10-28 写 §85 第四片时
 * 同一段脚本两次跑一次失败一次成功，失败的样子是"身份仍是 guest"或"根本没发出 POST"，
 * 看起来都像限流或像用例坏了。`waitForSelector('[data-auth-tab=…]')` 只等得到 SSR 的 HTML，等不到水合。
 *
 * 水合没法直接观测，所以判据一律用"**点/敲之后 DOM 真的按状态变了**"，不对就重敲一次：
 * - 注册表单：登录态不渲染昵称输入框，注册态渲染它，切一次tab看它消失再回来；
 * - 建项目：提交按钮是 `disabled={busy || !name.trim()}`，React 没接住输入时它一直灰着。
 *
 * 注册按 IP 限流 10 次/小时（`docs/ENVIRONMENT.md`）：答复码进第一条报错，
 * 但**不要为测试放宽那道闸**。
 */

/** 等 React 接住点击：用「登录／注册」切换把昵称输入框弄消失再弄回来。只在游客态的账号面板上成立。 */
async function wakeByTabToggle(page: Page): Promise<void> {
  for (let attempt = 1; attempt <= 20; attempt++) {
    await page.click('[data-auth-tab="login"]');
    const woke = await page
      .waitForSelector('[data-auth-displayname]', { state: 'detached', timeout: 1_000 })
      .then(() => true)
      .catch(() => false);
    if (!woke) continue;
    await page.click('[data-auth-tab="register"]');
    await page.waitForSelector('[data-auth-displayname]', { state: 'attached', timeout: 5_000 });
    return;
  }
  throw new Error('水合没等到：点 20 次「登录／注册」，昵称输入框都没跟着消失再回来——React 始终没接住点击');
}

/**
 * 给**自己驱动登录／注册流程**的用例用的屏障（`auth.spec.ts` 测的就是这条流程，
 * 不能整段换成 `registerMember`，但同样必须先确认 React 接住了点击）。
 * 前提：当前是游客态——登录态不渲染昵称输入框，注册态才渲染。
 */
export async function waitForAuthFormHydrated(page: Page): Promise<void> {
  await page.waitForSelector('[data-auth-tab="register"]', { timeout: 60_000 });
  await wakeByTabToggle(page);
}

/** 提交登录／注册表单，并确认会话真的成了 member。两条腿都带水合屏障。 */
async function submitAuthForm(page: Page, tab: 'login' | 'register', email: string, password: string): Promise<void> {
  const doing = tab === 'register' ? '注册' : '登录';
  await page.goto('/');
  await waitForAuthFormHydrated(page); // 结束时表单停在「注册」那一态
  if (tab === 'login') await page.click('[data-auth-tab="login"]');
  await page.fill('[data-auth-email]', email);
  await page.fill('[data-auth-password]', password);
  const attempted = page
    .waitForResponse((r) => new URL(r.url()).pathname === `/api/auth/${tab}`, { timeout: 30_000 })
    .catch(() => null);
  await page.click('[data-auth-submit]');
  const status = (await attempted)?.status() ?? 0;
  // 这一声读数必须**不等待**：`locator.textContent()` 会先等元素出现，而成功时
  // `[data-auth-error]` 根本不存在——`.catch(() => null)` 救不了它，reject 发生在测试超时那一刻
  // （实测把绿的路径拖成 145 秒后整条测试超时）。`evaluate` 是一次性读数，元素不在就是 null。
  const shown = await page.evaluate(() => document.querySelector('[data-auth-error]')?.textContent?.trim() ?? null);
  await expect(
    page.locator('[data-auth-identity]'),
    `${doing}没把会话变成 member（HTTP ${status}${shown ? ` · 界面上写：${shown}` : ''}）` +
      (status === 0
        ? '——POST 压根没发出去：这是水合没等到，不是限流。'
        : status === 429
          ? `——这是${doing}限流：连着跑多轮 e2e 会先把名额用光（注册是同一 IP 每小时 10 次）。` +
            '等滑动窗口腾出名额再跑，别放宽产品里那道闸。'
          : ''),
  ).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });
}

/** 注册一个 member 会话。 */
export async function registerMember(page: Page, email: string, password: string): Promise<void> {
  await submitAuthForm(page, 'register', email, password);
}

/** 登录成一个已存在的 member 会话（游客态调用；已登录时界面上没有这两个页签）。 */
export async function loginMember(page: Page, email: string, password: string): Promise<void> {
  await submitAuthForm(page, 'login', email, password);
}

/** 用界面上的新建项目表单建一个项目，返回项目 id。 */
export async function createProjectNamed(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.waitForSelector('[data-project-name-input]', { timeout: 60_000 });
  for (let attempt = 1; attempt <= 20; attempt++) {
    await page.fill('[data-project-name-input]', name);
    // React 接住了输入才会把提交按钮从灰点亮起来
    const enabled = await page
      .waitForSelector('[data-create-project]:not([disabled])', { timeout: 1_000 })
      .then(() => true)
      .catch(() => false);
    if (enabled) break;
    if (attempt === 20) throw new Error('水合没等到：填了 20 次项目名，新建按钮始终灰着——React 没接住输入事件');
  }
  // 建项目也有限流（`/api/projects` POST：每个 IP 每小时 20 次，2026-10-28 实测撞上过）。
  // 光等 URL 的话，被拒的那一次会安静地耗满 60 秒再报"导航超时"，把真原因埋掉——
  // 所以先把这次 POST 的答复接住，非 2xx 就照界面上那句话收场（同 registerMember 的规矩）。
  // 监听必须挂在点之前：挂在点之后就可能赶在答复后面。
  const attempted = page
    .waitForResponse((r) => new URL(r.url()).pathname === '/api/projects', { timeout: 15_000 })
    .catch(() => null);
  await page.click('[data-create-project]');
  const res = await attempted;
  if (res && !res.ok()) {
    const body = (await res.json().catch(() => null)) as { message?: string; issues?: string[] } | null;
    const said = body?.message ?? body?.issues?.join('；') ?? `HTTP ${res.status()}`;
    throw new Error(
      `建项目被服务端拒了（HTTP ${res.status()} · 界面上写：${said}）` +
        (res.status() === 429 ? '——这是建项目限流：等窗口腾出名额再跑，别放宽产品里那道闸。' : ''),
    );
  }
  await page.waitForURL(/\/studio\/[^/]+$/, { timeout: 60_000 });
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 60_000 });
  return new URL(page.url()).pathname.split('/').pop()!;
}
