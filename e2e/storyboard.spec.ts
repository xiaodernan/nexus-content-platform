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

/**
 * §40 欠的那一寸入口：把角色挂到镜头上（`Shot.characterId`）。
 * 模型字段与服务端归属校验早就在（`firstForeignRef` 会拒掉别人项目的 id），
 * 缺的是界面上那个选择器——这正是本仓库犯过三次的形状（#66 / #67 / #75）。
 * 走真浏览器所以要证的不是"能点"，而是：一次选择=一个可撤销事务，且撤销结果真的进了库。
 */
test('@smoke 镜头挂角色：选择器只给本项目名册、改动可撤销、刷新后还在（§40 × §46）', async ({ page }) => {
  test.setTimeout(180_000);
  await openStudio(page, `镜头挂角色 ${Date.now().toString(36)}`);

  await page.click('[data-panel-tab="characters"]');
  await expect(page.locator('[data-character-empty]')).toBeVisible({ timeout: 30_000 });
  await page.fill('[data-character-new-name]', '守夜人');
  await page.click('[data-character-create]');
  await expect(page.locator('[data-character-count]')).toHaveText('1');

  await openStoryboardPanel(page);
  await page.fill('[data-storyboard-prompt-input]', '灯塔的光扫过浮冰，她数着回来的每一条船');
  await page.click('[data-storyboard-create]');
  await savedState(page);

  const shotId = (await page.locator('[data-storyboard-shot]').first().getAttribute('data-storyboard-shot'))!;
  const picker = page.locator(`[data-storyboard-character="${shotId}"]`);
  // 名册来自服务端：选项就是那一位角色，不给用户手填一个会被服务端挡下的 id
  await expect(picker.locator('option')).toHaveCount(2);
  await expect(picker.locator('option').nth(1)).toHaveText('守夜人');

  await picker.selectOption({ label: '守夜人' });
  await savedState(page);
  await page.click('[data-storyboard-undo]');
  await expect(picker.locator('option:checked')).toHaveText('不挂角色');
  await page.click('[data-storyboard-redo]');
  await expect(picker.locator('option:checked')).toHaveText('守夜人');

  // 落库的那一份要与之相符：这一步在整组跑里红过一次——撤销/重做各自都是一个新事务，
  // 重做之后自动保存还没落地就点重新装配，读回来的是上一次落库的状态。
  // 所以这里不用"等文本变成已保存"（那一栏在重做的瞬间可能还是上一次的"已保存"，会假通过），
  // 而是反复重新装配直到服务端认可：断言的仍然是"库里存的就是守夜人"。
  await expect
    .poll(
      async () => {
        await page.click('[data-storyboard-reload]');
        return picker.locator('option:checked').textContent();
      },
      { timeout: 40_000, message: '重新装配后服务端那份不是"守夜人"= 重做没落库' },
    )
    .toBe('守夜人');

  // §38 / §39 那条箭头接到镜头上：这一镜有角色，所以走的是 Character → Scene，
  // 像素来自本地确定性合成器（按钮写着 DEMO，本机没有图像 provider，不做假 AI 出图）
  const refPicker = page.locator(`[data-storyboard-reference="${shotId}"]`);
  await expect(refPicker.locator('option:checked')).toHaveText('不用参考图');
  const optionsBefore = await refPicker.locator('option').count();

  // 先证一句实话：这位角色只有名字、没有视觉标识（建档时不替用户编性格，也不编 palette），
  // 所以 Character → Scene 要**拒绝**生成，并把拒绝的理由说清楚——而不是悄悄出一张跟角色无关的图
  await page.click(`[data-storyboard-image-gen="${shotId}"]`);
  await expect(page.locator('[data-storyboard-image-error]')).toContainText('视觉标识', { timeout: 30_000 });
  await expect(refPicker.locator('option')).toHaveCount(optionsBefore);

  // 摘掉角色就成了 Text → Image 那条箭头：这一步应当真的产出资产并挂上镜头
  await picker.selectOption('');
  await savedState(page);
  await page.click(`[data-storyboard-image-gen="${shotId}"]`);
  await savedState(page);
  // 新资产必须当场出现在选择器里：不补名册的话浏览器会把这个 select 渲染成"什么都没选"，
  // 用户看到的就是"刚生成的东西不见了"
  await expect(refPicker.locator('option')).toHaveCount(optionsBefore + 1);
  await expect(refPicker.locator('option:checked')).not.toHaveText('不用参考图');
  // 撤销只断开引用，不删那张已经花过额度的资产
  await page.click('[data-storyboard-undo]');
  await expect(refPicker.locator('option:checked')).toHaveText('不用参考图');
  await expect(refPicker.locator('option')).toHaveCount(optionsBefore + 1);
  await page.screenshot({ path: 'screenshots/shot-reference-demo.png' });
});

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
  // 动作按钮要在面板那 264px 里看得见：裁出界外的按钮 Playwright 照样点得到，用户点不到。
  // 按这句话的字面来断言——按钮的左右不出面板的左右（264px 那条竖边）。竖直方向不断言：
  // 镜头列表本来就是滚动区（flex-1 overflow-auto），三镜时最后一镜在折叠线下是正常的，
  // 滚一下就到；2026-10-24 把时间线钉上面板底部之后折叠线还更高了。
  // （这里早先写的是 toBeInViewport：两个方向都要在视口里。#194 给每卡加了「定位」钮、
  // 卡片从三个包装行变四个之后它必红——那不是裁剪，是列表该滚，不是产品坏了。）
  const panelBox = (await page.locator('[data-storyboard-panel]').boundingBox())!;
  const removeBox = (await page.locator(`[data-storyboard-remove="${lastId}"]`).boundingBox())!;
  expect(removeBox.x).toBeGreaterThanOrEqual(panelBox.x);
  expect(removeBox.x + removeBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
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
  // "不可播"要跟着说出为什么不可播：限度只写在 notes 里，用户在时间线旁看到的就是一个没有解释的结论
  await expect(page.locator('[data-storyboard-playable]')).toContainText('不可播');
  await expect(page.locator('[data-storyboard-playable]')).toContainText('不做假生成');
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

/**
 * §41 的时间线编辑：拖右边缘 trim/extend、拖整块 reorder、点转场标记换衔接。
 *
 * 这一条证的不是"能拖"，而是三件容易各说各话的事：
 * ① **拖动期间库里那一份没动**——每一步都在松手之后直接查服务端那一份，不拿界面上的读数当凭证；
 * ② 一次拖拽/一次点击 = 一个可撤销事务（§150）：撤销之后服务端那一份回到原样；
 * ③ 口径与列表里的数字框一致：拖出来的长度吸附到 100 毫秒刻度、下限也是一步——
 *    时间线与镜头表是同一份模型的两个投影（§16），不是两套真值。
 */

/** 直接读服务端那一份：界面上的数字可能是本地预览，库里的才算"写进去了" */
async function serverShots(page: Page): Promise<{ id: string; durationMs: number; transition: string }[]> {
  const projectId = page.url().split('/').pop() ?? '';
  return page.evaluate(async (id) => {
    const res = await fetch(`/api/projects/${id}/storyboard`, { cache: 'no-store' });
    const body = (await res.json()) as { storyboard?: { shots?: { id: string; durationMs: number; transition: string }[] } };
    return body.storyboard?.shots ?? [];
  }, projectId);
}

test('@smoke §41 时间线编辑：拖边缘改长度、拖整块换位、点标记换转场，都落成一个可撤销的事务', async ({ page }) => {
  test.setTimeout(300_000);
  await openStudio(page, `时间线编辑 ${Date.now().toString(36)}`);
  await openStoryboardPanel(page);
  await page.fill('[data-storyboard-prompt-input]', '夜色里的港口，一台旧起重机慢慢转身，猫跳上缆绳，它跑起来了');
  await page.click('[data-storyboard-create]');
  await savedState(page);

  const blocks = page.locator('[data-timeline-block]');
  await expect(blocks).toHaveCount(4);
  const ids = await blocks.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-timeline-block') ?? ''));
  const first = ids[0] ?? '';
  const duration = page.locator(`[data-storyboard-duration="${first}"]`);
  const beforeMs = Number(await duration.inputValue());

  // ① trim：拖第一格的右边缘往右 40 像素（条宽约 240 像素、总长上万毫秒，这一下足够跨过 100 毫秒的刻度）
  const handle = page.locator(`[data-timeline-trim="${first}"]`);
  // 面板是个滚动容器，时间线在镜头表下面：不先滚进视口，鼠标事件落在视口外（`elementFromPoint` 给 null，
  // 而 Playwright 的 boundingBox 照样返回一个坐标——这一条实测红过一次，就是没滚）
  await handle.scrollIntoViewIfNeeded();
  await expect(handle).toBeInViewport();
  const box = (await handle.boundingBox())!;
  const trimY = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, trimY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, trimY, { steps: 8 });
  // 拖动期间：读数在，而**库里那一份还是旧的**——松手才落事务
  await expect(page.locator('[data-timeline-readout]')).toContainText('→');
  // 等一会儿再读库：不写的话这 400 毫秒里什么都不该有（"拖动期间每次 pointermove 都写库"那种实现会在这里露出来）
  await page.waitForTimeout(400);
  expect((await serverShots(page)).find((shot) => shot.id === first)?.durationMs).toBe(beforeMs);
  await page.mouse.up();
  await expect(page.locator('[data-timeline-readout]')).toHaveCount(0);

  await expect
    .poll(async () => (await serverShots(page)).find((shot) => shot.id === first)?.durationMs)
    .toBeGreaterThan(beforeMs);
  const grown = (await serverShots(page)).find((shot) => shot.id === first)?.durationMs ?? 0;
  // 吸附到 100 毫秒刻度：2817 这种像素误差不该进库
  expect(grown % 100).toBe(0);
  await expect(duration).toHaveValue(String(grown));

  // 撤销：库里那一份回到拖动之前（不是"界面看起来回去了"）
  await page.click('[data-storyboard-undo]');
  await expect.poll(async () => (await serverShots(page)).find((shot) => shot.id === first)?.durationMs).toBe(beforeMs);

  // ② transition：时间线上那个标记点一下换下一种衔接
  const transition = page.locator(`[data-storyboard-transition="${first}"]`);
  const beforeTransition = await transition.inputValue();
  await page.click(`[data-timeline-transition="${first}"]`);
  await expect
    .poll(async () => (await serverShots(page)).find((shot) => shot.id === first)?.transition)
    .not.toBe(beforeTransition);
  // 镜头表那一栏必须跟着动：两个投影说的是同一件事
  await expect(transition).toHaveValue(
    (await serverShots(page)).find((shot) => shot.id === first)?.transition ?? '',
  );
  await page.click('[data-storyboard-undo]');
  await expect
    .poll(async () => (await serverShots(page)).find((shot) => shot.id === first)?.transition)
    .toBe(beforeTransition);

  // ③ reorder：把第一格拖到最后一格的右边
  await blocks.first().scrollIntoViewIfNeeded();
  await expect(blocks.last()).toBeInViewport();
  const firstBox = (await blocks.first().boundingBox())!;
  const lastBox = (await blocks.last().boundingBox())!;
  // 抓格子下缘：上缘是转场标记的位置，那一下会被当成"点标记"而不是"拖整块"
  const dragY = firstBox.y + firstBox.height - 6;
  await page.mouse.move(firstBox.x + firstBox.width / 2, dragY);
  await page.mouse.down();
  await page.mouse.move(lastBox.x + lastBox.width + 20, dragY, { steps: 10 });
  // 拖动期间看得出会落到哪儿：目标格被标出来，读数说的是第几位
  await expect(page.locator('[data-timeline-drop-target="true"]')).toHaveCount(1);
  await expect(page.locator('[data-timeline-readout]')).toContainText('位');
  // 拖动中的这一张就是这一片的证据：目标格被标出来、读数在、格子跟着鼠标走
  await page.screenshot({ path: 'screenshots/storyboard-timeline-dragging.png' });
  await page.mouse.up();
  await expect(page.locator('[data-timeline-readout]')).toHaveCount(0);
  await expect.poll(async () => (await serverShots(page)).map((shot) => shot.id)).toEqual([...ids.slice(1), first]);

  // 撤销：顺序回到原样
  await page.click('[data-storyboard-undo]');
  await expect.poll(async () => (await serverShots(page)).map((shot) => shot.id)).toEqual(ids);
  // 截图要拍得到时间线：点上面那排按钮会把面板滚回头部，不滚回来的话这一张里没有新做的那条编辑面
  await page.locator('[data-timeline-strip]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-timeline-strip]')).toBeInViewport();
  await page.screenshot({ path: 'screenshots/storyboard-timeline-edit.png' });
});

