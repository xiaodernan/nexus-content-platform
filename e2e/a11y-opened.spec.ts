import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { reusableMemberWithProject } from './support/auth-session';

/**
 * §85 第三十五 / 三十六片：**点开才出现的界面第一次进读数**——发布弹层与导出弹层。
 *
 * 两处是同一个形状（顶栏一颗触发键 + 一个绝对定位的面板），收口共用
 * `apps/web/src/studio/use-popover-dismiss.ts`；这里各量一遍，免得一条腿只修在其中一个上。
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

/**
 * 第三十六片：导出弹层。它与发布弹层共用同一份收口，但**面板里的东西完全不同**——
 * 五个复选框（各自包在 `<label>` 里）、导出键、收起键，以及回执/错误那几行。
 * 这条用例同时钉住"共用 hook 真的接上了"：`aria-controls` 指到自己的 id，Tab 首停是第一个复选框。
 */
test('§85 点开才出现的界面：导出弹层的 axe、ARIA 接线与键盘收口', async ({ page }) => {
  test.setTimeout(360_000);
  const { projectId } = await reusableMemberWithProject(page, EMAIL, PASSWORD, `无障碍弹层夹具${RUN}`);
  await page.goto(`/studio/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 120_000 });

  const trigger = page.locator('[data-export-open]');
  const panel = page.locator('[data-export-panel]');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible({ timeout: 30_000 });

  // ---- ARIA 接线：按钮说它展开了一个区域，那个区域真的有名字、id 也对得上
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const panelId = await panel.getAttribute('id');
  expect(panelId).toBe('nexus-export-panel');
  await expect(panel).toHaveAttribute('role', 'region');
  await expect(panel).toHaveAttribute('aria-label', '导出与下载');
  await expect(trigger).toHaveAttribute('aria-controls', panelId!);
  expect(
    await page.evaluate((id) => document.getElementById(id)?.hasAttribute('data-export-panel') ?? false, panelId!),
    'aria-controls 指的那个 id 在 DOM 里没有对应的弹层——那是一句指向不存在东西的承诺',
  ).toBe(true);

  // ---- 打开态的 axe 读数
  const r = await scan(page);
  const critical = printSurface('Studio · 导出弹层（打开态）', r);
  expect(
    r.passes.length,
    `通过规则数为 0：扫描可能是空转（弹层没渲染、axe 没加载、或规则集没命中）。inapplicable=${r.inapplicable.length}`,
  ).toBeGreaterThan(0);
  expect(critical, `导出弹层打开态有 ${critical} 类 critical 违规，逐条见上面的读数`).toBe(0);

  await page.screenshot({ path: 'screenshots/a11y-opened-export.png' });

  // ---- 收口判据：弹层消失、焦点回触发键、合着时不留 aria-controls
  const expectClosed = async (whyFocus: string) => {
    await expect(panel, `${whyFocus}：弹层没有收起`).toHaveCount(0);
    await expect(trigger, `${whyFocus}：焦点被留在了 document.body 上，下一次 Tab 从页首开始`).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).not.toHaveAttribute('aria-controls', /./);
  };

  // ---- Escape 第一腿：焦点还在触发键上
  await page.keyboard.press('Escape');
  await expectClosed('焦点在触发键上按 Esc');

  // ---- 重开，Tab 序：从触发键出发，第一个停留点必须是弹层里的第一个复选框
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return {
      inPanel: Boolean(el?.closest('[data-export-panel]')),
      tag: el?.tagName ?? null,
      type: el?.getAttribute('type') ?? null,
    };
  });
  expect(
    focused.inPanel,
    `Tab 之后焦点落在 ${focused.tag ?? 'null'} 上而不是弹层里：键盘用户即使打开了也走不进这几颗控件`,
  ).toBe(true);
  expect(focused.tag, '弹层里的第一个停留点不是复选框').toBe('INPUT');
  expect(focused.type).toBe('checkbox');

  // ---- Escape 第二腿：焦点在弹层里的复选框上
  await page.keyboard.press('Escape');
  await expectClosed('焦点在弹层控件上按 Esc');

  // ---- 点外部收起；点弹层里面不许收起（否则勾选一档就先把弹层关掉）
  await page.click('[data-export-open]');
  await expect(panel).toBeVisible();
  await page.locator('[data-export-panel] p').first().click();
  await expect(panel, '点在弹层内部也把它收起了：面板里的控件按不到第二下').toBeVisible();
  const canvas = await page.locator('[data-canvas-frame]').boundingBox();
  expect(canvas, '量不到画布框：找不到一个"弹层之外"的落点').not.toBeNull();
  await page.mouse.click(canvas!.x + 24, canvas!.y + canvas!.height - 24);
  await expect(panel).toHaveCount(0);
});

test('§85 导出弹层的动态态：回执与失败两态进读数', async ({ page }) => {
  test.setTimeout(360_000);
  const { projectId } = await reusableMemberWithProject(page, EMAIL, PASSWORD, `无障碍动态态夹具${RUN}`);
  await page.goto(`/studio/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 120_000 });

  const trigger = page.locator('[data-export-open]');
  const panel = page.locator('[data-export-panel]');
  const runButton = page.locator('[data-export-run]');
  const receipt = page.locator('[data-export-receipt]');
  const error = page.locator('[data-export-error]');

  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible({ timeout: 30_000 });

  // ---- 回执态：真的打一次包。下载事件必须接住，否则 Playwright 会把它晾在那儿。
  const arriving = page.waitForEvent('download');
  await runButton.click();
  const download = await arriving;
  expect(download.suggestedFilename(), '回执里说的文件名与浏览器真正收到的那个对不上').toMatch(/\.zip$/);
  await expect(receipt).toBeVisible({ timeout: 120_000 });

  // 键盘与读屏用户看不见"下载完成"这一块出现：它得自己说一次。
  // 用 `status` 而不是 `alert`：打包成功不该打断当前朗读。
  await expect(receipt).toHaveAttribute('role', 'status');
  await expect(receipt).toContainText('已下载');
  // 构成那一行来自服务端回执；读不出来时也要有那一行如实说"只报字节数"，不能空着
  await expect(page.locator('[data-export-composition]')).toHaveCount(1);

  const receiptScan = await scan(page);
  const critical1 = printSurface('Studio · 导出弹层（回执态）', receiptScan);
  expect(receiptScan.passes.length, '回执态扫描为空转：回执没渲染或 axe 没命中规则集').toBeGreaterThan(0);
  expect(critical1, `回执态有 ${critical1} 类 critical 违规，逐条见上面的读数`).toBe(0);
  await page.screenshot({ path: 'screenshots/a11y-opened-export-receipt.png' });

  // ---- 失败态：只把导出这一个端点注入成 500。
  // 真服务端走到这一态要"存储挂掉"（代价太大），这里注入的是网络那一层，不是产品语义；
  // 断言只看界面把服务端那句话原样端出来、并且它会打断朗读。
  await page.route(/\/api\/projects\/[^/]+\/export/, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'storage_down', message: '这次打包没成：注入的失败' }),
    }),
  );
  await runButton.click();
  await expect(error).toBeVisible({ timeout: 30_000 });
  await expect(error).toHaveAttribute('role', 'alert');
  await expect(error).toHaveText('这次打包没成：注入的失败');
  // 上一轮的回执必须跟着这一轮一起清掉：一次失败旁边还摆着"已下载"就是两句自相矛盾的话
  await expect(receipt).toHaveCount(0);

  const errorScan = await scan(page);
  const critical2 = printSurface('Studio · 导出弹层（失败态）', errorScan);
  expect(errorScan.passes.length, '失败态扫描为空转：错误行没渲染或 axe 没命中规则集').toBeGreaterThan(0);
  expect(critical2, `失败态有 ${critical2} 类 critical 违规，逐条见上面的读数`).toBe(0);
  await page.screenshot({ path: 'screenshots/a11y-opened-export-error.png' });
});

