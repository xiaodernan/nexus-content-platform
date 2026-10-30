import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { loginMemberIfPossible, reusableMemberWithProject } from './support/auth-session';

/**
 * §85 移动端体检的第二片：**应用外壳**在 390 下有没有读数。
 *
 * 第十三片只量了公开作品页，量到的是"设计稿按绝对像素铺进可平移容器"这件事
 * （帧宽 1440、首屏可见 27%、要平移 1082px）。那是**作品**的投影，本来就不该跟着视口变。
 * 真正该跟着视口变的是**应用外壳**：发现页的卡片栏、市场页的列表、Studio 的三栏。
 * 这些从来没有在窄视口下量过（26 个 e2e 文件全跑 1280×720）。
 *
 * 这一片只**记读数**，不断言阈值（与第十三片同一条纪律）：
 * - **页面级**横向溢出（`documentElement.scrollWidth - clientWidth`）：外壳上出现这个数就是缺陷，
 *   它不像作品帧那样有理由横向平移；
 * - 溢出得最远的那个元素（点名，便于下一片去修）；
 * - 可横向滚动的容器（外壳里出现"要平移才看得全"的列表，也是缺陷的形状）；
 * - 小于 24×24 的可见点击目标（WCAG 2.5.8 的下限，这一片仍只量不判）。
 *
 * 四条"真的量到了"的门（与第十三片一致）：仿真落地（`innerWidth` 等于请求宽度）、
 * 载体渲染出来（各自的地标元素在）、读数非空、点击目标名册 ≥1。
 *
 * admin 那一路要本地夹具（`npm run e2e:admin-fixture`）。本机没有夹具时这一路**记"未测"**，
 * 不降级成"测一下拒绝页"——拒绝页的布局不是管理台的布局。
 */

const MEMBER = 'viewer+fixture@nexus.test';
const SECRET = 'e2e-secret-123';
const ADMIN = 'obs-admin+fixture@nexus.test';

const WIDTHS = [
  { label: '手机390', width: 390, height: 844, mobile: true },
  { label: '桌面1280', width: 1280, height: 900, mobile: false },
] as const;

const TARGET_MIN = 24;

interface Surface {
  name: string;
  path: string;
  /** 地标：这个选择器在，说明页面真的渲染出来了（不是 404、不是"没有权限"） */
  landmark: string;
  /**
   * 水合屏障：等它出现才量。Studio 的 SSR 只有一句「载入项目…」（[data-studio-status]），
   * 面板要等客户端把文档取回来才挂上——没等它，量到的就是骨架（第一次跑真的量成了
   * "1 个点击目标"，那不是 Studio 的读数）。
   */
  ready: string;
  as: 'guest' | 'member' | 'admin';
  /**
   * 这一面是否把「0 个 <24px 点击目标」当门（WCAG 2.5.8）。
   * 发现／市场／管理台：是——第二十五片量到的 1/1/7 个已在 2026-10-30 修掉。
   * Studio：否——画布右上角那组 12–20px 的缩放/视图小按钮是**已登记的欠账**
   * （第二十五片记的），门只会把已知缺陷重复报一遍；等它的控件重做后再挂门。
   */
  smallTargetGate: boolean;
}

interface Reading {
  innerWidth: number;
  dpr: number;
  overflowX: number;
  overflowEl: { tag: string; label: string; px: number } | null;
  pannable: { label: string; px: number }[];
  clipped: { label: string; px: number }[];
  targetTotal: number;
  smallTargets: { label: string; w: number; h: number }[];
  landmark: boolean;
}

/** 一次量完。函数体整个进 `page.evaluate`，所以只能用 DOM 与内联常量。 */
async function measure(page: Page, landmark: string, targetMin: number): Promise<Reading> {
  return page.evaluate(({ landmark: sel, targetMin: min }) => {
    const doc = document.documentElement;
    const vw = window.innerWidth;
    const label = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18);
      return text ? `${tag}(${text})` : tag;
    };
    let worst: { tag: string; label: string; px: number } | null = null;
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const over = Math.round(r.right - vw);
      if (over > 0 && (!worst || over > worst.px)) worst = { tag: el.tagName.toLowerCase(), label: label(el), px: over };
    }
    const pannable: { label: string; px: number }[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowX)) continue;
      const over = el.scrollWidth - el.clientWidth;
      if (over > 2) pannable.push({ label: label(el), px: over });
    }
    const clipped: { label: string; px: number }[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const cs = getComputedStyle(el);
      if (!/(hidden|clip)/.test(cs.overflowX)) continue;
      const over = el.scrollWidth - el.clientWidth;
      if (over > 2) clipped.push({ label: label(el), px: over });
    }
    const interactive = Array.from(
      document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[tabindex]:not([tabindex="-1"])'),
    ).filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    });
    const smallTargets = interactive
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { label: label(el), w: Math.round(r.width), h: Math.round(r.height), min: Math.min(r.width, r.height) };
      })
      .filter((t) => t.min < min)
      .map(({ label: l, w, h }) => ({ label: l, w, h }));
    return {
      innerWidth: vw,
      dpr: window.devicePixelRatio,
      overflowX: Math.max(0, doc.scrollWidth - doc.clientWidth),
      overflowEl: worst,
      pannable,
      clipped,
      targetTotal: interactive.length,
      smallTargets,
      landmark: Boolean(document.querySelector(sel)),
    };
  }, { landmark, targetMin });
}

