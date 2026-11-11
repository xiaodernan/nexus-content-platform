import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * §FE-10 市场购买页 `/marketplace/purchases` 门面的**浏览器那一寸**（脱离后端，纯 CSS + 真结构因果）。
 *
 * 为什么离线：本机 3100 常无干净窗口（上游 Next 未起时网关回 502），而 /marketplace/purchases
 * 是登录后页面，真页面要数据库 + 会话。本片门面的正确性只取决于两件事——purchases 真实产物的
 * **结构/文案/data 钩子/状态机类名**与产物 `.mp-` CSS 在真 Chromium 下的双主题渲染。二者都与
 * 后端数据无关。本 spec 从**产物真实字节**取这两样，用 `page.setContent` 离线注入，零后端零夹具。
 *
 * 为什么 markup 是"复刻样本"而非直接抽 JSX：purchases 是 client 组件，JSX 里含 `{error}`、
 * `{rows.map(...)}`、`disabled={busy===...}` 等 JS 表达式，裸 HTML 无法解释。因此这里人工构造一份
 * **覆盖四态（error/loading/empty/list）的静态 markup 样本**，但每个 className / data-* / 状态徽标
 * 文案 / 按钮文案都逐字取自真实产物（见下 SAMPLE 常量旁的出处行号）——验的是"真实门面类 + 真实
 * 结构钩子在真 Chrome 下的渲染因果"，不是"真页面点开过一遍"。诚实边界写进 ADR。
 *
 * 验五件静态门覆盖不了的事：
 *  1. 深/浅双主题下四态门面真渲染、状态徽标三色（在售/私密/下架）可达、零 console error；
 *  2. 下载按钮 busy 态 `:disabled` 真有视觉反馈（opacity/filter/cursor），四态不是同一副裸样子；
 *  3. 键盘 Tab 下 download / back 的 `:focus-visible` 描边真生效（真 Tab，非编程 focus）；
 *  4. hover / :active 的 transform 真生效（真鼠标 hover / 按下，非编程触发）；
 *  5. reduced-motion 只切 emulateMedia，验 globals.css 产品关闭块自身生效，零手工 !important 兜底。
 *
 * 静态那一寸归 `apps/web/test/marketplace-purchases-visual-style.test.ts`。
 */
const PAGE = join(process.cwd(), 'apps/web/src/app/marketplace/purchases/page.tsx');
const GLOBALS = join(process.cwd(), 'apps/web/src/app/globals.css');
const TOKENS = join(process.cwd(), 'apps/web/src/styles/tokens.css');

const pageSrc = readFileSync(PAGE, 'utf8');
const cssSrc = readFileSync(GLOBALS, 'utf8');
const tokensCss = readFileSync(TOKENS, 'utf8');

/** 从产物 globals.css 提取 `.mp-` 视觉段整段（到 forced-colors 块之前，含 reduced-motion）。 */
function extractMpSegment(css: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = clean.search(/\.mp-[A-Za-z]/);
  if (start < 0) throw new Error('globals.css 找不到 .mp- 视觉段——FE-10 没落地');
  const tail = clean.slice(start);
  const forcedAt = tail.search(/@media\s*\(forced-colors:\s*active\)/);
  return (forcedAt >= 0 ? tail.slice(0, forcedAt) : tail);
}

/**
 * 四态 markup 样本：className / data-* / 文案逐字取自真实产物字节。
 * 出处：purchases/page.tsx — mp-root/mp-frame/mp-head/mp-heading/mp-title/mp-subtitle/
 *   mp-headActions/mp-back（:90-104）；mp-error/mp-loading/mp-empty（:106-117）；
 *   mp-list/mp-row/mp-rowTop/mp-rowName/mp-type/mp-status/mp-statusLive|Private|Delisted/
 *   mp-date/mp-rowMeta/mp-download/mp-message（:119-166）。
 * 四态用四个独立 <main> 并排，各自带真实结构钩子，便于分别定位断言。
 */
