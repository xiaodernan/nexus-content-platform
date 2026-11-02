import { expect, test } from '@playwright/test';
import { createProjectNamed } from './support/auth-session';

/**
 * §13 组件的界面投影：把选中的框存为主组件、删除它，并且**撤销能完整回来**。
 *
 * 这一条要看到的不是"有个面板"，而是三件之前只在模型层单测里有凭证的事：
 * 1. 组件是文档真值的一部分（§16），面板只是它的投影——存与删都走一次可撤销事务（§150）；
 * 2. 删除组件会连带解开引用它的实例（`removeComponent` 的 document 全域清理），
 *    撤销时定义与链接一起回来（`restoreComponent`）；
 * 3. 界面上没有"凭空造组件"：必须先选中一个元素，按钮才可点。
 */

async function openStudio(page: import('@playwright/test').Page, name: string): Promise<void> {
  await createProjectNamed(page, name);
}

/**
 * A5 的牙在这段监听里。只断言"刷新后还在"证不了 ops 路径：`store.save()` 碰到 PATCH 回
 * 400/409 会**当场换整份 PUT 兜底**（apps/web/src/studio/store.ts 里那句
 * `if (res && (res.status === 409 || res.status === 400)) res = await putBody()`），
 * PUT 送的是同一份内存状态，实例照样落库、刷新照样看得见——门被摘掉时那条见证是绿的。
 * 所以钉的是"这一存走的是补丁，而且一条也没被报文门拒掉"。
 *
 * PUT 也单独数一份：`patchRejected === 0 && patchOk === 0` 与"补丁被拒后换了整份"是两回事，
 * 前者是 `forceFullSave` 被别处按下（换页/换 mode/历史跳转），压根没走补丁这条路。
 */
function trackDesignSaves(page: import('@playwright/test').Page) {
  const calls = { patchOk: 0, patchRejected: 0, putOk: 0, firstReject: '' };
  page.on('response', (res) => {
    const url = res.url();
    if (!url.includes('/api/projects/')) return;
    const method = res.request().method();
    if (method === 'PATCH' && url.includes('/design')) {
      if (res.status() < 400) {
        calls.patchOk += 1;
        return;
      }
      calls.patchRejected += 1;
      // 拒一次就要把理由摊在断言里：只报"拒了 1 次"的见证逼着人再跑一遍去抓包，
      // 而这一条恰恰是想看"哪一族 op 过不了门"
      void res
        .text()
        .then((body) => {
          if (!calls.firstReject) calls.firstReject = `${res.status()} ${body.slice(0, 500)}`;
        })
        .catch(() => undefined);
      return;
    }
    if (method === 'PUT' && res.status() < 400) calls.putOk += 1;
  });
  return calls;
}

/** 屏幕上这一点真正接到指针的那个元素，相对目标是什么关系（'ok' 才算点得着） */
function hitTestStatus(page: import('@playwright/test').Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return 'missing';
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return 'zero-size';
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    if (!hit) return 'out-of-viewport';
    if (el === hit || el.contains(hit) || hit.contains(el)) return 'ok';
    return `covered-by-${hit.closest('[data-canvas-surface]') ? 'canvas-surface' : hit.tagName.toLowerCase()}`;
  }, selector);
}

/**
 * 面板里的按钮必须真的"点得着"。卡片一行排不下三个按钮时，多出来的那个会溢出到画布底下：
 * DOM 里查得到、`toBeVisible()` 也过，但坐标上被 `[data-canvas-surface]` 接着——
 * Playwright 点它不会立刻失败，而是重试到超时（2026-11-03 实测 243 次重试 / 150 秒才红）。
 * 这一句把同一个判据提前到几秒内，并且把"是谁盖在上面"写在读数里。
 */
async function expectHitTestable(page: import('@playwright/test').Page, selector: string): Promise<void> {
  await expect
    .poll(() => hitTestStatus(page, selector), { timeout: 8_000, intervals: [200] })
    .toBe('ok');
}

/**
 * 仪器自证：`expectHitTestable` 报的是"这一点接到的是谁"，那它就得真的能报出"被盖住"。
 * 盖一层透明遮罩是**不依赖界面布局**的证法——臂不碰产品代码，遮罩一撤读数就回 'ok'。
 * 为什么要在界面里自己造覆盖：两次真改布局的臂（单行摆 / `min-w-max` 撑宽）都没把按钮推到
 * 画布底下（动作排自己换行了），门对着没坏的东西当然绿——那种绿不能算牙。
 */
