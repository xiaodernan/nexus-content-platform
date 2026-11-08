import { expect, test } from '@playwright/test';
import { reusableMemberWithProject } from './support/auth-session';

/**
 * §85 第四十四 / 四十六片：**窄视口下顶栏弹层的读数**（390 与 320）。
 *
 * 多处「仍欠」都指向同一格（第三十六 / 三十八 / 三十九 / 四十 / 四十一 / 四十二 / 四十三片）：
 * "390 下弹层落点与触达尺寸、焦点陷阱"。这一片把它量成读数：
 * 1. 面板整块落进视口（左右都不许越界——`w-[440px]` 在 390 上必然越界）；
 * 2. 面板里的点击目标 ≥24×24（WCAG 2.5.8 下限；输入框按它所在的 `<label>` 量）；
 * 3. 键盘从最后一颗控件按 Tab：这一层不是模态（没有 `aria-modal`），所以**不装焦点陷阱**；
 *    但也不许"焦点跑到面板背后、面板还开着"——离开这一层就收起，焦点回触发键。
 *
 * 320 是最窄的一档（iPhone SE 一代那种宽度）：贴边策略在数学上成立，但数学不等于读数。
 *
 * 会话与项目用同一个夹具账号：注册 / 建项目两道限流不为测试放宽。
 */

const EMAIL = 'popover-mobile+fixture@nexus.test';
const PASSWORD = 'e2e-secret-123';

const PANELS = [
  { name: '发布', slug: 'publish', open: '[data-publish-open]', panel: '[data-publish-panel]', root: '[data-publish-root]' },
  { name: '导出', slug: 'export', open: '[data-export-open]', panel: '[data-export-panel]', root: '[data-export-root]' },
] as const;

const WIDTHS = [390, 320] as const;