const SAMPLE = `
<main class="mp-root" data-purchases-root>
  <div class="mp-frame">
    <header class="mp-head">
      <div class="mp-heading">
        <h1 class="mp-title">我的购买</h1>
        <p class="mp-subtitle">在这里买到的东西都留在这张单子上。条目下架后记录仍在——但交付门不再给包（页面上照实写）。</p>
      </div>
      <div class="mp-headActions"><a href="http://localhost/marketplace" class="mp-back" data-purchases-back>回市场</a></div>
    </header>

    <p class="mp-error" data-purchases-error>读取失败（500）</p>
    <p class="mp-loading" data-purchases-loading>加载中...</p>
    <p class="mp-empty" data-purchases-empty>还没有买过东西。<a href="http://localhost/marketplace">去市场看看</a>。</p>

    <ul class="mp-list" data-purchases-list>
      <li class="mp-row" data-purchase-row data-purchase-item="i1" data-purchase-status="public">
        <div class="mp-rowTop">
          <strong class="mp-rowName">潮汐组件包</strong>
          <span class="mp-type">组件</span>
          <span class="mp-status mp-statusLive" data-purchase-status-label>在售</span>
          <span class="mp-date" data-purchase-date>2026-11-01 08:30 UTC</span>
        </div>
        <div class="mp-rowMeta">
          <span>作者：盐海工坊</span><span data-purchase-price>实付 42 credits</span>
          <button type="button" class="mp-download" data-purchase-download="i1">下载</button>
          <span class="mp-message" data-purchase-message="i1">包已交付（设计文档 + 代码）。</span>
        </div>
      </li>
      <li class="mp-row" data-purchase-row data-purchase-item="i2" data-purchase-status="private">
        <div class="mp-rowTop">
          <strong class="mp-rowName">雾港模板</strong>
          <span class="mp-type">模板</span>
          <span class="mp-status mp-statusPrivate" data-purchase-status-label>已转私密（已购仍可下载）</span>
          <span class="mp-date" data-purchase-date>2026-10-12 11:05 UTC</span>
        </div>
        <div class="mp-rowMeta">
          <span>作者：灯塔工作室</span><span data-purchase-price>实付 18 credits</span>
          <button type="button" class="mp-download" data-purchase-download="i2" disabled>打包中...</button>
        </div>
      </li>
      <li class="mp-row" data-purchase-row data-purchase-item="i3" data-purchase-status="delisted">
        <div class="mp-rowTop">
          <strong class="mp-rowName">旧日素材集</strong>
          <span class="mp-type">素材</span>
          <span class="mp-status mp-statusDelisted" data-purchase-status-label>已下架（不再交付）</span>
          <span class="mp-date" data-purchase-date>2026-09-03 03:17 UTC</span>
        </div>
        <div class="mp-rowMeta">
          <span>作者：匿名</span><span data-purchase-price>实付 7 credits</span>
        </div>
      </li>
    </ul>
  </div>
</main>`;

const mpCss = extractMpSegment(cssSrc);

/** 真实 token + 真实 .mp- CSS + 四态样本装进一个 data-nexus-theme 可控文档。
 *  reduced-motion 门禁此文件注入任何手工关闭规则：产品 globals.css 的 .mp- 段自带
 *  @media (prefers-reduced-motion: reduce) 块，真 emulateMedia 触发它才验得到产品真规则；
 *  若在此处 !important 兜底，会让 A/B 退化成"验注入的 !important 生效"的同义反复。 */
function htmlFor(scheme: 'dark' | 'light'): string {
  return `<!doctype html><html lang="zh-CN" data-nexus-theme="${scheme}"><head><meta charset="utf-8" />
    <style>${tokensCss}</style>
    <style>
      :root { color-scheme: ${scheme}; }
      body { margin: 0; background: var(--nexus-color-bg-0); color: var(--nexus-color-fg-1); }
      ${mpCss}
    </style></head><body>${SAMPLE}</body></html>`;
}

