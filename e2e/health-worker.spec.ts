import { expect, test } from '@playwright/test';
import { reusableMemberWithProject } from './support/auth-session';

/**
 * §147：体检（`analyzeHealth`）搬进 Web Worker 的**浏览器见证**。
 *
 * 单测（`apps/web/test/health-job.test.ts`）只能证明"同一份作业两条路算出同样的报告"——
 * 它证明不了 worker 真的开了一条线程：node 里没有 Web Worker。所以这一片把证据放在真浏览器里：
 *
 * - 臂 A（正常环境）：健康栏的 `data-health-source` 必须是 `worker`。那是 worker 答复后才写的标记，
 *   同步路写的是 `sync`——两个值分得开，"后台算的"就不能被冒充成"主线程算的"。
 * - 编辑一次：`data-health-seq` 必须前进（证明改文档会真的重算，而不是只画了首屏那一份），
 *   撤销回去后读数必须与编辑前逐字相同（证明重算读的是当前文档，不是某一份缓存）。
 * - 臂 B（把 `window.Worker` 拿掉再刷新）：`data-health-source` 必须是 `sync`，
 *   且整份读数与臂 A 逐字相同。这是"退回同步路"的真环境见证——不是 mock 了一个假 Worker。
 * - 发布弹层里的门禁同样来自 worker：两处读者共用同一条后台路，不是一处改了另一处没改。
 *
 * 闸门：注册 10 次/小时、建项目 20 次/小时（`docs/ENVIRONMENT.md`），
 * 所以这里用可复用的夹具账号 + 名下一个真项目，不为测试放宽任何一道闸。
 */

const RUN = Date.now().toString(36);
const EMAIL = 'health-worker-fixture@nexus.test';
const PASSWORD = 'e2e-secret-123';

/** 把健康栏这份读数抄成一行字：摘要 + 每行的分数/发现数/状态。逐字相同才叫"读数一样"。 */
async function readRail(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-health-rail] [data-health-panel]');
    if (!panel) return '(没有读数)';
    const summary = panel.querySelector('[data-health-summary]')?.textContent ?? '';
    const rows = Array.from(panel.querySelectorAll('[data-health-row]')).map((row) => {
      const id = row.getAttribute('data-health-row');
      const state = row.getAttribute('data-health-state');
      const score = row.querySelector(`[data-health-score="${id}"]`)?.textContent ?? '';
      const findings = row.querySelector(`[data-health-findings="${id}"]`)?.textContent ?? '';
      return `${id}:${state}:${score}:${findings}`;
    });
    return [summary.replace(/\s+/g, ' ').trim(), ...rows].join('\n');
  });
}

const seqOf = async (page: import('@playwright/test').Page) =>
  Number((await page.locator('[data-health-rail]').getAttribute('data-health-seq')) ?? -1);

test('§147 体检在 worker 里算：真浏览器跑的是 worker，拿掉 Worker 后退回同步路读数一字不差', async ({ page }) => {
  test.setTimeout(420_000);
  const { projectId } = await reusableMemberWithProject(page, EMAIL, PASSWORD, `体检样板${RUN}`);
  await page.goto(`/studio/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 120_000 });

  const panel = page.locator('[data-health-rail] [data-health-panel]');

  // 健康栏只在「健康」页签打开时挂载（其余时候连算都不该算），所以先打开这一页
  await page.click('[data-panel-tab="health"]');
  await expect(page.locator('[data-health-rail]')).toBeVisible();

  // ---- 臂 A：worker 真的接手了（不是只构造了对象不用它）
  await expect(panel, '健康栏的读数不是 worker 算的：`data-health-source` 没等到 worker').toHaveAttribute(
    'data-health-source',
    'worker',
    { timeout: 90_000 },
  );
  await expect(panel).toHaveAttribute('data-health-pending', '0', { timeout: 90_000 });
  await expect(page.locator('[data-health-row]')).toHaveCount(7);
  const before = await readRail(page);

  // ---- 改一次文档：重算必须真的发生（seq 前进），不是只画了首屏那一份
  await page.click('[data-view="canvas"]');
  const headline = await page.evaluate(() => {
    const hit = Array.from(document.querySelectorAll('[data-canvas-frame] [data-node-type="text"]')).find((el) =>
      el.textContent?.includes('从一句话到一个可发布的产品'),
    );
    return hit?.getAttribute('data-node-id') ?? null;
  });
  expect(headline, '样板项目里找不到标题节点：这个项目不是起手文档，无法触发一次真实编辑').not.toBeNull();
  await page.click(`[data-node-id="${headline}"]`);
  await page.waitForSelector('[data-prop="typography.fontSize"]', { timeout: 60_000 });
  const seqBeforeEdit = await seqOf(page);
  await page.fill('[data-prop="typography.fontSize"]', '48');
  await expect
    .poll(() => seqOf(page), { timeout: 60_000, message: '改字号之后体检没有重算（data-health-seq 没前进）' })
    .toBeGreaterThan(seqBeforeEdit);
  await expect(panel).toHaveAttribute('data-health-pending', '0', { timeout: 60_000 });

  // 撤销回去：读数必须回到编辑前那一份（证明重算读的是当前文档，不是缓存的旧报告）
  await page.keyboard.press('Control+z');
  await expect
    .poll(() => seqOf(page), { timeout: 60_000, message: '撤销之后体检没有重算' })
    .toBeGreaterThan(seqBeforeEdit + 1);
  await expect(panel).toHaveAttribute('data-health-pending', '0', { timeout: 60_000 });
  const afterUndo = await readRail(page);
  expect(afterUndo, '撤销回原文档后，健康读数与编辑前不一致——重算读的可能不是当前文档').toBe(before);
  // 等这次改动真的写进库：刷新前后必须是同一份文档，否则臂 B 比的不是同一件事
  await expect
    .poll(() => page.locator('[data-save-state]').textContent(), { timeout: 60_000 })
    .toMatch(/^已保存|^已同步/);

  // ---- 发布弹层里的门禁也是 worker 算的（两处读者共用同一条后台路）
  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-gate] [data-health-panel]')).toHaveAttribute(
    'data-health-source',
    'worker',
    { timeout: 90_000 },
  );
  await page.click('[data-publish-open]');

  // ---- 臂 B：把 Worker 从环境里拿掉，再刷新。同一份文档、同一份构建，只是少了那条线程
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Worker', { value: undefined, configurable: true });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 120_000 });
  expect(
    await page.evaluate(() => typeof (window as unknown as { Worker?: unknown }).Worker),
    '臂 B 的前提不成立：页面里 Worker 还在，这一跑量的是两次 worker',
  ).toBe('undefined');
  const syncPanel = page.locator('[data-health-rail] [data-health-panel]');
  await page.click('[data-panel-tab="health"]');
  await expect(syncPanel, '拿掉 Worker 后健康栏没有退回同步路').toHaveAttribute('data-health-source', 'sync', {
    timeout: 90_000,
  });
  await expect(syncPanel).toHaveAttribute('data-health-pending', '0', { timeout: 90_000 });
  const syncText = await readRail(page);
  expect(syncText, '同步回退的读数与 worker 那条路不一致：两条路算的不是同一件事').toBe(afterUndo);
});
