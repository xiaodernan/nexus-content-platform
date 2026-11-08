import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { createProjectNamed, registerMember } from './support/auth-session';
/**
 * §85 第四片：**登录后那些界面的无障碍**——第二片只扫了公开作品页，而平台上被看得最多的
 * 界面根本不是那张：Studio 是创作者一整天待着的地方，发现/市场/通知/数据是别人进来的门。
 * axe 扫不到的面就不许说它"过"（§159：说法与事实对上），所以这一片把面扩出去，
 * 首跑的读数一律进 `docs/EVALUATION.md`。
 *
 * 与前几片同一条纪律：
 * - **不断言违规条数**。serious 有几个是当前读数而不是保证；许红的只有结构不变式：
 *   「扫描不是空转」（passes > 0——对一张白页 axe 也"全绿"，那种绿不算证据）与
 *   「没有致命项」（critical === 0）。
 * - **不凭节点标签归因**。每条违规连同它的 target 一起打印，"这是壳的还是作者的"
 *   要改完才知道（第二片就是这么推翻自己第一条归因的）。
 * - **一处公开声明的排除**：Next 的开发工具 portal（`nextjs-portal`）不是本平台的界面，
 *   它在每次扫描时都挂在 body 末尾；把它排除掉并把这件事写在报错与文档里，
 *   而不是把它的违规算成我们的、或者干脆不提。
 *
 * 一次注册扫多个界面：注册按 IP 限流 10 次/小时（`docs/ENVIRONMENT.md`），
 * 一个界面一次注册会在第二轮之前先把名额耗光。
 */

const require = createRequire(process.cwd() + '/package.json');
const AXE_PATH = require.resolve('axe-core/axe.min.js');

const RUN = Date.now().toString(36);

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

/** 扫哪些界面。label 只用于打印；path 用函数写是因为 Studio 那一张要带真实项目 id。 */
interface Surface {
  label: string;
  path: (projectId: string) => string;
  /** 这一张真渲染出来的判据——白页与"没扫"都不该算读数 */
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

test('§85 登录后界面的 axe（Studio / 发现 / 市场 / 通知 / 数据 / 搜索 / 额度 / 凭据 / 首页）', async ({ page }) => {
  test.setTimeout(600_000);
  await registerMember(page, `a11y-all+${RUN}@nexus.test`, 'e2e-secret-123');

  // 一张真项目：Studio 那一张要有东西可渲染，否则扫到的是一片空白，绿也不算证据
  const projectId = await createProjectNamed(page, `内部无障碍样板${RUN}`);

  const rows: Array<{ label: string; passes: number; violations: number; critical: number }> = [];
  const failures: string[] = [];
  for (const surface of SURFACES) {
    await page.goto(surface.path(projectId));
    // 每张先等它真的渲染出来：等不到的那张扫出来的是空文档，"零违规"是假绿
    const ready = await page
      .waitForSelector(surface.ready, { timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    expect(ready, `${surface.label} 没渲染出 ${surface.ready}——这一张根本没被扫到`).toBe(true);
    const r = await scan(page);
    const critical = printSurface(surface.label, r);
    rows.push({ label: surface.label, passes: r.passes.length, violations: r.violations.length, critical });
    // 结构不变式：扫描不是空转
    if (r.passes.length === 0) failures.push(`${surface.label}：passes=0（inapplicable=${r.inapplicable.length}）⇒ 扫描可能在空转`);
    if (critical > 0) failures.push(`${surface.label}：critical 违规 ${critical} 类`);
  }

  console.log(`\n== §85 登录后界面的 axe 读数（WCAG 2.0/2.1 A+AA · 排除 nextjs-portal） ==`);
  console.log('  界面 | 通过 | 违规 | critical');
  for (const row of rows) console.log(`  ${row.label} | ${row.passes} | ${row.violations} | ${row.critical}`);
  expect(failures, `结构不变式红在：\n${failures.join('\n')}`).toEqual([]);
});
