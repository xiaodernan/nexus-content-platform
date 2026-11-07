import { chromium } from '@playwright/test';
const BASE = 'http://localhost:3100';
const OUT = '.scratch/shots';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });

for (const [name, path] of [['home', '/'], ['discover', '/discover'], ['market', '/marketplace']]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.documentElement.setAttribute('data-nexus-theme', 'light'));
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/40-${name}-light.png` });
  const read = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-nexus-theme'),
    body: getComputedStyle(document.body).backgroundColor,
    link: getComputedStyle(document.querySelector('a[href]') ?? document.body).color,
  }));
  console.log(name, JSON.stringify(read));
}
console.log(errors.length ? `控制台报错 ${errors.length}：${errors.slice(0, 5).join(' | ')}` : '控制台无报错');
await browser.close();
