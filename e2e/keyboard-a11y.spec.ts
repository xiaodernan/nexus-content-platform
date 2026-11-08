import { expect, test, type Page } from '@playwright/test';
import { createProjectNamed, registerMember } from './support/auth-session';
import { keyboardWalk, tabTo, type WalkOptions } from './support/keyboard-walk';

/**
 * §85 第三片：**只用键盘的人能不能走完这一页**。
 *
 * 载体用 §167 那份两页互动稿（首页一个 `click → navigate` 节点），因为它是平台上
 * 唯一"必须按一下才走得通"的公开页——热点一旦不再是键盘可聚焦的（退化成 `div + onClick`、
 * 或被人加了 `tabindex="-1"`），鼠标那条链照旧通（§167 的用例仍绿），只有这里会红。
 *
 * 七道结构门本体在 `support/keyboard-walk.ts`（第七片抽过去，同一套门还要量 Studio／发现／
 * 市场／通知），这一片留下的只有公开页自己的那两件事：**热点点名在册**（走查前）与
 * **热点真被走到、Enter 按得响**（走查后）。
 * 读数一律打印进报告抄 docs/EVALUATION.md；前六道门与「热点在册」都过了变异臂（正 tabindex／
 * 热点 tabindex=-1／摘掉 ring），还原后 md5 逐字节复核。第七道「停留点有归属」是 2026-10-29
 * 在主题那片补的，只在本文件的载体上跑过绿，**没有跑变异臂**——别读成它也被证伪过。
 */

const RUN = Date.now().toString(36);

/** 公开页这一张：页内 = 作者投影出来的那棵子树，其余（浏览器 UI、Next 开发工具）都算页外。 */
const PUBLISHED: WalkOptions = {
  label: '公开作品页 · 两页互动稿',
  root: '[data-published-root]',
};

/** 与 §167 同一条纪律：先离开 Studio 再写文档（store 里那份旧稿会在卸载时盖回来）。 */
async function setInteractiveDocument(page: Page, projectId: string): Promise<string> {
  await page.goto('/');
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'nexus_csrf')?.value ?? '';
  const current = await page.request.get(`/api/projects/${projectId}`);
  expect(current.status(), `读取项目失败：${await current.text()}`).toBe(200);
  interface RawNode {
    id: string;
    children?: string[];
    [key: string]: unknown;
  }
  const doc = (
    (await current.json()) as { document: { pages: { id: string; name: string; rootId: string; nodes: Record<string, RawNode> }[] } }
  ).document;
  const home = doc.pages[0]!;
  const endId = `page-end-${RUN}`;
  const endRootId = `root-end-${RUN}`;
  const end = {
    ...structuredClone(home),
    id: endId,
    name: '终点页',
    rootId: endRootId,
    nodes: { [endRootId]: { ...structuredClone(home.nodes[home.rootId]!), id: endRootId, name: '终点', children: [] } },
  };
  doc.pages.push(end);
  const nodeId = Object.keys(home.nodes).find((id) => id !== home.rootId);
  if (!nodeId) throw new Error('默认首页里找不到可以挂交互的节点');
  home.nodes[nodeId]!.interactions = [{ id: `i-${RUN}`, trigger: 'click', action: 'navigate', target: endId }];
  const put = await page.request.put(`/api/projects/${projectId}`, { headers: { 'x-csrf-token': csrf }, data: doc });
  expect(put.status(), `写入互动稿失败：${await put.text()}`).toBe(200);
  return endId;
}

test('§85 键盘可达性：Tab 走完公开页、Enter 按响互动热点（WCAG 2.1.1）', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await registerMember(page, `kbd+${RUN}@nexus.test`, 'e2e-secret-123');
  const projectId = await createProjectNamed(page, `键盘走查${RUN}`);
  const endPageId = await setInteractiveDocument(page, projectId);

  await page.goto(`/studio/${projectId}`);
  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-submit]')).toBeVisible();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 30_000 });
  const path = (await page.locator('[data-publish-url]').getAttribute('href'))!;

  // 匿名访客，且盖掉 webdriver：这一片要的是"真人只用键盘走一遍"，被记成爬虫就不算走通
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(Object.getPrototypeOf(navigator), 'webdriver', { get: () => undefined });
  });
  const visitor = await context.newPage();
  await visitor.goto(new URL(path, page.url()).href);
  await expect(visitor.locator('[data-published-root]')).toBeVisible({ timeout: 30_000 });
  await expect(visitor.locator('[data-interactive-hotspot]')).toHaveCount(1);
  // 披露与测量同源：这段是访客看得见的唯一一句"怎么走"，只写鼠标就等于把键盘用户排除在功能之外。
  // 措辞钉在这条腿上——它正是量出"键盘也走得通"的那次测量，别的话没人复核。
  const note = visitor.locator('[data-interactive-note]');
  await expect(note).toBeVisible({ timeout: 30_000 });
  await expect(note, '页面上那句说明没告诉键盘用户怎么走').toContainText('Tab');
  await expect(note, '页面上那句说明没告诉键盘用户按哪个键翻页').toContainText('Enter');

  const walk = await keyboardWalk(visitor, { ...PUBLISHED, require: ['data-interactive-hotspot='] });
  const hotspotKey = walk.population.find((k) => k.includes('data-interactive-hotspot='))!;

  // 门「热点可达」：不仅要在册，还要真被 Tab 走到。走查收工时焦点停在**第一个**控件
  //（走回一圈的判据），所以这里继续按到热点为止。
  const onHotspot = await tabTo(visitor, PUBLISHED, hotspotKey, walk.population.length + 2);
  expect(onHotspot, `Tab 走不到互动热点 ${hotspotKey} ⇒ 只用键盘的人走不通这一版`).toBe(true);

  const reported = visitor.waitForResponse((res) => /\/api\/published\/work-complete$/.test(new URL(res.url()).pathname), {
    timeout: 30_000,
  });
  await visitor.keyboard.press('Enter');
  await expect(visitor).toHaveURL(new RegExp(`\\?page=${endPageId}$`), { timeout: 30_000 });
  await expect(visitor.locator('[data-interactive-end]')).toBeVisible({ timeout: 30_000 });
  const response = await reported;
  expect(response.status(), `键盘走到的那一声上报失败了：${await response.text()}`).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, recorded: true });
});
