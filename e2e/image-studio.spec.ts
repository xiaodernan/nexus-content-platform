import { expect, test, type Page } from '@playwright/test';

/**
 * §38 Image Studio 的第一条箭头（Text → Image）在真浏览器里走一遍。
 *
 * 这一条要看到的**不是"点了按钮有张图"**，而是三件用户可感、但之前只在服务端单测里有凭证的事：
 * 1. 生成物进的是**同一份资产清单**（模型即真值，§16），卡片上带着 **DEMO 角标**——
 *    这枚角标读的是 `generatedBy.demoMode`，而那个字段在本次修复前**没有任何写入方**（死代码）；
 * 2. 一次点击 = 一个可撤销事务：撤销同时收回画布上的填充与清单里的条目（§149/§150）；
 * 3. 消费透明（§134）：这一笔 -2 的 image 额度在 `/credits` 页面上看得见，理由里带着"DEMO 模板"。
 *
 * 本机没有图像 provider，所以像素来自本地确定性合成器；界面上必须自称 DEMO MODE（§160），
 * 这条用例同时是那句"DEMO 标识常驻"的用户可见凭证。
 */

async function createProject(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.fill('[data-project-name-input]', name);
  await page.click('[data-create-project]');
  await page.waitForURL(/\/studio\/[^/]+$/);
  await expect(page.locator('[data-canvas-frame]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-node-id]')).toHaveCount(8);
  return new URL(page.url()).pathname.split('/').pop()!;
}

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

