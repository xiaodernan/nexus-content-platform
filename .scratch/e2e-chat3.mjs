import { chromium } from 'playwright';

const BASE = 'http://localhost:3100';
const EMAIL = `llmctx-verify2-${Date.now().toString(36)}@nexus.test`;
const PASSWORD = 'e2e-secret-123';

async function main() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await context.newPage();

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-auth-tab="register"]', { timeout: 60000 });
  for (let i = 0; i < 20; i++) {
    await page.click('[data-auth-tab="login"]').catch(() => {});
    const woke = await page.waitForSelector('[data-auth-displayname]', { state: 'detached', timeout: 1000 }).then(() => true).catch(() => false);
    if (woke) break;
  }
  await page.click('[data-auth-tab="register"]').catch(() => {});
  await page.fill('[data-auth-displayname]', '大典验证二');
  await page.fill('[data-auth-email]', EMAIL);
  await page.fill('[data-auth-password]', PASSWORD);
  await page.click('[data-auth-submit]');
  await page.waitForFunction(() => document.querySelector('[data-auth-identity]')?.getAttribute('data-auth-identity') === 'member', undefined, { timeout: 40000 }).catch(() => {});

  await page.fill('[data-project-name-input]', '大典验证项目二').catch(() => {});
  await page.waitForSelector('[data-create-project]:not([disabled])', { timeout: 30000 }).catch(() => {});
  await page.click('[data-create-project]').catch(() => {});
  await page.waitForURL(/\/studio\/[^/]+$/, { timeout: 120000 }).catch(() => {});
  const projectId = new URL(page.url()).pathname.split('/').pop();
  await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 120000 });

  await page.click('[data-panel-tab="characters"]').catch(() => {});
  await page.waitForTimeout(1500);
  const nameInput = page.locator('input').filter({ hasNot: page.locator('[disabled]') }).nth(0);
  // 面板里第一个 input 就是「新角色名字」
  const inputs = page.locator('[data-panel-body] input, .rail input, aside input, [data-characters-panel] input');
  console.log('panel inputs =', await inputs.count());
  await inputs.first().fill('更漏');
  await page.locator('button', { hasText: '建' }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  console.log('after create, chat inputs =', await page.locator('.ch-row input').count());

  if (await page.locator('.ch-row input').count() > 0) {
    await page.locator('.ch-row input').first().fill('盐账欠的最后一格记的是什么？');
    await page.locator('.ch-row button').first().click();
    await page.waitForSelector('[data-character-chat-msg="character"]', { timeout: 300000 });
    await page.waitForTimeout(1500);
    console.log('CANON LINE:', await page.locator('[data-character-chat-canon]').first().textContent().catch(() => null));
    console.log('CACHE LINE:', await page.locator('[data-character-chat-cache]').first().textContent().catch(() => null));
    console.log('REPLY:', ((await page.locator('[data-character-chat-msg="character"]').last().textContent().catch(() => '')) || '').slice(0, 240));
    await page.screenshot({ path: 'D:/内容创作平台/screenshots/llmctx-character-chat.png' });
  } else {
    await page.screenshot({ path: 'D:/内容创作平台/screenshots/llmctx-no-chat-input.png' });
  }
  await browser.close();
}
main();