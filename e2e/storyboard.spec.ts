import { expect, test, type Page } from '@playwright/test';

/**
 * §40-42 的分镜面板在真浏览器里点一遍：切一版 → 改一镜 → 撤销 → 重读 → 整页刷新。
 *
 * 要看的是三件只有在界面上才成立的事：
 * ① 「切一版分镜」是本地确定性断句，界面上就写着这句话（notes 原文进面板，§159 不许假生成）；
 * ② 撤销/重做是真的能回（§150 的逆补丁），而且**回完还写进了库**——所以断言不能只看界面，
 *    要点「重读」甚至整页刷新，看服务端那一份到底是什么；
 * ③ 时间线可读不可播：playable 是 false，理由（缺的是帧不是布局）在界面上读得出来。
 */

async function openStudio(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.fill('[data-project-name-input]', name);
  await page.click('[data-create-project]');
  await page.waitForURL(/\/studio\/[^/]+$/);
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
}

async function openStoryboardPanel(page: Page): Promise<void> {
  await page.click('[data-panel-tab="storyboard"]');
  await expect(page.locator('[data-storyboard-panel]')).toBeVisible();
}

async function savedState(page: Page): Promise<void> {
  await expect(page.locator('[data-storyboard-save-state]')).toHaveText('已保存', { timeout: 30_000 });
}

test('@smoke 分镜面板：切句成镜、改一镜能撤、撤销结果真的进了库', async ({ page }) => {
  test.setTimeout(180_000);
  await openStudio(page, `分镜面板 ${Date.now().toString(36)}`);
  await openStoryboardPanel(page);

  // 还没有分镜：空状态说的是"这个项目还没有分镜"，而且要明说这不是 AI 分镜
  // （超时放宽：这条 API 路由在 dev 下第一次请求要现编译，首屏那几秒界面就停在"读取分镜…"）
  await expect(page.locator('[data-storyboard-empty]')).toContainText('还没有分镜', { timeout: 30_000 });
  await expect(page.locator('[data-storyboard-empty]')).toContainText('本地确定性断句');
  await expect(page.locator('[data-storyboard-create]')).toBeDisabled();

  await page.fill('[data-storyboard-prompt-input]', '夜色里的港口，一台旧起重机慢慢转身，猫跳上缆绳');
  await page.click('[data-storyboard-create]');
  await savedState(page);

  const shots = page.locator('[data-storyboard-shot]');
  await expect(shots).toHaveCount(3);
  // 投影的解释原样显示：这一版不是模型给的镜头语言
  await expect(page.locator('[data-storyboard-note]').first()).toBeVisible();
  await expect(page.locator('[data-storyboard-panel]')).toContainText('不是模型给的镜头语言');

  // 首镜按规则是宽景；改成航拍是一次补丁事务
  const first = shots.first();
  const firstId = await first.getAttribute('data-storyboard-shot');
  expect(firstId).toBeTruthy();
  const camera = page.locator(`[data-storyboard-camera="${firstId}"]`);
  await expect(camera).toHaveValue('wide');
  await camera.selectOption('aerial');
  await expect(camera).toHaveValue('aerial');
  await savedState(page);

  // 撤销：机位回到 wide，而且这一格不是"界面看起来回去了"——重读拿的是服务端那一份
  await page.click('[data-storyboard-undo]');
  await expect(camera).toHaveValue('wide');
  await savedState(page);
  await page.click('[data-storyboard-reload]');
  await expect(camera).toHaveValue('wide');

  // 删掉最后一镜可以撤回来，并且回到**原来那一位**（patch 里那条"记下原位置"的兑现）
  const lastId = await shots.last().getAttribute('data-storyboard-shot');
  // 动作按钮要在面板那 264px 里看得见：裁出界外的按钮 Playwright 照样点得到，用户点不到
  await expect(page.locator(`[data-storyboard-remove="${lastId}"]`)).toBeInViewport();
  await page.click(`[data-storyboard-remove="${lastId}"]`);
  await expect(shots).toHaveCount(2);
  await savedState(page);
  await page.click('[data-storyboard-undo]');
  await expect(shots).toHaveCount(3);
  await expect(shots.last()).toHaveAttribute('data-storyboard-shot', String(lastId));

  // 整页刷新：库里那份就是这些镜头，面板不是靠内存活着
  await savedState(page);
  await page.reload();
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await openStoryboardPanel(page);
  await expect(page.locator('[data-storyboard-shot]')).toHaveCount(3);
  await expect(page.locator('[data-storyboard-summary]')).toContainText('3 镜');

  // 时间线可读不可播：缺的是帧，不是布局（§40 最后一格要真 provider）
  await expect(page.locator('[data-storyboard-playable]')).toHaveText('不可播');
  await expect(page.locator('[data-storyboard-blocker]').first()).toContainText('还没有视频帧');
  await expect(page.locator('[data-storyboard-track="audio"]')).toContainText('空——');
  await page.screenshot({ path: 'screenshots/storyboard-panel.png' });
});