async function expectDoorHasTeeth(page: import('@playwright/test').Page, selector: string): Promise<void> {
  await page.evaluate(() => {
    const overlay = document.createElement('div');
    overlay.id = 'hit-test-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:auto';
    document.body.appendChild(overlay);
  });
  const covered = await hitTestStatus(page, selector);
  await page.evaluate(() => document.getElementById('hit-test-overlay')?.remove());
  expect(covered, `盖了一层全屏遮罩仍然报 ${covered}＝这一句查的不是命中测试`).toContain('covered-by-');
  await expect.poll(() => hitTestStatus(page, selector), { timeout: 8_000 }).toBe('ok');
}

test('@smoke 组件面板：存为组件 → 删除 → 撤销把定义与实例链接一起带回来', async ({ page }) => {
  test.setTimeout(150_000);
  await openStudio(page, `组件面板 ${Date.now().toString(36)}`);

  // 图层行只在「图层」那一栏里，所以**先**拿到一个确定存在的节点 id，再切到设计系统栏
  let targetId = '';
  await expect
    .poll(async () => {
      targetId = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-layer-id]'));
        return rows.find((r) => (r.textContent ?? '').includes('Headline'))?.dataset.layerId ?? '';
      });
      return targetId;
    })
    .toBeTruthy();

  await page.click('[data-panel-tab="design"]');
  const section = page.locator('[data-components-section]');
  await expect(section).toBeVisible();
  // 先选中才能存：没选中时按钮不可点，面板不许凭空造一个组件出来
  await expect(page.locator('[data-component-save]')).toBeDisabled();
  await expect(section).toContainText('还没有组件');

  await page.locator(`[data-node-id="${targetId}"]`).click();
  await expect(page.locator('[data-component-save]')).toBeEnabled();

  await page.click('[data-component-save]');
  const card = page.locator('[data-component-card]').first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  const componentId = await card.getAttribute('data-component-card');
  expect(componentId).toBeTruthy();
  // 刚存的组件还没有任何实例引用它：这个数字必须是 0，而不是看起来更顺眼的 1
  await expect(card).toContainText('引用 0');
  // 下面几步要点这三个按钮，先确认它们都真的点得着（溢到画布底下的那个要几秒内报出来，
  // 而不是等 150 秒超时）。第一句先自证这一句有牙，再拿它量产品代码。
  await expectDoorHasTeeth(page, `[data-component-delete="${componentId}"]`);
  for (const action of ['instantiate', 'sync', 'delete']) {
    await expectHitTestable(page, `[data-component-${action}="${componentId}"]`);
  }

  await page.screenshot({ path: 'screenshots/components-panel.png' });

  // 删除：一次事务，撤销要能把定义带回来
  await page.click(`[data-component-delete="${componentId}"]`);
  await expect(page.locator(`[data-component-card="${componentId}"]`)).toHaveCount(0, { timeout: 20_000 });

  await page.getByTitle('撤销（Ctrl+Z）').click();
  await expect(page.locator(`[data-component-card="${componentId}"]`)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(`[data-component-card="${componentId}"]`)).toContainText('引用 0');

  await page.getByTitle('重做（Ctrl+Shift+Z）').click();
  await expect(page.locator(`[data-component-card="${componentId}"]`)).toHaveCount(0, { timeout: 20_000 });
});

/**
 * §13 实例化的界面入口：组件目录里点一下 → 当前页上多出一份复制体 → 引用计数跟着真值走。
 *
 * 这一条补的是上面那条见证的空格：`引用 0` 在过去**只能是** 0，因为除了让 AI 手写 `insert`
 * 逐节点堆，界面上没有任何路径能造出实例。现在有了 `instantiate` op，读数才第一次有牙：
 * 放 → 引用 1 且页面树多 2 个节点，撤销 → 双双回去，重做 → 又回来；
 * 删组件 → 目录里没了它，画布上那颗还在（引用 0）。
 *
 * 尺子用 `data-layer-total` 而不是数图层行数：列表是虚拟化的（只铺看得见的那几十行），
 * 数 DOM 行数量的其实是滚动窗口。`data-layer-total` 是文档侧的真数，专门为此留着。
 */
