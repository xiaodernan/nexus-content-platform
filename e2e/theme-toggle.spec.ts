import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { reusableMemberWithProject } from './support/auth-session';
import { keyboardWalk, tabTo, type WalkOptions } from './support/keyboard-walk';

/**
 * §120 主题入口的浏览器见证。
 *
 * 三件事必须一起成立，否则"支持浅色"就只是 tokens.css 里的一堆十六进制：
 * ① 点一下真的换（`data-nexus-theme` + body 的计算底色）；
 * ② 刷新后还记得（显式选择写进 localStorage，首帧脚本读回来）；
 * ③ 没存过时跟随系统（light 系统第一次进来就是浅色）。
 *
 * 点击前等 `data-theme-toggle-ready="1"`：这是 React 真接住事件的屏障，
 * 只等按钮可见会点到"还没水合"的空壳上（本仓 2026-10-28 的固定坑）。
 */
test('§120 主题切换：显式选择覆盖系统偏好、跨刷新记住', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const toggle = page.locator('[data-theme-toggle]');
  await expect(toggle).toHaveAttribute('data-theme-toggle-ready', '1', { timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('data-nexus-theme', 'dark');

  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-nexus-theme', 'light');
  await expect(toggle).toHaveAttribute('data-theme-toggle', 'light');
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(lightBg, '换了属性但底色没跟着翻——浅色没有落到像素上').toBe('rgb(247, 248, 251)');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-nexus-theme', 'light');
  await expect(page.locator('[data-theme-toggle]')).toHaveAttribute('data-theme-toggle-ready', '1', { timeout: 30_000 });

  await page.locator('[data-theme-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-nexus-theme', 'dark');
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(darkBg).toBe('rgb(10, 11, 16)');
  // 首帧脚本会先于 React 改 html 属性；没有 suppressHydrationWarning 时这里会红在 hydration mismatch 上。
  expect(consoleErrors.filter((t) => /hydrat/i.test(t)), consoleErrors.join('\n')).toEqual([]);
});

test('§120 首次访问跟随系统偏好（浅色系统 → 浅色）', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-nexus-theme', 'light');
  await expect(page.locator('[data-theme-toggle]')).toHaveAttribute('data-theme-toggle-ready', '1', { timeout: 30_000 });
});

const require = createRequire(process.cwd() + '/package.json');
const AXE_PATH = require.resolve('axe-core/axe.min.js');
const TOKENS = 'apps/web/src/styles/tokens.css';

/** 从 tokens.css 现读一个 token 的字面值，转成浏览器给的 `rgb(...)`——单一真值留在 token 层。 */
function tokenRgb(selector: string, name: string): string {
  const css = readFileSync(TOKENS, 'utf8');
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`${TOKENS} 里找不到 ${selector}，这一片没有前提`);
  const literal = css.slice(start).match(new RegExp(`--nexus-color-${name}:\\s*#([0-9a-fA-F]{6})`))?.[1];
  if (!literal) throw new Error(`${TOKENS} 的 ${selector} 里读不到 --nexus-color-${name}，这一片没有前提`);
  const n = Number.parseInt(literal, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

const EXPECTED = {
  dark: { bg: tokenRgb(':root', 'bg-0'), fg: tokenRgb(':root', 'fg-1') },
  light: { bg: tokenRgb("[data-nexus-theme='light']", 'bg-0'), fg: tokenRgb("[data-nexus-theme='light']", 'fg-1') },
} as const;

interface AxeResults {
  violations: Array<{
    id: string;
    impact: string | null;
    help: string;
    nodes: Array<{ target: string[]; failureSummary?: string }>;
  }>;
  passes: Array<{ id: string }>;
  inapplicable: Array<{ id: string }>;
}

async function axeScan(page: Page): Promise<AxeResults> {
  await page.addScriptTag({ path: AXE_PATH });
  return await page.evaluate(async (): Promise<AxeResults> => {
    const axe = (window as unknown as { axe: { run(...args: unknown[]): Promise<AxeResults> } }).axe;
    if (!axe) throw new Error('axe 没有加载进页面');
    return await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      // Next 的开发工具 portal 不是本平台的界面（它由 dev server 注入，生产构建里没有）
      exclude: [['nextjs-portal']],
    });
  });
}

interface ThemeProbe {
  attr: string | null;
  bg: string;
  color: string;
  samples: Array<{ sel: string; fg: string; bg: string; author: boolean; ratio: number }>;
}

