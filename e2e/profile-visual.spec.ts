import { expect, test } from '@playwright/test';

/**
 * §FE-5 创作者主页 `/u/<handle>` 的**浏览器那一寸**：陌生人第一次认识一个作者时看到的
 * 那张脸，必须在真浏览器里真的渲染、门面卡片/名字/分区卡都在、零 console error、深/浅双主题
 * 都成立。改前这页是零语义前缀的裸 Tailwind（头像无环、名字纯色、作品卡薄边框、列表贴边），
 * FE-5 只动视觉（`.pf-` 类），结构/文案/`data-*` 钩子/交互逻辑一字未改（§159），这里钉住那条不变式。
 *
 * handle 取的****不是夹具账号**、也不依赖自己的发布状态**：跟 `profile-tasks.spec.ts` 同一条
 * 诚实路径——从发现页上一件**真公开作品**的地址 `/n/<handle>/<slug>` 里取 handle。这样量到的是
 * 访客真正看到的那张脸（不是 `isSelf` 分支），且不编造内容。若发现页此刻没有公开作品，
 * 这里会**跳过**（`test.skip`），绝不把"没数据"伪装成"页面坏了"或假绿。
 *
 * 静态那一寸（类名闭环/零 hex/token 真存在/结构钩子/reduced-motion/focus-visible）归
 * `apps/web/test/profile-style.test.ts`，零浏览器、确定性；这里不重复，只验渲染。
 * 无障碍 axe + 390 布局归既有的 `profile-tasks.spec.ts`，这里也不重复。
 */
async function publicHandle(page: import('@playwright/test').Page): Promise<string | null> {
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
  return /^\/n\/([^/]+)\//.exec(path ?? '')?.[1] ?? null;
}

for (const scheme of ['dark', 'light'] as const) {
  test(`@smoke §FE-5 创作者主页视觉（${scheme}）：门面/作品卡/分区/零 console error`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.emulateMedia({ colorScheme: scheme });
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    });

    const handle = await publicHandle(page);
    test.skip(!handle, '发现页此刻没有公开作品，取不到访客视角的 handle——不假绿也不误报');
    await page.goto(`/u/${handle}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-profile-root]', { timeout: 60_000 });

    // 结构不变式：作者名 / 关注键 / 作品栏都在（FE-5 只动视觉，没碰这些钩子）
    await expect(page.locator('[data-profile-name]')).toBeVisible();
    await expect(page.locator('[data-follow-button]')).toHaveCount(1);
    // 门面 hero 卡、渐变墨字名字、渐变压边都在 DOM 里
    await expect(page.locator('.pf-header')).toBeVisible();
    await expect(page.locator('.pf-name')).toBeVisible();
    // 分区卡：世界 / 角色 双栏各自成 panel，标题带左竖线
    await expect(page.locator('.pf-twin')).toBeVisible();
    await expect(page.locator('.pf-panel').first()).toBeVisible();
    await expect(page.locator('.pf-sectionTitle').first()).toBeVisible();

    // 有公开作品 ⇒ 作品网格 + 卡片 + 焦点描边钩子在；0 件 ⇒ 空态在（空不是坏）
    const works = page.locator('[data-profile-works]');
    if (await works.count()) {
      const card = page.locator('.pf-workCard').first();
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute('href', /.+/);
      await expect(page.locator('.pf-workName').first()).toBeVisible();
    } else {
      await expect(page.locator('[data-profile-empty="works"]')).toBeVisible();
    }

    // 浅色下渐变墨字名字用的是 fg-1 端，必须仍可读（不是白字写白底）
    if (scheme === 'light') {
      const nameColor = await page.locator('.pf-name').evaluate((el) => getComputedStyle(el).color);
      expect(nameColor).not.toBe('rgb(255, 255, 255)');
    }

    expect(consoleErrors, `${scheme} 控制台有报错：\n${consoleErrors.join('\n')}`).toEqual([]);
  });
}
