import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { HINTS } from '../apps/web/src/lib/hintCopy';
import { reusableMemberWithProject } from './support/auth-session';

const WEB_URL = process.env.NEXUS_WEB_URL ?? 'http://localhost:3100';
const FIXTURE_EMAIL = 'hint-bubble+fixture@nexus.test';
const FIXTURE_PASSWORD = 'e2e-secret-123';
const CJK = /[\u3400-\u9fff]/;

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

async function guardGenerativeAi(page: Page): Promise<string[]> {
  const calls: string[] = [];
  await page.route('**/api/ai/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (
      path === '/api/ai/agents' ||
      path.startsWith('/api/ai/pending-approvals') ||
      path === '/api/ai/health' ||
      path === '/api/ai/capability'
    ) {
      await route.continue();
      return;
    }
    calls.push(path);
    await route.abort('blockedbyclient');
  });
  return calls;
}

async function wakeStudio(page: Page): Promise<void> {
  const mobile = page.locator('[data-viewport="mobile"]');
  for (let attempt = 0; attempt < 20; attempt++) {
    await mobile.click();
    if (await mobile.evaluate((el) => el.classList.contains('sp-viewportOn'))) {
      await page.locator('[data-viewport="design"]').click();
      await expect(page.locator('[data-viewport="design"]')).toHaveClass(/sp-viewportOn/);
      return;
    }
  }
  throw new Error('Studio 水合没等到：点视口按钮 20 次，选中态始终没变');
}

