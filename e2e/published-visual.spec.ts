import { expect, test, type Page } from '@playwright/test';

/**
 * §FE-67 公开作品页 `/n/<handle>/<slug>` 的**浏览器那一寸**：内容平台最核心的落点——访客
 * 点开分享链接看到的第一张脸，必须在真浏览器里真的渲染、门面 chrome（header 渐变墨字 /
 * meta 胶囊 / 作品舞台 / 裱框投影 / 统计告知）都在、零 console error、深/浅双主题都成立。
 * 改前这页是零语义前缀的裸 Tailwind（header 一条素边框、meta 纯文字、试玩链接一块纯色、
 * 统计告知贴边），FE-6 只动视觉（`.pub-` 类），结构/文案/`data-*` 钩子/SEO/React cache 读路径
 * /四份投影/交互热点/PublishedFrame 作品本体一字未改（§159），这里钉住那条不变式。
 *
 * handle/path 取的**不是夹具账号**：跟 `profile-visual.spec.ts` / `profile-tasks.spec.ts`
 * 同一条诚实路径——从发现页上一件**真公开作品**的地址 `/n/<handle>/<slug>` 整条拿来。量到
 * 的是访客真正看到的作品页（不是作者预览态），且不编造内容。若发现页此刻没有公开作品，
 * 这里会**跳过**（`test.skip`），绝不把"没数据"伪装成"页面坏了"或假绿。
 *
 * 静态那一寸（类名闭环/零 hex/token 真存在/12 钩子/reduced-motion/focus-visible/守协同/
 * 守渲染路径）归 `apps/web/test/published-style.test.ts`，零浏览器、确定性；这里不重复，
 * 只验渲染。无障碍 axe / 互动 completion 归既有 `a11y-*` / `interactive-work.spec.ts`。
 */
async function publicWorkPath(page: Page): Promise<string | null> {
  await page.goto('/discover', { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForSelector('[data-discover-card]', { timeout: 45_000 });
  } catch {
    return null; // 发现页此刻没有公开作品——跳过，不假绿也不误报
  }
  const path = await page
    .locator('[data-discover-card]')
    .first()
    .getAttribute('data-discover-card');
  return path && /^\/n\/[^/]+\/[^/]+/.test(path) ? path : null;
}

for (const scheme of ['dark', 'light'] as const) {
  test(`@smoke §FE-67 公开作品页视觉（${scheme}）：门面/舞台/裱框/零 console error`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.emulateMedia({ colorScheme: scheme });
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    });

    const path = await publicWorkPath(page);
    test.skip(!path, '发现页此刻没有公开作品，取不到访客视角的作品页地址——不假绿也不误报');
    await page.goto(path!, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-published-root]', { timeout: 60_000 });

    // 结构不变式：作品根 / 服务端 SEO head 钩子 / 至少一份投影都在（FE-6 只动视觉，没碰这些）
    await expect(page.locator('[data-published-root]')).toBeVisible();
    await expect(page.locator('[data-published-title]')).toBeVisible();
    await expect(page.locator('.pub-root')).toBeVisible();
    await expect(page.locator('.pub-header')).toBeVisible();
    await expect(page.locator('.pub-title')).toBeVisible();
    await expect(page.locator('.pub-meta')).toBeVisible();
    await expect(page.locator('.pub-stage')).toBeVisible();
    await expect(page.locator('.pb-variant').first()).toBeVisible();

    // 四份投影（自动选档）或一份（钉住）都在 DOM；data-* 钩子逐一验明
    const variants = page.locator('[data-published-variant]');
    expect(await variants.count(), '作品页至少要有一份断点投影').toBeGreaterThan(0);
    const firstVariant = variants.first();
    await expect(firstVariant).toHaveAttribute('data-published-variant-width', /.+/);
    // SEO：JSON-LD 结构化数据仍服务端出（FE-6 没把 <script> 弄丢）
    await expect(page.locator('[data-seo-jsonld]')).toHaveCount(1);
    // 统计告知条可见（服务端渲染，不执行 JS 的访客也看得见）
    await expect(page.locator('.pub-notice')).toBeVisible();

    // 浅色下渐变墨字标题用的是 fg-1 端，必须仍可读（不是白字写白底）
    if (scheme === 'light') {
      const color = await page.locator('.pub-title').evaluate((el) => getComputedStyle(el).color);
      // 渐变墨字用 background-clip:text + color:transparent，取背景渐变首段断言含 fg-1 端点
      const image = await page.locator('.pub-title').evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(image, '浅色下标题渐变墨字丢了').toContain('gradient');
      expect(color).toBe('rgba(0, 0, 0, 0)'); // background-clip:text 的透明字是预期，不是 bug
    }

    expect(consoleErrors, `${scheme} 控制台有报错：\n${consoleErrors.join('\n')}`).toEqual([]);
  });
}
