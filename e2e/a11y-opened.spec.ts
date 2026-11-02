import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { reusableMemberWithProject } from './support/auth-session';

/**
 * §85 第三十五片：**点开才出现的界面第一次进读数**——发布弹层。
 *
 * 为什么这一格必须单独一片：第四片（`a11y-internal.spec.ts`）扫的是每张界面**默认展开的那一态**，
 * 而发布弹层合着的时候整个不在 DOM 里。`docs/EVALUATION.md` 的 notMeasured 一直写着
 * 「任何点开才出现的东西——收起的面板、模态、下拉菜单里的控件会从分母里整个退出」。
 * 也就是说，这一片之前，发布弹层里的单选组、门禁读数、发布 / 取消发布 / 收起三颗按钮
 * **一次都没有被 axe 量过**，键盘走查（`keyboard-surfaces.spec.ts`）的注释里也明写着
 * "收起的面板与点开才出现的东西不在读数里"。这一片把那张面打开，用同一把尺子量。
 *
 * 弹层本身还欠两件键盘约定（本片补上）：Escape 收起、点外部收起、收起后焦点回触发键。
 * 其中 Escape 有一条**会被相邻监听吃掉的**现场：画布也听 `window` 的 Escape（清空选区），
 * 所以这条腿不只断言"弹层关了"，还断言"作者选中的元素仍在"——否则"关弹层"会顺手丢掉选区。
 *
 * 纪律与前几片相同：
 * - **不断言违规条数**，只钉结构不变式（扫描不是空转 ⇒ `passes > 0`；没有致命项 ⇒ `critical === 0`）。
 * - 违规逐条连同 target 打印进读数；是壳的还是弹层的，改完才知道，不凭标签归因。
 * - Next 的开发工具 portal 不是本平台界面，排除并写明。
 *
 * 会话与项目用同一个夹具账号（`reusableMemberWithProject`）：注册按 IP 限流 10 次/小时、
 * 建项目 20 次/小时（`docs/ENVIRONMENT.md`），这一片只需要"一个真 member、一个真项目"，
 * **两道闸一次都没为测试放宽**。
 */

const require = createRequire(process.cwd() + '/package.json');
const AXE_PATH = require.resolve('axe-core/axe.min.js');

const RUN = Date.now().toString(36);
const EMAIL = 'a11y-opened+fixture@nexus.test';
const PASSWORD = 'e2e-secret-123';

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

