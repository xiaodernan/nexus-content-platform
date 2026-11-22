import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 90)));
await page.goto('http://127.0.0.1:3100/onboarding', { waitUntil: 'networkidle', timeout: 90000 });
const n = await page.locator('[data-onboarding-done]').count();
for (let i = 0; i < n; i++) {
  await page.locator('[data-onboarding-done]').nth(i).click();
  await page.waitForTimeout(200);
}
const progress = await page.locator('[data-onboarding-progress-text]').textContent();
const pressed = await page.locator('[data-onboarding-done]').evaluateAll(els => els.map(e => e.getAttribute('aria-pressed')));
const stored = await page.evaluate(() => localStorage.getItem('nexus-onboarding-done'));
await page.reload({ waitUntil: 'networkidle' });
const afterReload = await page.locator('[data-onboarding-progress-text]').textContent();
console.log(JSON.stringify({ steps: n, progress, pressed, storedLen: stored?.length, afterReload, errs }, null, 1));
await browser.close();
