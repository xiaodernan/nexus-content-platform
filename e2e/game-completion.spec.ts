import { expect, test, type Page } from '@playwright/test';
import { createProjectNamed, registerMember } from './support/auth-session';

/**
 * §168 **游戏侧的 completion 事件**在真浏览器里的那一寸（ADR-0054）。
 *
 * 集成层证得了"记一次 ⇒ 创作者那边是 1"，但它证不了**中间那一段**：
 * 玩家真的在公开可玩页上走到了一个结局吗？客户端那一声上报真的发出去了吗？
 * 只有真浏览器量得到——而且这一段只有它量得到。
 *
 * 这一条要钉的是：
 * 1. **真玩一次**：在公开可玩页上点到一个结局（对话型那一份：点一下就是一个结局）；
 * 2. **那一报真的发生了**：浏览器的网络面板里能看到 `/api/published/game-complete`，
 *    而且它是 **200**（403/404/429 都是"没记上"，不能算通过）；
 * 3. **创作者那一侧真的多了一个数**：分析页上「通关过」那一格是 1
 *    （**不是**页面上编的数：它与服务端那一份同源）。
 *
 * 为什么用对话型：对话的"通关"就是**走到一个结局**（一次点击），
 * 而 2D / RPG 的通关要在画布上打赢一局——那一寸留给别处，
 * 这里要的是"事件链走通了"，不是"这一局难不难打"。
 *
 * 为什么**不**用 §52 那条链来造这份游戏设计：链子要跑几分钟，而它不是这一条要测的东西
 * （链子那一寸由 `e2e/agent.spec.ts` 钉着）。这里直接用 **studio 的游戏编辑器同一个 PUT**
 * 摆一份对话设计 ⇒ 摆的东西是平台自己的接口与自己的校验，不是假数据。
 *
 * 访客那一侧要**扮演真人**：Playwright 的 `navigator.webdriver` 恒为 true，
 * 不盖掉的话这个访客会把自己上报成疑似爬虫（服务端把爬虫行排除在真人的数之外），
 * 于是「通关过」会是 0——那不是这条用例要证的东西。
 */

const RUN = Date.now().toString(36);

async function register(page: Page, email: string, password: string): Promise<void> {
  await registerMember(page, email, password);
}

/** 建一个项目并等画布真的画出那 8 个节点 */
async function createProject(page: Page, name: string): Promise<string> {
  return createProjectNamed(page, name);
}

/**
 * 一份**对话型**的游戏设计：两段对话，第二段没有指向别处 ⇒ 它就是结局。
 * 字段与 studio 的游戏编辑器用的是同一份契约（`packages/schemas` 的 GameDocumentSchema）。
 */
function storyDocument(projectId: string): unknown {
  const now = new Date().toISOString();
  return {
    id: `story-${RUN}`,
    projectId,
    name: '一次到结局的对话',
    summary: 'e2e 摆的那一份：两段对话，走到第二段就是结局',
    kind: 'interactive-story',
    entities: [
      {
        id: 'beat-1',
        kind: 'dialogue',
        name: '门口',
        notes: '你站在门口，门还亮着。',
        tags: [],
        stats: {},
        refs: [{ id: 'ref-1', to: 'beat-2', role: '推门进去' }],
        updatedAt: now,
      },
      {
        id: 'beat-2',
        kind: 'dialogue',
        name: '收下这张画',
        notes: '屋里只有一张画。你收下了它，这一段没有下一段。',
        tags: [],
        stats: {},
        refs: [],
        updatedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

/** 用 studio 游戏编辑器那一个入口存这份设计（CSRF 双提交照旧） */
async function saveGame(page: Page, projectId: string): Promise<void> {
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'nexus_csrf')?.value ?? '';
  const res = await page.request.put(`/api/projects/${projectId}/game`, {
    headers: { 'x-csrf-token': csrf },
    data: { document: storyDocument(projectId) },
  });
  expect(res.status(), `游戏设计没存进去：${await res.text()}`).toBe(200);
}

test('@smoke §168 游戏侧的 completion：真玩一次 ⇒ 创作者那边多一个数', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await register(page, `gc+${RUN}@nexus.test`, 'e2e-secret-123');
  const projectId = await createProject(page, `通关作品${RUN}`);
  await saveGame(page, projectId);

  // 发布（公开）：发布那一刻钉住游戏设计，之后作者改工作稿也不影响这一版
  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-submit]')).toBeVisible();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 30_000 });
  const path = (await page.locator('[data-publish-url]').getAttribute('href'))!;

  // 一个**匿名**访客去玩，走到��个结局 ⇒ 那一报真的发出去了
  const visitorContext = await browser.newContext();
  await visitorContext.addInitScript(() => {
    Object.defineProperty(Object.getPrototypeOf(navigator), 'webdriver', { get: () => undefined });
  });
  const visitor = await visitorContext.newPage();
  const reported = visitor.waitForResponse(
    (res) => /\/api\/published\/game-complete$/.test(new URL(res.url()).pathname),
    { timeout: 30_000 },
  );
  await visitor.goto(new URL(`${path}/play`, page.url()).href);
  await expect(visitor.locator('[data-story-play]')).toBeVisible({ timeout: 30_000 });
  // 走到一个结局：点那一段唯一的选择
  await visitor.locator('[data-story-choices] button', { hasText: '推门进去' }).first().click();
  await expect(visitor.locator('[data-story-ending]')).toBeVisible({ timeout: 30_000 });

  // 那一报必须成功：403/404/429 都是"没记上"，不能算通过
  const response = await reported;
  const body = await response.text();
  expect(response.status(), `那一报没有成功（状态 ${response.status()}）：${body}`).toBe(200);

  // 创作者那一侧：分析页上「通关过」那一格是 1
  await page.goto('/analytics');
  const row = page.locator('[data-analytics-row]').first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.locator('[data-analytics-value="completed"]')).toHaveText('1');
  // 旁边那格是**滚动的**完成度（这一页很短，整页都在眼前 ⇒ 100%），
  // 它说的是"看到了多少"，不是"玩通了没有"⇒ 两个口径各说各的。
  // "没采到完成度"那一半由集成测钉着（通关了但没有任何心跳 ⇒ 完成度仍是"未采集"）。
  await expect(row.locator('[data-analytics-value="completion"]')).toContainText('100%');
});
