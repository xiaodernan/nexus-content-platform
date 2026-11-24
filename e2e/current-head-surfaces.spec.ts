import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { reusableMemberWithProject } from './support/auth-session';

const BASE_URL = process.env.NEXUS_WEB_URL ?? 'http://localhost:3100';
const MEMBER = 'viewer+fixture@nexus.test';
const SECRET = 'e2e-secret-123';
const WIDTHS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1280', width: 1280, height: 900 },
] as const;

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

interface Surface {
  name: string;
  path: string;
  ready: string;
  requires?: string;
  blocks: string;
  studio?: boolean;
  observatory?: boolean;
}

let memberState: StorageState;
let projectId: string;
let surfaces: Surface[];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 900 },
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  try {
    const member = await reusableMemberWithProject(page, MEMBER, SECRET, '当前 HEAD 多尺寸验收夹具');
    memberState = await context.storageState();
    projectId = member.projectId;
    surfaces = [
      {
        name: 'home',
        path: '/',
        ready: '[data-home-quickstart]',
        requires: '[data-auth-identity="member"]',
        blocks: '.hp-helpStrip, [data-site-nav], [data-home-quickstart], .hp-page > .hp-section',
      },
      {
        name: 'studio',
        path: `/studio/${projectId}`,
        ready: '[data-panel-tab]',
        requires: '[data-canvas-frame]',
        blocks: '.sp-topbar, .se-rail, .se-workArea',
        studio: true,
      },
      {
        name: 'observatory',
        path: '/observatory',
        ready: '[data-pulse-public-gate]',
        blocks: '[data-pulse-public-trend], [data-pulse-public-projection], [data-pulse-public-volatility], [data-pulse-public-hot], [data-pulse-public-actions]',
        observatory: true,
      },
    ];
  } finally {
    await context.close();
  }
});

async function unlockObservatory(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.fill('[data-pulse-public-passphrase]', '123');
    await page.click('[data-pulse-public-enter]');
    const opened = await page
      .waitForSelector('[data-pulse-public-root]', { timeout: 1_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return;
  }
  await expect(page.locator('[data-pulse-public-root]')).toBeVisible();
}

async function expectBlocksInsideViewport(page: Page, selector: string, width: number): Promise<void> {
  const boxes = await page.locator(selector).evaluateAll((elements) => elements
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }));
  expect(boxes.length, `${selector} 没有量到主体块`).toBeGreaterThan(0);
  for (const [index, box] of boxes.entries()) {
    expect(box.left, `主体块 ${index} 左边越界`).toBeGreaterThanOrEqual(-1);
    expect(box.right, `主体块 ${index} 右边越界（视口 ${width}px）`).toBeLessThanOrEqual(width + 1);
    for (let other = index + 1; other < boxes.length; other += 1) {
      const peer = boxes[other]!;
      const overlapX = Math.min(box.right, peer.right) - Math.max(box.left, peer.left);
      const overlapY = Math.min(box.bottom, peer.bottom) - Math.max(box.top, peer.top);
      expect(overlapX > 1 && overlapY > 1, `主体块 ${index} 与 ${other} 相交`).toBe(false);
    }
  }
}

async function acceptSurface(
  browser: Browser,
  surface: Surface,
  state: StorageState | undefined,
  testInfo: TestInfo,
): Promise<void> {
  for (const viewport of WIDTHS) {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.width <= 500,
      hasTouch: viewport.width <= 500,
      colorScheme: 'dark',
      storageState: state,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
    });
    try {
      const response = await page.goto(surface.path, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      expect(response, `${surface.name} 没返回响应`).not.toBeNull();
      expect(response!.status(), `${surface.name} HTTP 状态`).toBeGreaterThanOrEqual(200);
      expect(response!.status(), `${surface.name} HTTP 状态`).toBeLessThan(400);
      await page.waitForSelector(surface.ready, { timeout: 90_000 });
      if (surface.requires) await page.waitForSelector(surface.requires, { timeout: 90_000 });
      if (surface.observatory) {
        await unlockObservatory(page);
        await page.waitForSelector('[data-pulse-public-trend]', { timeout: 90_000 });
      }
      await page.evaluate(async () => { await document.fonts.ready; });

      expect(await page.evaluate(() => window.innerWidth), '仿真视口宽度必须落地').toBe(viewport.width);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${surface.name}/${viewport.label} 页面级横向溢出`).toBeLessThanOrEqual(1);
      expect(await page.locator('body').innerText(), `${surface.name}/${viewport.label} 不得显示 NaN`).not.toMatch(/\bNaN\b/);
      await expectBlocksInsideViewport(page, surface.blocks, viewport.width);

      if (surface.name === 'home') {
        await expect(page.locator('[data-demo-mode]')).toBeVisible();
        await expect(page.locator('[data-home-quickstart-step]')).toHaveCount(3);
      }
      if (surface.studio) {
        await page.click('[data-fit-canvas]');
        await expect.poll(async () => page.evaluate(() => {
          const surface = document.querySelector('[data-canvas-surface]')!.getBoundingClientRect();
          const frame = document.querySelector('[data-canvas-frame]')!.getBoundingClientRect();
          return frame.left >= surface.left - 1
            && frame.top >= surface.top - 1
            && frame.right <= surface.right + 1
            && frame.bottom <= surface.bottom + 1;
        }), { timeout: 20_000 }).toBe(true);
        if (viewport.width < 1024) {
          const share = await page.evaluate(() => {
            const surface = document.querySelector('[data-canvas-surface]')!.getBoundingClientRect();
            return surface.width / window.innerWidth;
          });
          expect(share, `${surface.name}/${viewport.label} 窄视口画布份额`).toBeGreaterThanOrEqual(0.8);
        }
      }

      expect(errors, `${surface.name}/${viewport.label} 控制台错误：\n${errors.join('\n')}`).toEqual([]);
      const screenshot = testInfo.outputPath(`${surface.name}-${viewport.label}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      console.log(`${surface.name} ${viewport.label}px: overflow=${overflow}px screenshot=${screenshot}`);
    } finally {
      await context.close();
    }
  }
}

test('§HEAD-1 真实首页在 390 / 768 / 1280 下的当前工作树验收', async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  await acceptSurface(browser, surfaces[0]!, memberState, testInfo);
});

test('§HEAD-1 真实 Studio 在 390 / 768 / 1280 下的当前工作树验收', async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  await acceptSurface(browser, surfaces[1]!, memberState, testInfo);
});

test('§HEAD-1 真实公共观测大厅在 390 / 768 / 1280 下的当前工作树验收', async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  await acceptSurface(browser, surfaces[2]!, undefined, testInfo);
});