async function contextAt(browser: Browser, w: (typeof WIDTHS)[number], state?: Awaited<ReturnType<BrowserContext['storageState']>>) {
  return browser.newContext({
    viewport: { width: w.width, height: w.height },
    isMobile: w.mobile,
    hasTouch: w.mobile,
    deviceScaleFactor: w.mobile ? 2 : 1,
    colorScheme: 'dark',
    storageState: state,
  });
}

function fmt(name: string, r: Reading): string {
  const el = r.overflowEl ? `${r.overflowEl.tag}(${r.overflowEl.label})+${r.overflowEl.px}px` : '无';
  const pan = r.pannable.map((b) => `${b.label}+${b.px}px`).join(', ') || '无';
  const clip = r.clipped.map((b) => `${b.label}+${b.px}px`).join(', ') || '无';
  const small = r.smallTargets.map((t) => `${t.label} ${t.w}×${t.h}`).join(', ') || '无';
  return (
    `  ${name} ${r.innerWidth}px dpr=${r.dpr} · 页面级横向溢出 ${r.overflowX}px · 溢出最远的元素 ${el}\n` +
    `    可横滚容器：${pan}\n` +
    `    滚不动的裁切：${clip}\n` +
    `    点击目标 ${r.targetTotal} 个，其中 <${TARGET_MIN}px 的 ${r.smallTargets.length} 个：${small}`
  );
}

test('§85 移动端体检第二片：应用外壳（发现／市场／Studio／管理台）在 390 下的读数', async ({ page, browser }) => {
  test.setTimeout(900_000);

  const surfaces: Surface[] = [
    { name: '发现', path: '/discover', landmark: '[data-discover-grid]', ready: '[data-discover-grid]', as: 'guest', smallTargetGate: true },
    { name: '市场', path: '/marketplace', landmark: '[data-marketplace-list]', ready: '[data-marketplace-list]', as: 'guest', smallTargetGate: true },
  ];

  // member：Studio 要一个自己名下的项目
  const member = await reusableMemberWithProject(page, MEMBER, SECRET, '窄视口体检夹具');
  surfaces.push({
    name: 'Studio',
    path: `/studio/${member.projectId}`,
    landmark: '[data-studio-root]',
    ready: '[data-panel-tab]',
    as: 'member',
    smallTargetGate: false,
  });
  const memberState = await page.context().storageState();

  // admin：本机没有夹具就记"未测"，不去量拒绝页冒充管理台
  const adminPage = await browser.newPage({ storageState: undefined });
  const adminOk = await loginMemberIfPossible(adminPage, ADMIN, SECRET);
  const adminState = adminOk ? await adminPage.context().storageState() : null;
  await adminPage.close();
  if (adminState) surfaces.push({
    name: '管理台',
    path: '/admin/moderation',
    landmark: '[data-admin-queue], [data-admin-denied]',
    ready: '[data-admin-queue], [data-admin-denied]',
    as: 'admin',
    smallTargetGate: true,
  });

  const report: string[] = [];
  const rows: string[] = [];
  for (const surface of surfaces) {
    report.push(`\n${surface.name} ${surface.path}`);
    for (const w of WIDTHS) {
      const state = surface.as === 'member' ? memberState : surface.as === 'admin' ? adminState! : undefined;
      const context = await contextAt(browser, w, state);
      const tab = await context.newPage();
      try {
        const res = await tab.goto(surface.path, { waitUntil: 'domcontentloaded' });
        expect(res, `${surface.name} 没返回响应`).not.toBeNull();
        await tab.waitForSelector(surface.landmark, { timeout: 60_000 });
        await tab.waitForSelector(surface.ready, { timeout: 90_000 });
        const reading = await measure(tab, surface.landmark, TARGET_MIN);
        expect(reading.innerWidth, `${surface.name}/${w.label}：仿真没落地（页面自报 ${reading.innerWidth}，请求 ${w.width}）`).toBe(w.width);
        expect(reading.landmark, `${surface.name}/${w.label}：地标 ${surface.landmark} 不在`).toBe(true);
        expect(reading.targetTotal, `${surface.name}/${w.label}：一个点击目标都没有，0 不等于 0 个缺陷`).toBeGreaterThan(0);
        if (surface.smallTargetGate) {
          expect(
            reading.smallTargets.map((t) => `${t.label} ${t.w}×${t.h}`),
            `${surface.name}/${w.label}：还有 <${TARGET_MIN}px 的点击目标（WCAG 2.5.8 的下限是 24×24）`,
          ).toHaveLength(0);
        }
        report.push(fmt(`${surface.name}/${w.label}`, reading));
        rows.push(
          `${surface.name} ${w.label}: 溢出 ${reading.overflowX}px · 横滚 ${reading.pannable.length} 处 · 裁切 ${reading.clipped.length} 处 · <24px ${reading.smallTargets.length} 个`,
        );
      } catch (error) {
        report.push(fmt(`${surface.name}/${w.label}`, {
          innerWidth: w.width, dpr: 0, overflowX: -1, overflowEl: null, pannable: [], clipped: [], targetTotal: 0,
          smallTargets: [], landmark: false,
        }) + `\n    ✗ ${(error as Error).message.split('\n')[0]}`);
        throw error;
      } finally {
        await tab.close();
        await context.close();
      }
    }
  }
  if (!adminState) report.push('\n管理台：未测（本机没有 admin 夹具，先跑 npm run e2e:admin-fixture）');

  console.log(report.join('\n'));
  console.log('\n----- 汇总 -----\n' + rows.join('\n'));
});