test('@smoke 图像生成：DEMO 角标可见、一次点击一个事务、额度页面看得见那一笔', async ({ page }) => {
  test.setTimeout(150_000);
  const projectId = await createProject(page, `图像生成 ${Date.now().toString(36)}`);

  const targetId = await layerId(page, 'Headline');
  const node = page.locator(`[data-node-id="${targetId}"]`);
  await node.click();
  await page.click('[data-panel-tab="assets"]');
  await expect(page.locator('[data-assets-panel]')).toBeVisible();

  // 空 prompt 时按钮必须不可点：需求要的是"用户不会点出一张没意义的图"
  await expect(page.locator('[data-image-generate]')).toBeDisabled();

  const prompt = '一只在月球上弹吉他的猫';
  await page.fill('[data-image-prompt]', prompt);
  await page.click('[data-image-generate]');

  // 先认出"这是哪一张"：清单按创建时间正序，新生成的排在**最后**，
  // 所以不能用 .first()——那会断到别人的卡片上。assetId 从画布那层反解出来。
  await expect(node).toHaveCSS('background-image', /\/api\/assets\//, { timeout: 40_000 });
  const assetId = await node.evaluate((el) => {
    const match = /\/api\/assets\/([^/]+)\/file/.exec(getComputedStyle(el).backgroundImage);
    return match?.[1] ?? '';
  });
  expect(assetId, '画布上没有出现生成图').toMatch(/^[a-z0-9_-]+$/i);
  await expect(node).toHaveCSS('background-image', new RegExp(`/api/assets/${assetId}/file`));

  const card = page.locator(`[data-asset-card="${assetId}"]`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText(prompt.slice(0, 8));
  // 这枚角标是本次修复的用户可见凭证：它读的 `generatedBy.demoMode` 在修复前没有任何写入方
  await expect(card.locator('[data-asset-demo-badge]')).toHaveText('DEMO');
  await expect(card.locator('img')).toHaveAttribute('src', `/api/assets/${assetId}/file`);
  await expect
    .poll(async () => card.locator('img').evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 20_000 })
    .toBeGreaterThan(0);

  // 同一次点击把图贴到了选中的元素上：清单里的引用数与画布背景同源
  await expect(card).toContainText('引用 1');
  await page.screenshot({ path: 'screenshots/image-studio-generated.png' });

  // 撤销：填充与清单项一起消失（一次事务，不是两笔各撤销一半）
  await page.getByTitle('撤销（Ctrl+Z）').click();
  await expect(page.locator(`[data-asset-card="${assetId}"]`)).toHaveCount(0, { timeout: 20_000 });
  await expect(node).not.toHaveCSS('background-image', /\/api\/assets\//);

  // 重做：又回来了，仍然是那一张
  await page.getByTitle('重做（Ctrl+Shift+Z）').click();
  await expect(page.locator(`[data-asset-card="${assetId}"]`)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(`[data-asset-card="${assetId}"] [data-asset-demo-badge]`)).toHaveText('DEMO');

  // §38 第二条箭头 Reference → Variation 的界面入口：以清单里那一张为参考再生成一张
  const cardsBefore = await page.locator('[data-asset-card]').count();
  await page.click(`[data-asset-variant="${assetId}"]`);
  await expect(page.locator('[data-assets-panel] [data-asset-notice]')).toContainText('以清单里那张为参考的变体', { timeout: 40_000 });
  await expect(page.locator('[data-asset-card]')).toHaveCount(cardsBefore + 1, { timeout: 30_000 });
  // 清单按创建时间正序，新那一张排在最后；它是**另一行资产**（另一份字节），不是原图被改
  const variant = page.locator('[data-asset-card]').last();
  await expect(variant.locator('img')).not.toHaveAttribute('src', `/api/assets/${assetId}/file`);
  await expect(variant.locator('[data-asset-demo-badge]')).toHaveText('DEMO');
  await expect
    .poll(async () => variant.locator('img').evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 20_000 })
    .toBeGreaterThan(0);
  await page.screenshot({ path: 'screenshots/image-studio-variation.png' });

  // §134 消费透明：那一笔 -2 在额度页看得见，理由里带着它是 DEMO 给的
  await page.goto('/credits');
  const entry = page.locator(`[data-credit-kind="image"][data-credit-delta="-2"]`).first();
  await expect(entry).toBeVisible({ timeout: 20_000 });
  await expect(entry).toContainText('DEMO 模板 image.generate 生成完成');
  await expect(entry.locator('[data-credit-task]')).not.toHaveText('不绑定任务');
  expect(projectId).toMatch(/^[a-z0-9-]+$/i);
});

/**
 * §38 Sketch → Image 在真浏览器里走一遍。要看到的不是"能画能生成"，而是四件用户可感的事：
 * 1. 空白纸点不动生成（防止一张没画的纸被喂进生成链）；画了笔但没写描述时，缺料的原因就地说清；
 * 2. 一次点击 = 一个事务：草图与生成图**两条清单项同时进**（§149），撤销也同时走；
 * 3. 生成那张带 DEMO 角标、草图那张不带——角标说的是"这不是模型给的图"，
 *    你自己画的笔迹当然不是合成物，两枚徽章各有事实（§159/§160）；
 * 4. 回执里写着构图来源是草图的测量值，不是"照轮廓画"——边界不夸大。
 */
test('@smoke 草图生成：空白不可点、一次事务两张卡、DEMO 只贴在生成那张', async ({ page }) => {
  test.setTimeout(180_000);
  await createProject(page, `草图生成 ${Date.now().toString(36)}`);
  await page.click('[data-panel-tab="assets"]');
  await expect(page.locator('[data-assets-panel]')).toBeVisible();

  await page.click('[data-sketch-section] summary');
  const generateButton = page.locator('[data-sketch-generate]');
  // 空白纸 + 空描述：这颗按钮不该点得动
  await expect(generateButton).toBeDisabled();

  const pad = page.locator('[data-sketch-pad]');
  const box = await pad.boundingBox();
  if (!box) throw new Error('草图绘制区没有尺寸，浏览器里它没被画出来');
  // 真鼠标按-拖-放：pointer 事件要走浏览器的命中测试，dispatchEvent 那种合成不算凭证
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.3, { steps: 10 });
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.85, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('[data-sketch-strokes]')).toHaveText('1 笔');
  // 有笔迹但没描述：缺料要就地说清，而不是让按钮哑着
  await expect(page.locator('[data-sketch-need-prompt]')).toBeVisible();
  await expect(generateButton).toBeDisabled();

  const prompt = '黄昏后的海岸城市';
  await page.fill('[data-image-prompt]', prompt);
  await expect(page.locator('[data-sketch-need-prompt]')).toHaveCount(0);
  await expect(generateButton).toBeEnabled();

  const cardsBefore = await page.locator('[data-asset-card]').count();
  await generateButton.click();
  await expect(page.locator('[data-assets-panel] [data-asset-notice]')).toContainText('明暗与元素密度取自草图', { timeout: 60_000 });
  // 一次点击进两张卡：草图（你画的，无 DEMO）+ 生成图（合成物，有 DEMO）
  await expect(page.locator('[data-asset-card]')).toHaveCount(cardsBefore + 2, { timeout: 30_000 });
  const cards = page.locator('[data-asset-card]');
  const sketchCard = cards.nth(cardsBefore);
  const generatedCard = cards.nth(cardsBefore + 1);
  await expect(sketchCard).toContainText('草图');
  await expect(sketchCard.locator('[data-asset-demo-badge]')).toHaveCount(0);
  await expect(generatedCard.locator('[data-asset-demo-badge]')).toHaveText('DEMO');
  await expect(generatedCard.locator('img')).toHaveAttribute('src', /\/api\/assets\/[^/]+\/file/);
  await expect
    .poll(async () => generatedCard.locator('img').evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 20_000 })
    .toBeGreaterThan(0);
  await page.screenshot({ path: 'screenshots/image-studio-sketch.png' });

  // 撤销：两张一起走——草图与生成图绑在同一事务里，撤销不该留下半截清单（§149）
  await page.getByTitle('撤销（Ctrl+Z）').click();
  await expect(page.locator('[data-asset-card]')).toHaveCount(cardsBefore, { timeout: 20_000 });
});