test('@smoke 组件面板：放到当前页 → 引用与页面树一起变，撤销/重做/删组件各按自己的账回来', async ({ page }) => {
  test.setTimeout(180_000);
  await openStudio(page, `组件实例化 ${Date.now().toString(36)}`);

  let targetId = '';
  await expect
    .poll(async () => {
      targetId = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-layer-id]'));
        return rows.find((r) => (r.textContent ?? '').includes('Headline'))?.dataset.layerId ?? '';
      });
      return targetId;
    })
    .toBeTruthy();

  /** 图层栏与设计系统栏各占左栏：读 `data-layer-total` 要切回图层，读完切回来才点得动目录 */
  const layerTotal = async (): Promise<number> => {
    await page.click('[data-panel-tab="layers"]');
    const n = await page.evaluate(() => {
      const el = document.querySelector('[data-layer-total]') as HTMLElement | null;
      return Number(el?.dataset.layerTotal ?? '-1');
    });
    await page.click('[data-panel-tab="design"]');
    await expect(page.locator('[data-components-section]')).toBeVisible();
    return n;
  };

  // 选中的是 Headline 那**一个**叶子节点：复制体 = 实例壳 + 叶子本身，页面树正好多 2
  await page.locator(`[data-node-id="${targetId}"]`).click();
  const start = await layerTotal();
  expect(start).toBeGreaterThan(1);

  await page.click('[data-component-save]');
  const card = page.locator('[data-component-card]').first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  const componentId = await card.getAttribute('data-component-card');
  expect(componentId).toBeTruthy();
  await expect(card).toContainText('引用 0');

  // 放一份到当前页
  const saveCalls = trackDesignSaves(page);
  await page.click(`[data-component-instantiate="${componentId}"]`);
  await expect(card).toContainText('引用 1', { timeout: 20_000 });
  await expect.poll(layerTotal, { timeout: 20_000 }).toBe(start + 2);
  await page.screenshot({ path: 'screenshots/components-instantiate.png' });

  // 撤销：实例连同复制体整份收走，不是只把目录里那个数字改回去
  await page.getByTitle('撤销（Ctrl+Z）').click();
  await expect(card).toContainText('引用 0', { timeout: 20_000 });
  await expect.poll(layerTotal, { timeout: 20_000 }).toBe(start);

  // 重做：原样回来
  await page.getByTitle('重做（Ctrl+Shift+Z）').click();
  await expect(card).toContainText('引用 1', { timeout: 20_000 });
  await expect.poll(layerTotal, { timeout: 20_000 }).toBe(start + 2);

  // 删组件：定义移出目录，实例留在画布上但被解开（节点数不变，引用归 0）
  await page.click(`[data-component-delete="${componentId}"]`);
  await expect(page.locator(`[data-component-card="${componentId}"]`)).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(layerTotal, { timeout: 20_000 }).toBe(start + 2);

  // 撤销删除：定义回来，链接也接回画布上那颗实例
  await page.getByTitle('撤销（Ctrl+Z）').click();
  const back = page.locator(`[data-component-card="${componentId}"]`);
  await expect(back).toBeVisible({ timeout: 20_000 });
  await expect(back).toContainText('引用 1', { timeout: 20_000 });

  /**
   * 刷新一次：把"模型层通了"与"落到库里了"分开钉。
   * 但**这一句单独不背书报文门**——上面注释里那个整份 PUT 兜底会替被拒的补丁把活儿干完，
   * 门摘掉时刷新后照样是 `引用 1`。门的牙在末尾那两条 PATCH 计数上。
   */
  await expect(page.locator('[data-save-state]')).not.toContainText('未保存', { timeout: 60_000 });
  await expect(page.locator('[data-save-state]')).toContainText('已保存');
  await page.reload();
  await page.click('[data-panel-tab="design"]');
  const afterReload = page.locator(`[data-component-card="${componentId}"]`);
  await expect(afterReload).toBeVisible({ timeout: 40_000 });
  await expect(afterReload).toContainText('引用 1', { timeout: 20_000 });

  // 落库这条路确实是补丁走的：报文门（`ProjectDesignPatchRequestSchema`）拒一次就算缺陷，
  // 因为拒了以后界面仍然说"已保存"，只是悄悄换成了整份 PUT
  await page.waitForTimeout(1_000);
  expect(
    saveCalls.patchRejected,
    `自动保存里有 ${saveCalls.patchRejected} 次 PATCH 被报文门拒掉；第一次的理由：${saveCalls.firstReject || '（没抓到正文）'}`,
  ).toBe(0);
  expect(saveCalls.patchOk, `一次 PATCH 都没发出去（走了 ${saveCalls.putOk} 次整份 PUT）`).toBeGreaterThan(0);
});

/**
 * §13「主组件改了，实例跟上」的界面入口：改主组件的文案 → 点「更新实例」→ 画布上那份复制体
 * 换成新样子 → 撤销回到旧的、重做又跟上。
 *
 * 这一条补的是第三十四片明写在 ADR-0078 里的那一格：放出去的实例是**物化复制体**，
 * 主组件改了它不会自己跟上，过去界面上也没有任何路径能把它换掉（只能删了重放）。
 *
 * 尺子用画布上那颗叶子节点的 textContent，不用图层行数：主组件与复制体**同名**，
 * 按名字数不清是谁，而 `[data-node-type]` 那几颗叶子是把哪一份渲染在屏幕上摊开来数。
 * 末尾仍数一次 `data-layer-total`：同步是"旧的收走、新的插回"，节点总数不能涨——
 * 涨了就是把实例又放了一遍（第三十四片那条见证量的是 +2，这一条量的是 +0）。
 */
