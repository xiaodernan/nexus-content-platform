import { chromium } from 'playwright';

const url = process.argv[2];
const out = process.argv[3];
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 900);
const scheme = process.argv[6] || 'light'; // 'light' | 'dark' | 'no-preference'
if (!url || !out) {
  console.error('usage: node tools/harness/shot.mjs <url> <out> [w] [h] [scheme]');
  process.exit(2);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width, height }, colorScheme: /** @type any */ (scheme) });
const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
console.log('status', resp?.status());
await page.waitForTimeout(8000);
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log('saved', out);
process.exit(0);
