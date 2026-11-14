/**
 * §A11Y-4 取证：本机 live 渲染 `/admin`（§A11Y-4 新增的管理台首页）。
 *
 * 登录用本地测试夹具 admin `obs-admin+fixture@nexus.test`（dev DB 里唯一的 admin；
 * 注册自 repo 既有的 e2e admin fixture 流程，`npm run e2e:admin-fixture` 幂等可复核）。
 * 登录后只读访问 `/admin`——本页无任何写路径（纯导航），无需 dry-run/回滚那一套。
 *
 * 截图落 docs/evidence/admin-home/（dark / narrow 390 / forced-colors）。
 *
 * 用法：
 *   npm run dev -w @nexus/web
 *   npx tsx scripts/capture-admin-home.mts
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:3100';
const outDir = fileURLToPath(new URL('../docs/evidence/admin-home/', import.meta.url));
await mkdir(outDir, { recursive: true });

const ADMIN = 'obs-admin+fixture@nexus.test';
const SECRET = 'e2e-secret-123';

const browser = await chromium.launch({ channel: 'chrome' });

async function login(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-auth-tab="login"]', { timeout: 60_000 });
  for (let attempt = 1; attempt <= 20; attempt++) {
    await page.click('[data-auth-tab="login"]');
    const woke = await page
      .waitForSelector('[data-auth-displayname]', { state: 'detached', timeout: 1_000 })
      .then(() => true)
      .catch(() => false);
    if (woke) break;
    if (attempt === 20) throw new Error('登录 Tab 点了 20 次没醒——React 还没挂载');
  }
  await page.fill('[data-auth-email]', ADMIN);
  await page.fill('[data-auth-password]', SECRET);
  await page.click('[data-auth-submit]');
  await page.waitForFunction(
    () => document.querySelector('[data-auth-identity]')?.getAttribute('data-auth-identity') === 'member',
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

// ── 深/浅两种主题各渲染一次 ────────────────────────────────
for (const theme of ['dark', 'light'] as const) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: theme,
  });
  const page = await login(context);
  await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-admin-home-root]', { timeout: 60_000 });
  const count = await page.locator('[data-admin-home-card]').count();
  console.log(`${theme}: ${count} cards, url=${page.url()}`);
  if (count !== 10) throw new Error(`${theme}: expected 10 cards, got ${count}`);
  const texts = await page.locator('[data-admin-home-card] h2').allTextContents();
  console.log(`${theme} cards: ${texts.join(' / ')}`);
  await page.screenshot({ path: `${outDir}${theme}.png`, fullPage: true });
  await context.close();
}

// ── 窄视口（390px）：grid 应塌成单列，卡片不横向溢出 ─────────
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
    isMobile: true,
  });
  const page = await login(context);
  await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-admin-home-root]', { timeout: 60_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`narrow: horizontal overflow = ${overflow}px`);
  await page.screenshot({ path: `${outDir}narrow-390.png`, fullPage: true });
  await context.close();
  if (overflow > 0) throw new Error(`narrow: 横向溢出 ${overflow}px`);
}

// ── forced-colors：每卡的渐变/描边在砍色后仍说得清自己是可点入口 ─
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: 'dark',
    forcedColors: 'active',
  });
  const page = await login(context);
  await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-admin-home-root]', { timeout: 60_000 });
  await page.screenshot({ path: `${outDir}forced-colors.png`, fullPage: true });
  await context.close();
}

await browser.close();
console.log('captured docs/evidence/admin-home/*.png');
