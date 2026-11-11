import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GLOBALS = join(process.cwd(), 'apps/web/src/app/globals.css');
const css = readFileSync(GLOBALS, 'utf8');
const marker = '@media (forced-colors: active)';
const start = css.indexOf(marker);
const braceStart = css.indexOf('{', start);
let depth = 0, end = braceStart;
for (; end < css.length; end++) {
  if (css[end] === '{') depth++;
  else if (css[end] === '}') { depth--; if (depth === 0) break; }
}
const forcedBlock = css.slice(start, end + 1);
const rule = forcedBlock.replace(/\.dv-title,\s*\.mk-title,\s*\.hp-heroTitle,\s*\.se-title,\s*\.pf-name,\s*\.pb-title,\s*\.pp-title,\s*\.ss-title/, '.ink');
const baseline = `.ink { color: transparent; background: linear-gradient(120deg, #111 20%, #555 80%); -webkit-background-clip: text; background-clip: text; font: 700 28px sans-serif; }`;

const browser = await chromium.launch({ channel: 'chrome' });
for (const forced of [false, true]) {
  for (const withFix of [false, true]) {
    const page = await browser.newPage();
    await page.emulateMedia({ forcedColors: forced ? 'active' : 'none' });
    await page.setContent(`<style>${baseline}\n${withFix ? rule : ''}</style><h1 class="ink">高对比度标题</h1>`);
    const s = await page.locator('.ink').evaluate((el) => {
      const c = getComputedStyle(el);
      return {
        color: c.color,
        backgroundImage: c.backgroundImage,
        backgroundClip: c.backgroundClip,
        webkitBackgroundClip: c.webkitBackgroundClip,
        forcedColorAdjust: c.forcedColorAdjust,
        visibility: c.visibility,
      };
    });
    console.log(JSON.stringify({ forced, withFix, ...s }));
    await page.close();
  }
}
await browser.close();