test('@smoke §FE-10 样本锚真实产物：SAMPLE 的 mp- 类 / data-* 钩子 / 文案逐字出自 page.tsx', async () => {
  // 本 spec 的 SAMPLE 是人造静态 markup（client 组件含 JS 表达式，裸 HTML 解释不了）。
  // 这道门把 JSDoc 里"逐字取自真实产物"的承诺变成可执行判据：样本一旦与产物脱节就红，
  // 杜绝"测着一个早已和真实页面无关的自造样本却全绿"的诚实口子。零浏览器、纯字节比对。
  const classes = [...new Set([...SAMPLE.matchAll(/\bmp-[A-Za-z0-9-]+/g)].map((m) => m[0]!))];
  const missingClasses = classes.filter((c) => !pageSrc.includes(c));
  expect(missingClasses, `SAMPLE 用了产物里不存在的 mp- 类（样本与产物脱节）：${missingClasses.join(', ')}`).toEqual([]);

  const hooks = [...new Set([...SAMPLE.matchAll(/\bdata-[a-z-]+/g)].map((m) => m[0]!))];
  const missingHooks = hooks.filter((h) => !pageSrc.includes(h));
  expect(missingHooks, `SAMPLE 用了产物里不存在的 data-* 钩子：${missingHooks.join(', ')}`).toEqual([]);

  // 状态徽标 / 按钮 / 空态文案逐字在（下架"不再交付"、私密"仍可下载"的诚实措辞也在）
  for (const copy of ['我的购买', '回市场', '加载中...', '还没有买过东西。', '在售', '已转私密', '已下架', '下载', '打包中...']) {
    expect(pageSrc, `SAMPLE 文案「${copy}」在真实产物里找不到`).toContain(copy);
  }
});

for (const scheme of ['dark', 'light'] as const) {
  test(`@smoke §FE-10 购买页四态双主题渲染（${scheme}）：门面/状态徽标/零 console error`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: scheme });
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    });

    await page.setContent(htmlFor(scheme), { waitUntil: 'domcontentloaded' });

    // 门面骨架与四态钩子真渲染
    await expect(page.locator('.mp-root')).toBeVisible();
    await expect(page.locator('.mp-title')).toHaveText('我的购买');
    for (const hook of [
      'data-purchases-back', 'data-purchases-error', 'data-purchases-loading',
      'data-purchases-empty', 'data-purchases-list',
    ]) {
      await expect(page.locator(`[${hook}]`), `状态钩子 ${hook} 没渲染`).toHaveCount(1);
    }
    await expect(page.locator('[data-purchase-row]')).toHaveCount(3);
    // 三态徽标文案真在（诚实：下架不再交付、私密仍可下载）
    await expect(page.locator('[data-purchase-status-label]').nth(0)).toHaveText('在售');
    await expect(page.locator('[data-purchase-status-label]').nth(1)).toContainText('已转私密');
    await expect(page.locator('[data-purchase-status-label]').nth(2)).toContainText('已下架');

    // 四态不是同一副裸样子：error/loading/empty 的边框样式各不相同
    const styles = await Promise.all(
      ['.mp-error', '.mp-loading', '.mp-empty'].map((sel) =>
        page.locator(sel).evaluate((el) => {
          const s = getComputedStyle(el);
          return `${s.borderTopStyle}|${s.borderLeftWidth}`;
        }),
      ),
    );
    expect(new Set(styles).size, `四态视觉趋同：${styles.join(' , ')}`).toBeGreaterThan(1);

    expect(consoleErrors, `${scheme} 控制台有报错：\n${consoleErrors.join('\n')}`).toEqual([]);
  });
}