test('@smoke 分镜面板：时长写非法值不会悄悄改掉那一镜', async ({ page }) => {
  test.setTimeout(150_000);
  await openStudio(page, `分镜校验 ${Date.now().toString(36)}`);
  await openStoryboardPanel(page);
  await page.fill('[data-storyboard-prompt-input]', '一个人走进雨里');
  await page.click('[data-storyboard-create]');
  await savedState(page);

  const id = await page.locator('[data-storyboard-shot]').first().getAttribute('data-storyboard-shot');
  const duration = page.locator(`[data-storyboard-duration="${id}"]`);
  const before = await duration.inputValue();
  await duration.fill('abc');
  await duration.blur();
  // 明说这一格没动，而不是让输入框显示一个库里没有的值
  await expect(page.locator('[data-storyboard-notice]')).toContainText('没写进去');
  await expect(duration).toHaveValue(String(before));
  await expect(page.locator('[data-storyboard-save-state]')).not.toHaveText('保存失败');
  await page.screenshot({ path: 'screenshots/storyboard-duration-rejected.png' });

  // 合法的编辑照常走：1200 毫秒写进库，刷新后还在
  await duration.fill('1200');
  await duration.blur();
  await savedState(page);
  await page.reload();
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await openStoryboardPanel(page);
  await expect(page.locator(`[data-storyboard-duration="${id}"]`)).toHaveValue('1200');
});

/**
 * §49 × §40：分镜存进去就该查得到——在同一条查询上证明。
 *
 * 顺序是全部意义所在：先在**没有分镜**的项目里查那个词，界面必须说没有命中；
 * 然后只做一次"切一版分镜 + 保存"（不点重建索引），同一个词就得查出「分镜」来源的块。
 * 这样红/绿的差别只可能来自写路径里那次同步调用，而不是有人手工刷了索引。
 */
test('@smoke 检索面板：一句分镜存进去，同一个词就从查不到变成查到', async ({ page }) => {
  test.setTimeout(180_000);
  const sentence = '夜色里的港口，一台旧起重机慢慢转身，猫跳上缆绳';
  await openStudio(page, `分镜检索 ${Date.now().toString(36)}`);

  // 空项目：语料库里此刻只有这个设计自己那一块正文（§49 Documents），分镜一类快还没有
  await page.click('[data-panel-tab="retrieve"]');
  await expect(page.locator('[data-retrieve-panel]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-knowledge-source="design"]')).toHaveText('设计文档 1', { timeout: 30_000 });
  await expect(page.locator('[data-knowledge-source="storyboard"]')).toHaveCount(0);
  await page.fill('[data-retrieve-query]', '缆绳');
  await page.click('[data-retrieve-run]');
  // 放宽到 30 秒：retrieve 这条路由在 dev 下第一次请求要现编译，那几秒按钮还停在 busy
  await expect(page.locator('[data-retrieve-empty]')).toBeVisible({ timeout: 30_000 });

  await openStoryboardPanel(page);
  await page.fill('[data-storyboard-prompt-input]', sentence);
  await page.click('[data-storyboard-create]');
  await savedState(page);

  // 回到检索面板：分镜那一类 = 来源句子 + 3 镜，全部由那次 PUT 带出来（按来源数，不看总数）
  await page.click('[data-panel-tab="retrieve"]');
  await expect(page.locator('[data-knowledge-source="storyboard"]')).toHaveText('分镜 4');
  // 面板自我介绍的那句也得把分镜算进语料，否则界面说的和库里装的不是同一件事
  await expect(page.locator('[data-retrieve-note]')).toContainText('分镜镜头');
  await page.fill('[data-retrieve-query]', '缆绳');
  await page.click('[data-retrieve-run]');

  const hits = page.locator('[data-retrieve-hit]:has([data-retrieve-source="storyboard"])');
  await expect(hits.first()).toBeVisible();
  // 中文标签（不是裸的 storyboard）
  await expect(hits.first()).toContainText('分镜');
  // 「第 3 镜」必须**看得见**：整条标题在窄面板里会被截断，DOM 里有字但界面没说清是哪一镜
  // 等于没断言，所以块名单独一格 + toBeInViewport
  const shotHit = page
    .locator('[data-retrieve-hit]')
    .filter({ has: page.locator('[data-retrieve-part]:has-text("第 3 镜")') });
  await expect(shotHit).toHaveCount(1);
  await expect(shotHit.locator('[data-retrieve-part]')).toBeInViewport();
  await expect(shotHit).toContainText('猫跳上缆绳');
  await expect(shotHit).toContainText('机位：');
  await page.screenshot({ path: 'screenshots/storyboard-retrieved.png' });
});
