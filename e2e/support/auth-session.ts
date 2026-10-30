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

/** 提交登录／注册表单的结果，供断言与"登不上就换个法子"的探测两条路共用。 */
export interface AuthAttempt {
  status: number;
  upgraded: boolean;
  shown: string | null;
}

/** 提交登录／注册表单，等会话真的变成 member 或界面上给出那句话。两条腿都带水合屏障。 */
async function submitAuthForm(page: Page, tab: 'login' | 'register', email: string, password: string): Promise<AuthAttempt> {
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
  // 成功与失败各等自己那一声，谁先到算谁：只等"变成 member"的话，一次错口令要把
  // 20 秒耗满才返回 false，而界面上的话早在半秒前就写出来了。
  const upgraded = await Promise.race([
    page
      .waitForFunction(
        () => document.querySelector('[data-auth-identity]')?.getAttribute('data-auth-identity') === 'member',
        undefined,
        { timeout: 20_000, polling: 250 },
      )
      .then(() => true)
      .catch(() => false),
    page
      .waitForSelector('[data-auth-error]', { timeout: 20_000, state: 'attached' })
      .then(() => false)
      .catch(() => true),
  ]);
  // 这一声读数必须**不等待**：`locator.textContent()` 会先等元素出现，而成功时
  // `[data-auth-error]` 根本不存在——`.catch(() => null)` 救不了它，reject 发生在测试超时那一刻
  // （实测把绿的路径拖成 145 秒后整条测试超时）。`evaluate` 是一次性读数，元素不在就是 null。
  const shown = await page.evaluate(() => document.querySelector('[data-auth-error]')?.textContent?.trim() ?? null);
  return { status, upgraded, shown };
}

function authFailureMessage(tab: 'login' | 'register', attempt: AuthAttempt): string {
  const doing = tab === 'register' ? '注册' : '登录';
  const { status, shown } = attempt;
  return (
    `${doing}没把会话变成 member（HTTP ${status}${shown ? ` · 界面上写：${shown}` : ''}）` +
    (status === 0
      ? '——POST 压根没发出去：这是水合没等到，不是限流。'
      : status === 429
        ? `——这是${doing}限流：连着跑多轮 e2e 会先把名额用光（注册是同一 IP 每小时 10 次）。` +
          '等滑动窗口腾出名额再跑，别放宽产品里那道闸。'
        : '')
  );
}

/** 注册一个 member 会话。 */
export async function registerMember(page: Page, email: string, password: string): Promise<void> {
  const attempt = await submitAuthForm(page, 'register', email, password);
  await expect(
    page.locator('[data-auth-identity]'),
    authFailureMessage('register', attempt),
  ).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });
}

/** 登录成一个已存在的 member 会话（游客态调用；已登录时界面上没有这两个页签）。 */
export async function loginMember(page: Page, email: string, password: string): Promise<void> {
  const attempt = await submitAuthForm(page, 'login', email, password);
  await expect(
    page.locator('[data-auth-identity]'),
    authFailureMessage('login', attempt),
  ).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });
}

/** 能不能登进去，登不进去不报错——给可复用的夹具账号用（账号还不存在时要去注册）。 */
export async function loginMemberIfPossible(page: Page, email: string, password: string): Promise<boolean> {
  return (await loginOutcome(page, email, password)).upgraded;
}

/**
 * 同上，但把那一次答复原样交回去（`status` 与界面上那句话）。
 *
 * 单给"登不上要说清为什么"的夹具用：一个**本来就存在**的夹具账号登不上，十次里有九次是
 * 那道「10 次/15 分钟/邮箱」的闸被自己反复跑喂满了，而调用方若只拿到一个布尔，
 * 就会退回去注册，然后看见一句"该邮箱已被注册"——那句话是真的，但它把原因指错了地方。
 */
export async function loginOutcome(page: Page, email: string, password: string): Promise<AuthAttempt> {
  return submitAuthForm(page, 'login', email, password);
}

/**
 * 属于这个会话名下的第一个项目 id；一个都没有时返回 null。
 * 读的是 `GET /api/projects`（按会话，不限流），不新建——建项目按 IP 每小时只放行 20 次。
 */
export async function firstProjectId(page: Page): Promise<string | null> {
  const res = await page.request.get('/api/projects');
  if (!res.ok()) throw new Error(`读取名下项目失败（HTTP ${res.status()}：${await res.text()}）`);
  const body = (await res.json()) as { projects: { id: string; updatedAt?: string }[] };
  const ids = body.projects.map((p) => p.id);
  return ids[0] ?? null;
}

/**
 * 一把贵的门复用两次：可复用的 member 会话 + 名下一个真项目。
 *
 * 为什么不是"每次注册一个新账号、建一个新项目"：注册按 IP 每小时 10 次、建项目每小时 20 次
 * （`docs/ENVIRONMENT.md`），而 §85 这类"一次注册要扫五张界面"的读数**不需要新的空项目**，
 * 只需要一个真项目。所以先试登录固定夹具邮箱，登不上（账号还不存在）才注册；
 * 名下有项目就直接用，一个也不建。
 * **没有为测试放宽服务端那两道闸**，只是不重复消耗它们。
 */
export async function reusableMemberWithProject(
  page: Page,
  email: string,
  password: string,
  firstProjectName: string,
): Promise<{ projectId: string; freshAccount: boolean; freshProject: boolean }> {
  const freshAccount = !(await loginMemberIfPossible(page, email, password));
  if (freshAccount) await registerMember(page, email, password);
  let projectId = await firstProjectId(page);
  const freshProject = projectId === null;
  if (projectId === null) projectId = await createProjectNamed(page, firstProjectName);
  return { projectId, freshAccount, freshProject };
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
    const body = (await res.json().catch(() => null)) as { message?: string; issues?: string[]; retryAfterMs?: number } | null;
    const said = body?.message ?? body?.issues?.join('；') ?? `HTTP ${res.status()}`;
    // retryAfterMs 是服务端算出来的"还要等多久腾出一个名额"（`rateLimit.ts` 里窗口最早那条 + 窗口 - now）。
    // 报出来是为了**照实等**，而不是等一个猜的数：20 次/小时的滑动窗口在 20 次连建之后会给出接近一小时的数。
    const wait =
      typeof body?.retryAfterMs === 'number' && body.retryAfterMs > 0 ? `（还要等 ${Math.ceil(body.retryAfterMs / 60_000)} 分钟）` : '';
    throw new Error(
      `建项目被服务端拒了（HTTP ${res.status()} · 界面上写：${said}）` +
        (res.status() === 429 ? `——这是建项目限流：等窗口腾出名额再跑${wait}，别放宽产品里那道闸。` : ''),
    );
  }
  await page.waitForURL(/\/studio\/[^/]+$/, { timeout: 60_000 });
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 60_000 });
  return new URL(page.url()).pathname.split('/').pop()!;
}
