import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0,80)));
await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForSelector('[data-project-name-input]', { timeout: 60000 });
await page.fill('[data-project-name-input]', '牵线终验2');
await page.waitForSelector('[data-create-project]:not([disabled])', { timeout: 15000 });
const resp = page.waitForResponse(r => new URL(r.url()).pathname === '/api/projects', { timeout: 15000 }).catch(()=>null);
await page.click('[data-create-project]'); await resp;
await page.waitForURL(/\/studio\/[^/]+$/, { timeout: 60000 });
const id = new URL(page.url()).pathname.split('/').pop();
await page.waitForSelector('[data-canvas-frame]', { timeout: 60000 });
await page.click('[data-panel-tab="world"]');
await page.waitForSelector('[data-world-panel]', { timeout: 30000 });
const create = page.locator('[data-world-create]');
if (await create.count()) await create.click();
await page.waitForSelector('[data-world-ai-fill]', { timeout: 30000 });
await page.fill('[data-world-summary]', '灰灯纪之后，盐道尽头的潮候院靠一口老石磨记时；每逢潮退，磨盘会磨出不属于这个纪元的盐。');
await page.locator('[data-world-summary]').press('Tab'); await page.waitForTimeout(2000);
const notes = [];
for (const kind of ['geography', 'factions']) {
  await page.selectOption('[data-world-new-kind]', kind);
  await page.click('[data-world-ai-fill]');
  await page.waitForTimeout(9000);
  notes.push(await page.locator('[data-world-ai-fill-note]').textContent().catch(()=>'(none)'));
}
const bodies = await page.locator('[data-world-body]').evaluateAll(els => els.map(e => ({id:e.getAttribute('data-world-body'), v:e.value||''})));
const filled = bodies.filter(b => b.v.length > 30);
if (filled.length < 2) { console.log(JSON.stringify({ notes, filled: filled.length })); await browser.close(); process.exit(0); }
const target = filled[0];
await page.locator(`[data-world-ai-link="${target.id}"]`).click();
await page.waitForTimeout(10000);
const linkNote = await page.locator('[data-world-ai-link-note]').textContent().catch(()=>'(none)');
const doc = await (await ctx.request.get(`http://127.0.0.1:3100/api/projects/${id}/world`)).json();
console.log(JSON.stringify({ notes, filled: filled.length, linkNote, links: (doc.world?.links||[]).map(l=>({to:l.to,label:l.label})), errs }, null, 1));
await page.screenshot({ path: '.scratch/final-link2.png', fullPage: false });
await browser.close();
