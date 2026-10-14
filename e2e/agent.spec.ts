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
 *
 * §52 那条链走到第三格，这里把"点的是哪一格，进库的就是那一份"钉在最小的差别上：
 * level 那份与 combat 那份只差坐标，服务端集成测能证"两份内容不同"，但"界面把 stepId 传对了"
 * 这一段发生在点击上——而"坐标写进了库"只有真浏览器读回来的那一份能证明它一路没被换掉。
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

/**
 * 写了作者坐标（x 与 y 都是有限数）的实体数。
 * §52 链第三格（level）自称"只改坐标"，所以它与上一格（combat）那份的**全部**差别就在这一个数上——
 * 拿它当判别证据，等于把"点的是哪一格"这件事压到这一片能给出的最细的刻度上。
 */
function authoredPositions(entities: unknown[]): number {
  return entities.filter((entity) => {
    const stats = (entity as { stats?: Record<string, unknown> }).stats ?? {};
    return Number.isFinite(stats.x) && Number.isFinite(stats.y);
  }).length;
}

/** 服务端那一份作业：计划里的步数与逐步结论。界面上的数必须与它说同一件事 */
interface ServerRun {
  run: {
    taskId: string;
    plan: { tasks: { id: string }[] } | null;
    steps: { id: string; status: string; summary: string; draft?: { name: string; entities: unknown[] } }[];
  } | null;
}

