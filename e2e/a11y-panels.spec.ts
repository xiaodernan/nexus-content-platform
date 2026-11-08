import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { createProjectNamed, registerMember } from './support/auth-session';

/**
 * §85 第五片续：**收起的面板里住着的那些控件**——浏览器门（axe）只看得见渲染出来的 DOM；
 * 设计系统 / 方案板 / Agent 都挂在"默认收起"的面里，a11y-internal 那一片从结构上扫不到它们
 * （2026-10-28 教训：扫不到的面不许说它过）。
 *
 * 纪律与前四片同一条：不断言违规条数，许红的只有结构不变式——
 * 「扫描不是空转」（passes > 0）与 critical === 0；serious 数量与节点是**读数**，打印进报告。
 * 收起面里→展开后看得见，axe 才能量到，控制名的确定性门由 `control-names.test.ts` 兜底
 *（即便 axe 看不见，jsx 字面那道也能抓名字缺失类）。
 *
 * 一张注册扫三屏：注册限流 10 次/小时（docs/ENVIRONMENT.md），
 * Studio 是创作者一整天待着的地方，「展开了看不见」是默认形态被 axe 量到的唯一路径。
 */

const require = createRequire(process.cwd() + '/package.json');
const AXE_PATH = require.resolve('axe-core/axe.min.js');

const RUN = Date.now().toString(36);

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string[] }>;
}
interface AxeResults {
  violations: AxeViolation[];
  passes: Array<{ id: string }>;
  inapplicable: Array<{ id: string }>;
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

function printSurface(label: string, r: AxeResults): number {
  const byImpact = new Map<string, number>();
  for (const v of r.violations) byImpact.set(v.impact ?? 'unknown', (byImpact.get(v.impact ?? 'unknown') ?? 0) + 1);
  console.log(`\n  【${label}】通过 ${r.passes.length} 条 · 不适用 ${r.inapplicable.length} 条 · 违规 ${r.violations.length} 条`);
  for (const impact of ['critical', 'serious', 'moderate', 'minor', 'unknown']) {
    const n = byImpact.get(impact);
    if (!n) continue;
    console.log(`    [${impact}] ${n} 类：`);
    for (const v of r.violations.filter((x) => (x.impact ?? 'unknown') === impact)) {
      console.log(`      - ${v.id}（${v.nodes.length} 个节点）：${v.help}`);
      for (const node of v.nodes.slice(0, 8)) console.log(`          target: ${node.target.join(' ')}`);
    }
  }
  return byImpact.get('critical') ?? 0;
}

interface Surface {
  label: string;
  /** 打开哪一片 */
  click: (page: Page) => Promise<void>;
  /** 展开了之后真正渲染出来的判据 */
  ready: string;
}

const SURFACES: Surface[] = [
  {
    label: '设计系统（DesignSystemPanel：令牌表格 / 筛选 / 添加表单）',
    click: async (page) => page.click('[data-panel-tab="design"]'),
    ready: '[data-design-system-root]',
  },
  {
    label: '方案板（VariantsBoard：多方案并排产生 / 投票 / 采纳）',
    click: async (page) => page.click('[data-view="variants"]'),
    ready: '[data-variants-board]',
  },
  {
    label: 'Agent 面板（AgentPanel：输入 / 任务进度 / 审批卡）',
    click: async (page) => page.click('[data-panel-tab="agent"]'),
    ready: '[data-agent-panel]',
  },
];

test('§85 收起面板的 axe：设计系统 / 方案板 / Agent（点开以后才看得见，才量得到）', async ({ page }) => {
  test.setTimeout(600_000);
  await registerMember(page, `a11y-panels+${RUN}@nexus.test`, 'e2e-secret-123');
  const projectId = await createProjectNamed(page, `面板无障碍样板${RUN}`);

  await page.goto(`/studio/${projectId}`);
  await page.waitForSelector('[data-canvas-frame]', { timeout: 60_000 });

  const rows: Array<{ label: string; passes: number; violations: number; critical: number }> = [];
  const failures: string[] = [];
  for (const surface of SURFACES) {
    await surface.click(page);
    const ready = await page
      .waitForSelector(surface.ready, { timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    expect(ready, `${surface.label} 没渲染出 ${surface.ready}——这一张根本没被扫到`).toBe(true);
    const r = await scan(page);
    const critical = printSurface(surface.label, r);
    rows.push({ label: surface.label, passes: r.passes.length, violations: r.violations.length, critical });
    if (r.passes.length === 0) failures.push(`${surface.label}：passes=0（inapplicable=${r.inapplicable.length}）⇒ 扫描可能在空转`);
    if (critical > 0) failures.push(`${surface.label}：critical 违规 ${critical} 类`);
  }

  console.log('\n== §85 展开面板的 axe 读数（WCAG 2.0/2.1 A+AA · 排除 nextjs-portal） ==');
  for (const row of rows) console.log(`  ${row.label} | 通过 ${row.passes} | 违规 ${row.violations} | critical ${row.critical}`);
  expect(failures, `结构不变式红在：\n${failures.join('\n')}`).toEqual([]);
});
