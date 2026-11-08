import { expect, test } from '@playwright/test';
import { reusableMemberWithProject } from './support/auth-session';

/**
 * §85 第四十七片：1280 的画布悬崖，作者自己能把属性栏折起来（1280 与 1440 各量一遍）。
 *
 * 第四十五片量到：1279 与 1280 只差 1px，画布从 971 掉到 672——`xl` 一过，右侧属性面板
 * 从底部浮层翻成常驻 300px 内联列。常驻属性栏是设计本身，但 1280–1439 的笔记本用户
 * 不该只有"画布少 21 个点"这一种活法。
 *
 * 这一片给的是**作者的选择**，不是改门槛：默认仍是常驻（既有行为不变），点「折起」才让位。
 * 三条判据：
 * 1. 折起之后画布真的变宽（不是视觉上挪一下）——`[data-canvas-surface]` 的宽度，
 *    并且常驻时的宽度要等于 `视口 - 608`（44 图标栏 + 264 左栏 + 300 属性栏），差超过 8px 就红；
 * 2. 折起/展开两端都有 ≥24×24 的入口，且**焦点跟着走**（折起后焦点落在右缘的「属性」上，
 *    展开后落在「折起」上——不能把键盘用户留在被隐藏的按钮里）；
 * 3. 展开后画布宽度回到折起前（±4px），没有把布局挤坏。
 */

const EMAIL = 'inspector-fold+fixture@nexus.test';
const PASSWORD = 'e2e-secret-123';
const WIDTHS = [1280, 1440] as const;

test('§85 1280/1440 属性栏可折起：画布 +300，焦点跟着走', async ({ page }) => {
  test.setTimeout(360_000);
  const run = Date.now().toString(36);
  const { projectId } = await reusableMemberWithProject(page, EMAIL, PASSWORD, `属性折叠夹具${run}`);
  await page.goto(`/studio/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 120_000 });

  const surface = page.locator('[data-canvas-surface]');
  const panel = page.locator('[data-right-panel]');
  const fold = page.locator('[data-inspector-fold]');
  const unfold = page.locator('[data-inspector-unfold]');

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(200);
    await expect(panel, `${width}：属性栏没渲染`).toBeVisible({ timeout: 30_000 });
    await expect(fold, `${width}：应当有「折起」入口`).toBeVisible();
    await page.screenshot({ path: `screenshots/studio-${width}-inspector-expanded.png` });

    const before = (await surface.boundingBox())!.width;
    const expected = width - 608;
    console.log(`[${width}] 折起前画布宽 ${before.toFixed(1)}（预期 ${expected}）`);
    expect(
      Math.abs(before - expected),
      `${width}：常驻属性栏时画布宽 ${before}，与"视口-608=44+264+300"不符`,
    ).toBeLessThanOrEqual(8);

    const foldBox = await fold.boundingBox();
    expect(foldBox, `${width}：量不到「折起」的矩形`).not.toBeNull();
    expect(Math.min(foldBox!.width, foldBox!.height), `${width}：「折起」小于 24×24`).toBeGreaterThanOrEqual(24);

    await fold.click();
    await expect(panel, `${width}：折起后属性栏应当从布局里退出`).toBeHidden();
    await expect(unfold, `${width}：折起后右缘应当有「属性」入口`).toBeVisible();
    await expect(unfold, `${width}：折起后焦点应当落在「属性」上`).toBeFocused();
    await page.screenshot({ path: `screenshots/studio-${width}-inspector-folded.png` });

    const after = (await surface.boundingBox())!.width;
    console.log(`[${width}] 折起后画布宽 ${after.toFixed(1)}（+${(after - before).toFixed(1)}）`);
    expect(after - before, `${width}：折起属性栏后画布至少要拿回 250px`).toBeGreaterThan(250);
    expect(after, `${width}：折起后画布没有比常驻时更宽`).toBeGreaterThan(before);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      `${width}：折起后出现了页面级横向溢出`,
    ).toBe(0);

    const unfoldBox = await unfold.boundingBox();
    expect(unfoldBox, `${width}：量不到「属性」的矩形`).not.toBeNull();
    expect(Math.min(unfoldBox!.width, unfoldBox!.height), `${width}：「属性」小于 24×24`).toBeGreaterThanOrEqual(24);
    await expect(unfold).toHaveAttribute('aria-controls', 'nexus-inspector');
    await expect(unfold).toHaveAttribute('aria-expanded', 'false');

    await unfold.click();
    await expect(panel).toBeVisible();
    await expect(fold, `${width}：展开后焦点应当落在「折起」上`).toBeFocused();
    const back = (await surface.boundingBox())!.width;
    console.log(`[${width}] 展开后画布宽 ${back.toFixed(1)}`);
    expect(Math.abs(back - before), `${width}：展开后画布宽度没有回到折起前`).toBeLessThanOrEqual(4);
    await expect(fold).toHaveAttribute('aria-controls', 'nexus-inspector');
  }

  // 键盘：Enter 也能折起，折完焦点同样在「属性」上
  await page.keyboard.press('Enter');
  await expect(panel).toBeHidden();
  await expect(unfold).toBeFocused();
});
