import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * §FE-11 市场交互原子 `MarketplaceItemRow` 门面的**浏览器那一寸**（脱离后端，纯 CSS + 真结构因果）。
 *
 * 为什么离线：本机 3100 上游常无干净窗口（Next 未起时网关回 502），而市场列表是登录后页，
 * 真页面要数据库 + 会话。本片门面的正确性只取决于两件事——真实产物的**结构/文案/data 钩子/
 * 门面类名**与产物 `.mi-` CSS 在真 Chromium 下的渲染。二者都与后端数据无关。本 spec 从**产物
 * 真实字节**取这两样，用 `page.setContent` 离线注入，零后端零夹具。
 *
 * 为什么 markup 是"复刻样本"而非直接抽 JSX：`MarketplaceItemRow` 是 client 组件，JSX 含
 * `{mine ? ...}`、`{message ? ...}`、`disabled={downloading}`、`${item.downloadCount}` 等 JS
 * 表达式，裸 HTML 无法解释。因此这里人工构造**覆盖 owner/buyer/徽标三态 + 两个 disclosure 面板
 * 展开态**的静态 markup 样本，但每个 className / data-* / 按钮与徽标文案都逐字取自真实产物
 * （见 SAMPLE 旁出处）——验的是"真实门面类 + 结构钩子在真 Chrome 下的渲染因果"，
 * 不是"真页面点开过一遍"。诚实边界写进 ADR。
 *
 * 验六件静态门覆盖不了的事：
 *  1. 样本锚真实产物（SAMPLE 的 mi- 类 / data-* / 文案逐字出自组件，脱节即红）；
 *  2. 深/浅双主题下三态门面真渲染、三档按钮语气（主/幽灵/危险）视觉分档、零 console error；
 *  3. 3 处 disabled busy（购买/下载/提交举报）真有 cursor/opacity 反馈；
 *  4. 键盘 Tab 下按钮 / input / select 的 `:focus-visible` 描边真生效（真 Tab，非编程 focus）；
 *  5. hover / :active 的 transform 真生效、reduced-motion 下产品关闭块真关掉（零手工 !important 兜底）；
 *  6. disclosure 面板展开态动画在 reduced-motion 下被真关掉（`animation:none`）。
 *
 * 静态那一寸归 `apps/web/test/marketplace-item-row-visual-style.test.ts`。
 */
const COMPONENT = join(process.cwd(), 'apps/web/src/marketplace/MarketplaceItemRow.tsx');
const GLOBALS = join(process.cwd(), 'apps/web/src/app/globals.css');
const TOKENS = join(process.cwd(), 'apps/web/src/styles/tokens.css');

const compSrc = readFileSync(COMPONENT, 'utf8');
const cssSrc = readFileSync(GLOBALS, 'utf8');
const tokensCss = readFileSync(TOKENS, 'utf8');

/** 从产物 globals.css 提取 `.mi-` 视觉段整段（从第一个 `.mi-` 到第一个 `.mp-` 之前）。 */
function extractMiSegment(css: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = clean.search(/\.mi-[A-Za-z]/);
  if (start < 0) throw new Error('globals.css 找不到 .mi- 视觉段——FE-11 没落地');
  const tail = clean.slice(start);
  const nextFacade = tail.search(/\.mp-[A-Za-z]/);
  return nextFacade >= 0 ? tail.slice(0, nextFacade) : tail;
}

/**
 * 三态 markup 样本：className / data-* / 文案逐字取自真实产物字节。
 * 出处：MarketplaceItemRow.tsx —
 *   mi-head/mi-preview/mi-title/mi-tag/mi-price/mi-badgePurchased/mi-badgeReported/mi-creator（:174-205）；
 *   mi-btn+mi-btnGhost/mi-btnPrimary/mi-btnDanger 五按钮（:206-259）；
 *   mi-panel/mi-field/mi-input/mi-inputNum/mi-inputNote/mi-select/mi-hint/mi-desc/mi-msg（:260-352）。
 * 三行：owner 态（改价/下架）、buyer 已购未举报态（下载 enabled）、buyer busy + 已举报态（三 disabled + 报告面板）。
 */
