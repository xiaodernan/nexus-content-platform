import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

/**
 * §85 第八片：**浅色主题第一次在真浏览器里被扫**。
 *
 * 为什么要这一片：第五片留下的两条账都指向同一句话——
 * ①「浅色主题至今没有任何浏览器门（axe 只跑暗色），它现在只有 token 层的字面值门兜着」；
 * ②「强调色当文字在浅色下塌成 1.46／1.64／2.72」那 194 处，当时是靠 tokens.css 的算式说的，
 * 不是靠渲染出来的像素。这一片把那句话换成读数：同一套 axe、同一判据，跑在浅色的真页面上。
 *
 * 与第四片的三点不同：
 * 1. **载体只用游客能看到的页**（首页／发现／市场／搜索／组件库）。注册 10 次/小时、
 *    建项目 20 次/小时（`docs/ENVIRONMENT.md`），而这一片要量的缺陷与登录态无关，
 *    花那个名额等于把后面几片的预算先吃掉。
 * 2. 多一道**前提门**：浅色没真的生效就判红。产品里没有任何入口把主题写到 dark 以外
 *    （`app/layout.tsx` 钉死），所以浅状态是测试替它设的 `data-nexus-theme`——
 *    没有这道门，一次"属性设上了但 token 没跟着翻"会扫出一版暗色读数并被记成浅色的，
 *    那是本文件最不能犯的错（§159：说法与事实对上）。
 *    期望值不写死十六进制，而是从 `tokens.css` 现读现算，单一真值留在 token 层。
 * 3. 纪律不变：**不断言违规条数**，许红的只有结构不变式（扫描不是空转 / 没有 critical / 前提成立），
 *    `color-contrast` 的条数一律作为读数打印并抄进 docs/EVALUATION.md。
 */

const require = createRequire(process.cwd() + '/package.json');
const AXE_PATH = require.resolve('axe-core/axe.min.js');
const TOKENS = 'apps/web/src/styles/tokens.css';

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string[]; failureSummary?: string }>;
}
interface AxeResults {
  violations: AxeViolation[];
  passes: Array<{ id: string }>;
  inapplicable: Array<{ id: string }>;
}

/** 从主题块的 `:root`／属性选择器里读一个 token 的字面值，转成浏览器给的 `rgb(...)`。 */
function rgbFrom(selector: string, name: string): string {
  const css = readFileSync(TOKENS, 'utf8');
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`${TOKENS} 里找不到 ${selector}，这一片没有前提`);
  const block = css.slice(start);
  const literal = block.match(new RegExp(`--nexus-color-${name}:\\s*#([0-9a-fA-F]{6})`))?.[1];
  if (!literal) throw new Error(`${TOKENS} 的 ${selector} 里读不到 --nexus-color-${name}，这一片没有前提`);
  const n = Number.parseInt(literal, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

const LIGHT_BG = rgbFrom("[data-nexus-theme='light']", 'bg-0');
const LIGHT_FG = rgbFrom("[data-nexus-theme='light']", 'fg-1');
const DARK_BG = rgbFrom(':root', 'bg-0');

const SURFACES: Array<{ label: string; path: string; ready: string }> = [
  { label: '首页', path: '/', ready: '[data-auth-identity]' },
  { label: '发现', path: '/discover', ready: '[data-discover-root]' },
  { label: '市场', path: '/marketplace', ready: '[data-marketplace-type-nav]' },
  { label: '全平台搜索', path: '/search?q=e2e', ready: 'main' },
  { label: '组件库', path: '/blocks', ready: 'main' },
];

/** 浏览器给的 `rgb(...)` 字符串 → WCAG 相对亮度 → 对比度。与 `style-tokens.test.ts` 同一把尺子。 */
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

interface Sampled {
  sel: string;
  fg: string;
  bg: string;
  ratio: number;
}

/**
 * 把主题设成浅色，并**在真正会被扫的那批元素上**确认它真的落到了。
 *
 * 只看 body 的底色与文字是不够的——这一片首跑就是这么漏的：`body` 的 `bg-0`/`fg-1` 翻了，
 * 而链接吃的是 `--nexus-color-accent-2`（不翻转的强调色）压在其父级表面上。门要钉的是
 * "axe 待会要量到的那些像素是浅色的"，所以取样的必须是真的带文字的元素，判据是它
 * **沿祖先链第一个不透明的底色**（浏览器算对比度就是这么找的，不是拿 token 猜的）。
 *
 * 取样为什么不只挑 `<a>`：`/search` 那张在没有任何结果时**一个链接都没有**
 * （2026-10-28 实测：`<a>` 数量 0），按"没有链接"判红就等于把"页面恰好是空的"
 * 说成"浅色没生效"——那是两件事。所以按标签广度取样，一张有文字的页不会取到 0 个。
 */
async function toLight(page: Page): Promise<{ attr: string | null; bg: string; color: string; samples: Sampled[] }> {
  await page.evaluate(() => document.documentElement.setAttribute('data-nexus-theme', 'light'));
  return await page
    .evaluate(() => {
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
          ratio: 0,
        })),
      };
    })
    .then((r) => ({ ...r, samples: r.samples.map((s) => ({ ...s, ratio: contrast(s.fg, s.bg) })) }));
}

