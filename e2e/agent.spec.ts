import { expect, test, type Page } from '@playwright/test';

/**
 * §112 多步 Agent 协作的真浏览器那一寸（§158 的 Run → Test → Screenshot → Inspect）。
 *
 * 集成层已经证明"跑完留下的账对不对"；这里要证明的是**只有浏览器能证明的三件事**：
 * - **面板上的读数是服务端算的**，与画布上那 8 个节点对得上（不是面板自己编一个数）；
 * - **库是权威**：刷新之后那一份作业还在，且与没刷新时说的是同一件事（ADR-0010 后果 4）；
 * - **只读是真的**：跑一次检查前后，整份设计文档逐字节相同、历史里不多一条快照。
 *   这一条最要紧——"检查"两个字最容易让人以为它会顺手改点什么。
 *
 * 通知那一格在真浏览器上量的是"面板与收件箱是同一份真值的两个投影"：
 * 标题里的步数必须与面板上的一致，而不是各写各的。
 */

const RUN = Date.now().toString(36);

async function register(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.fill('[data-auth-email]', email);
  await page.fill('[data-auth-password]', password);
  await page.click('[data-auth-submit]');
  await expect(page.locator('[data-auth-identity]')).toHaveAttribute('data-auth-identity', 'member', { timeout: 20_000 });
}

/** 建一个项目并等画布真的画出那 8 个节点——读数要跟画布对，所以先等画布稳定 */
async function createProject(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.fill('[data-project-name-input]', name);
  await page.click('[data-create-project]');
  await page.waitForURL(/\/studio\/[^/]+$/);
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-node-id]')).toHaveCount(8);
  return new URL(page.url()).pathname.split('/').pop()!;
}

async function readJson<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(async (p) => (await fetch(p as string, { cache: 'no-store' })).json(), path) as Promise<T>;
}