const SAMPLE = `
<ul>
  <!-- 行 1：owner 态——改价格/可见性 + 下架，编辑面板展开 -->
  <li class="mk-card" data-marketplace-item="i1">
    <div class="mi-head">
      <img class="mi-preview" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="预览：潮汐组件包" data-marketplace-preview="i1" />
      <span class="mi-title" data-marketplace-item-title>潮汐组件包</span>
      <span class="mi-tag">组件包</span>
      <span class="mi-tag" data-marketplace-item-visibility="public">公开在售</span>
      <span class="mi-price" data-marketplace-item-price="42">42 credits</span>
      <span class="mi-creator">盐海工坊</span>
      <button type="button" class="mi-btn mi-btnGhost" data-marketplace-edit="i1" aria-expanded="true" aria-controls="marketplace-edit-i1">收起</button>
      <button type="button" class="mi-btn mi-btnDanger" data-marketplace-remove="i1">下架</button>
      <button type="button" class="mi-btn mi-btnGhost" data-marketplace-download="i1">下载（36）</button>
    </div>
    <div class="mi-panel" id="marketplace-edit-i1" data-marketplace-edit-panel="i1">
      <label class="mi-field">价格<input type="number" class="mi-input mi-inputNum" data-marketplace-edit-price="i1" /></label>
      <label class="mi-field">可见性<select class="mi-select" data-marketplace-edit-visibility="i1"><option value="public">公开在售</option><option value="free">免费</option><option value="private">私密</option></select></label>
      <button type="button" class="mi-btn mi-btnPrimary" data-marketplace-edit-save="i1">保存</button>
    </div>
    <p class="mi-desc">一整套可复用的潮汐主题组件。</p>
  </li>

  <!-- 行 2：buyer 已购态——已购买徽标 + 购买入口消失 + 举报 -->
  <li class="mk-card" data-marketplace-item="i2">
    <div class="mi-head">
      <span class="mi-title" data-marketplace-item-title>雾港模板</span>
      <span class="mi-tag">模板</span>
      <span class="mi-price" data-marketplace-item-price="18">18 credits</span>
      <span class="mi-badgePurchased" data-marketplace-purchased>已购买</span>
      <span class="mi-creator">灯塔工作室</span>
      <button type="button" class="mi-btn mi-btnDanger" data-marketplace-report="i2" aria-expanded="false">举报</button>
      <button type="button" class="mi-btn mi-btnGhost" data-marketplace-download="i2">下载（12）</button>
    </div>
  </li>

  <!-- 行 3：buyer busy + 已举报态——3 处 disabled + 报告面板展开 -->
  <li class="mk-card" data-marketplace-item="i3">
    <div class="mi-head">
      <span class="mi-title" data-marketplace-item-title>旧日素材集</span>
      <span class="mi-tag">素材</span>
      <span class="mi-price" data-marketplace-item-price="7">7 credits</span>
      <span class="mi-badgeReported" data-marketplace-reported>已举报</span>
      <span class="mi-creator">匿名创作者</span>
      <button type="button" class="mi-btn mi-btnPrimary" data-marketplace-purchase="i3" disabled>购买中...</button>
      <button type="button" class="mi-btn mi-btnGhost" data-marketplace-download="i3" disabled>取包中...</button>
    </div>
    <div class="mi-panel" id="marketplace-report-i3" data-marketplace-report-panel="i3">
      <label class="mi-field">原因<select class="mi-select" data-marketplace-report-reason="i3"><option value="spam">垃圾内容</option></select></label>
      <input class="mi-input mi-inputNote" aria-label="举报说明" data-marketplace-report-note="i3" placeholder="补充说明（可选，最多 1000 字）" />
      <button type="button" class="mi-btn mi-btnPrimary" data-marketplace-report-submit="i3" disabled>提交中...</button>
      <button type="button" class="mi-btn mi-btnGhost" data-marketplace-report-cancel="i3">取消</button>
      <span class="mi-hint">举报进审核员工单台；结案 / 驳回都不会自动下架物品。</span>
      <p class="mi-msg" data-marketplace-item-message>已提交举报。审核员会在市场工单台处置；工单结案不等于下架，撤内容走人工复核台。</p>
    </div>
  </li>
</ul>`;

const miCss = extractMiSegment(cssSrc);

/** 真实 token + 真实 .mi- CSS + 三态样本装进一个 data-nexus-theme 可控文档。
 *  reduced-motion 门禁此文件注入任何手工关闭规则：产品 globals.css 的 .mi- 段自带
 *  @media (prefers-reduced-motion: reduce) 块，真 emulateMedia 触发它才验得到产品真规则。 */