/** 浏览器给的 `rgb(...)` → WCAG 相对亮度 → 对比度。与 `style-tokens.test.ts` 同一把尺子。 */
function contrast(fg: string, bg: string): number {
  const lum = (css: string): number => {
    const [r, g, b] = css.match(/\d+/g)!.slice(0, 3).map(Number) as [number, number, number];
    const ch = (v: number): number => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  };
  const a = lum(fg);
  const b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * 主题**真落到了像素上**没有。取样取的是带文字的元素，取它沿祖先链第一个不透明的底色——
 * 浏览器算对比度就是这么找的，不是拿 token 猜的。
 *
 * 公开页上有一件必须分开看的事：作者投影出来的子树（`[data-published-root]` 里）颜色是
 * 设计稿自带的，**不该**随平台主题翻；拿"没有暗底"去判它会红在作者的设计上（§159：
 * 读数要归给该归的人）。所以每个取样点带 `author` 标记，平台壳的元素才参与 stale 判据。
 */
async function themeProbe(page: Page): Promise<ThemeProbe> {
  const raw = await page.evaluate(() => {
    const background = (el: Element): string => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const c = getComputedStyle(node).backgroundColor;
        if (c && c !== 'transparent' && !/rgba\([^)]*,\s*0\s*\)/.test(c)) return c;
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    const text = Array.from(
      document.querySelectorAll<HTMLElement>('a[href], button, label, input, select, h1, h2, h3, p, li, span, td'),
    )
      .filter((el) => (el.textContent ?? '').trim().length >= 2)
      .slice(0, 60);
    return {
      attr: document.documentElement.getAttribute('data-nexus-theme'),
      bg: getComputedStyle(document.body).backgroundColor,
      color: getComputedStyle(document.body).color,
      samples: text.map((el) => ({
        sel: `${el.tagName.toLowerCase()} ${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 14)}`,
        fg: getComputedStyle(el).color,
        bg: background(el),
        author: el.closest('[data-published-root]') !== null,
        ratio: 0,
      })),
    };
  });
  return { ...raw, samples: raw.samples.map((s) => ({ ...s, ratio: contrast(s.fg, s.bg) })) };
}

/** 把显式选择写进 localStorage——走产品自己的持久化入口，不替产品改 html 属性。 */
async function storeTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.evaluate((t) => localStorage.setItem('nexus-theme', t), theme);
}

/**
 * §120 主题在**三张面**上的浏览器见证：暗/浅 × 首页／Studio／公开作品页，每张两道门。
 *
 * 为什么需要这一片：入口那一条只证了"首页点一下会换、刷新还记得"，而浅色要成为
 * 一个可交付的主题，得在**登录后界面**与**真实发布出来的作品页**上同时成立——
 * 前者是创作者一整天待着的地方，后者是唯一对外的那张脸。前两片的浅色也只扫了
 * 游客五张与（本片顺带补的）登录后九张，公开作品页在浅色下从没被量过。
 *
 * 两道门，判据与既有 §85 系列逐字同源：
 * ① **axe**：结构不变式只有三条——扫描不是空转（passes > 0）、没有 critical、
 *    主题真的落到了像素上（属性 + body 的底色/文字 + 取样元素里不许有没翻过来的平台壳）。
 *    违规条数是读数，不是保证；一律打印并抄进 docs/EVALUATION.md。
 * ② **键盘**：`keyboardWalk` 的七道门（非空转／点名在册／无陷阱／覆盖／顺序／焦点可见／停留点有归属），
 *    外加**切换键真的按得响**——Tab 走得到 `[data-theme-toggle]`（覆盖门已经在证明这件事），
 *    再按 Enter 与 Space 各一次，主题与像素都得真的翻过去再翻回来。
 *
 * 会话与项目复用夹具账号（注册 10 次/小时、建项目 20 次/小时，`docs/ENVIRONMENT.md`）；
 * 公开页用**真发布**出来的地址，不拿 `/preview` 冒充访客看到的那张。
 */
