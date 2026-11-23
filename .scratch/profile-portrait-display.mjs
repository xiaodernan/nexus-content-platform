// 无头跑 .scratch/profile-portrait-display.html，把读数收进 .scratch/profile-portrait-display.json
// （页面上量的是线上那张头像：508×586，object-fit: contain，边缘是不是"白线线"）
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const page_path = join(ROOT, '.scratch', 'profile-portrait-display.html');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('file:///' + page_path.replace(/\\/g, '/'));
await page.waitForFunction(() => Boolean(window.__PROBE_RESULT__), null, { timeout: 60_000 });
const result = await page.evaluate(() => window.__PROBE_RESULT__);
await page.screenshot({ path: join(ROOT, '.scratch', 'profile-portrait-display.png'), fullPage: true });
await browser.close();

writeFileSync(
  join(ROOT, '.scratch', 'profile-portrait-display.json'),
  JSON.stringify({ measuredAt: new Date().toISOString(), ...result }, null, 2),
);
console.log(result.lines.join('\n'));
process.exit(result.ok ? 0 : 1);