/**
 * 与 `serverShots` 同一只抓手，但读的是「这一镜说的是什么」那一组字段：
 * 片段级裁切要把 `prompt` / `camera` 复制给后半，光看时长证不出"两半共享同一句描述"。
 */
async function serverShotDetails(page: Page): Promise<{ id: string; prompt: string; camera: string }[]> {
  const projectId = page.url().split('/').pop() ?? '';
  return page.evaluate(async (id) => {
    const res = await fetch(`/api/projects/${id}/storyboard`, { cache: 'no-store' });
    const body = (await res.json()) as { storyboard?: { shots?: { id: string; prompt: string; camera: string }[] } };
    return body.storyboard?.shots ?? [];
  }, projectId);
}

/**
 * 双击某一格的"自身宽度 × fraction"处。**每一次都重量盒子**：
 * 拒因那一行写进 notice 后换行要多占高度，整条时间线跟着上下顶动，
 * 拿着旧坐标按第二下就落到格子外面（这一条实测红过一次，红在"点了没反应"上，
 * 而屏幕上留的还是上一次的拒因——看上去像两句拒因说了同一句话）。
 */
async function dblclickBlock(page: Page, selector: string, spot: { fraction: number } | { fromLeftPx: number }): Promise<void> {
  const block = page.locator(selector);
  const box = (await block.boundingBox())!;
  const x = 'fraction' in spot ? box.width * spot.fraction : spot.fromLeftPx;
  // 走 locator.dblclick 而不是 page.mouse.dblclick(量好的视口坐标)：布局会在两次点击之间动
  // ——点名/配额那几段是挂载后异步落下来的，点条的第一击还会触发"把镜头滚进视野"的滚动。
  // 量的时候对得上，第二次点击时目标已经移走了，dblclick 根本不会在块上合成。
  // locator 的点击自带行动性检查（可见、占据稳定、命中本元素），位移发生时会等它稳下来。
  await block.dblclick({ position: { x, y: box.height / 2 } });
}