test('@smoke §FE-10 下载按钮 busy 态 :disabled 真有视觉反馈（全库门面首次覆盖）', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });

  const enabled = page.locator('[data-purchase-download="i1"]');
  const disabled = page.locator('[data-purchase-download="i2"]');
  const a = await enabled.evaluate((el) => {
    const s = getComputedStyle(el);
    return { cursor: s.cursor, opacity: s.opacity };
  });
  const b = await disabled.evaluate((el) => {
    const s = getComputedStyle(el);
    return { cursor: s.cursor, opacity: s.opacity };
  });
  expect(b.cursor, 'disabled 按钮 cursor 没变 progress').toBe('progress');
  expect(parseFloat(b.opacity), 'disabled 按钮没有降透明度视觉').toBeLessThan(parseFloat(a.opacity));
});

test('@smoke §FE-10 键盘可达：download / back 的 :focus-visible 描边真生效（真 Tab）', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });

  // 文档里可聚焦顺序：back 链接 → empty 内链接 → 两个 download 按钮（i3 下架无按钮）
  // 先 Tab 到 back 验一次；再连 Tab 越过 empty 链接落到 i1 download；最后 i2（disabled 不可聚焦，跳过）。
  await page.keyboard.press('Tab');
  await expect(page.locator('.mp-back')).toBeFocused();
  const backOutline = await page.locator('.mp-back').evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth };
  });
  expect(backOutline.style).toBe('solid');
  expect(parseFloat(backOutline.width)).toBeGreaterThan(0);

  await page.keyboard.press('Tab'); // empty 里的"去市场看看"
  await page.keyboard.press('Tab'); // i1 download
  await expect(page.locator('[data-purchase-download="i1"]')).toBeFocused();
  const dlOutline = await page.locator('[data-purchase-download="i1"]').evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth };
  });
  expect(dlOutline.style, 'download 键盘 focus 无描边样式').toBe('solid');
  expect(parseFloat(dlOutline.width), 'download 键盘 focus 描边宽度为 0').toBeGreaterThan(0);
});

test('@smoke §FE-10 hover / :active 真生效，reduced-motion 下产品关闭块真关掉', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });

  // ① hover：row 抬升真生效
  const row = page.locator('[data-purchase-row]').first();
  await row.hover();
  const hovered = await row.evaluate((el) => getComputedStyle(el).transform);
  expect(hovered, 'row hover 无 transform 抬升').not.toBe('none');

  // ② :active：真鼠标按下下载按钮，transform 从 hover 的 translateY 收到 scale(.97)，
  //    验的是 FE-10 首次补的 :active 交互态（不是测试名虚报）。DOMMatrix.a<1 即发生缩放。
  const dl = page.locator('[data-purchase-download="i1"]');
  await dl.hover();
  const box = await dl.boundingBox();
  if (!box) throw new Error('download 按钮无 boundingBox，无法验 :active');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await expect
      .poll(
        () =>
          dl.evaluate((el) => {
            const t = getComputedStyle(el).transform;
            return t === 'none' ? 1 : new DOMMatrixReadOnly(t).a;
          }),
        { message: ':active 没触发 scale 收缩——FE-10 首次补的 :active 交互态没生效', timeout: 3_000 },
      )
      .toBeLessThan(1);
  } finally {
    await page.mouse.up();
  }

  // ③ reduced-motion：只切 emulateMedia，触发 globals.css .mp- 段自带的
  //    @media (prefers-reduced-motion: reduce) 产品块（零手工 !important 注入）。
  //    前半段已证非 reduced 下 hover 有 transform，故此处验到的 none 只能来自产品规则。
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  const reducedRow = page.locator('[data-purchase-row]').first();
  await reducedRow.hover();
  const reducedTransform = await reducedRow.evaluate((el) => getComputedStyle(el).transform);
  expect(reducedTransform, 'reduced-motion 下 row hover 仍有 transform——产品 reduced 块没生效').toBe('none');
});