test('§120 暗/浅 × 首页／Studio／公开页：axe 结构门 + 键盘六门 + 切换键真的翻', async ({ page, browser }) => {
  test.setTimeout(900_000);
  const RUN = Date.now().toString(36);
  const { projectId } = await reusableMemberWithProject(page, 'theme-witness@nexus.test', 'e2e-secret-123', `主题见证样板${RUN}`);

  // 真发布（公开）：公开页扫的就是发布那一刻的快照，与访客看到的完全同源
  await page.goto(`/studio/${projectId}`);
  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-submit]')).toBeVisible();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 90_000 });
  const publishedPath = (await page.locator('[data-publish-url]').getAttribute('href'))!;

  // 公开页用**匿名访客**的上下文：登录态看同一张页会多出作者自己的东西，
  // 那样的 axe 读数不是访客看到的那张（第二片就是这么分开量的）
  const visitor = await browser.newContext().then((c) => c.newPage());
  await visitor.goto('/');

  const SURFACES: Array<{ label: string; path: string; ready: string; require: string[]; anonymous?: boolean }> = [
    // 点名要点的是"这一张上不许退化成鼠标专用"的控件；切换键在三张面上都必须走得到
    { label: '首页', path: '/', ready: '[data-auth-identity]', require: ['data-project-name-input=', 'data-theme-toggle='] },
    { label: 'Studio', path: `/studio/${projectId}`, ready: '[data-canvas-frame]', require: ['data-panel-tab=', 'data-theme-toggle='] },
    { label: '公开作品页', path: publishedPath, ready: '[data-published-root]', require: ['data-theme-toggle='], anonymous: true },
  ];

  const rows: Array<{ label: string; theme: string; passes: number; violations: number; critical: number; contrastNodes: number; population: number; reached: number }> = [];
  const failures: string[] = [];

  for (const surface of SURFACES) {
    for (const theme of ['dark', 'light'] as const) {
      const target = surface.anonymous ? visitor : page;
      await storeTheme(target, theme);
      await target.goto(surface.path);
      const ready = await target
        .waitForSelector(surface.ready, { timeout: 60_000 })
        .then(() => true)
        .catch(() => false);
      expect(ready, `${surface.label}（${theme}）没渲染出 ${surface.ready}——这一张根本没被量到`).toBe(true);

      const probe = await themeProbe(target);
      const expected = EXPECTED[theme];
      const stale = theme === 'light' ? probe.samples.filter((s) => !s.author && s.bg === EXPECTED.dark.bg) : [];
      if (probe.attr !== theme || probe.bg !== expected.bg || probe.color !== expected.fg || probe.samples.length === 0) {
        failures.push(
          `${surface.label}（${theme}）：主题没落到像素上（attr=${probe.attr} · body 底色=${probe.bg} 期望 ${expected.bg} · ` +
            `文字=${probe.color} 期望 ${expected.fg} · 取样 ${probe.samples.length} 个带文字元素）`,
        );
      }
      if (stale.length) {
        failures.push(`${surface.label}（浅色）：平台壳里还有 ${stale.length} 个元素压在暗底 ${EXPECTED.dark.bg} 上（${stale.map((s) => s.sel).join(' | ')}）`);
      }
      const worst = probe.samples.reduce<(typeof probe.samples)[number] | null>(
        (min, s) => (min === null || s.ratio < min.ratio ? s : min),
        null,
      );
      if (worst) {
        console.log(`\n  【${surface.label}（${theme}）】取样 ${probe.samples.length} 个带文字元素，浏览器里量到的最低对比度 ${worst.ratio.toFixed(2)}:1（${worst.sel}）`);
      }

      const r = await axeScan(target);
      const critical = r.violations.filter((v) => v.impact === 'critical').length;
      const contrastNodes = r.violations.filter((v) => v.id === 'color-contrast').reduce((sum, v) => sum + v.nodes.length, 0);
      console.log(`\n  【${surface.label}（${theme}）】通过 ${r.passes.length} · 违规 ${r.violations.length} · critical ${critical} · 对比度不合格节点 ${contrastNodes}`);
      for (const v of r.violations) {
        console.log(`      - ${v.id}（${v.nodes.length}）：${v.help}`);
        for (const n of v.nodes.slice(0, 6)) console.log(`          target: ${n.target.join(' ')}`);
        if (v.nodes.length > 6) console.log(`          … 其余 ${v.nodes.length - 6} 个节点略`);
      }
      if (r.passes.length === 0) failures.push(`${surface.label}（${theme}）：passes=0（inapplicable=${r.inapplicable.length}）⇒ 扫描可能在空转`);
      if (critical > 0) failures.push(`${surface.label}（${theme}）：critical 违规 ${critical} 类`);

      // 键盘门：七道结构门 + 切换键
      const walkOptions: WalkOptions = {
        label: `${surface.label}（${theme} · 只用键盘）`,
        root: 'body',
        require: surface.require,
      };
      const walk = await keyboardWalk(target, walkOptions);
      const toggleKey = walk.population.find((k) => k.includes('data-theme-toggle='))!;
      const onToggle = await tabTo(target, walkOptions, toggleKey, walk.population.length * 2 + 4);
      expect(onToggle, `${surface.label}（${theme}）：Tab 走不到主题切换键 ${toggleKey} ⇒ 只用键盘的人换不了主题`).toBe(true);

      // 切换键真的按得响：Enter 翻过去，Space 翻回来——两件事都要有像素读数，不能只看属性
      for (const [key, to] of [['Enter', theme === 'dark' ? 'light' : 'dark'], ['Space', theme]] as const) {
        await target.keyboard.press(key);
        await expect(target.locator('html'), `${surface.label}（${theme}）：按 ${key} 后主题没翻`).toHaveAttribute('data-nexus-theme', to, { timeout: 10_000 });
        const flipped = await target.evaluate(() => getComputedStyle(document.body).backgroundColor);
        expect(flipped, `${surface.label}（${theme}）：按 ${key} 后属性翻了但底色没跟着翻`).toBe(EXPECTED[to].bg);
      }

      rows.push({
        label: surface.label,
        theme,
        passes: r.passes.length,
        violations: r.violations.length,
        critical,
        contrastNodes,
        population: walk.population.length,
        reached: walk.reached.length,
      });
    }
  }

  console.log(`\n== §120 主题的三张面读数（暗/浅 × 首页／Studio／公开作品页 · axe WCAG A+AA · 键盘六门 + 切换键） ==`);
  console.log('  界面 | 主题 | axe 通过 | 违规 | critical | 对比度不合格节点 | 可聚焦分母 | Tab 命中');
  for (const row of rows) {
    console.log(`  ${row.label} | ${row.theme} | ${row.passes} | ${row.violations} | ${row.critical} | ${row.contrastNodes} | ${row.population} | ${row.reached}`);
  }
  expect(failures, `结构不变式红在：\n${failures.join('\n')}`).toEqual([]);
});
