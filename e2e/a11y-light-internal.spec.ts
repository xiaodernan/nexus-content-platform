import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { createProjectNamed, registerMember } from './support/auth-session';
/**
 * §85 · 浅色主题第一次落到**登录后**那些界面——2026-10-29 立了主题入口，
 * 游客可见的五张页扫过（a11y-light.spec.ts），登录后的九张一直只有暗色读数
 * （a11y-internal.spec.ts）。这一片补上：同样的九张、同样的判据，换浅色。
 *
 * 与 a11y-light.spec.ts 同一条前提门——这不能靠"属性设上了就是浅色"糊过去：
 * 取样真实带文字的元素，它们沿祖先链找到的第一个不透明底色**一个暗色 bg-0 都不许有**，
 * 否则这张只能被记成"没扫"。期望值从 tokens.css 现读现算，单一真值留在 token 层。
 *
 * 纪律与同事们同一条：**不断言违规条数**——serious 有几个是当前读数不是保证；
 * 许红的只有结构不变式：
 * ① 扫描不是空转（passes > 0——白页 axe 也"全绿"，那种绿不算证据）；
 * ② critical === 0；
 * ③ 前提成立（浅色真的落到了取样像素上）。
 * 每张的违规清单连同 target 一起打印，不归因到"壳还是作者"（第二片踩过这条）。
 *
 * 一次注册扫九张：注册按 IP 限流 10 次/小时（docs/ENVIRONMENT.md），一张一次注册会先把名额耗光。
 */

const TOKENS = 'apps/web/src/styles/tokens.css';
const RUN = Date.now().toString(36);

const require = createRequire(process.cwd() + '/package.json');
const AXE_PATH = require.resolve('axe-core/axe.min.js');

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

/** 从 tokens.css 主题块里读一个 token 的字面值，转成浏览器给的 `rgb(...)`。 */
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

/** 浏览器给的 `rgb(...)` 字符串 → WCAG 相对亮度 → 对比度。与 style-tokens.test.ts 同一把尺子。 */
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

/** 扫哪些界面。与 a11y-internal.spec.ts 同一张名册（同一 ready 判据），只是换浅色。 */
interface Surface {
  label: string;
  path: (projectId: string) => string;
  ready: string;
}

const SURFACES: Surface[] = [
  { label: '首页（账号 / 项目 / 回收站）', path: () => '/', ready: '[data-auth-identity]' },
  { label: 'Studio（画布 + 面板）', path: (id) => `/studio/${id}`, ready: '[data-canvas-frame]' },
  { label: '发现', path: () => '/discover', ready: 'main' },
  { label: '市场', path: () => '/marketplace', ready: 'main' },
  { label: '通知', path: () => '/notifications', ready: 'main' },
  { label: '创作数据', path: () => '/analytics', ready: 'main' },
  { label: '全平台搜索', path: () => '/search?q=e2e', ready: 'main' },
  { label: '额度与消费', path: () => '/credits', ready: 'main' },
  { label: 'API 凭据', path: () => '/api-tokens', ready: 'main' },
];

interface Sampled {
  sel: string;
  fg: string;
  bg: string;
  ratio: number;
}