test('@smoke agent orchestration runs in the studio and lands a real notification', async ({ page }) => {
  // dev server 按需编译（studio / 通知页 / 这条新路由都是首屏现编译），所以这一条走得慢是环境的账
  test.setTimeout(300_000);
  await register(page, `agent+${RUN}@nexus.test`, 'e2e-secret-123');
  const projectId = await createProject(page, `编排 ${RUN}`);

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
    // 跑一次编排只有这么几步、彼此隔几百毫秒，两种读法都记不下来才算真的没推
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
  // 步数不写在测试里，从服务端那一份计划读：配方加一步时这里跟着变，
  // 而不是留下一条"界面少了一步也绿"的断言
  const server = (await readJson<ServerRun>(page, `/api/projects/${projectId}/agent`)).run;
  expect(server, '跑完的作业读不回来').not.toBeNull();
  const stepCount = server!.plan!.tasks.length;
  expect(stepCount).toBeGreaterThan(1);
  // 服务端自己说"每步都 done"——下面的 DOM 断言才有对照物
  expect(server!.steps.filter((step) => step.status === 'done')).toHaveLength(stepCount);
  await expect(page.locator('[data-agent-step]')).toHaveCount(stepCount);
  await expect(page.locator('[data-agent-step-status="done"]')).toHaveCount(stepCount);
  // 那句作业介绍里的步数必须与服务端计划里的步数是同一个数。这一条不是修辞：
  // 那句话在第二片之后就一直写着"五步"而配方有七步——手抄的数没有对照物就会漂（§159）
  await expect(page.locator('[data-agent-panel]')).toContainText(`${stepCount} 步作业`);
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
  // 每一格说得出是哪一步，而不是只报一个百分比；分母与计划里的步数一致
  expect(ticks.some((text) => new RegExp(`第 \\d/${stepCount} 步：`).test(text))).toBe(true);
  await page.screenshot({ path: 'screenshots/agent-run.png' });

  // 库是权威：刷新之后那一份作业还在，说的还是同一件事
  await page.reload();
  await page.click('[data-panel-tab="agent"]');
  await expect(page.locator('[data-agent-status="succeeded"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-agent-step-status="done"]')).toHaveCount(stepCount);
  // 刷新后不该退回空态（那意味着计划只活在内存里）
  await expect(page.locator('[data-agent-empty]')).toHaveCount(0);
  // 刷新之后草稿还在，接受入口也还在：草稿存的是任务行，不是组件状态（ADR-0035）
  // §52 那条链现在有三份草稿：game 的原始那份、combat 调过数值的那份、level 把位置写成设计值的那份，
  // 三个入口各管各的那一份
  await expect(page.locator('[data-agent-accept-step="game"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-agent-accept-step="combat"]')).toBeVisible();
  await expect(page.locator('[data-agent-accept-step="level"]')).toBeVisible();
  // 第三格在站内说的是几何目标，不是战斗目标——它摆的是位置，读数的单位也得跟着换
  await expect(page.locator('[data-agent-step-summary="level"]')).toContainText('条几何目标达标');

  /**
   * 第四格（code）在这一层要看得见两件事：它报的是**投影的读数**（几份文件、多少字节），
   * 而且它**没有接受按钮**——它是投影不是第四份"可接受的设计"，缺省档位才会仍落在链末的 level 上。
   * 面板上那句与服务端那一份逐字相同：这一步的数字不是界面自己数的。
   */
  const codeSummary = server!.steps.find((step) => step.id === 'code')?.summary ?? '';
  expect(codeSummary, '服务端那一份里没有 code 的结论').toContain('份自包含文件');
  await expect(page.locator('[data-agent-step-summary="code"]')).toHaveText(codeSummary);
  await expect(page.locator('[data-agent-accept-step="code"]')).toHaveCount(0);

  // §52 的落地：这一点之前项目里"还没有游戏"——只读的作业不会自己把草稿写进去
  expect((await readJson<{ game: unknown }>(page, `/api/projects/${projectId}/game`)).game).toBeNull();

  // 先点链末那一步（level 那份：把位置写成设计值的）：界面上点的是 level，库里就必须是 level 那一份。
  // 这一句是"按 stepId 选"在真浏览器里的证据——缺省取链末对不对，服务端集成测里证不了"点的是谁"。
  // 判别证据用这一片给得出的最细的刻度：level 与 combat 那两份**只差坐标**，
  // 所以"库里那一份带着作者摆的位置、combat 那份一个都没有"就排除了"传错 stepId 也照样绿"。
  await page.click('[data-agent-accept-step="level"]');
  await expect(page.locator('[data-agent-accept-note="ok"]')).toBeVisible({ timeout: 30_000 });
  const accepted = await readJson<{ game: { name: string; entities: unknown[] } }>(
    page,
    `/api/projects/${projectId}/game`,
  );
  const levelDraft = server!.steps.find((step) => step.id === 'level')?.draft as
    | { name: string; entities: unknown[] }
    | undefined;
  expect(levelDraft, 'level 那一步在库里没留草稿').toBeTruthy();
  const combatDraft = server!.steps.find((step) => step.id === 'combat')?.draft as
    | { name: string; entities: unknown[] }
    | undefined;
  expect(combatDraft, 'combat 那一步在库里没留草稿').toBeTruthy();
  const noteText = (await page.locator('[data-agent-accept-note="ok"]').textContent()) ?? '';
  // 回执上报的名字与实体数来自库里那一份，不是面板自己数的
  expect(accepted.game.entities.length).toBeGreaterThan(0);
  expect(accepted.game.entities).toEqual(levelDraft!.entities);
  expect(authoredPositions(accepted.game.entities), '接进来的那一份该带 level 摆好的位置').toBeGreaterThan(0);
  expect(authoredPositions(combatDraft!.entities), '上一格那份不该有作者坐标').toBe(0);
  expect(noteText).toContain(accepted.game.name);
  expect(noteText).toContain(`${accepted.game.entities.length} 个实体`);
  expect(noteText).toContain('「level」这一步留下的那一份草稿');
  await page.screenshot({ path: 'screenshots/agent-accept.png' });

  // 切到「游戏」面板：接受的这一份是项目里的普通文档，接着改的入口在那儿
  await page.click('[data-panel-tab="game"]');
  await expect(page.locator('[data-game-name]')).toHaveValue(accepted.game.name, { timeout: 30_000 });
  await expect(page.locator('[data-game-entity]')).not.toHaveCount(0);

  // 再点另外两格（game 的原始草稿、combat 那份没坐标的）：项目已经有游戏设计了，接受不覆盖，
  // 界面把服务端那句原因原样说出来，而库里那份一字未动。
  // 第二格这一击才有分量：上一格的草稿位置比已接受那份**少**，覆盖了就等于把刚摆好的布局抹掉。
  await page.click('[data-panel-tab="agent"]');
  await expect(page.locator('[data-agent-accept-step="game"]')).toBeVisible({ timeout: 30_000 });
  const landed = JSON.stringify(await readJson(page, `/api/projects/${projectId}/game`));
  for (const stepId of ['game', 'combat'] as const) {
    await page.click(`[data-agent-accept-step="${stepId}"]`);
    await expect(page.locator('[data-agent-accept-note="refused"]')).toContainText('不会覆盖', { timeout: 30_000 });
    expect(JSON.stringify(await readJson(page, `/api/projects/${projectId}/game`)), `${stepId} 那一格不该覆盖已接受的那份`).toBe(landed);
  }
  await page.screenshot({ path: 'screenshots/agent-accept-refused.png' });

  // 收件箱里那一条与面板是同一份真值的两个投影
  await page.goto('/notifications');
  const item = page.locator('[data-notification-kind="agent"]').first();
  await expect(item).toBeVisible({ timeout: 20_000 });
  await expect(item.locator('[data-notification-title]')).toContainText('多步 Agent 任务完成');
  await expect(item.locator('[data-notification-title]')).toContainText('DEMO 规划');
  await expect(item.locator('[data-notification-title]')).toContainText(`${stepCount}/${stepCount} 步`);
  // 这一片之后"没有来源"的单子上连 Build complete 都不挂了（§144 的导出接上的是 §164 的第四类）
  await expect(page.locator('[data-notification-unbacked="Agent task complete"]')).toHaveCount(0);
  await expect(page.locator('[data-notification-unbacked="Build complete"]')).toHaveCount(0);
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
