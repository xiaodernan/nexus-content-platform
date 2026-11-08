import { expect, test, type Page } from '@playwright/test';
import { reusableMemberWithProject } from './support/auth-session';

/**
 * §90 / WCAG 2.1.1 的游戏页那一寸：**Space 是按钮的，方向键是输入框的**。
 *
 * 三张游戏页（2D / RPG / 3D 世界）都在 window 上挂 keydown 当玩法输入，而且对
 * `key in KEY_MAP || key === ' '` 无条件 `preventDefault`。这会在两处吞掉浏览器本来就有的行为：
 * 1. 焦点在按钮上时 Space 是**原生激活键**——`[data-playtest-run]` 按 Space 跑不出报告；
 * 2. 焦点在种子输入框（number input）上时 ↑ 是**数字 +1**——而 `KEY_MAP` 恰好把 ↑ 当成走路。
 *
 * 这一条在**真发布的可玩页**上量三臂（每臂都重新加载，报告区是全新的）：
 * - 臂一：焦点在「跑四种走法」上按 Space ⇒ `[data-playtest-run-row="beeline"]` 出现（修复本体）；
 * - 臂二：同一按钮按 Enter ⇒ 同样出现（基线：修 Space 不许把 Enter 弄坏）；
 * - 臂三：焦点在随机种子输入框里按 ↑ ⇒ 值 7→8，且报告没跑（证明豁免是"焦点在输入框上"限定的，
 *   不是把玩法键整体关掉）。
 *
 * 为什么用骨架而不是手摆 11 条：`compileGame` 唯一的硬条件是"有玩家实体"（`play.ts`），
 * 骨架里每个类各一条 ⇒ 页面真能开跑；摆出来的东西走的是 Studio 同一个 PUT 与同一份
 * `GameDocumentSchema`，不是假数据（§159）。2D 与 RPG 两张共用同一份骨架、只换 `kind`：
 * 它们的 window keydown 是同一处修复，要一起量。
 */

const RUN = Date.now().toString(36);
const EMAIL = 'game-keyboard@nexus.test';
const PASSWORD = 'e2e-secret-123';

/** §54 的 11 类，顺序照模型（`GAME_ENTITY_KINDS`）：骨架与 Studio 新建游戏那一份同一形状 */
const ENTITY_KINDS: { kind: string; name: string }[] = [
  { kind: 'player', name: '玩家' },
  { kind: 'enemy', name: '敌人' },
  { kind: 'weapon', name: '武器' },
  { kind: 'item', name: '物品' },
  { kind: 'quest', name: '任务' },
  { kind: 'dialogue', name: '对话' },
  { kind: 'trigger', name: '触发器' },
  { kind: 'npc', name: 'NPC' },
  { kind: 'camera', name: '镜头' },
  { kind: 'animation', name: '动画' },
  { kind: 'particle', name: '粒子' },
];

/**
 * 一份 `createGame` 形状的骨架：11 类各一条空实体，**不填任何数值**。
 * 骨架是脚手架不是内容——真正的数值一个都没有，页面上的兜底值也照实标出来（§159）。
 */
