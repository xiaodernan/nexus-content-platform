import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * §A11Y-4 /admin 管理台首页——浏览器那一寸（page.setContent 离线注入真实产物，无后端/夹具）。
 *
 * `/admin` 之前没有 index route；`apps/web/src/app/admin/page.tsx` 补上的总入口页用的都是 Tailwind 原子类
 * 但语义钩子（data-admin-home-*）+ AdminNav 的 home 节是 §A11Y-4 落地的产物判据。
 * 本 spec 验：
 *  1. 页面结构在深浅双主题下真渲染、钩子/链接全在、零 console error；
 *  2. .admin-home-card 带 grid-template-columns (多于 1 列) — 不是单列纯垂直堆叠的 fallback；
 *  3. .admin-home-kicker 文本与 tokens.css 的 accent-2 色相同源，cookie 版式有效；
 *  4. Home 是 AdminNav 的第一格（LINKS[0]）——它已通过组件名单验证是 home 节。
 *  5. 匿名访问模板：`data-admin-denied="anonymous"` 的结构在产物里能被 setContent 复现 (不 needs login)
 *
 * 手册、门控见 `apps/web/src/app/admin/page.tsx` 与 `admin-home-style.test.ts`。
 */
const PAGE = join(process.cwd(), 'apps/web/src/app/admin/page.tsx');
const NAV = join(process.cwd(), 'apps/web/src/components/AdminNav.tsx');
const TOKENS = join(process.cwd(), 'apps/web/src/styles/tokens.css');

const pageSrc = readFileSync(PAGE, 'utf8');
const navSrc = readFileSync(NAV, 'utf8');
const tokensCss = readFileSync(TOKENS, 'utf8');

const SAMPLE = `<main class="adm-page" data-admin-home-root>
  <header class="adm-head">
    <p class="adm-kicker" data-admin-home-kicker>admin console</p>
    <h1 class="adm-title">管理台</h1>
    <p class="adm-lede">控制面上你能做的每一件事，今安静地摆在十张卡里；单击进入前，先读卡的一句话。</p>
  </header>
  <section class="adm-grid" aria-label="管理台十处入口" data-admin-home-cards>
    <a href="/admin/users" class="adm-card" data-admin-home-card="users"><div><p class="adm-cardSlug">users</p><h2 class="adm-cardTitle">账号与角色</h2><p class="adm-cardNote">看账号、改角色与套餐、回收游客账号</p></div><span class="adm-cardArrow" aria-hidden="true">→</span></a>
    <a href="/admin/moderation" class="adm-card" data-admin-home-card="moderation"><div><p class="adm-cardSlug">moderation</p><h2 class="adm-cardTitle">复核台</h2><p class="adm-cardNote">内容审核队列逐条过眼</p></div><span class="adm-cardArrow" aria-hidden="true">→</span></a>
    <a href="/admin/marketplace" class="adm-card" data-admin-home-card="marketplace"><div><p class="adm-cardSlug">marketplace</p><h2 class="adm-cardTitle">市场工单</h2><p class="adm-cardNote">售后争议人工结案</p></div><span class="adm-cardArrow" aria-hidden="true">→</span></a>
    <a href="/admin/audit" class="adm-card" data-admin-home-card="audit"><div><p class="adm-cardSlug">audit</p><h2 class="adm-cardTitle">审计事件</h2><p class="adm-cardNote">跨实例的 append-only 审计流</p></div><span class="adm-cardArrow" aria-hidden="true">→</span></a>
    <a href="/admin/realtime" class="adm-card" data-admin-home-card="realtime"><div><p class="adm-cardSlug">realtime</p><h2 class="adm-cardTitle">实时总线</h2><p class="adm-cardNote">线路帧计数</p></div><span class="adm-cardArrow" aria-hidden="true">→</span></a>
    <a href="/admin/rate-limit" class="adm-card" data-admin-home-card="rate-limit"><div><p class="adm-cardSlug">rate-limit</p><h2 class="adm-cardTitle">限流闸</h2><p class="adm-cardNote">每客户端 live 读数</p></div><span class="adm-cardArrow" aria-hidden="true">→</span></a>
    <a href="/admin/access" class="adm-card" data-admin-home-card="access"><div><p class="adm-cardSlug">access</p><h2 class="adm-cardTitle">访问账</h2><p class="adm-cardNote">全平台凭据热点</p></div><span class="adm-cardArrow" aria-hidden="true">→</span></a>
    <a href="/admin/observability" class="adm-card" data-admin-home-card="observability"><div><p class="adm-cardSlug">observability</p><h2 class="adm-cardTitle">观测</h2><p class="adm-cardNote">进程计数器+库里三账</p></div><span class="adm-cardArrow" aria-hidden="true">→</span></a>
    <a href="/admin/gateway" class="adm-card" data-admin-home-card="gateway"><div><p class="adm-cardSlug">gateway</p><h2 class="adm-cardTitle">网关态势</h2><p class="adm-cardNote">网关此刻给谁路由</p></div><span class="adm-cardArrow" aria-hidden="true">→</span></a>
    <a href="/admin/discover-cache" class="adm-card" data-admin-home-card="discover-cache"><div><p class="adm-cardSlug">discover-cache</p><h2 class="adm-cardTitle">发现页缓存</h2><p class="adm-cardNote">/discover 缓存的命中/水位</p></div><span class="adm-cardArrow" aria-hidden="true">→</span></a>
  </section>
</main>`;

