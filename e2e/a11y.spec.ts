import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { createProjectNamed, registerMember } from './support/auth-session';

/**
 * §85 第二片：**渲染后页面的无障碍**——§85 第一切片 notMeasured 清单里
 * 「axe / 键盘可达性（需真浏览器）」的那一格。它不被 provider 阻塞，所以先补它。
 *
 * 设计模型的静态 a11y 门禁（analyzeHealth）量的是**设计稿**：对比度 / alt / 按钮名 /
 * 点击目标，四个注入违规检出 4/4。但它答不了「真浏览器渲染出来的 DOM 长什么样」——
 * Next 壳（header / 按钮 / 语言属性）、渲染投影出的状态类、布局级陷阱（tab 顺序、
 * landmark）只有 axe 对着活 DOM 才量得到。
 *
 * 纪律（与 scripts/eval-baseline.mts 同一条）：不断言阈值，先记读数；只有**结构不变式**
 * 才许红——这里钉的是「扫描不是空转」：axe 真的加载了、真的跑过了规则、
 * 而且通过列表非空（对一张白页 axe 也"全绿"，那种绿不算证据）。
 * 违规按 impact 分类打印进报告，真数抄 docs/EVALUATION.md。
 * 「这条违规是壳的还是要修的」不许凭节点标签归因：首跑把两处壳上小字（「还没有评论。」、
 * 统计告知段）当成了"快照自带的作者颜色"，改 token 后 7 处一起消失才证明它们全属于平台。
 */

const require = createRequire(process.cwd() + '/package.json');
const AXE_PATH = require.resolve('axe-core/axe.min.js');

const RUN = Date.now().toString(36);

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

async function register(page: Page, email: string, password: string): Promise<void> {
  await registerMember(page, email, password);
}

async function createProject(page: Page, name: string): Promise<string> {
  return createProjectNamed(page, name);
}

test('§85 渲染后无障碍：公开作品页跑 axe（WCAG 2.0/2.1 A+AA），读数进 EVALUATION', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await register(page, `a11y+${RUN}@nexus.test`, 'e2e-secret-123');
  const projectId = await createProject(page, `无障碍样板${RUN}`);

  // 发布（公开）：扫的就是发布那一刻的快照——与访客看到的完全同源
  await page.goto(`/studio/${projectId}`);
  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-submit]')).toBeVisible();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 30_000 });
  const path = (await page.locator('[data-publish-url]').getAttribute('href'))!;

  const visitor = await browser.newContext().then((c) => c.newPage());
  await visitor.goto(new URL(path, page.url()).href);
  await expect(visitor.locator('[data-published-root]')).toBeVisible({ timeout: 30_000 });

  await visitor.addScriptTag({ path: AXE_PATH });
  const results = await visitor.evaluate(async (): Promise<AxeResults> => {
    const axe = (window as unknown as { axe: { run(...args: unknown[]): Promise<AxeResults> } }).axe;
    if (!axe) throw new Error('axe 没有加载进页面');
    return await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
  });

  // 结构不变式：扫描必须真的发生过。对一张白页 axe 也"全绿"——那种绿不算证据。
  expect(Array.isArray(results.violations)).toBe(true);
  expect(
    results.passes.length,
    `通过规则数为 0：扫描可能是空转（页面没渲染、axe 版本不对、或规则集没命中）。inapplicable=${results.inapplicable.length}`,
  ).toBeGreaterThan(0);

  const byImpact = new Map<string, Array<{ id: string; help: string; nodes: number }>>();
  for (const v of results.violations) {
    const impact = v.impact ?? 'unknown';
    const bucket = byImpact.get(impact) ?? [];
    bucket.push({ id: v.id, help: v.help, nodes: v.nodes.length });
    byImpact.set(impact, bucket);
  }
  console.log(`\n== §85 渲染后无障碍读数（公开作品页 · WCAG 2.0/2.1 A+AA） ==`);
  console.log(`  通过规则 ${results.passes.length} 条 · 不适用 ${results.inapplicable.length} 条 · 违规 ${results.violations.length} 条`);
  for (const impact of ['critical', 'serious', 'moderate', 'minor', 'unknown']) {
    const bucket = byImpact.get(impact);
    if (!bucket?.length) continue;
    console.log(`  [${impact}] ${bucket.length} 类：`);
    for (const v of results.violations.filter((x) => (x.impact ?? 'unknown') === impact)) {
      console.log(`    - ${v.id}（${v.nodes.length} 个节点）：${v.help}`);
      for (const n of v.nodes.slice(0, 8)) console.log(`        target: ${n.target.join(' ')}`);
      if (v.nodes.length > 8) console.log(`        … 其余 ${v.nodes.length - 8} 个节点略`);
    }
  }

  const critical = byImpact.get('critical')?.length ?? 0;
  // 结构不变式：critical = 0。这一门只管"扫描真的发生过、且没有致命项"，不管 serious 有几条：
  // 首跑的 7 处 color-contrast 全部同源于 --nexus-color-fg-3 一个 token，改色后归零，
  // 而那个对比度 floor 由 style-tokens.test.ts 按 tokens.css 的字面值钉——比在这里断言
  // 一个数字稳。读数一律进 docs/EVALUATION.md，不抄进注释：注释没有读者会复核。
  expect(critical).toBe(0);
});