test('§85 点开才出现的界面：发布弹层的 axe、ARIA 接线与键盘收口', async ({ page }) => {
  test.setTimeout(360_000);
  const { projectId, freshAccount, freshProject } = await reusableMemberWithProject(
    page,
    EMAIL,
    PASSWORD,
    `无障碍弹层夹具${RUN}`,
  );
  console.log(
    `\n== §85 第三十五片的会话：夹具账号${freshAccount ? '（本轮首次注册）' : '（复用，零注册）'} · ` +
      `项目 ${projectId}${freshProject ? '（本轮首次新建）' : '（复用名下已有，零建项目）'}`,
  );

  await page.goto(`/studio/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 120_000 });

  // 先选一个节点：后面"Esc 只归弹层"那条腿要能看见选区还在。
  // 判据是属性面板那一栏（`[data-prop]`），不是图层行的高亮——图层行只有 class，没有可读的选中态。
  const headline = await page.evaluate(() => {
    const hit = Array.from(document.querySelectorAll<HTMLElement>('[data-canvas-frame] [data-node-id]')).find((el) =>
      el.textContent?.includes('从一句话到一个可发布的产品'),
    );
    return hit?.getAttribute('data-node-id') ?? null;
  });
  expect(
    headline,
    '起手文档里找不到标题节点：这个项目不是起手文档，本片就量不到"关弹层不会带走选区"那条腿',
  ).not.toBeNull();
  await page.click(`[data-node-id="${headline}"]`);
  await page.waitForSelector('[data-prop="typography.fontSize"]', { timeout: 60_000 });

  // 只用键盘打开：焦点到触发键 → Enter。鼠标也能开，但"键盘用户打不开"要在这一条上说得清。
  const trigger = page.locator('[data-publish-open]');
  const panel = page.locator('[data-publish-panel]');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible({ timeout: 30_000 });

  // 门禁是 worker 算的（`data-publish-gate` 是算完才画出来的那一块）：等它，量到的才是弹层完整的那一态。
  await expect(page.locator('[data-publish-gate]')).toBeVisible({ timeout: 120_000 });

  // ---- ARIA 接线：按钮说它展开了一个区域，那个区域真的有名字、id 也对得上
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const panelId = await panel.getAttribute('id');
  expect(panelId).toBe('nexus-publish-panel');
  await expect(panel).toHaveAttribute('role', 'region');
  await expect(panel).toHaveAttribute('aria-label', '发布与分享');
  await expect(trigger).toHaveAttribute('aria-controls', panelId!);
  expect(
    await page.evaluate((id) => document.getElementById(id)?.hasAttribute('data-publish-panel') ?? false, panelId!),
    'aria-controls 指的那个 id 在 DOM 里没有对应的弹层——那是一句指向不存在东西的承诺',
  ).toBe(true);

  // ---- 打开态的 axe 读数
  const r = await scan(page);
  const critical = printSurface('Studio · 发布弹层（打开态）', r);
  expect(
    r.passes.length,
    `通过规则数为 0：扫描可能是空转（弹层没渲染、axe 没加载、或规则集没命中）。inapplicable=${r.inapplicable.length}`,
  ).toBeGreaterThan(0);
  expect(critical, `发布弹层打开态有 ${critical} 类 critical 违规，逐条见上面的读数`).toBe(0);

  await page.screenshot({ path: 'screenshots/a11y-opened-publish.png' });

  // ---- 收口判据做一份：弹层消失、焦点回触发键、**画布选区不被同一下带走**
  const expectClosedKeepingSelection = async (whyFocus: string) => {
    await expect(panel, `${whyFocus}：弹层没有收起`).toHaveCount(0);
    await expect(trigger, `${whyFocus}：焦点被留在了 document.body 上，下一次 Tab 从页首开始`).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // 合着的时候不许留一个指向不存在 id 的 aria-controls（引用空 id 是 axe 的 aria-valid-attr-value 违规）
    await expect(trigger).not.toHaveAttribute('aria-controls', /./);
    await expect(
      page.locator('[data-prop="typography.fontSize"]'),
      `${whyFocus}：画布的「Esc 清空选区」也被触发了，作者选中的元素被顺手丢掉`,
    ).toBeVisible();
  };

  // ---- Escape 第一腿：焦点还在触发键上（打开后直接按 Esc，最自然的那条路）。
  // 这一腿才真正踩到画布的同名快捷键：焦点在输入控件里时画布的全局处理本来就会放手，
  // 所以上面那条 Tab 之后的 Escape 无论如何都不会碰选区——两腿都要走，否则拦不拦那一下的差别看不见。
  await page.keyboard.press('Escape');
  await expectClosedKeepingSelection('焦点在触发键上按 Esc');

  // ---- 重开，Tab 序：第一个停留点必须是弹层里的东西（此前整块从分母里蒸发）
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return {
      inPanel: Boolean(el?.closest('[data-publish-panel]')),
      name: el?.getAttribute('name') ?? null,
      tag: el?.tagName ?? null,
    };
  });
  expect(
    focused.inPanel,
    `Tab 之后焦点落在 ${focused.tag ?? 'null'} 上而不是弹层里：键盘用户即使打开了也走不进这几颗控件`,
  ).toBe(true);
  expect(focused.name, '弹层里的第一个停留点不是可见性那一组单选').toBe('publish-visibility');

  // ---- Escape 第二腿：焦点在弹层里的输入控件上（Tab 进去之后按 Esc）
  await page.keyboard.press('Escape');
  await expectClosedKeepingSelection('焦点在弹层输入控件上按 Esc');

  // ---- 点外部收起；点弹层里面不许收起（否则点单选、点发布都会先把弹层关掉）
  await page.click('[data-publish-open]');
  await expect(panel).toBeVisible();
  await page.locator('[data-publish-panel] p').first().click();
  await expect(panel, '点在弹层内部也把它收起了：面板里的控件按不到第二下').toBeVisible();
  const canvas = await page.locator('[data-canvas-frame]').boundingBox();
  expect(canvas, '量不到画布框：找不到一个"弹层之外"的落点').not.toBeNull();
  await page.mouse.click(canvas!.x + 24, canvas!.y + canvas!.height - 24);
  await expect(panel).toHaveCount(0);
});
