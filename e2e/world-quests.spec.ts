import { test, expect } from '@playwright/test';
import { reusableMemberWithProject } from './support/auth-session';

/**
 * §WORLD-QUEST「世界委托」的浏览器读数（§158：Run → Test → Screenshot → Inspect）。
 *
 * 夹具直接经过产品自己的接口：登录/注册（复用 a11y 夹具账号）→ 建项目 → PUT 一份真世界文档。
 * 世界里有意的缺口：1 张空页、1 条薄注、1 条未标纪元、1 组序号撞号、1 座孤岛；
 * 委托板必须从这些真字段算出数字，而不是页面自己写死。
 */

const EMAIL = 'a11y-opened+fixture@nexus.test';
const PASSWORD = 'e2e-secret-123';
const T = '2026-11-22T00:00:00.000Z';
const LONG = '字'.repeat(130);

function worldDocument(projectId: string) {
  return {
    id: `wq-${projectId}`,
    projectId,
    name: '委托夹具世界',
    summary: '',
    nodes: [
      { id: 'n1', kind: 'lore', title: '空页', body: '', updatedAt: T },
      { id: 'n2', kind: 'lore', title: '薄注', body: '短短一句', updatedAt: T },
      { id: 'n3', kind: 'story', title: '无纪', body: LONG, updatedAt: T, lore: { order: 0 } },
      { id: 'n4', kind: 'story', title: '撞一', body: LONG, updatedAt: T, lore: { era: '灰灯纪', order: 1 } },
      { id: 'n5', kind: 'story', title: '撞二', body: LONG, updatedAt: T, lore: { era: '灰灯纪', order: 1 } },
      { id: 'n6', kind: 'lore', title: '孤岛', body: LONG, updatedAt: T },
    ],
    links: [{ id: 'l1', from: 'n1', to: 'n4', label: '先于' }],
    positions: {},
    createdAt: T,
    updatedAt: T,
  };
}

test('§WORLD-QUEST 世界委托：真缺口、今日三件、双语与窄屏不溢出', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  const { projectId } = await reusableMemberWithProject(page, EMAIL, PASSWORD, `世界委托夹具${Date.now().toString(36)}`);

  const cookies = await page.context().cookies();
  const csrf = cookies.find((cookie) => cookie.name === 'nexus_csrf')?.value ?? '';
  expect(csrf, '会话里没有 nexus_csrf cookie').not.toBe('');

  const saved = await page.request.put(`/api/projects/${projectId}/world`, {
    headers: { 'x-csrf-token': csrf },
    data: { document: worldDocument(projectId) },
  });
  expect(saved.status(), `世界文档没写进去：${await saved.text()}`).toBe(200);

  await page.goto(`/world/${projectId}/quests`);
  await expect(page.locator('[data-quests-root]')).toBeVisible({ timeout: 60_000 });

  // 今日三件：正好 3 张卡（本夹具的缺口多于 3）
  const cards = page.locator('[data-quests-card]');
  await expect(cards).toHaveCount(3);
  // 每张卡都有三步与一个真实样例（样例来自真标题）
  expect(await page.locator('[data-quests-card] .wq-step').count()).toBeGreaterThanOrEqual(9);
  expect(await page.locator('[data-quests-sample]').count()).toBeGreaterThanOrEqual(1);

  // 五类真缺口都在板上（今日卡或其余行）；样例来自真标题（薄注可能落在「其余」行，行内不重复列样例）
  const boardText = await page.locator('[data-quests-root]').innerText();
  for (const title of ['给空页落笔', '把短注写厚', '把条目放回时间里', '排开撞号的两行', '给孤岛接一条线']) {
    expect(boardText, `板上没有委托「${title}」`).toContain(title);
  }
  const sampleText = await page.locator('[data-quests-card] [data-quests-sample]').allInnerTexts();
  expect(sampleText.length).toBeGreaterThanOrEqual(1);
  for (const sample of sampleText) {
    expect(['空页', '薄注', '无纪', '撞一', '撞二', '孤岛'], `样例「${sample}」不是夹具里的真标题`).toContain(sample);
  }

  // 1440：无横向溢出
  const wide = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(wide.scroll).toBe(wide.client);
  await page.screenshot({ path: '.scratch/world-quests-desktop.png', fullPage: true });

  // 390：窄屏单列、无横向溢出、无重叠的卡片（相邻卡片 top 递增）
  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(narrow.scroll).toBe(narrow.client);
  const tops = await page.locator('[data-quests-card]').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
  for (let i = 1; i < tops.length; i++) expect(tops[i]!).toBeGreaterThan(tops[i - 1]!);
  await page.screenshot({ path: '.scratch/world-quests-mobile.png', fullPage: true });

  // 英文模式：同一页切到 en，标题与操作文案全英文
  await page.context().addCookies([{ name: 'NEXUS_LOCALE', value: 'en', url: new URL(page.url()).origin }]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(page.locator('[data-quests-root]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.wq-title')).toHaveText('World commissions');
  const enText = await page.locator('[data-quests-root]').innerText();
  // 项目名本身是用户数据（夹具名含中文）——只钉界面文案，不钉数据
  for (const zh of ['今日委托', '其余可做的事', '已经了结', '给空页落笔', '去设定集', '回到世界图']) {
    expect(enText, `英文模式残留中文界面文案「${zh}」`).not.toContain(zh);
  }
  await page.screenshot({ path: '.scratch/world-quests-en.png', fullPage: true });

  expect(errors, `页面抛错：${errors.join(' | ')}`).toEqual([]);
});
