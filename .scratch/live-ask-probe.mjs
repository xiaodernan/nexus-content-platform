import { chromium } from 'playwright';

const BASE = 'http://localhost:3100';
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--no-sandbox'] });
const errors = [];

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1000);

// register guest
const reg = await page.evaluate(async () => {
  const csrf = document.cookie.match(/nexus_csrf=([^;]+)/)?.[1] ?? '';
  const email = `probe-${Date.now().toString(36)}@example.com`;
  const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ email, password: 'Probe-4242', displayName: 'probe' }) });
  return { status: r.status };
});
console.log('register:', reg.status);

await page.goto(`${BASE}/bible/ask`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1200);

const questions = [
  { q: '雾港灯塔那一盏一直亮着的灯，它是哪一盏？', expected: '未见补充回答不准确码库' },
  { q: '候潮院最窄的一间屋子里有什么？', expected: '看起来没有文字' },
  { q: '潮候院为什么不打开那根石柱？', expected: '不予揭晓' },
];

for (const { q, expected } of questions) {
  await page.fill('[data-bible-ask-input]', q);
  await page.click('[data-bible-ask-submit]');
  const badges = [];
  try {
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-bible-ask-answer]');
      return el && el.textContent && el.textContent.trim().length > 8 && !el.textContent.includes('璇氬疄');
    }, { timeout: 30000 });
    const answer = await page.textContent('[data-bible-ask-answer]');
    const badge = await page.textContent('[data-bible-ask-badge]').catch(() => null);
    console.log(`\nQ: ${q}`);
    console.log(`A: ${(answer ?? '').trim().replace(/\s+/g, ' ').slice(0, 260)}`);
    console.log(`badge: ${badge ?? '(none)'}`);
  } catch (e) {
    console.log(`\nQ: ${q}\nTIMEOUT`);
  }
}
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