/** 把主题设成浅色，并在**真正会被扫的那批元素上**确认它真的落到了。 */
async function toLight(
  page: Page,
): Promise<{ attr: string | null; bg: string; color: string; samples: Sampled[] }> {
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

function printSurface(label: string, r: AxeResults, worst: Sampled | undefined): number {
  const byImpact = new Map<string, number>();
  for (const v of r.violations) byImpact.set(v.impact ?? 'unknown', (byImpact.get(v.impact ?? 'unknown') ?? 0) + 1);
  console.log(
    `\n  【${label}（浅色）】通过 ${r.passes.length} 条 · 不适用 ${r.inapplicable.length} 条 · 违规 ${r.violations.length} 条` +
      (worst ? ` · 最低对比度 ${worst.ratio.toFixed(2)}:1（${worst.sel}）` : ''),
  );
  for (const impact of ['critical', 'serious', 'moderate', 'minor', 'unknown']) {
    if (!byImpact.get(impact)) continue;
    console.log(`    [${impact}] ${byImpact.get(impact)} 类：`);
    for (const v of r.violations.filter((x) => (x.impact ?? 'unknown') === impact)) {
      console.log(`      - ${v.id}（${v.nodes.length} 个节点）：${v.help}`);
      for (const n of v.nodes.slice(0, 6)) console.log(`          target: ${n.target.join(' ')}`);
      if (v.nodes.length > 6) console.log(`          … 其余 ${v.nodes.length - 6} 个节点略`);
    }
  }
  return byImpact.get('critical') ?? 0;
}

test('§85 登录后九张界面的 axe · 浅色（浏览器强制 data-nexus-theme=light + 前提门）', async ({ page }) => {
  test.setTimeout(600_000);
  await registerMember(page, `a11y-light-all+${RUN}@nexus.test`, 'e2e-secret-123');

  // 一张真项目：Studio 那一张要有东西可渲染，否则扫到的是一片空白，绿也不算证据
  const projectId = await createProjectNamed(page, `内部浅色无障碍样板${RUN}`);

  const rows: Array<{ label: string; passes: number; violations: number; critical: number }> = [];
  const failures: string[] = [];
  for (const surface of SURFACES) {
    await page.goto(surface.path(projectId));
    const ready = await page
      .waitForSelector(surface.ready, { timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    expect(ready, `${surface.label} 没渲染出 ${surface.ready}——这一张根本没被扫到`).toBe(true);

    const applied = await toLight(page);
    // 门「前提成立」：浅色的 token 真的落到了 axe 待会要量到的那些像素上，否则下面扫的是暗色读数。
    const stale = applied.samples.filter((s) => s.bg === DARK_BG);
    if (applied.attr !== 'light' || applied.bg !== LIGHT_BG || applied.color !== LIGHT_FG || applied.samples.length === 0 || stale.length > 0) {
      failures.push(
        `${surface.label}：浅色没有真的落到页面上（取样 ${applied.samples.length} 个带文字元素 · attr=${applied.attr} ` +
          `body 底色=${applied.bg} 期望 ${LIGHT_BG} · 文字=${applied.color} 期望 ${LIGHT_FG}` +
          (stale.length ? ` · ${stale.length} 个元素的底色仍是暗色 ${DARK_BG}` : '') +
          `）⇒ 这一张不算浅色的读数`,
      );
      continue;
    }

    const worst = applied.samples.reduce<Sampled>((min, s) => (s.ratio < min.ratio ? s : min), applied.samples[0]!);
    console.log(
      `\n  【${surface.label}（浅色）】取样 ${applied.samples.length} 个带文字元素，浏览器里量到的最低对比度 ` +
        `${worst.ratio.toFixed(2)}:1（${worst.sel}：${worst.fg} 压 ${worst.bg}）`,
    );

    const r = await scan(page);
    const critical = printSurface(surface.label, r, worst);
    rows.push({ label: surface.label, passes: r.passes.length, violations: r.violations.length, critical });
    if (r.passes.length === 0) failures.push(`${surface.label}：passes=0（inapplicable=${r.inapplicable.length}）⇒ 扫描可能在空转`);
    if (critical > 0) failures.push(`${surface.label}：critical 违规 ${critical} 类`);
  }

  console.log('\n== §85 登录后九张界面的 axe 读数 · 浅色（WCAG 2.0/2.1 A+AA · 排除 nextjs-portal） ==');
  console.log('  界面 | 通过 | 违规 | critical');
  for (const row of rows) console.log(`  ${row.label} | ${row.passes} | ${row.violations} | ${row.critical}`);
  expect(failures, `结构不变式红在：\n${failures.join('\n')}`).toEqual([]);
});