test('@smoke 组件面板：改主组件 → 更新实例 → 复制体跟上，撤销/重做各按自己的账回来', async ({ page }) => {
  test.setTimeout(180_000);
  await openStudio(page, `组件同步 ${Date.now().toString(36)}`);

  const saveCalls = trackDesignSaves(page);

  let targetId = '';
  await expect
    .poll(async () => {
      targetId = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-layer-id]'));
        return rows.find((r) => (r.textContent ?? '').includes('Headline'))?.dataset.layerId ?? '';
      });
      return targetId;
    })
    .toBeTruthy();

  /** 图层栏只在那一栏里读得到，读完切回设计系统栏才点得动目录 */
  const layerTotal = async (): Promise<number> => {
    await page.click('[data-panel-tab="layers"]');
    const n = await page.evaluate(() => {
      const el = document.querySelector('[data-layer-total]') as HTMLElement | null;
      return Number(el?.dataset.layerTotal ?? '-1');
    });
    await page.click('[data-panel-tab="design"]');
    await expect(page.locator('[data-components-section]')).toBeVisible();
    return n;
  };

  const master = page.locator(`[data-node-id="${targetId}"]`);
  await master.click();
  const original = ((await master.textContent()) ?? '').trim();
  expect(original.length).toBeGreaterThan(0);
  const leafType = await master.evaluate((el) => (el as HTMLElement).dataset.nodeType ?? 'text');
  const countWith = (want: string) =>
    page.evaluate(
      ({ type, text }) =>
        Array.from(document.querySelectorAll<HTMLElement>(`[data-node-type="${type}"]`)).filter(
          (el) => (el.textContent ?? '').trim() === text,
        ).length,
      { type: leafType, text: want },
    );

  await page.click('[data-panel-tab="design"]');
  await page.click('[data-component-save]');
  const card = page.locator('[data-component-card]').first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  const componentId = await card.getAttribute('data-component-card');
  expect(componentId).toBeTruthy();

  // 放一份实例：此刻画布上有两份一模一样的文字，而这一页上有 1 颗实例等着被更新
  await page.click(`[data-component-instantiate="${componentId}"]`);
  await expect(card).toContainText('引用 1', { timeout: 20_000 });
  await expect.poll(() => countWith(original), { timeout: 20_000 }).toBe(2);
  const afterPlace = await layerTotal();

  // 改主组件，实例不动——这一格存在正是「更新实例」这个按钮存在的理由
  await page.click(`[data-node-id="${targetId}"]`);
  const renamed = `同步见证 ${Date.now().toString(36)}`;
  await page.fill('[data-prop="text"]', renamed);
  await expect.poll(() => countWith(renamed), { timeout: 20_000 }).toBe(1);
  await expect.poll(() => countWith(original)).toBe(1);

  const sync = page.locator(`[data-component-sync="${componentId}"]`);
  await expect(sync).toHaveAttribute('data-component-sync-count', '1');
  await expect(sync).toBeEnabled();
  await sync.click();
  await expect.poll(() => countWith(renamed), { timeout: 20_000 }).toBe(2);
  await expect.poll(() => countWith(original)).toBe(0);
  // 换掉而不是再加一份：节点总数与放实例那天一样
  expect(await layerTotal()).toBe(afterPlace);

  await page.getByTitle('撤销（Ctrl+Z）').click();
  await expect.poll(() => countWith(renamed), { timeout: 20_000 }).toBe(1);
  await expect.poll(() => countWith(original)).toBe(1);
  await page.getByTitle('重做（Ctrl+Shift+Z）').click();
  await expect.poll(() => countWith(renamed), { timeout: 20_000 }).toBe(2);
  await expect.poll(() => countWith(original)).toBe(0);
  await page.screenshot({ path: 'screenshots/components-sync.png' });

  // 同步那串 remove+insert 过不了报文门的话，界面会悄悄换成整份 PUT，读数照样好看——
  // 所以这里钉的是"这一存走的是补丁，而且一条也没被拒"（第三十四片 A5 的教训）
  await expect(page.locator('[data-save-state]')).not.toContainText('未保存', { timeout: 60_000 });
  await page.waitForTimeout(1_000);
  expect(
    saveCalls.patchRejected,
    `自动保存里有 ${saveCalls.patchRejected} 次 PATCH 被报文门拒掉；第一次的理由：${saveCalls.firstReject || '（没抓到正文）'}`,
  ).toBe(0);
  expect(saveCalls.patchOk, `一次 PATCH 都没发出去（走了 ${saveCalls.putOk} 次整份 PUT）`).toBeGreaterThan(0);
});
