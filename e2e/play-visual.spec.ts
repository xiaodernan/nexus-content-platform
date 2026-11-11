import { expect, test, type Page } from '@playwright/test';

/**
 * §FE-7 公开试玩页 `/n/<handle>/<slug>/play` 的**浏览器那一寸**：访客从作品页点"试玩"进来的
 * 第一张脸、游戏作品的核心体验落点，必须在真浏览器里真的渲染、门面 chrome（header 渐变墨字 /
 * 钉住版说明 / back 胶囊 / 三态门面）都在、零 console error、深/浅双主题都成立。
 * 改前三个状态（无内容 / 读不出来 / 可玩）都是零语义前缀裸 Tailwind；FE-7 只动视觉（`.pp-` 类），
 * 结构/文案/`data-play-*` 钩子/读路径/PublicPlay 游戏本体/VisitMeter 一字未改（§159）。
 *
 * handle/path 取的**不是夹具账号**：跟 `published-visual.spec.ts` 同一条诚实路径——从发现页上一件
 * 真公开作品的地址 `/n/<handle>/<slug>` 整条拿来，再拼 `/play` 进访客真正看到的试玩页。若发现页
 * 此刻没有公开作品，跳过（`test.skip`），绝不把"没数据"伪装成"页面坏了"或假绿。
 *
 * **三态诚实断言**：真语料可能带 gameDocument（live）、也可能不带（none）或读不出来（broken）——
 * 这里验"页面确实落在三态之一、且那一态的门面完整"，不假设一定有可玩内容、也不假装空态有游戏。
 *
 * 静态那一寸（类名闭环/零 hex/token/钩子/reduced-motion/focus/守读路径/层优先级）归
 * `apps/web/test/play-visual-style.test.ts`，零浏览器；这里只验渲染。
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
  test(`@smoke §FE-7 公开试玩页视觉（${scheme}）：三态门面/零 console error`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.emulateMedia({ colorScheme: scheme });
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    });

    const workPath = await publicWorkPath(page);
    test.skip(!workPath, '发现页此刻没有公开作品，取不到访客视角的试玩页地址——不假绿也不误报');
    await page.goto(`${workPath!}/play`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-play]', { timeout: 60_000 });

    // 三态之一：页面根的门面类必须挂上，且落在 live / none / broken 之一
    await expect(page.locator('.pp-root')).toBeVisible();
    const state = await page.locator('[data-play]').first().getAttribute('data-play');
    expect(['live', 'none', 'broken']).toContain(state);
    await expect(page.locator('.pp-back')).toBeVisible(); // 回到作品页——三态都有
    await expect(page.locator('[data-play-back]')).toBeVisible();

    if (state === 'live') {
      // 可玩态：header 门面 / 渐变墨字标题 / 钉住版说明 / 子标题全在
      await expect(page.locator('.pp-header')).toBeVisible();
      await expect(page.locator('.pp-title')).toBeVisible();
      await expect(page.locator('[data-play-title]')).toBeVisible();
      await expect(page.locator('.pp-pinned')).toBeVisible();
      await expect(page.locator('[data-play-pinned]')).toBeVisible();
      if (scheme === 'light') {
        // 渐变墨字用 background-clip:text + color:transparent；浅色 fg-1 端必须仍可读
        const image = await page.locator('.pp-title').evaluate((el) => getComputedStyle(el).backgroundImage);
        const color = await page.locator('.pp-title').evaluate((el) => getComputedStyle(el).color);
        expect(image, '浅色下标题渐变墨字丢了').toContain('gradient');
        expect(color).toBe('rgba(0, 0, 0, 0)'); // background-clip:text 的透明字是预期，不是 bug
      }
    } else {
      // 空态 / 读不出来态：门面卡在、诚实文案在，绝不冒充有游戏（无 .pp-title）
      await expect(page.locator('.pp-empty')).toBeVisible();
      await expect(page.locator('.pp-emptyTitle')).toBeVisible();
      await expect(page.locator('[data-play]')).toHaveAttribute('data-play', state!);
      if (state === 'broken') {
        await expect(page.locator('[data-play-issue]').first()).toBeVisible();
      }
    }

    expect(consoleErrors, `${scheme} 控制台有报错：\n${consoleErrors.join('\n')}`).toEqual([]);
  });
}