function htmlFor(scheme: 'dark' | 'light'): string {
  return `<!doctype html><html lang="zh-CN" data-nexus-theme="${scheme}"><head><meta charset="utf-8" />
    <style>${tokensCss}</style>
    <style>
      :root { color-scheme: ${scheme}; }
      body { margin: 0; background: var(--nexus-color-bg-0); color: var(--nexus-color-fg-1); }
      ${miCss}
    </style></head><body>${SAMPLE}</body></html>`;
}

test('@smoke §FE-11 样本锚真实产物：SAMPLE 的 mi- 类 / data-* / 文案逐字出自组件', async () => {
  const classes = [...new Set([...SAMPLE.matchAll(/\bmi-[A-Za-z0-9-]+/g)].map((m) => m[0]!))];
  const missingClasses = classes.filter((c) => !compSrc.includes(c));
  expect(missingClasses, `SAMPLE 用了产物里不存在的 mi- 类（样本与产物脱节）：${missingClasses.join(', ')}`).toEqual([]);

  const hooks = [...new Set([...SAMPLE.matchAll(/\bdata-marketplace-[a-z-]+/g)].map((m) => m[0]!))];
  const missingHooks = hooks.filter((h) => !compSrc.includes(h));
  expect(missingHooks, `SAMPLE 用了产物里不存在的 data-* 钩子：${missingHooks.join(', ')}`).toEqual([]);

  // 关键**静态 UI 文案**逐字在（含 A11Y 诚实措辞、busy 三态、按钮/徽标/option 文案）。
  // 诚实边界：标题/作者/价格数字/描述在组件里是 {item.title}/{item.creatorName}/
  // {item.priceCredits}/{item.description} 动态值，SAMPLE 里的是编造假数据，本就不该逐字锚产物——
  // 锚它们只会制造假红，故只锚组件里真实写死的静态文案。
  for (const copy of [
    '已购买', '已举报', '匿名创作者', '公开在售', '免费', '私密',
    '改价格/可见性', '收起', '下架', '购买', '购买中...', '举报', '收起举报',
    '下载', '取包中...', '保存', '提交举报', '提交中...', '取消',
    '举报进审核员工单台', '已提交举报', '补充说明（可选，最多 1000 字）', '举报说明',
    '价格', '可见性', '原因', '已保存。', '免费物品无需购买', '请先完成购买再下载',
  ]) {
    expect(compSrc, `SAMPLE 文案「${copy}」在真实产物里找不到`).toContain(copy);
  }
});

for (const scheme of ['dark', 'light'] as const) {
  test(`@smoke §FE-11 三态双主题渲染（${scheme}）：门面 / 三档按钮分档 / 零 console error`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: scheme });
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    });

    await page.setContent(htmlFor(scheme), { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.mk-card')).toHaveCount(3);
    await expect(page.locator('[data-marketplace-item-title]')).toHaveCount(3);
    // 徽标双态真渲染
    await expect(page.locator('[data-marketplace-purchased]')).toHaveText('已购买');
    await expect(page.locator('[data-marketplace-reported]')).toHaveText('已举报');
    // 两个 disclosure 面板展开态真渲染
    await expect(page.locator('.mi-panel')).toHaveCount(2);

    // 三档按钮语气视觉分档：主 / 幽灵 / 危险 的 background-color 两两不同（不是同一副裸样子）
    const bgOf = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor);
    const primary = await bgOf('.mi-btnPrimary');
    const ghost = await bgOf('.mi-btnGhost');
    const danger = await bgOf('.mi-btnDanger');
    expect(new Set([primary, ghost, danger]).size, `三档按钮视觉趋同：${primary} / ${ghost} / ${danger}`).toBe(3);

    expect(consoleErrors, `${scheme} 控制台有报错：\n${consoleErrors.join('\n')}`).toEqual([]);
  });
}

test('@smoke §FE-11 三处 disabled busy 真有视觉反馈（购买/下载/提交举报）', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });

  const enabled = page.locator('[data-marketplace-download="i1"]');
  const a = await enabled.evaluate((el) => {
    const s = getComputedStyle(el);
    return { cursor: s.cursor, opacity: s.opacity };
  });
  for (const hook of ['data-marketplace-purchase="i3"', 'data-marketplace-download="i3"', 'data-marketplace-report-submit="i3"']) {
    const b = await page.locator(`[${hook}]`).evaluate((el) => {
      const s = getComputedStyle(el);
      return { cursor: s.cursor, opacity: s.opacity };
    });
    expect(b.cursor, `${hook} disabled cursor 没变 progress`).toBe('progress');
    expect(parseFloat(b.opacity), `${hook} disabled 没有降透明度视觉`).toBeLessThan(parseFloat(a.opacity));
  }
});