function skeletonDocument(projectId: string, kind: '2d' | 'rpg-prototype', name: string): unknown {
  const now = new Date().toISOString();
  return {
    id: `game-${RUN}-${kind}`,
    projectId,
    name,
    summary: `e2e 摆的那一份：11 类各一条空实体（${kind}），没有填任何数值`,
    kind,
    entities: ENTITY_KINDS.map(({ kind: entityKind, name: entityName }) => ({
      id: `ge-${RUN}-${kind}-${entityKind}`,
      kind: entityKind,
      name: entityName,
      notes: '',
      tags: [],
      stats: {},
      refs: [],
      updatedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

/** 用 studio 游戏编辑器那一个入口存这份设计（CSRF 双提交照旧） */
async function saveGame(page: Page, projectId: string, document: unknown): Promise<void> {
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'nexus_csrf')?.value ?? '';
  const res = await page.request.put(`/api/projects/${projectId}/game`, {
    headers: { 'x-csrf-token': csrf },
    data: { document },
  });
  expect(res.status(), `游戏设计没存进去：${await res.text()}`).toBe(200);
}

/**
 * 打开发布面板 → 选公开 → 发布，返回公开路径。
 * 重发时 URL 不变（同一 handle/slug），所以"`[data-publish-url]` 可见"不是完成的证据——
 * 证据是那次 POST 的 200：面板在水合之前点不开，这里先把它点开再等 POST。
 */
async function publishPublic(page: Page, projectId: string): Promise<string> {
  await page.goto(`/studio/${projectId}`);
  const submit = page.locator('[data-publish-submit]');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await submit.isVisible().catch(() => false)) break;
    await page.click('[data-publish-open]');
    await page.waitForTimeout(500);
  }
  await expect(submit, '发布面板没打开：点 10 次 [data-publish-open] 都没等到它——水合没接住点击').toBeVisible({
    timeout: 15_000,
  });
  await page.click('[data-publish-choice="public"]');
  const posted = page.waitForResponse(
    (r) => new URL(r.url()).pathname === `/api/projects/${projectId}/publish` && r.request().method() === 'POST',
    { timeout: 60_000 },
  );
  await page.click('[data-publish-submit]');
  const res = await posted;
  expect(res.status(), `发布被拒了（HTTP ${res.status()}）：${await res.text()}`).toBe(200);
  const link = page.locator('[data-publish-url]');
  await expect(link).toBeVisible({ timeout: 30_000 });
  return (await link.getAttribute('href'))!;
}

test('@smoke §90 游戏页：Space 归按钮、方向键归输入框（2D 与 RPG 同一处修复）', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const { projectId } = await reusableMemberWithProject(page, EMAIL, PASSWORD, `键盘游戏样板${RUN}`);

  // ---- 2D：骨架 → 真发布 → 匿名访客去玩
  await saveGame(page, projectId, skeletonDocument(projectId, '2d', '键盘样板（2D）'));
  const path = await publishPublic(page, projectId);

  const viewer = await browser.newContext();
  const visitor = await viewer.newPage();
  await visitor.goto(new URL(`${path}/play`, page.url()).href);
  await expect(visitor.locator('[data-game-root]')).toBeVisible({ timeout: 60_000 });
  await expect(visitor.locator('[data-playtest-run]')).toBeVisible({ timeout: 30_000 });

  // 臂一（修复本体）：焦点在按钮上，Space 是原生激活键 ⇒ 报告必须跑出来
  await visitor.locator('[data-playtest-run]').focus();
  await visitor.keyboard.press('Space');
  await expect(visitor.locator('[data-playtest-run-row="beeline"]')).toBeVisible({ timeout: 20_000 });

  // 臂二（基线）：Enter 一直能用——修 Space 不许把 Enter 弄坏
  await visitor.reload();
  await expect(visitor.locator('[data-playtest-run]')).toBeVisible({ timeout: 30_000 });
  await visitor.locator('[data-playtest-run]').focus();
  await visitor.keyboard.press('Enter');
  await expect(visitor.locator('[data-playtest-run-row="beeline"]')).toBeVisible({ timeout: 20_000 });

  // 臂三（范围限定）：焦点在种子输入框里时 ↑ 是数字 +1，不是"往前走"
  await visitor.reload();
  const seed = visitor.locator('[data-playtest-seed]');
  await expect(seed).toBeVisible({ timeout: 30_000 });
  await expect(seed).toHaveValue('7'); // PLAYTEST_DEFAULT_SEED
  await seed.focus();
  await visitor.keyboard.press('ArrowUp');
  await expect(seed).toHaveValue('8');
  // 同时没有跑报告：豁免是"焦点在输入控件上"限定的，不是把玩法键整体关掉
  await expect(visitor.locator('[data-playtest-run-row]')).toHaveCount(0);

  // ---- RPG：同一份骨架换 `kind`，重发一次（同一路径换管线）⇒ 同一处修复也得成立
  await saveGame(page, projectId, skeletonDocument(projectId, 'rpg-prototype', '键盘样板（RPG）'));
  await publishPublic(page, projectId);
  await visitor.goto(new URL(`${path}/play`, page.url()).href);
  await expect(visitor.locator('[data-rpg-restart]')).toBeVisible({ timeout: 60_000 });
  await visitor.locator('[data-playtest-run]').focus();
  await visitor.keyboard.press('Space');
  await expect(visitor.locator('[data-playtest-run-row="beeline"]')).toBeVisible({ timeout: 20_000 });
  await visitor.locator('[data-playtest-seed]').focus();
  await visitor.keyboard.press('ArrowUp');
  await expect(visitor.locator('[data-playtest-seed]')).toHaveValue('8');

  await viewer.close();
});