/**
 * §41 片段级裁切：一镜切两镜。
 *
 * 这一条要证的不是"多了一格"，而是四件只有真界面上才成立的事：
 * ① 切点吃的是**鼠标落点**（按那一格自身的宽度换算），并且吸到 100 毫秒刻度；
 * ② **总时长守恒**：前半 + 后半 = 原来那一镜，时间线的 `totalMs` 一格毫秒都没多没少
 *    （后半是"减出来的余数"，不是再吸一次刻度——两次吸附会凭空多出误差）；
 * ③ 一次双击 = **一个**可撤销事务：撤销一步就回到两镜，不是回到"三镜但长度错了"；
 * ④ 切不出两镜时**明说**，而且两半各说一句：前半不足一格 → "往右挪一点再切"；
 *    后半凑不成一镜 → "往左挪一点再切"。两次都**没有写库**（不是"切了一半"），
 *    界面上也不留一个看不见的 0 毫秒方块。
 */
test('@smoke §41 片段级裁切：双击在点击处切、总时长守恒、一步撤销回两镜、切不出来说得清（模型 + 界面）', async ({ page }) => {
  test.setTimeout(300_000);
  await openStudio(page, `片段级裁切 ${Date.now().toString(36)}`);
  await openStoryboardPanel(page);
  // 两段、都没有运动词 → 每镜 3000 毫秒，切出来的数才是能口算的
  await page.fill('[data-storyboard-prompt-input]', '灯塔的光扫过浮冰，她数着回来的每一条船');
  await page.click('[data-storyboard-create]');
  await savedState(page);

  const shots = page.locator('[data-storyboard-shot]');
  await expect(shots).toHaveCount(2);
  const blocks = page.locator('[data-timeline-block]');
  const firstId = (await blocks.first().getAttribute('data-timeline-block'))!;
  const idsBefore = (await serverShots(page)).map((shot) => shot.id);

  // ①② 落在大约三分之一处：3000 × 1/3 = 1000 毫秒，前半 1000 + 后半 2000
  await dblclickBlock(page, `[data-timeline-block="${firstId}"]`, { fraction: 1 / 3 });
  await expect(shots).toHaveCount(3);
  await expect(page.locator('[data-storyboard-notice]')).toContainText('切成两镜');
  await savedState(page);

  const after = await serverShots(page);
  expect(after.map((shot) => shot.durationMs)).toEqual([1000, 2000, 3000]);
  expect(after[0]!.id).toBe(firstId);
  // 后半是新 id；原那一镜的转场描述的是"与上一镜怎么接"，所以它留在前半，后半一律硬切
  expect(after[1]!.id).not.toBe(firstId);
  expect(after[1]!.transition).toBe('cut');
  expect(after[0]!.transition).not.toBe('cut');
  // 两半共享同一句描述与同一个机位：切的是时间线，不是像素
  const details = await serverShotDetails(page);
  expect(details[1]!.prompt).toBe(details[0]!.prompt);
  expect(details[1]!.camera).toBe(details[0]!.camera);
  // 时间线是投影：镜数变了，总长还是那 6 秒（一格毫秒都没多出来）
  await expect(page.locator('[data-storyboard-summary]')).toContainText('3 镜 · 共 6 秒');

  // ③ 撤销**一步**：回到两镜、库里那份的 id 与长度都是原样
  await page.click('[data-storyboard-undo]');
  await expect(shots).toHaveCount(2);
  await expect.poll(async () => (await serverShots(page)).map((shot) => shot.id)).toEqual(idsBefore);
  await expect.poll(async () => (await serverShots(page)).map((shot) => shot.durationMs)).toEqual([3000, 3000]);
  await savedState(page);

  // 键盘那条路：镜头表里的 ✂ 在中点切，与双击走同一个 store 动作
  await page.click(`[data-storyboard-split="${firstId}"]`);
  await expect(shots).toHaveCount(3);
  await expect.poll(async () => (await serverShots(page)).map((shot) => shot.durationMs)).toEqual([1500, 1500, 3000]);
  await page.click('[data-storyboard-undo]');
  await expect.poll(async () => (await serverShots(page)).map((shot) => shot.id)).toEqual(idsBefore);

  // ④ 切不出两镜时**明说**。两镜都手填成 150 毫秒（手填那条路的下限是 1 毫秒，界面不替作者改数），
  //    这样"半格"在时间线上就是几十像素而不是一两个像素——贴左/贴右的两刀才落得准。
  const duration = page.locator(`[data-storyboard-duration="${firstId}"]`);
  const secondId = idsBefore[1]!;
  await duration.fill('150');
  await duration.blur();
  await savedState(page);
  const secondDuration = page.locator(`[data-storyboard-duration="${secondId}"]`);
  await secondDuration.fill('150');
  await secondDuration.blur();
  await savedState(page);

  // 键盘那条路先挡住：不足两格步长切不出第二镜，disabled 的 title 说的是为什么
  const splitBtn = page.locator(`[data-storyboard-split="${firstId}"]`);
  await expect(splitBtn).toBeDisabled();
  await expect(splitBtn).toHaveAttribute('title', /不足两格步长/);

  // 鼠标那条路不挡（切点由落点决定），所以拒因要读得出来：贴着左边缘那一刀前半是 0 毫秒
  await dblclickBlock(page, `[data-timeline-block="${firstId}"]`, { fromLeftPx: 2 });
  await expect(shots).toHaveCount(2);
  await expect(page.locator('[data-storyboard-notice]')).toContainText('前半只有 0 毫秒');
  await expect(page.locator('[data-storyboard-notice]')).toContainText('往右挪一点再切');

  // 同一格的偏右处：前半凑得成一格、后半只剩 50 毫秒 → 说的是另一句（往左挪）
  await dblclickBlock(page, `[data-timeline-block="${firstId}"]`, { fraction: 0.7 });
  await expect(shots).toHaveCount(2);
  await expect(page.locator('[data-storyboard-notice]')).toContainText('后半只剩 50 毫秒');
  await expect(page.locator('[data-storyboard-notice]')).toContainText('往左挪一点再切');
  // 两次被拒都没有悄悄写库：库里还是那两镜 150 毫秒
  expect((await serverShots(page)).map((shot) => shot.durationMs)).toEqual([150, 150]);
  // 被拒的那一刀也不能把文档标成"未保存"：一次什么都没改的点击不该留下待写的痕迹
  // （截图里出现过"未保存"，这一条就是为它写的——双击的 pointerdown 会先走"拖整块换位"的起手）
  await expect(page.locator('[data-storyboard-save-state]')).toHaveText('已保存');
  await page.locator('[data-timeline-strip]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'screenshots/storyboard-split.png' });
});

/** 图层树里的节点 id：与 `studio.spec.ts` 同一只抓手（按名字找那一行） */
async function layerId(page: Page, name: string): Promise<string> {
  let id = '';
  await expect
    .poll(async () => {
      id = await page.evaluate((target) => {
        const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-layer-id]'));
        const row = rows.find((r) => (r.textContent ?? '').includes(target));
        return row?.dataset.layerId ?? '';
      }, name);
      return id;
    })
    .toBeTruthy();
  return id;
}