test('§85 发布弹层的动态态：门禁算完与私有提示进读数', async ({ page }) => {
  test.setTimeout(360_000);
  const { projectId } = await reusableMemberWithProject(page, EMAIL, PASSWORD, `无障碍发布动态态夹具${RUN}`);
  await page.goto(`/studio/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 120_000 });

  const trigger = page.locator('[data-publish-open]');
  const panel = page.locator('[data-publish-panel]');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible({ timeout: 30_000 });

  // ---- 门禁算完那一态：这块只在 worker 回来之后才画出来，此前只有一行"正在后台算"
  const gate = page.locator('[data-publish-gate]');
  await expect(gate).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('[data-publish-gate-pending]'), '门禁读数已经画出来了，"正在算"那行却还在').toHaveCount(0);
  // 门禁不是一句空话：它里面得是那份真报告（七行读数都来自同一个 analyzeHealth）
  await expect(gate.locator('[data-health-panel]')).toHaveCount(1);

  const gateScan = await scan(page);
  const critical1 = printSurface('Studio · 发布弹层（门禁算完态）', gateScan);
  expect(gateScan.passes.length, '门禁态扫描为空转：门禁没渲染或 axe 没命中规则集').toBeGreaterThan(0);
  expect(critical1, `门禁态有 ${critical1} 类 critical 违规，逐条见上面的读数`).toBe(0);
  await page.screenshot({ path: 'screenshots/a11y-opened-publish-gate.png' });

  // ---- 私有提示：说明只在选中私有之后出现，读屏用户得先听到选项本身
  const privateRadio = page.locator('[data-publish-choice="private"] input');
  const note = page.locator('[data-publish-private-note]');
  await expect(note, '还没选私有就把下架说明摆出来了').toHaveCount(0);
  await expect(privateRadio).not.toHaveAttribute('aria-describedby', /./);

  await privateRadio.focus();
  await page.keyboard.press('Space');
  await expect(note).toBeVisible();
  await expect(privateRadio).toHaveAttribute('aria-describedby', 'nexus-publish-private-note');
  expect(
    await page.evaluate(() => document.getElementById('nexus-publish-private-note')?.hasAttribute('data-publish-private-note') ?? false),
    'aria-describedby 指的那个 id 在 DOM 里没有对应的说明——那是一句指向不存在东西的承诺',
  ).toBe(true);
  // 弹层自己有滚动条：截图要把那句说明真的滚进视口，否则留档的图上看不见它
  await note.scrollIntoViewIfNeeded();

  const noteScan = await scan(page);
  const critical2 = printSurface('Studio · 发布弹层（私有提示态）', noteScan);
  expect(noteScan.passes.length, '私有提示态扫描为空转：说明没渲染或 axe 没命中规则集').toBeGreaterThan(0);
  expect(critical2, `私有提示态有 ${critical2} 类 critical 违规，逐条见上面的读数`).toBe(0);
  await page.screenshot({ path: 'screenshots/a11y-opened-publish-private.png' });
});

test('§85 发布动作的进行与失败：发布中状态与报错进读数', async ({ page }) => {
  test.setTimeout(360_000);
  const { projectId } = await reusableMemberWithProject(page, EMAIL, PASSWORD, `无障碍发布进行态夹具${RUN}`);
  await page.goto(`/studio/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 120_000 });

  const trigger = page.locator('[data-publish-open]');
  const panel = page.locator('[data-publish-panel]');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  // 门禁算完再动手：这一片量的是发布动作本身，不要让"正在算"那行混进截图
  await expect(page.locator('[data-publish-gate]')).toBeVisible({ timeout: 120_000 });

  // ---- 动手之前两行都不该在：没点发布就摆一句"发布中"或一条报错，都是没有来源的状态
  const busyLine = page.locator('[data-publish-busy]');
  const errorLine = page.locator('[data-publish-error]');
  await expect(busyLine, '没点发布就把"发布中"摆出来了').toHaveCount(0);
  await expect(errorLine, '没点发布就先摆了一条报错').toHaveCount(0);

  // ---- 把发布请求扣住，让"发布中"这一态停住可量：route 只拦 POST，保存那条照走
  let releasePublish: () => void = () => {};
  const publishHeld = new Promise<void>((resolve) => {
    releasePublish = resolve;
  });
  await page.route('**/api/projects/*/publish', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await publishHeld;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: '发布队列不可用（注入）' }),
    });
  });

  await page.locator('[data-publish-submit]').click();
  await expect(busyLine, '服务端还扣着，界面却没画"发布中"').toBeVisible({ timeout: 60_000 });
  await expect(busyLine).toHaveAttribute('role', 'status');
  // 视觉上那颗键也得真的进到忙态，不能只有一行悄悄的话
  await expect(page.locator('[data-publish-submit]')).toBeDisabled();
  await expect(page.locator('[data-publish-submit]')).toHaveText(/发布中/);

  const busyScan = await scan(page);
  const critical1 = printSurface('Studio · 发布弹层（发布中态）', busyScan);
  expect(busyScan.passes.length, '发布中态扫描为空转：状态行没渲染或 axe 没命中规则集').toBeGreaterThan(0);
  expect(critical1, `发布中态有 ${critical1} 类 critical 违规，逐条见上面的读数`).toBe(0);
  await busyLine.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'screenshots/a11y-opened-publish-busy.png' });

  // ---- 放行：服务端回 500，报错必须是服务端给的那一句原话，并且"发布中"要收掉
  releasePublish();
  await expect(errorLine).toBeVisible({ timeout: 60_000 });
  await expect(errorLine).toHaveAttribute('role', 'alert');
  await expect(errorLine, '报错换了服务端那句话，界面自己编了一句').toContainText('发布队列不可用（注入）');
  await expect(busyLine, '失败已经回来了，"发布中"那行还挂着').toHaveCount(0);
  await errorLine.scrollIntoViewIfNeeded();

  const errorScan = await scan(page);
  const critical2 = printSurface('Studio · 发布弹层（发布失败态）', errorScan);
  expect(errorScan.passes.length, '发布失败态扫描为空转：报错行没渲染或 axe 没命中规则集').toBeGreaterThan(0);
  expect(critical2, `发布失败态有 ${critical2} 类 critical 违规，逐条见上面的读数`).toBe(0);
  await page.screenshot({ path: 'screenshots/a11y-opened-publish-error.png' });
});

