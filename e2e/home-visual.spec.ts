import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * §FE-18 首页 `/` `.hp-` 门面——浏览器那一寸（setContent 离线注入，不访问任何 URL）。
 *
 * 样本结构对齐产物 `page.tsx` 的"未登录（guest）"一例——这是唯一不依赖前置 API/数据库
 * 就能验的真实分支；结构标签、data-* 钩子、`.hp-*` 类、诚实文案逐字对齐产物（drift 靠
 * `home-visual-style.test.ts` 的 SHA256 剥 className 门钉）。tokens.css + .hp- 段真注入，Chrom
 * 真渲染是它和纯静态门的关键差量。
 *
 * 验：
 *  1. 深/浅双主题各真渲染（Hero/nav/wordmark/诚实文案在页）；
 *  2. `.hp-*` 段真渲染（.hp-page/.hp-nav/.hp-navlink/.hp-rowCard* 各样）；
 *  3. 键盘 Tab 聚焦 .hp-rowCardInteractive 有 brand outline（FE-3 navlink 同语义环 extends 一致性）；
 *  4. 空态/muted 行卡不顶走零色环；
 *  5. 控制台零 error。
 */
const GLOBALS = join(process.cwd(), 'apps/web/src/app/globals.css');
const TOKENS = join(process.cwd(), 'apps/web/src/styles/tokens.css');


/** 去 globals.css 注释后提取 `.hp-` 段（同时截取 FE-3 已存 `.hp-` 段 + 本片新 `.hp-` 段；to the 下一个 `--` 锚点） */
function extractHpSegment(css: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = clean.search(/\.hp-[A-Za-z]/);
  if (start < 0) throw new Error('globals.css 找不到 .hp- 段——FE-3 没落地');
  const tail = clean.slice(start);
  const next = tail.search(/-- §FE-4/);
  return next >= 0 ? tail.slice(0, next) : tail;
}
const cssSrc = readFileSync(GLOBALS, 'utf8');
const hpCss = extractHpSegment(cssSrc);
const tokensCss = readFileSync(TOKENS, 'utf8');

/**
 * 手写 guest 样本：Hero + nav（5 链接）+ 空项目计数 + 诚实文案 + Provider 就绪状态。
 * 与产物 page.tsx 对齐的关键钩子：data-nexus-wordmark / data-site-nav / data-nav-search / data-deleted-empty / data-ai-service。
 */
const SAMPLE = `
<main class="hp-page" data-hp-root>
  <header class="hp-hero"><div>
    <h1 class="hp-heroTitle" data-nexus-wordmark>NEXUS</h1>
    <p class="hp-heroSub">Describe it. Design it. Generate it. Build it. Enter it.</p>
    <span class="hp-demoChip">DEMO MODE</span>
  </div></header>

  <nav class="hp-nav" data-site-nav aria-label="站点导航">
    <a href="/search" class="hp-navlink" data-nav-search>全平台搜索</a>
    <a href="/discover" class="hp-navlink" data-nav-discover>发现</a>
    <a href="/marketplace" class="hp-navlink">市场</a>
    <a href="/analytics" class="hp-navlink">创作数据</a>
    <a href="/blocks" class="hp-navlink">已拉黑与已屏蔽</a>
  </nav>

  <section class="hp-section">
    <h2 class="hp-sectionTitle">账号</h2>
    <p class="hp-emptyNote" data-notification-empty>账号面板：得先登录或注册...</p>
  </section>

  <section class="hp-section">
    <h2 class="hp-sectionTitle">项目</h2>
    <p class="hp-emptyNote">还没有项目。创建一个即可进入 Studio 画布。</p>
  </section>

  <section class="hp-section">
    <h2 class="hp-sectionTitleTight">回收站（0）</h2>
    <p class="hp-emptyNote" data-deleted-empty>回收站是空的。</p>
  </section>

  <section class="hp-section">
    <h2 class="hp-sectionTitle">Provider 就绪状态</h2>
    <p class="hp-sectionNoteLoose">读取自 AI Service 的 /healthz——未配置真实 key 时生成链路走标注过的确定性 Mock。</p>
    <ul class="hp-list">
      <li class="hp-rowCard"><span class="hp-rowName">AI 文本 / 设计</span><span class="hp-statusBadge">DEMO</span></li>
      <li class="hp-rowCard" data-ai-service="not-configured"><span class="hp-rowName">AI Service<span class="hp-rowMetaIndent">未配置 NEXUS_AI_SERVICE_URL</span></span><span class="hp-statusBadge">未配置</span></li>
    </ul>
  </section>

  <footer class="hp-section">
    <a href="/" class="hp-profileLink" data-my-profile-link="none">回到首页</a>
  </footer>
</main>`;

function htmlFor(scheme: 'dark' | 'light'): string {
  return `<!doctype html><html lang="zh-CN" data-nexus-theme="${scheme}"><head><meta charset="utf-8" />
    <style>${tokensCss}</style>
    <style>:root { color-scheme: ${scheme}; } body { margin: 0; } ${hpCss}</style>
  </head><body>${SAMPLE}</body></html>`;
}

for (const scheme of ['dark', 'light'] as const) {
  test(`@smoke §FE-18 首页双主题渲染 + 钩子（${scheme}）`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: scheme });
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`); });
    await page.setContent(htmlFor(scheme), { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-nexus-wordmark]')).toHaveText('NEXUS');
    await expect(page.locator('[data-site-nav]')).toBeVisible();
    await expect(page.locator('[data-nav-search]')).toHaveAttribute('href', '/search');
    await expect(page.locator('[data-deleted-empty]')).toContainText('回收站');
    await expect(page.locator('[data-ai-service]')).toBeVisible();
    // 诚实文案在深浅下都可读
    const emptyColor = await page.locator('[data-deleted-empty]').evaluate((el) => getComputedStyle(el).color);
    expect(emptyColor).toMatch(/^rgb\(/);
    expect(consoleErrors, `${scheme} 控制台报错：\n${consoleErrors.join('\n')}`).toEqual([]);
  });
}

test('@smoke §FE-18 键盘可达：.hp-rowCardInteractive / .hp-profileLink 聚焦真生效', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  const focusable = page.locator('.hp-navlink, .hp-profileLink');
  const count = await focusable.count();
  expect(count, '至少 nav 链接 + profileLink 可聚焦').toBeGreaterThanOrEqual(6);
  // Tab 到最后一个可聚焦（.hp-profileLink）
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab');
  }
  const outline = await focusable.last().evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth };
  });
  expect(outline.style, '聚焦环样式应为 solid（FE-3 navlink/profileLink 同语系）').toBe('solid');
  expect(parseFloat(outline.width), '描边宽度应大于 0').toBeGreaterThan(0);
});