/**
 * §41 第二片：时间线自己也能用键盘改（`docs/DESIGN_SYSTEM.md` §90「全部交互可键盘到达」）。
 *
 * 拖拽能做的事要能用键盘做一遍，而且**标准一样**：调整期间库里那份不动、Enter 才落**一个**事务、
 * Esc 取消不留痕、上下限挡得住（一镜不会被调成 0 毫秒）。
 *
 * 最后一段是这一页独有的坑：`CanvasStage` 在 window 上收着方向键（画布微调）与 Esc（退出选择）。
 * 焦点在时间线上按这两个键时不能被画布也收走一份——所以先选中一个可自由移动的画布元素
 * （把 Hero 切成绝对定位，它的子节点才可自由移动），再去按时间线的键，验的是**画布那一份没动**、
 * 选择也没被 Esc 清掉。没有这一段，`stopPropagation` 掉了都不会有人发现。
 */
test('@smoke §41 时间线键盘那条路：方向键调长度、Enter 落库、Esc 取消，且不惊动画布', async ({ page }) => {
  test.setTimeout(300_000);
  await openStudio(page, `时间线键盘 ${Date.now().toString(36)}`);
  await openStoryboardPanel(page);
  await page.fill('[data-storyboard-prompt-input]', '夜色里的港口，一台旧起重机慢慢转身，猫跳上缆绳，它跑起来了');
  await page.click('[data-storyboard-create]');
  await savedState(page);

  const ids = await page
    .locator('[data-timeline-block]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-timeline-block') ?? ''));
  const first = ids[0] ?? '';
  const duration = page.locator(`[data-storyboard-duration="${first}"]`);
  const handle = page.locator(`[data-timeline-trim="${first}"]`);
  await handle.scrollIntoViewIfNeeded();
  await expect(handle).toBeInViewport();

  const beforeMs = Number(await duration.inputValue());
  // 手柄要把当前值读得出来：读屏用户听到的第一句就是"现在多长"
  await expect(handle).toHaveAttribute('aria-valuenow', String(beforeMs));
  await expect(handle).toHaveAttribute('aria-valuetext', `${(beforeMs / 1000).toFixed(1)} 秒`);

  // Tab 能到这个手柄（tabIndex=0）：直接 focus 与按 Tab 过来的效果一致
  await handle.focus();
  await expect(handle).toBeFocused();

  // ① 方向键只改预览：aria-valuenow 跟上去、读数在，而库里那份没动
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', String(beforeMs + 200));
  await expect(page.locator('[data-timeline-readout]')).toContainText('→');
  await expect(page.locator('[data-timeline-announce]')).toContainText('还没写库');
  await page.waitForTimeout(400);
  expect((await serverShots(page)).find((shot) => shot.id === first)?.durationMs).toBe(beforeMs);

  // ② Esc：预览撤掉，一格都没写（"取消"要真的什么都不留，不只是把界面改回去）
  await page.keyboard.press('Escape');
  await expect(handle).toHaveAttribute('aria-valuenow', String(beforeMs));
  await expect(page.locator('[data-timeline-readout]')).toHaveCount(0);
  await expect(page.locator('[data-timeline-announce]')).toContainText('取消');
  expect((await serverShots(page)).find((shot) => shot.id === first)?.durationMs).toBe(beforeMs);

  // ③ Shift 是粗档，一格 1 秒（= 10 × 100 毫秒，与拖动那条路同一个刻度）
  await page.keyboard.press('Shift+ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', String(beforeMs + 1000));

  // ④ Enter：落**一个**可撤销的事务
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-timeline-readout]')).toHaveCount(0);
  await expect(page.locator('[data-timeline-announce]')).toContainText('已写库');
  await expect
    .poll(async () => (await serverShots(page)).find((shot) => shot.id === first)?.durationMs)
    .toBe(beforeMs + 1000);
  await expect(duration).toHaveValue(String(beforeMs + 1000));

  // 撤销**一步**就回到原样：整段键盘调整（三下按键）只算一个事务，不是三步
  await page.click('[data-storyboard-undo]');
  await expect
    .poll(async () => (await serverShots(page)).find((shot) => shot.id === first)?.durationMs)
    .toBe(beforeMs);
  await expect(duration).toHaveValue(String(beforeMs));

  // ⑤ 下限挡得住：一直按 Shift+左 也调不出 0 毫秒的镜头（库里的 durationMs 是整数毫秒，
  //    下限 100 与一格 100 都是 packages/video-model 里的常量）
  await handle.focus();
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('Shift+ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '100');
  await expect(page.locator('[data-timeline-announce]')).toContainText('下限');
  await page.keyboard.press('Escape');
  expect((await serverShots(page)).find((shot) => shot.id === first)?.durationMs).toBe(beforeMs);

  // ⑥ 画布不能被顺带按下：先让一个节点可自由移动（Hero 切成绝对定位），选中它，再按时间线的键。
  //    左边那一格一次只挂一个面板（图层与分镜互斥），所以这一段是"切过去选、切回来按"——
  //    选择存在 studio store 里，换页签不会把它冲掉，右侧属性栏也就还拿着 Headline 的 X
  await page.click('[data-panel-tab="layers"]');
  const hero = await layerId(page, 'Hero');
  await page.click(`[data-layer-id="${hero}"]`);
  await page.locator('[data-prop="模式"]').selectOption('none');
  const headline = await layerId(page, 'Headline');
  await page.click(`[data-node-id="${headline}"]`);
  const xField = page.locator('[data-prop="X"]');
  await expect(xField).toBeEnabled();
  const x0 = await xField.inputValue();

  await page.click('[data-panel-tab="storyboard"]');
  await handle.scrollIntoViewIfNeeded();
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', String(beforeMs + 100));
  // Esc 既要是"取消这次预览"，也不能顺带清掉画布的选择
  await page.keyboard.press('Escape');
  await expect(xField).toHaveValue(x0);
  await expect(xField).toBeVisible();

  await page.locator('[data-timeline-strip]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'screenshots/storyboard-timeline-keyboard.png' });
});