test('@smoke §FE-11 键盘可达：按钮 / input / select 的 :focus-visible 描边真生效（真 Tab）', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });

  // 行 1 可聚焦顺序（按组件 JSX）：edit → download → remove → 数字 input → select → 保存。
  // 不写死 Tab 次数（易随顺序漂移）：循环 Tab 直到目标聚焦，最多 8 次，再验描边。
  const outline = (locator: ReturnType<typeof page.locator>) =>
    locator.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
  const tabUntilFocused = async (sel: string, label: string) => {
    const loc = page.locator(sel);
    let focused = false;
    for (let i = 0; i < 8; i++) {
      if (await loc.evaluate((el) => el === document.activeElement)) { focused = true; break; }
      await page.keyboard.press('Tab');
    }
    expect(focused, `${label} 连续 Tab 8 次仍没聚焦`).toBe(true);
    const o = await outline(loc);
    expect(o.style, `${label} 键盘 focus 无描边样式`).toBe('solid');
    expect(o.width, `${label} 键盘 focus 描边宽度为 0`).toBeGreaterThan(0);
  };

  await tabUntilFocused('[data-marketplace-edit-price="i1"]', '数字 input');
  await tabUntilFocused('[data-marketplace-edit-visibility="i1"]', 'select');
  await tabUntilFocused('[data-marketplace-edit-save="i1"]', '保存按钮');
});

test('@smoke §FE-11 hover / :active 真生效，reduced-motion 下产品关闭块真关掉', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });

  // ① hover：主按钮（保存，Primary）抬升真生效——只有 .mi-btnPrimary:hover 定义了 translateY(-1px)，
  //    幽灵/危险按钮刻意只换配色不抬升，故这里必选 Primary，别验错对象制造假红。
  const primary = page.locator('[data-marketplace-edit-save="i1"]');
  await primary.hover();
  await expect
    .poll(() => primary.evaluate((el) => getComputedStyle(el).transform), { message: '主按钮 hover 无 transform 抬升', timeout: 3_000 })
    .not.toBe('none');

  // ② :active：真鼠标按下，transform 从 hover 的 translateY 收到 scale(.97)（DOMMatrix.a<1）
  const box = await primary.boundingBox();
  if (!box) throw new Error('按钮无 boundingBox，无法验 :active');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await expect
      .poll(
        () => primary.evaluate((el) => {
          const t = getComputedStyle(el).transform;
          return t === 'none' ? 1 : new DOMMatrixReadOnly(t).a;
        }),
        { message: ':active 没触发 scale 收缩', timeout: 3_000 },
      )
      .toBeLessThan(1);
  } finally {
    await page.mouse.up();
  }

  // ③ reduced-motion：只切 emulateMedia，触发 globals.css .mi- 段自带产品块（零手工 !important 注入）。
  //    前半段已证非 reduced 下 hover 有 transform，故此处验到的 none 只能来自产品规则。
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  const reducedPrimary = page.locator('[data-marketplace-edit-save="i1"]');
  await reducedPrimary.hover();
  const reducedTransform = await reducedPrimary.evaluate((el) => getComputedStyle(el).transform);
  expect(reducedTransform, 'reduced-motion 下主按钮 hover 仍有 transform——产品 reduced 块没生效').toBe('none');
});

test('@smoke §FE-11 disclosure 面板展开动画在 reduced-motion 下被产品规则真关掉', async ({ page }) => {
  test.setTimeout(60_000);
  // 非 reduced：面板动画名是 mi-panel-in
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  const normal = await page.locator('.mi-panel').first().evaluate((el) => getComputedStyle(el).animationName);
  expect(normal, '面板没有展开动画').toBe('mi-panel-in');

  // reduced：只切 emulateMedia，产品 .mi-panel { animation:none } 应把动画名清成 none
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  const reduced = await page.locator('.mi-panel').first().evaluate((el) => getComputedStyle(el).animationName);
  expect(reduced, 'reduced-motion 下面板仍在播动画——产品 animation:none 没生效').toBe('none');
});
