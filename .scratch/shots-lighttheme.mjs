import { chromium } from '@playwright/test';
const BASE = 'http://localhost:3100';
const [EMAIL, THEME] = process.argv.slice(2);
const OUT = '.scratch/shots';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });

/** 主题不是产品入口能切的（layout.tsx 把 data-nexus-theme 钉成 dark），所以看图时手动改写属性。 */
async function forceTheme() {
  await page.evaluate((t) => document.documentElement.setAttribute('data-nexus-theme', t), THEME);
  const now = await page.evaluate(() => document.documentElement.getAttribute('data-nexus-theme'));
  if (now !== THEME) throw new Error(`主题没改过来：${now}`);
}
async function wake() {
  for (let i = 1; i <= 20; i++) {
    await page.click('[data-auth-tab="login"]');
    const ok = await page.waitForSelector('[data-auth-displayname]', { state: 'detached', timeout: 1_000 }).then(() => true).catch(() => false);
    if (!ok) continue;
    await page.click('[data-auth-tab="register"]');
    await page.waitForSelector('[data-auth-displayname]', { state: 'attached', timeout: 5_000 });
    return;
  }
  throw new Error('水合没等到');
}
async function shot(name) { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log(`saved ${name}`); }

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-site-nav]');
await page.waitForTimeout(600);
await forceTheme();
await shot(`30-home-${THEME}`);

await page.waitForSelector('[data-auth-tab="login"]', { timeout: 60_000 });
await wake();
await page.click('[data-auth-tab="login"]');
await page.fill('[data-auth-email]', EMAIL);
await page.fill('[data-auth-password]', 'e2e-secret-123');
await page.click('[data-auth-submit]');
await page.waitForFunction(() => document.querySelector('[data-auth-identity]')?.getAttribute('data-auth-identity') === 'member', { timeout: 30_000 });
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-project-name-input]');
await forceTheme();
await shot(`31-home-member-${THEME}`);
const href = await page.evaluate(() => document.querySelector('a[href^="/studio/"]')?.getAttribute('href') ?? null);
console.log('studio:', href);
await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-canvas-frame]', { timeout: 60_000 });
await page.waitForTimeout(2_000);
await forceTheme();
await shot(`32-studio-${THEME}`);
await page.goto(`${BASE}/marketplace`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1_500);
await forceTheme();
await shot(`33-market-${THEME}`);
console.log('console errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