async function focusByTab(page: Page, selector: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const target = page.locator(selector);
  for (let step = 0; step < 160; step++) {
    if (await target.count()) {
      if (await target.evaluate((el) => el === document.activeElement)) return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab 走查 160 步仍没聚焦 ${selector}`);
}

async function expectLabeledControlName(page: Page, selector: string): Promise<void> {
  const control = page.locator(selector);
  const id = await control.getAttribute('id');
  expect(id, `${selector} 缺少 label 关联 id`).toBeTruthy();
  const labelText = ((await page.locator(`label[for="${id}"]`).textContent()) ?? '').trim();
  expect(labelText.length, `${selector} 的 label 没有文字`).toBeGreaterThan(0);
  await expect(control).toHaveAccessibleName(labelText);
}

async function readHint(page: Page, selector: string) {
  const trigger = page.locator(selector);
  const id = await trigger.getAttribute('data-teaching-hint-trigger');
  expect(id, `${selector} 没有共享气泡触发器`).toBeTruthy();
  const describedBy = (await trigger.getAttribute('aria-describedby'))?.split(/\s+/) ?? [];
  expect(describedBy).toContain(id);
  expect(await trigger.getAttribute('title')).toBeNull();
  return {
    trigger,
    id: id!,
    bubble: page.locator(`[data-teaching-hint-bubble="${id}"]`),
    description: page.locator(`[data-teaching-hint="${id}"] [role="tooltip"]`),
  };
}

async function expectBubbleGeometry(hint: Awaited<ReturnType<typeof readHint>>, width: number, height: number) {
  const bubbleBox = await hint.bubble.boundingBox();
  const triggerBox = await hint.trigger.boundingBox();
  expect(bubbleBox).toBeTruthy();
  expect(triggerBox).toBeTruthy();
  expect(bubbleBox!.x).toBeGreaterThanOrEqual(0);
  expect(bubbleBox!.y).toBeGreaterThanOrEqual(0);
  expect(bubbleBox!.x + bubbleBox!.width).toBeLessThanOrEqual(width);
  expect(bubbleBox!.y + bubbleBox!.height).toBeLessThanOrEqual(height);
  const overlaps =
    bubbleBox!.x < triggerBox!.x + triggerBox!.width &&
    bubbleBox!.x + bubbleBox!.width > triggerBox!.x &&
    bubbleBox!.y < triggerBox!.y + triggerBox!.height &&
    bubbleBox!.y + bubbleBox!.height > triggerBox!.y;
  expect(overlaps, '气泡压住了自己的触发器').toBe(false);
}

test.describe.configure({ timeout: 240_000 });

test.describe.serial('§HINT-2 共享教学气泡（真实浏览器，不调用生成接口）', () => {
  let projectId: string | null = null;
  let state: StorageState | null = null;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ baseURL: WEB_URL, colorScheme: 'dark' });
    const page = await context.newPage();
    const fixture = await reusableMemberWithProject(page, FIXTURE_EMAIL, FIXTURE_PASSWORD, '教学气泡验收夹具');
    projectId = fixture.projectId;
    state = await context.storageState();
    await context.close();
  });

  test('桌面：Tab 聚焦、Escape 只收自己的气泡、外部点击收起，动态撤销/重做也走共享说明', async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ baseURL: WEB_URL, storageState: state!, viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
    const page = await context.newPage();
    const providerCalls = await guardGenerativeAi(page);

    await page.goto(`/studio/${projectId}`);
    await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 60_000 });
    await wakeStudio(page);

    await focusByTab(page, '[data-ai-input]');
    const inputHint = await readHint(page, '[data-ai-input]');
    await expect(inputHint.bubble).toBeVisible();
    const inputCopy = (await inputHint.bubble.textContent()) ?? '';
    expect(inputCopy.trim().length, '输入框的动态说明太短').toBeGreaterThan(20);
    expect(inputCopy).toContain('Enter');
    await expect(inputHint.description).toHaveText(inputCopy);
    await page.screenshot({ path: 'docs/evidence/studio/teaching-hints-desktop-zh.png', fullPage: true });

    await page.keyboard.press('Escape');
    await expect(inputHint.bubble).toBeHidden();
    await expect(inputHint.trigger).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(inputHint.bubble).toBeVisible();
    await page.keyboard.press('Escape');

    await page.locator('[data-ai-input]').fill('教学气泡验收');
    await expect(page.locator('[data-ai-submit]')).toBeEnabled();
    await page.keyboard.press('Tab');
    const runHint = await readHint(page, '[data-ai-submit]');
    await expect(runHint.trigger).toBeFocused();
    await expect(runHint.bubble).toHaveText(HINTS['studio.command.run'].zh);
    await page.keyboard.press('Escape');

    await expectLabeledControlName(page, '[data-ai-agent]');
    await expectLabeledControlName(page, '[data-ai-async]');
    await expectLabeledControlName(page, '[data-ai-review]');

    await page.locator('[aria-keyshortcuts="Control+G"]').hover();
    const gridHint = await readHint(page, '[aria-keyshortcuts="Control+G"]');
    await expect(gridHint.bubble).toBeVisible();
    await expect(gridHint.bubble).toHaveText(HINTS['studio.topbar.grid'].zh);

    const textNodeId = await page.locator('[data-node-type="text"]').first().getAttribute('data-node-id');
    expect(textNodeId, '画布文本节点缺少稳定 id').toBeTruthy();
    const textNode = page.locator(`[data-node-id="${textNodeId}"]`);
    await textNode.click();
    await expect(page.locator('[data-resize-handle]').first()).toBeVisible();
    await page.locator('.sp-wordmark').focus();
    await page.locator('[aria-keyshortcuts="Control+G"]').hover();
    await expect(gridHint.bubble).toBeVisible();
    await page.evaluate(() => {
      const state = window as typeof window & { __hintEscapePrevented?: boolean };
      state.__hintEscapePrevented = undefined;
      window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') state.__hintEscapePrevented = event.defaultPrevented;
      }, { capture: true, once: true });
    });
    await page.keyboard.press('Escape');
    await expect(gridHint.bubble).toBeHidden();
    expect(await page.evaluate(() => (window as typeof window & { __hintEscapePrevented?: boolean }).__hintEscapePrevented),
      '焦点在气泡外时，TeachingHint 不应截断画布的 Escape').toBe(false);
    await expect(page.locator('.sp-wordmark')).toBeFocused();
    await expect(page.locator('[data-resize-handle]')).toHaveCount(0);

    await page.locator('[aria-keyshortcuts="Control+G"]').hover();
    await page.locator('[data-project-name]').click();
    await expect(gridHint.bubble).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('.sp-nameInput')).toHaveCount(0);

    await textNode.click();
    await expect(page.locator('[data-resize-handle]').first()).toBeVisible();
    await page.keyboard.press('Delete');
    await expect(textNode).toHaveCount(0);
    const undo = page.locator('[aria-keyshortcuts="Control+Z"]');
    await expect(undo).toBeEnabled();
    await undo.hover();
    const undoHint = await readHint(page, '[aria-keyshortcuts="Control+Z"]');
    await expect(undoHint.bubble).toContainText(HINTS['studio.topbar.undo'].zh);
    await expect(undoHint.bubble).toContainText('删除元素');
    await undo.click();
    await expect(textNode).toHaveCount(1);

    const redo = page.locator('[aria-keyshortcuts="Control+Shift+Z"]');
    await expect(redo).toBeEnabled();
    await redo.hover();
    const redoHint = await readHint(page, '[aria-keyshortcuts="Control+Shift+Z"]');
    await expect(redoHint.bubble).toContainText(HINTS['studio.topbar.redo'].zh);
    await expect(redoHint.bubble).toContainText('删除元素');
    await redo.click();
    await expect(textNode).toHaveCount(0);
    await undo.click();
    await expect(textNode).toHaveCount(1);

    await page.goto('/');
    await expect(page.locator('[data-command-palette-chip]')).toBeVisible({ timeout: 60_000 });
    await focusByTab(page, '[data-command-palette-chip]');
    const paletteHint = await readHint(page, '[data-command-palette-chip]');
    await expect(paletteHint.bubble).toBeVisible();
    await expect(paletteHint.bubble).toHaveText(HINTS['studio.palette.open'].zh);

    expect(providerCalls, '验收过程碰到了生成接口').toEqual([]);
    await context.close();
  });

  test('移动端 390px：触屏可开、英文零汉字、气泡不越界也不压住触发器', async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({
      baseURL: WEB_URL,
      storageState: state!,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      colorScheme: 'dark',
    });
    await context.addCookies([{ name: 'NEXUS_LOCALE', value: 'en', url: WEB_URL }]);
    const page = await context.newPage();
    const providerCalls = await guardGenerativeAi(page);

    await page.goto(`/studio/${projectId}`);
    await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 60_000 });
    await wakeStudio(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.locator('[data-ai-input]').tap();
    const inputHint = await readHint(page, '[data-ai-input]');
    await expect(inputHint.bubble).toBeVisible();
    const inputCopy = (await inputHint.bubble.textContent()) ?? '';
    expect(inputCopy.trim().length, '输入框的英文动态说明太短').toBeGreaterThan(20);
    expect(inputCopy).toContain('Enter');
    await expect(inputHint.description).toHaveText(inputCopy);
    expect(CJK.test(inputCopy)).toBe(false);

    await expectBubbleGeometry(inputHint, 390, 844);
    await page.screenshot({ path: 'docs/evidence/studio/teaching-hints-mobile-en.png', fullPage: true });

    const canvas = page.locator('[data-canvas-frame]');
    await expect(canvas).toBeVisible();
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).toBeTruthy();
    await page.touchscreen.tap(canvasBox!.x + 16, canvasBox!.y + 16);
    await expect(inputHint.bubble).toBeHidden();

    const mobileTextNodeId = await page.locator('[data-node-type="text"]').first().getAttribute('data-node-id');
    expect(mobileTextNodeId, '移动端画布文本节点缺少稳定 id').toBeTruthy();
    const mobileTextNode = page.locator(`[data-node-id="${mobileTextNodeId}"]`);
    await mobileTextNode.tap();
    await expect(page.locator('[data-resize-handle]').first()).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Delete');
    await expect(mobileTextNode).toHaveCount(0);

    const undo = page.locator('[aria-keyshortcuts="Control+Z"]');
    await expect(undo).toBeEnabled();
    await undo.focus();
    const undoHint = await readHint(page, '[aria-keyshortcuts="Control+Z"]');
    await expect(undoHint.bubble).toHaveText(HINTS['studio.topbar.undo'].en);
    expect(CJK.test((await undoHint.bubble.textContent()) ?? ''), '英文撤销气泡夹进了中文历史标签').toBe(false);
    await undo.tap();
    await expect(mobileTextNode).toHaveCount(1);

    const redo = page.locator('[aria-keyshortcuts="Control+Shift+Z"]');
    await expect(redo).toBeEnabled();
    await redo.focus();
    const redoHint = await readHint(page, '[aria-keyshortcuts="Control+Shift+Z"]');
    await expect(redoHint.bubble).toHaveText(HINTS['studio.topbar.redo'].en);
    expect(CJK.test((await redoHint.bubble.textContent()) ?? ''), '英文重做气泡夹进了中文历史标签').toBe(false);
    await redo.tap();
    await expect(mobileTextNode).toHaveCount(0);
    await undo.tap();
    await expect(mobileTextNode).toHaveCount(1);

    await page.setViewportSize({ width: 390, height: 300 });
    await page.locator('[data-ai-input]').tap();
    const narrowHint = await readHint(page, '[data-ai-input]');
    await expect(narrowHint.bubble).toBeVisible();
    await expectBubbleGeometry(narrowHint, 390, 300);
    expect(providerCalls, '验收过程碰到了生成接口').toEqual([]);
    await context.close();
  });
});