/**
 * §160 成片播放预览：#191 起分镜能真渲出 mp4，但渲完在 Studio 里看不了成片——
 * 用户点完「DEMO 渲染整条分镜」，只有一个文字回执。这一片把成片接进界面：
 * 渲染结果区与历史清单每条各挂一个 <video>，src 走 apiAssetUrl 投影出的鉴权 URL。
 *
 * 要证的三件事：
 * ① 渲染之前面板里一个播放器都没有——不摆「假播放器」占位（§159）；
 * ② 真的能播：浏览器 readyState ≥ 1（HAVE_METADATA）意味着元数据真的从
 *    /api/assets/<id>/file 经鉴权路由流回来了，不是摆着不能播的空壳；
 * ③ DEMO 明码标注还在（§160）：播的是真字节，但「像素是本地确定性推演、不是 AI 生成」
 *    这句话写在明处，不假装有视频 provider。
 */
test('@smoke §160 成片播放预览：DEMO 渲染出的 mp4 在面板里真的能播，且 DEMO 标注照旧', async ({ page }) => {
  test.setTimeout(240_000);
  await openStudio(page, `成片预览 ${Date.now().toString(36)}`);

  await openStoryboardPanel(page);
  await page.fill('[data-storyboard-prompt-input]', '灯塔的光扫过浮冰，她数着回来的每一条船');
  await page.click('[data-storyboard-create]');
  await savedState(page);
  const shotId = (await page.locator('[data-storyboard-shot]').first().getAttribute('data-storyboard-shot'))!;

  // ① 渲染之前：面板里一个播放器都没有——不摆假占位（§159）
  await expect(page.locator('[data-storyboard-render-video]')).toHaveCount(0);

  await page.click('[data-storyboard-render]');
  await expect(page.locator('[data-storyboard-render-result]')).toBeVisible({ timeout: 120_000 });

  // ② 结果区的播放器：src 是 apiAssetUrl 投影出的鉴权 URL（§16：assetId → URL 是投影）
  const video = page.locator('[data-storyboard-render-result] [data-storyboard-render-video]');
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute('src', /^\/api\/assets\/[0-9a-f-]+\/file$/);

  // ③ 真的能播：浏览器把元数据加载出来了。readyState >= 1 意味着字节真的从
  //    /api/assets/<id>/file 流回来过——空壳 src 到不了这一格
  await expect
    .poll(async () => video.evaluate((el: HTMLVideoElement) => el.readyState), {
      timeout: 60_000,
      message: '成片播放器加载不出元数据——鉴权路由没把字节流回来',
    })
    .toBeGreaterThanOrEqual(1);

  // ④ DEMO 明码标注（§160）：播的是真字节，但「不是 AI 生成」这句话写在明处
  await expect(page.locator('[data-storyboard-render-result]')).toContainText('DEMO');

  // ⑤ 历史清单每条也各带一个播放器：渲过几版就能挨个回看
  await expect(page.locator('[data-storyboard-render-history] [data-storyboard-render-video]')).toHaveCount(1);

  // ⑥ 渲完成片自动定位到挂着成片的那一镜（#200）：高亮落在第一镜上，播报也说清是"成片挂在了这一镜"。
  //    这是渲染完成的视图副作用，不进撤销栈（§150 管改动，不管查看）
  const linked = page.locator('[data-storyboard-shot-linked="true"]');
  await expect(linked).toHaveCount(1);
  await expect(linked).toHaveAttribute('data-storyboard-shot', shotId);
  await expect(page.locator('[data-timeline-announce]')).toContainText('成片已挂到第 1 镜');

  await page.locator('[data-storyboard-render-result]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'screenshots/storyboard-render-playback.png' });
});