async function scan(page: Page): Promise<AxeResults> {
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

test('§85 浅色主题在真浏览器里的 axe（游客可见的五张页）', async ({ page }) => {
  test.setTimeout(420_000);
  const rows: Array<{ label: string; passes: number; violations: number; critical: number; contrastNodes: number }> = [];
  const failures: string[] = [];

  for (const surface of SURFACES) {
    await page.goto(surface.path);
    const ready = await page
      .waitForSelector(surface.ready, { timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    expect(ready, `${surface.label} 没渲染出 ${surface.ready}——这一张根本没被扫到`).toBe(true);

    const applied = await toLight(page);
    // 门「前提成立」：浅色的 token 真的落到了**axe 待会要量到的那些像素**上，否则下面扫的是暗色读数。
    // 两层判据：① body 的底色/文字翻了；② 取样链接的有效底色里**一个暗色 bg-0 都不许有**——
    // 这一条是首跑之后加的，因为首跑只验了 ①，而 ① 成立时 ② 完全可能不成立（子元素 token 没跟着翻）。
    const stale = applied.samples.filter((s) => s.bg === DARK_BG);
    if (applied.attr !== 'light' || applied.bg !== LIGHT_BG || applied.color !== LIGHT_FG || applied.samples.length === 0 || stale.length > 0) {
      failures.push(
        `${surface.label}：浅色没有真的落到页面上（取样 ${applied.samples.length} 个带文字元素 · attr=${applied.attr} ` +
          `body 底色=${applied.bg} 期望 ${LIGHT_BG} · ` +
          `文字=${applied.color} 期望 ${LIGHT_FG}${stale.length ? ` · ${stale.length} 个元素的底色仍是暗色 ${DARK_BG}` : ''}）` +
          `⇒ 这一张不算浅色的读数`,
      );
      continue;
    }
    const worst = applied.samples.reduce<Sampled>((min, s) => (s.ratio < min.ratio ? s : min), applied.samples[0]!);
    console.log(
      `\n  【${surface.label}（浅色）】取样 ${applied.samples.length} 个带文字元素，浏览器里量到的最低对比度 ` +
        `${worst.ratio.toFixed(2)}:1（${worst.sel}：${worst.fg} 压 ${worst.bg}）`,
    );

    const r = await scan(page);
    const critical = r.violations.filter((v) => v.impact === 'critical').length;
    const contrastNodes = r.violations
      .filter((v) => v.id === 'color-contrast')
      .reduce((sum, v) => sum + v.nodes.length, 0);
    rows.push({ label: surface.label, passes: r.passes.length, violations: r.violations.length, critical, contrastNodes });

    console.log(`\n  【${surface.label}（浅色）】通过 ${r.passes.length} · 违规 ${r.violations.length} · 对比度不合格节点 ${contrastNodes} 个`);
    for (const impact of ['critical', 'serious', 'moderate', 'minor', 'unknown']) {
      const list = r.violations.filter((v) => (v.impact ?? 'unknown') === impact);
      if (!list.length) continue;
      console.log(`    [${impact}] ${list.length} 类：`);
      for (const v of list) {
        console.log(`      - ${v.id}（${v.nodes.length} 个节点）：${v.help}`);
        for (const n of v.nodes.slice(0, 6)) console.log(`          target: ${n.target.join(' ')}`);
        if (v.nodes.length > 6) console.log(`          … 其余 ${v.nodes.length - 6} 个节点略`);
      }
    }

    if (r.passes.length === 0) failures.push(`${surface.label}：passes=0（inapplicable=${r.inapplicable.length}）⇒ 扫描可能在空转`);
    if (critical > 0) failures.push(`${surface.label}：critical 违规 ${critical} 类`);
  }

  console.log(`\n== §85 浅色主题的 axe 读数（WCAG 2.0/2.1 A+AA · 游客可见页 · 排除 nextjs-portal） ==`);
  console.log('  界面 | 通过 | 违规 | critical | 对比度不合格节点');
  for (const row of rows) {
    console.log(`  ${row.label} | ${row.passes} | ${row.violations} | ${row.critical} | ${row.contrastNodes}`);
  }
  expect(failures, `结构不变式红在：\n${failures.join('\n')}`).toEqual([]);
});