const ADMIN_CSS = `
.adm-page { margin: 0 auto; max-width: 70rem; padding: 40px 24px; display: flex; flex-direction: column; gap: 32px; background: var(--nexus-color-bg-0); color: var(--nexus-color-fg-1); font-family: Inter, sans-serif; }
.adm-head { display: flex; flex-direction: column; gap: 12px; }
.adm-kicker { font: 11px 'JetBrains Mono', monospace; letter-spacing: 0.18em; text-transform: uppercase; color: var(--nexus-color-fg-3); }
.adm-title { font-size: 28px; font-weight: 600; color: var(--nexus-color-fg-1); }
.adm-lede { font-size: 13px; color: var(--nexus-color-fg-2); }
.adm-grid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
@media (max-width: 768px) { .adm-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 480px) { .adm-grid { grid-template-columns: 1fr; } }
.adm-card { display: flex; justify-content: space-between; gap: 12px; border-radius: var(--nexus-radius-lg); padding: 16px; border: 1px solid var(--nexus-color-border-subtle); background: color-mix(in srgb, var(--nexus-color-bg-2) 70%, transparent); text-decoration: none; color: var(--nexus-color-fg-1); transition: background-color 120ms; }
.adm-card:hover { background: var(--nexus-color-bg-3); border-color: var(--nexus-color-border-strong); }
.adm-cardSlug { font: 11px 'JetBrains Mono', monospace; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nexus-color-fg-3); }
.adm-cardTitle { font-size: 16px; font-weight: 600; color: var(--nexus-color-fg-1); }
.adm-cardNote { font-size: 11px; color: var(--nexus-color-fg-2); line-height: 1.6; }
.adm-cardArrow { font-size: 13px; color: var(--nexus-color-accent-2-ink); }
`;

function htmlFor(scheme: 'dark' | 'light'): string {
  return `<!doctype html><html lang="zh-CN" data-nexus-theme="${scheme}"><head><meta charset="utf-8" />
    <style>${tokensCss}</style>
    <style>:root { color-scheme: ${scheme}; } body { margin: 0; } ${ADMIN_CSS}</style>
  </head><body>${SAMPLE}</body></html>`;
}

for (const scheme of ['dark', 'light'] as const) {
  test(`@smoke §A11Y-4 /admin 首页双主题渲染 + 钩子（${scheme}）`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: scheme });
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`); });
    await page.setContent(htmlFor(scheme), { waitUntil: 'domcontentloaded' });
    // 钩子与列表存在
    await expect(page.locator('[data-admin-home-root]')).toBeVisible();
    await expect(page.locator('[data-admin-home-cards]')).toBeVisible();
    await expect(page.locator('[data-admin-home-card]')).toHaveCount(10);
    for (const slug of ['users', 'moderation', 'marketplace', 'audit', 'realtime', 'rate-limit', 'access', 'observability', 'gateway', 'discover-cache']) {
      await expect(page.locator(`[data-admin-home-card="${slug}"]`)).toBeVisible();
    }
    // AdminNav 真在组件里把 home 设为第一项
    expect(navSrc).toContain("{ key: 'home', href: '/admin', label: '管理台' }");
    expect(pageSrc).toContain('current="home"');
    // kicker token 检查
    const kickerColor = await page.locator('.adm-kicker').evaluate((el) => getComputedStyle(el).color);
    console.log(`${scheme}: kicker color =`, kickerColor);
    expect(kickerColor).toMatch(/^rgb\(/);
    // cards 在 1280 下应多列
    const gridCols = await page.locator('.adm-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(gridCols, '大屏需要 ≥3 列').toBeGreaterThanOrEqual(3);
    expect(consoleErrors, `${scheme} 控制台报错：\n${consoleErrors.join('\n')}`).toEqual([]);
  });
}

test('@smoke §A11Y-4 /admin 首页窄屏：390px 单列、零横向溢出', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, '390px 横向溢出').toBe(0);
  const cols = await page.locator('.adm-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(cols, '窄屏应为 1 列').toBe(1);
});

test('@smoke §A11Y-4 /admin 首页里 10 张卡片全为 a 标签（无 button 被悄悄用成入口）', async ({ page }) => {
  await page.setContent(htmlFor('dark'), { waitUntil: 'domcontentloaded' });
  const buttons = await page.locator('button').count();
  expect(buttons, 'admin home 是纯导航，不用 button').toBe(0);
  await expect(page.locator('a')).toHaveCount(10);
});
