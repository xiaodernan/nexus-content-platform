import { expect, test, type Page } from '@playwright/test';

/**
 * §FE-8 公开分镜页 `/n/<handle>/<slug>/storyboard` 的**浏览器那一寸**：访客从作品页点"分镜"
 * 进来的镜头表落点，必须在真浏览器里真的渲染、门面 chrome（header 渐变墨字 / 钉住版说明 /
 * back 胶囊 / 三态门面 / 镜头卡裱框）都在、零 console error、深/浅双主题都成立。
 * 改前三个状态（无分镜稿 / 读不出来 / 有镜头表）都是零语义前缀裸 Tailwind；FE-8 只动视觉
 * （`.ss-` 类），结构/文案/`data-storyboard-*` 钩子/读路径/VisitMeter/"不是视频"诚实边界
 * 一字未改（§159 / ADR-0123 六红线）。
 *
 * handle/path 取的**不是夹具账号**：跟 `published-visual.spec.ts` / `play-visual.spec.ts` 同一条
 * 诚实路径——从发现页上一件真公开作品的地址 `/n/<handle>/<slug>` 整条拿来，再拼 `/storyboard`
 * 进访客真正看到的公开分镜页。若发现页此刻没有公开作品，跳过（`test.skip`），绝不把
 * "没数据"伪装成"页面坏了"或假绿。
 *
 * **三态诚实断言**：真语料可能带 storyboardDocument（live）、也可能不带（none）或读不出来
 * （broken）——这里验"页面确实落在三态之一、且那一态的门面完整"，不假设一定有分镜稿、
 * 也不假装空态有镜头表。live 态若真有镜头，验逐镜裱框卡；空镜头表（0 镜）时验 `ss-shotsEmpty`。
 *
 * 静态那一寸（类名闭环/零 hex/token/钩子/reduced-motion/focus/守读路径/层优先级）归
 * `apps/web/test/storyboard-visual-style.test.ts`，零浏览器；这里只验渲染。
 *
 * 探活：显式 `NEXUS_WEB_URL=.../discover`（本机根路径 `/` 曾因后端网关无干净窗口返回 502
 * 令 Playwright webServer 等满 180s；`/discover` 恒 200），所有 goto 为绝对路径不受 baseURL
 * 带 path 影响。跑前请先零删除归档陈旧 `test-results/`（safe-delete 护栏）。
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
  test(`@smoke §FE-8 公开分镜页视觉（${scheme}）：三态门面/零 console error`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.emulateMedia({ colorScheme: scheme });
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    });

    const workPath = await publicWorkPath(page);
    test.skip(!workPath, '发现页此刻没有公开作品，取不到访客视角的公开分镜页地址——不假绿也不误报');
    await page.goto(`${workPath!}/storyboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-storyboard]', { timeout: 60_000 });

    // 三态之一：页面根的门面类必须挂上，且落在 live / none / broken 之一
    await expect(page.locator('.ss-root')).toBeVisible();
    const state = await page.locator('[data-storyboard]').first().getAttribute('data-storyboard');
    expect(['live', 'none', 'broken']).toContain(state);
    await expect(page.locator('.ss-back')).toBeVisible(); // 回到作品页——三态都有
    await expect(page.locator('[data-storyboard-back]')).toBeVisible();

    if (state === 'live') {
      // 有镜头表：header 门面 / 渐变墨字标题 / 钉住版说明 / 镜头来源全在
      await expect(page.locator('.ss-header')).toBeVisible();
      await expect(page.locator('.ss-title')).toBeVisible();
      await expect(page.locator('[data-storyboard-title]')).toBeVisible();
      await expect(page.locator('.ss-pinned')).toBeVisible();
      await expect(page.locator('[data-storyboard-pinned]')).toBeVisible();
      await expect(page.locator('.ss-notice')).toBeVisible(); // "不是视频"诚实边界
      // 有镜头 → 逐镜裱框卡；空镜头表 → 诚实空态（不假设真语料一定有镜头）
      if (await page.locator('[data-storyboard-shot]').count()) {
        await expect(page.locator('.ss-shot').first()).toBeVisible();
        await expect(page.locator('[data-storyboard-shot-meta]').first()).toBeVisible();
        await expect(page.locator('[data-storyboard-shot-prompt]').first()).toBeVisible();
      } else {
        await expect(page.locator('.ss-shotsEmpty')).toBeVisible();
      }
      if (scheme === 'light') {
        // 渐变墨字用 background-clip:text + color:transparent；浅色 fg-1 端必须仍可读
        const image = await page.locator('.ss-title').evaluate((el) => getComputedStyle(el).backgroundImage);
        const color = await page.locator('.ss-title').evaluate((el) => getComputedStyle(el).color);
        expect(image, '浅色下标题渐变墨字丢了').toContain('gradient');
        expect(color).toBe('rgba(0, 0, 0, 0)'); // background-clip:text 的透明字是预期，不是 bug
      }
    } else {
      // 空态 / 读不出来态：门面卡在、诚实文案在，绝不冒充有镜头表（无 .ss-title）
      await expect(page.locator('.ss-empty')).toBeVisible();
      await expect(page.locator('.ss-emptyTitle')).toBeVisible();
      await expect(page.locator('[data-storyboard]')).toHaveAttribute('data-storyboard', state!);
      if (state === 'broken') {
        await expect(page.locator('[data-storyboard-issue]').first()).toBeVisible();
      }
    }

    expect(consoleErrors, `${scheme} 控制台有报错：\n${consoleErrors.join('\n')}`).toEqual([]);
  });
}