test('@smoke agent orchestration runs in the studio and lands a real notification', async ({ page }) => {
  // dev server 按需编译（studio / 通知页 / 这条新路由都是首屏现编译），所以这一条走得慢是环境的账
  test.setTimeout(300_000);
  await register(page, `agent+${RUN}@nexus.test`, 'e2e-secret-123');
  await createProject(page, `编排 ${RUN}`);

  await page.click('[data-panel-tab="agent"]');
  // 这条路由在 dev 下首次命中要现编译，所以第一次读给足时间（不是"面板慢"）
  await expect(page.locator('[data-agent-panel]')).toBeVisible({ timeout: 30_000 });
  // 没跑过就是没有：不许画一个"0 步完成"的空壳（§159）
  await expect(page.locator('[data-agent-empty]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-agent-plan]')).toHaveCount(0);

  await page.fill('[data-agent-goal]', `上架前检查 ${RUN}`);
  // §163 × §112：进度条上每一格都要留下痕迹。只等"最后一条"的话，中间那几格到底推没推过是不知道的，
  // 而"中间刻度来自真跑完的步数"正是这一片的卖点——所以在点「执行」之前装一个观察者，把每次文字变化记下来
  await page.evaluate(() => {
    const ticks: string[] = [];
    (window as unknown as { __progressTicks: string[] }).__progressTicks = ticks;
    const record = () => {
      const text = document.querySelector('[data-generation-progress]')?.textContent?.trim() ?? '';
      if (text && ticks[ticks.length - 1] !== text) ticks.push(text);
    };
    new MutationObserver(record).observe(document.body, { childList: true, subtree: true, characterData: true });
    // 观察者的回调会把同一批改动并成一次，所以再用 20ms 的轮询兜一层：
    // 跑一次编排只有四步、彼此隔几百毫秒，两种读法都记不下来才算真的没推
    window.setInterval(record, 20);
    record();
  });
  await page.click('[data-agent-run]');

  await expect(page.locator('[data-agent-status="succeeded"]')).toBeVisible({ timeout: 90_000 });
  // 报错便签不该出现：它一旦出现就是 CSRF 或 HTTP 那条链坏了
  await expect(page.locator('[data-agent-note]')).toHaveCount(0);
  await expect(page.locator('[data-agent-read-error]')).toHaveCount(0);
  // §160：计划来自确定性配方，界面上必须写清这一点
  await expect(page.locator('[data-agent-planner="demo"]')).toBeVisible();
  await expect(page.locator('[data-agent-step]')).toHaveCount(4);
  await expect(page.locator('[data-agent-step-status="done"]')).toHaveCount(4);
  await expect(page.locator('[data-agent-goal-echo]')).toHaveText(`上架前检查 ${RUN}`);

  // 服务端数出来的页/节点与画布上那 8 个对得上（不是面板自己加的数）
  await expect(page.locator('[data-agent-step-summary="context"]')).toContainText('1 页 / 8 个节点');
  // 汇总那一步真的读出了待办：新项目既没语料也没发布过
  await expect(page.locator('[data-agent-step-summary="report"]')).toContainText('待办');

  // 收尾那一条要等到再读刻度：HTTP 响应比 SSE 的最后一格早到是常事
  await expect(page.locator('[data-generation-progress]')).toContainText('完成', { timeout: 30_000 });
  const ticks = await page.evaluate(() => (window as unknown as { __progressTicks: string[] }).__progressTicks);
  const percents = ticks.map((text) => {
    const matched = /实时进度 (\d+)%/.exec(text);
    return matched ? Number(matched[1]) : Number.NaN;
  });
  // 每条读数都得是进度行本来就写得出的样子，读不出数字的那条等于断言在量别的东西
  expect(percents.every((value) => Number.isFinite(value))).toBe(true);
  expect(percents[0]).toBe(0);
  expect(percents[percents.length - 1]).toBe(100);
  // 这一条才是这一片的主张：中间那几格在真浏览器里出现过，不是一开始 0% 一结束 100%
  expect(percents.some((value) => value > 0 && value < 100)).toBe(true);
  // 进度条不许倒回去
  expect(percents.every((value, index) => index === 0 || value >= percents[index - 1]!)).toBe(true);
  // 每一格说得出是哪一步，而不是只报一个百分比
  expect(ticks.some((text) => /第 \d\/4 步：/.test(text))).toBe(true);
  await page.screenshot({ path: 'screenshots/agent-run.png' });

  // 库是权威：刷新之后那一份作业还在，说的还是同一件事
  await page.reload();
  await page.click('[data-panel-tab="agent"]');
  await expect(page.locator('[data-agent-status="succeeded"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-agent-step-status="done"]')).toHaveCount(4);
  // 刷新后不该退回空态（那意味着计划只活在内存里）
  await expect(page.locator('[data-agent-empty]')).toHaveCount(0);

  // 收件箱里那一条与面板是同一份真值的两个投影
  await page.goto('/notifications');
  const item = page.locator('[data-notification-kind="agent"]').first();
  await expect(item).toBeVisible({ timeout: 20_000 });
  await expect(item.locator('[data-notification-title]')).toContainText('多步 Agent 任务完成');
  await expect(item.locator('[data-notification-title]')).toContainText('DEMO 规划');
  await expect(item.locator('[data-notification-title]')).toContainText('4/4 步');
  // 这一片之后"没有来源"的只剩 Build complete 那一类
  await expect(page.locator('[data-notification-unbacked="Agent task complete"]')).toHaveCount(0);
  await expect(page.locator('[data-notification-unbacked="Build complete"]')).toBeVisible();
  await page.screenshot({ path: 'screenshots/agent-notification.png' });
});

test('a readiness run writes no design model and no snapshot', async ({ page }) => {
  test.setTimeout(240_000);
  await register(page, `agent-ro+${RUN}@nexus.test`, 'e2e-secret-123');
  const projectId = await createProject(page, `只读 ${RUN}`);

  const before = await readJson<{ document: unknown }>(page, `/api/projects/${projectId}`);
  const snapsBefore = await readJson<{ snapshots: unknown[] }>(page, `/api/projects/${projectId}/snapshots`);

  await page.click('[data-panel-tab="agent"]');
  // 承诺得写在界面上，不然"检查"两个字会被当成"自动修复"
  await expect(page.locator('[data-agent-panel]')).toContainText('这一轮不改设计、不发布、不生成像素');
  await page.fill('[data-agent-goal]', '只读检查');
  await page.click('[data-agent-run]');
  await expect(page.locator('[data-agent-status="succeeded"]')).toBeVisible({ timeout: 90_000 });

  const after = await readJson<{ document: unknown }>(page, `/api/projects/${projectId}`);
  const snapsAfter = await readJson<{ snapshots: unknown[] }>(page, `/api/projects/${projectId}/snapshots`);
  // 整份文档逐字节相同：跑一次检查不该顺手改工作区
  expect(JSON.stringify(after.document)).toBe(JSON.stringify(before.document));
  // 也不落快照：历史里不多一条"AI 事务"（§150 那条路根本没被走到）
  expect(snapsAfter.snapshots.length).toBe(snapsBefore.snapshots.length);
});
