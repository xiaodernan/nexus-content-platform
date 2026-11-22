import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 80)));
const posts = [];
page.on('request', r => { if (r.url().includes('/api/ai/world-fill')) posts.push(JSON.parse(r.postData() || '{}')); });
await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForSelector('[data-project-name-input]', { timeout: 60000 });
await page.fill('[data-project-name-input]', 'RAG填料实测');
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
await page.selectOption('[data-world-new-kind]', 'geography');
await page.click('[data-world-ai-fill]');
await page.waitForTimeout(9000);
await page.selectOption('[data-world-new-kind]', 'factions');
await page.click('[data-world-ai-fill]');
await page.waitForTimeout(9000);
const doc = await (await ctx.request.get(`http://127.0.0.1:3100/api/projects/${id}/world`)).json();
const nodes = doc.world?.nodes || [];
console.log(JSON.stringify({
  posts: posts.map(p => ({ kind: p.kind, contextCount: (p.context || []).length, contextTitles: (p.context || []).map(c => c.title) })),
  filled: nodes.filter(n => (n.body || '').length > 20).map(n => ({ kind: n.kind, title: n.title, body: n.body.slice(0, 80) })),
  errs,
}, null, 1));
await browser.close();
