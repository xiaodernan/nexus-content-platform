import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
/**
 * §85 · 浅色主题下的**公开作品页**——guest 五张页扫过（第八片）、登录后九张扫过（第十七片），
 * 留着的那张是平台上被看得最多的：任何人不登录点开的 `\n/<handle>/<slug>`。
 *
 * 与前两片同一套纪律（不断言违规条数；许红的只有结构不变式：passes>0 / critical===0 / 前提成立），
 * 载体直接从 `/sitemap.xml` 抽一张已经发布出去的页——与第十三片「移动端第一次被量」同一棵名册，
 * 只改尺寸（浅色）与对象（公开页）。页名用 `?page=` 参数保持不变，
 * 但那是渲染不是路由，扫的是访客看到的像素。
 *
 * 为什么必须先验前提：默认暗色（tokens.css 在 :root 定死 dark），只有显式浅色才是扫的不是暗色——
 * 同第八片「门『前提成立』」一模一样的理由。
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

function rgbFrom(selector: string, name: string): string {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const css = readFileSync(TOKENS, 'utf8');
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`${TOKENS} 里找不到 ${selector}，这一片没有前提`);
  const literal = css.slice(start).match(new RegExp(`--nexus-color-${name}:\\s*#([0-9a-fA-F]{6})`))?.[1];
  if (!literal) throw new Error(`${TOKENS} 的 ${selector} 里读不到 --nexus-color-${name}`);
  const n = Number.parseInt(literal, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

const LIGHT_BG = rgbFrom("[data-nexus-theme='light']", 'bg-0');
const LIGHT_FG = rgbFrom("[data-nexus-theme='light']", 'fg-1');

async function scan(page: import('@playwright/test').Page): Promise<AxeResults> {
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

async function toLight(page: import('@playwright/test').Page): Promise<{ attr: string | null; bg: string; color: string }> {
  await page.evaluate(() => document.documentElement.setAttribute('data-nexus-theme', 'light'));
  return await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-nexus-theme'),
    bg: getComputedStyle(document.body).backgroundColor,
    color: getComputedStyle(document.body).color,
  }));
}

function printResult(r: AxeResults): number {
  const byImpact = new Map<string, number>();
  for (const v of r.violations) byImpact.set(v.impact ?? 'unknown', (byImpact.get(v.impact ?? 'unknown') ?? 0) + 1);
  console.log(`  通过 ${r.passes.length} 条 · 不适用 ${r.inapplicable.length} 条 · 违规 ${r.violations.length} 条`);
  for (const impact of ['critical', 'serious', 'moderate', 'minor']) {
    const n = byImpact.get(impact);
    if (!n) continue;
    console.log(`    [${impact}] ${n} 类：`);
    for (const v of r.violations.filter((x) => (x.impact ?? 'unknown') === impact)) {
      console.log(`      - ${v.id}（${v.nodes.length} 个节点）：${v.help}`);
      for (const node of v.nodes.slice(0, 6)) {
        console.log(`          target: ${node.target.join(' ')}`);
        if (node.failureSummary) console.log(`          axe: ${node.failureSummary.split('Expected')[0]?.replace(/\s+/g, ' ').trim()}`);
      }
    }
  }
  return byImpact.get('critical') ?? 0;
}

test('§85 访客可见的公开作品页 × 浅色（axe WCAG 2.0/2.1 A+AA）', async ({ page }) => {
  test.setTimeout(300_000);

  // 从 sitemap 抽一张已经发布出去的公开页——这是访客看到的那份渲染，不是作者草稿
  const sitemap = await page.request.get('/sitemap.xml');
  expect(sitemap.ok(), '/sitemap.xml 读不出来：公开页没有尺寸数就没有载体').toBeTruthy();
  const xml = await sitemap.text();
  const url = xml.match(/<loc>(https?:\/\/[^<]+\/n\/[^<]+)<\/loc>/)?.[1];
  expect(url, 'sitemap 里没有 /n/ 公开页：这一片没有载体可量（先发一份公开页再跑）').toBeTruthy();
  const path = new URL(url!).pathname;
  console.log(`  载体（来自 /sitemap.xml）：${path}`);

  await page.goto(path, { waitUntil: 'domcontentloaded' });
  const rooted = await page
    .waitForSelector('[data-published-root]', { timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  expect(rooted, `${path} 渲染出的不是带 data-published-root 的公开页——这一张没被扫到`).toBe(true);

  const applied = await toLight(page);
  // 门「前提成立」：浅色的 token 必须真落到像素上，否则扫到的是暗色读数被记成浅色
  expect(applied.attr, 'data-nexus-theme 没设成 light').toBe('light');
  expect(applied.bg, `body 底色 ${applied.bg} 不是浅色 bg-0 ${LIGHT_BG}`).toBe(LIGHT_BG);
  expect(applied.color, `body 文字 ${applied.color} 不是浅色 fg-1 ${LIGHT_FG}`).toBe(LIGHT_FG);

  const r = await scan(page);
  const critical = printResult(r);

  expect(r.passes.length, 'passes=0：扫描可能在空转，或根本没渲染出东西').toBeGreaterThan(0);
  expect(critical, 'critical 违规不是读数是事实：先有缺陷再谈这个测量').toBe(0);
});