test('§85 390/320 弹层：整块落进视口、目标 ≥24、Tab 去向有读数', async ({ page }) => {
  test.setTimeout(360_000);
  const run = Date.now().toString(36);
  const { projectId } = await reusableMemberWithProject(page, EMAIL, PASSWORD, `移动弹层夹具${run}`);
  await page.goto(`/studio/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 120_000 });

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(150);

    for (const spec of PANELS) {
      await page.click(spec.open);
      const panel = page.locator(spec.panel);
      await expect(panel, `${width} ${spec.name}弹层没打开`).toBeVisible({ timeout: 30_000 });

      const box = await panel.boundingBox();
      expect(box, `${width} ${spec.name}弹层量不到矩形`).not.toBeNull();
      const vw = page.viewportSize()!.width;
      const vh = page.viewportSize()!.height;
      console.log(
        `[${width} ${spec.name}] panel x=${box!.x.toFixed(1)} y=${box!.y.toFixed(1)} w=${box!.width.toFixed(1)} h=${box!.height.toFixed(1)} / viewport ${vw}x${vh}`,
      );
      expect(box!.x, `${width} ${spec.name}弹层左侧越出视口 ${(-box!.x).toFixed(1)}px`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${width} ${spec.name}弹层右侧越出视口`).toBeLessThanOrEqual(vw);
      expect(box!.y, `${width} ${spec.name}弹层顶部越出视口`).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height, `${width} ${spec.name}弹层底部越出视口`).toBeLessThanOrEqual(vh);
      const inner = await page.evaluate((selector) => {
        const el = document.querySelector(selector) as HTMLElement | null;
        return el ? { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth } : null;
      }, spec.panel);
      expect(inner, `${width} ${spec.name}弹层量不到内部宽度`).not.toBeNull();
      expect(
        inner!.scrollWidth - inner!.clientWidth,
        `${width} ${spec.name}弹层内部横向滚了 ${inner!.scrollWidth - inner!.clientWidth}px（内容比面板宽，右缘会切字）`,
      ).toBeLessThanOrEqual(2);
      await page.screenshot({ path: `screenshots/popover-${width}-${spec.slug}.png` });

      const small = await page.evaluate((selector) => {
        const root = document.querySelector(selector) as HTMLElement | null;
        if (!root) return null;
        const nodes = Array.from(
          root.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'),
        );
        const out: Array<{ tag: string; label: string; w: number; h: number }> = [];
        for (const el of nodes) {
          const target = (el.closest('label') as HTMLElement | null) ?? el;
          const rect = target.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          if (rect.width < 24 || rect.height < 24) {
            out.push({
              tag: el.tagName.toLowerCase(),
              label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 20),
              w: Math.round(rect.width),
              h: Math.round(rect.height),
            });
          }
        }
        return out;
      }, spec.panel);
      console.log(`[${width} ${spec.name}] <24 目标: ${JSON.stringify(small)}`);
      expect(small, `${width} ${spec.name}弹层里有小于 24×24 的点击目标`).toEqual([]);

      // Tab 去向：把焦点放到面板里最后一颗控件，再按 Tab，看焦点是否还在这个弹层根里
      const tab = await page.evaluate((selector) => {
        const root = document.querySelector(selector) as HTMLElement | null;
        const panel = root?.querySelector('[data-publish-panel], [data-export-panel]') as HTMLElement | null;
        if (!root || !panel) return null;
        const items = Array.from(
          panel.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'),
        ).filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
        const last = items[items.length - 1];
        if (!last) return null;
        last.focus();
        return { count: items.length };
      }, spec.root);
      expect(tab, `${width} ${spec.name}弹层里没有可聚焦控件`).not.toBeNull();
      await page.keyboard.press('Tab');
      const after = await page.evaluate((selector) => {
        const root = document.querySelector(selector) as HTMLElement | null;
        const panel = document.querySelector('[data-publish-panel], [data-export-panel]');
        const el = document.activeElement as HTMLElement | null;
        return {
          inPanel: Boolean(el && panel?.contains(el)),
          onTrigger: Boolean(el && el.matches('[data-publish-open], [data-export-open]')),
          tag: el?.tagName.toLowerCase() ?? null,
          text: (el?.textContent ?? '').trim().slice(0, 16),
          panelStillOpen: Boolean(panel),
          rootExists: Boolean(root),
        };
      }, spec.root);
      console.log(`[${width} ${spec.name}] Tab 之后: ${JSON.stringify(after)}`);
      expect(after.inPanel, `${width} ${spec.name}弹层：Tab 离开后焦点仍在面板里（说好的非模态呢）`).toBe(false);
      expect(after.onTrigger, `${width} ${spec.name}弹层：收起后焦点应当回到触发键`).toBe(true);
      expect(after.panelStillOpen, `${width} ${spec.name}弹层：焦点已经跑到背后，面板却还开着`).toBe(false);

      // 反方向：重开，焦点落在面板第一颗控件，Shift+Tab 回触发键且**不**收起；
      // 再 Shift+Tab 才离开这一层并收起——两腿都要有，否则"离开即收起"只验了一半
      await page.click(spec.open);
      await expect(panel).toBeVisible();
      const firstFocus = await page.evaluate((selector) => {
        const panel = document.querySelector(selector) as HTMLElement | null;
        if (!panel) return null;
        const items = Array.from(
          panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        ).filter((el) => el.getClientRects().length > 0);
        items[0]?.focus();
        return items.length;
      }, spec.panel);
      expect(firstFocus, `${width} ${spec.name}弹层里没有可聚焦控件`).not.toBeNull();
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator(spec.open), `${width} ${spec.name}弹层：Shift+Tab 从第一颗控件应当回到触发键`).toBeFocused();
      await expect(panel, `${width} ${spec.name}弹层：焦点还在这一层里（触发键上），不该收起`).toBeVisible();
      await page.keyboard.press('Shift+Tab');
      await expect(panel, `${width} ${spec.name}弹层：从触发键再 Shift+Tab 就是离开这一层，应当收起`).toHaveCount(0);
      await expect(page.locator(spec.open)).toBeFocused();
    }
  }
});