test('§85 发布被机检挡下：硬红线裁决与限度说明进读数', async ({ page }) => {
  test.setTimeout(360_000);
  const { projectId } = await reusableMemberWithProject(page, EMAIL, PASSWORD, `无障碍机检挡下夹具${RUN}`);
  await page.goto(`/studio/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 120_000 });

  const trigger = page.locator('[data-publish-open]');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-publish-panel]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-publish-gate]')).toBeVisible({ timeout: 120_000 });

  // ---- 没发布过就没有机检结果：这一块不许预先摆出来
  const scanBlock = page.locator('[data-publish-scan]');
  await expect(scanBlock, '还没发布就把机检结果摆出来了').toHaveCount(0);

  // ---- 服务端按硬红线挡下：回话里带 scan 与 message，前端要原样端出来
  await page.route('**/api/projects/*/publish', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        message: '机检命中硬红线：未成年相关（注入）',
        scan: {
          rulesVersion: '2026-11-02.1',
          decision: 'blocked',
          findings: [
            {
              rule: 'minor-safety',
              level: 'blocked',
              why: '涉及未成年人的可识别信息',
              where: 'node:hero-headline',
              quote: '十二岁的小明',
            },
          ],
          limits: ['只扫可见文字与引用资产', '图片里的文字未识别'],
          scanned: { pages: 1, textNodes: 8, assetRefs: 0 },
        },
      }),
    });
  });

  await page.locator('[data-publish-submit]').click();
  await expect(scanBlock).toBeVisible({ timeout: 60_000 });
  await expect(scanBlock).toHaveAttribute('role', 'status');

  // ---- 裁决那句话得是"挡下"的口径，不能拿 clear 的措辞顶上
  await expect(page.locator('[data-scan-decision]')).toHaveText(/命中硬红线.*没有发出去/);
  const finding = page.locator('[data-scan-finding="minor-safety"]');
  await expect(finding, '裁决说挡下了，却没说挡的是哪一条').toHaveCount(1);
  await expect(finding).toContainText('涉及未成年人的可识别信息');
  await expect(finding).toContainText('node:hero-headline');
  await expect(finding).toContainText('十二岁的小明');
  // 限度说明必须和结论一起出现：没有它，clear 会被读成"内容没问题"
  await expect(page.locator('[data-scan-limit]')).toHaveCount(2);
  // 报错行仍要端服务端原话，不许自己编一句
  await expect(page.locator('[data-publish-error]')).toHaveAttribute('role', 'alert');
  await expect(page.locator('[data-publish-error]')).toContainText('机检命中硬红线：未成年相关（注入）');
  await expect(page.locator('[data-publish-busy]')).toHaveCount(0);

  await scanBlock.scrollIntoViewIfNeeded();
  const scanResults = await scan(page);
  const critical = printSurface('Studio · 发布弹层（机检挡下态）', scanResults);
  expect(scanResults.passes.length, '机检挡下态扫描为空转：裁决块没渲染或 axe 没命中规则集').toBeGreaterThan(0);
  expect(critical, `机检挡下态有 ${critical} 类 critical 违规，逐条见上面的读数`).toBe(0);
  await page.screenshot({ path: 'screenshots/a11y-opened-publish-scan-blocked.png' });
});

test('§85 发布成功后的结果块：地址、版本与审核状态进读数', async ({ page }) => {
  test.setTimeout(360_000);
  const { projectId } = await reusableMemberWithProject(page, EMAIL, PASSWORD, `无障碍发布结果夹具${RUN}`);
  await page.goto(`/studio/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 120_000 });

  const trigger = page.locator('[data-publish-open]');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-publish-panel]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-publish-gate]')).toBeVisible({ timeout: 120_000 });

  // ---- 夹具项目可能已经被上一轮发布过：先收回来，保证"结果块是这次动作带出来的"
  const resultBlock = page.locator('[data-publish-result]');
  if (await resultBlock.count()) {
    await page.locator('[data-publish-off]').click();
    await expect(resultBlock).toHaveCount(0, { timeout: 60_000 });
    await expect(trigger).toHaveText(/^发布$/, { timeout: 60_000 });
  }
  await expect(resultBlock, '还没发布就把结果块摆出来了').toHaveCount(0);

  // ---- 真发布（不注入）：这一块的内容只能由服务端回执带出来
  await page.locator('[data-publish-submit]').click();
  await expect(resultBlock).toBeVisible({ timeout: 120_000 });
  await expect(resultBlock).toHaveAttribute('role', 'status');

  // 版本与地址都是回执里的数，不是界面自己编的（夹具项目被反复发布过，版本号不硬编码）
  const blockText = ((await resultBlock.textContent()) ?? '').trim();
  const versionMatch = blockText.match(/当前公开地址（第 (\d+) 版）/);
  expect(versionMatch, `结果块里没有版本那一句：${blockText.slice(0, 80)}`).toBeTruthy();
  const version = Number(versionMatch?.[1]);
  expect(version, `版本号不是正数：${version}`).toBeGreaterThan(0);
  const url = page.locator('[data-publish-url]');
  await expect(url).toHaveCount(1);
  const href = await url.getAttribute('href');
  expect(href, '公开地址没进 DOM').toBeTruthy();
  expect(href, `公开地址不是一个站内可打开的路由：${href}`).toMatch(/^\/n\/[a-z0-9]+\/.+/);
  // 看得见的那串是绝对地址（由同一条 path 拼出来），它必须以 href 结尾：否则"看起来是它、点开是别的"
  const shown = ((await url.textContent()) ?? '').trim();
  expect(shown, `链接文字与 href 指的不是同一个地址：${shown} vs ${href}`).toBeTruthy();
  expect(shown.startsWith('http://localhost:3101/'), `链接文字不是绝对地址：${shown}`).toBe(true);
  expect(shown.endsWith(href ?? ''), `链接文字没落在 href 那条 path 上：${shown}`).toBe(true);
  // 审核状态那句必须跟着结果块一起出现，不能只给一个地址
  await expect(resultBlock).toContainText('人工审核');
  await expect(page.locator('[data-publish-busy]')).toHaveCount(0);
  await expect(page.locator('[data-publish-error]')).toHaveCount(0);
  await expect(trigger).toHaveText(new RegExp(`已发布 v${version}`));

  await resultBlock.scrollIntoViewIfNeeded();
  const resultScan = await scan(page);
  const critical = printSurface('Studio · 发布弹层（发布成功态）', resultScan);
  expect(resultScan.passes.length, '发布成功态扫描为空转：结果块没渲染或 axe 没命中规则集').toBeGreaterThan(0);
  expect(critical, `发布成功态有 ${critical} 类 critical 违规，逐条见上面的读数`).toBe(0);
  await page.screenshot({ path: 'screenshots/a11y-opened-publish-result.png' });
});
