import { expect, test, type Browser, type Page } from '@playwright/test';
import { loginMemberIfPossible, reusableMemberWithProject } from './support/auth-session';

/**
 * §14 / §85 第十六片：访客那一边的 `?viewport=` 与 `?zoom=` —— 真浏览器里的第一次走通。
 *
 * 第十三片量到的原始事实是：公开页把设计稿按**发布快照算出来的绝对像素**铺进一个
 * `overflow-x-auto` 的容器，访客在手机上要横向平移一千多 px 才看得见右半边，
 * 而**访客自己没有任何办法改变这件事**（`?zoom=` / `?viewport=` 当时只有作者侧的
 * `/preview` 有一半，公开页连读都不读）。这一片接的就是那半边，所以每一条断言都必须是
 * 访客在真浏览器里看得见的差别，而不是"参数被读进来了"这种自证。
 *
 * 载体是一份**自己写进模型**的稿子（走平台自己的 PUT 契约，与 studio 同一份），里面三样东西各有用处：
 * ① 起手页的一个文字节点带一条 `mobile` 断点规则（`visible:false`）—— 断点这一档**真的改变了画面**，
 *    这是"那颗按钮不是摆设"的证据；
 * ② 一个按钮节点带 `click → navigate` 到第二页 —— 热点翻页时取景框必须跟着过去；
 * ③ 第二页的根画框**恰好写着 375**、且没有任何规则 —— 那一档重解出来与"按设计尺寸"逐字节相同
 *    （依据是 `packages/design-model/test/layout.test.ts` 里那条同解见证），所以那颗按钮不该摆出来。
 *
 * 一条容易写错的纪律：`applyResponsive` 的规则按 `BREAKPOINT_ORDER <= 当前档` **向上级联**，
 * 所以那条 `mobile` 规则在 tablet / desktop / wide 下同样生效。这里就把这件事直接量出来（腿 C），
 * 免得后来人把它当成 bug 修掉；相应地**不许**断言"换到 tablet 那个节点又回来了"。
 *
 * 与第二、三、十三片一样，`zoom` 那两条读数同时记下**布局宽**（`offsetWidth`，模型算出来的那个数）
 * 和**视觉宽**（`getBoundingClientRect().width`，缩放后的那个数）：只有两个都钉住，才能说清
 * "缩小看全"改的是投影，不是发布快照（§16）。
 *
 * 第三十一片（ADR-0074）之后，**缺参数不再等于设计尺寸**：这一页有断点规则时，服务端把四档
 * 各解一份铺进 DOM，由媒体查询选一份——访客不点任何东西也先看到适合自己视口的那一版。
 * 于是"钉住设计尺寸"变成明写的 `?viewport=design`（腿 A2 才测它），腿 A 改测自动选档。
 */

const RUN = Date.now().toString(36);

/** 夹具账号与项目复用：注册限流 10/小时、建项目 20/小时，这一片每跑一次都不该再吃这两道额度 */
const FIXTURE_EMAIL = 'viewer+fixture@nexus.test';
const FIXTURE_PASSWORD = 'e2e-secret-123';

interface RawNode {
  id: string;
  name?: string;
  parentId?: string;
  children?: string[];
  [key: string]: unknown;
}
interface RawPage {
  id: string;
  name: string;
  rootId: string;
  width: number;
  height: number;
  nodes: Record<string, RawNode>;
  [key: string]: unknown;
}
interface RawDoc {
  pages: RawPage[];
  activePageId: string;
  [key: string]: unknown;
}

interface Carriers {
  homeId: string;
  endId: string;
  /** 被 mobile 规则隐藏掉的那个节点 */
  hideId: string;
  /** 挂着 click → navigate 的那个节点 */
  ctaId: string;
}

/**
 * 把起手稿改成"带一条断点规则 + 一个跳页交互 + 一张 375 窄页"。
 *
 * 与 §167 那条链同一份纪律：**先离开 Studio 再写**（store 里留着旧的副本，
 * 自动保存可能在卸载时把它盖回去）；新页**克隆现有节点**而不是手写字面量，
 * 缺字段的节点会白屏。
 */
async function authorViewerDocument(page: Page, projectId: string): Promise<Carriers> {
  await page.goto('/');
  const csrf = (await page.context().cookies()).find((c) => c.name === 'nexus_csrf')?.value ?? '';
  const current = await page.request.get(`/api/projects/${projectId}`);
  expect(current.status(), `读取项目失败：${await current.text()}`).toBe(200);
  const doc = (await current.json()).document as RawDoc;
  // 起手页**先按名字认**，其次按 `activePageId`：服务端读回来的 pages 顺序不是这份契约的一部分
  // （第一跑就撞过一次：写了第二页之后，`pages[0]` 变回了那张窄页，于是"找不到 Eyebrow"）。
  // 名字先于 activePageId 是因为后者在反复写入后可能指着上一轮写过的那张窄页。
  const home =
    doc.pages.find((p) => p.name === 'Home') ?? doc.pages.find((p) => p.id === doc.activePageId) ?? doc.pages[0]!;

  const byName = (name: string): RawNode | undefined => Object.values(home.nodes).find((n) => n.name === name);
  const eyebrow = byName('Eyebrow');
  const cta = byName('Primary CTA');
  const homeRoot = home.nodes[home.rootId]!;
  // 载体必须先存在，否则后面每一条断言都是拿"没有这个东西"当"这个东西没问题"
  if (!eyebrow) throw new Error(`起手页（${home.name} / ${home.id}）里没有名为 Eyebrow 的节点：这一片要隐藏的载体不存在`);
  if (!cta) throw new Error('起手页里没有名为 Primary CTA 的节点：跳页交互的载体不存在');
  if (!homeRoot) throw new Error('起手页的根画框读不到：窄页要克隆它的形状');

  // id 与页名都**不带运行号**：夹具项目要能反复写而越写越干净。带运行号的话每跑一次就多攒一张窄页
  const endId = 'page-narrow-375';
  const endRootId = 'root-narrow-375';
  const endTextId = 'txt-narrow-375';
  const END_NAME = '窄页 375';

  // ① 断点规则：这一档把这个节点藏掉（模型里的 responsive，不是 CSS 媒体查询）
  eyebrow.responsive = [{ breakpoint: 'mobile', patch: { visible: false } }];
  // ② 跳页交互：目标是那张 375 的窄页。id 同样不带运行号——每次重写都把这一条覆盖掉，
  //    而不是在同一个节点上越攒越多的重复交互
  cta.interactions = [{ id: 'i-navigate-narrow', trigger: 'click', action: 'navigate', target: endId }];

  // ③ 窄页：根宽恰好等于 mobile 那一档的断点宽，且**一个规则都没有**（克隆来的节点要清掉规则），
  //    这样 `liveBreakpoints` 才有资格判定"手机那一格是空按钮"
  const end: RawPage = {
    ...structuredClone(home),
    id: endId,
    name: '窄页 375',
    rootId: endRootId,
    width: 375,
    height: 900,
    nodes: {
      [endRootId]: {
        ...structuredClone(homeRoot),
        id: endRootId,
        name: '窄页根',
        children: [endTextId],
        size: { width: 375, height: 900 },
        responsive: undefined,
        interactions: undefined,
      },
      [endTextId]: {
        ...structuredClone(eyebrow),
        id: endTextId,
        parentId: endRootId,
        name: '窄页文字',
        children: [],
        responsive: undefined,
        interactions: undefined,
      },
    },
  };
  // 反复写入要**收敛**而不是累积：按 id 与页名把上一轮留下的窄页先摘掉再放这一轮的。
  // 不摘的话夹具项目每跑一次多一张窄页，而"页面上有几张页"会开始影响别处的读数。
  doc.pages = [...doc.pages.filter((p) => p.id !== endId && p.name !== END_NAME), end];

  const put = await page.request.put(`/api/projects/${projectId}`, {
    headers: { 'x-csrf-token': csrf },
    data: doc,
  });
  expect(put.status(), `写入响应式稿失败：${await put.text()}`).toBe(200);
  return { homeId: home.id, endId, hideId: eyebrow.id, ctaId: cta.id };
}

/** 发布（公开）并回公开路径。同一项目重复发布是**换版本**，路径不变，所以夹具可以长用 */
async function publishPublic(page: Page, projectId: string): Promise<string> {
  await page.goto(`/studio/${projectId}`);
  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-submit]')).toBeVisible({ timeout: 60_000 });
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 60_000 });
  return (await page.locator('[data-publish-url]').getAttribute('href'))!;
}

type Dataset = Record<string, string | undefined>;

/** 控件行自己报的那几个读数：这一排的全部意义就是"服务端按这些数画的这一版"。
 *  `data-viewer-live-breakpoints` 挂在里面那一层（它描述的是"哪几档在改"，不是整行），
 *  所以两层一起读——否则这条读数存在却没人读得到。 */
async function reader(p: Page): Promise<Dataset> {
  const row = p.locator('[data-viewer-controls]').first();
  await expect(row, '查看器控件行没渲染出来：访客没有可以改投影的入口').toBeVisible({ timeout: 30_000 });
  return row.evaluate((el) => {
    const host = el as HTMLElement;
    const options = host.querySelector('[data-viewer-viewport-options]') as HTMLElement | null;
    return { ...host.dataset, ...(options?.dataset ?? {}) } as Dataset;
  });
}

/** 缩放盒 + 真正会横向平移的那层容器（`overflow-x-auto`）的读数。
 *  左右内边距也一起读：残余平移必须由"盒宽 + 两条 gutter − 可视宽"这条算术解释得通，
 *  否则"缩到 0.25 就归零"只是一句碰巧过了的断言。 */
async function panReading(p: Page): Promise<{
  boxVisual: number;
  scroll: number;
  client: number;
  padLeft: number;
  padRight: number;
}> {
  return p.evaluate(() => {
    const box = Array.from(document.querySelectorAll('[data-published-scale-box]')).find((el) => {
      const variant = el.closest('[data-published-variant]');
      return !variant || getComputedStyle(variant).display !== 'none';
    }) as HTMLElement;
    const scroller = box.parentElement as HTMLElement;
    const cs = getComputedStyle(scroller);
    return {
      boxVisual: Math.round(box.getBoundingClientRect().width),
      scroll: scroller.scrollWidth,
      client: scroller.clientWidth,
      padLeft: Math.round(parseFloat(cs.paddingLeft) || 0),
      padRight: Math.round(parseFloat(cs.paddingRight) || 0),
    };
  });
}

/** 画面盒子：布局宽（模型算出来的那个数，transform 不改它）与视觉宽（缩放后的那个数） */
async function frameReading(p: Page): Promise<{ layout: number; visual: number }> {
  return p.evaluate(() => {
    // 自动选档下四份投影同时在 DOM 里，隐藏的几份量出来是 0 —— 读**可见**的那一份
    const f = Array.from(document.querySelectorAll('[data-published-frame]')).find((el) => {
      const variant = el.closest('[data-published-variant]');
      return !variant || getComputedStyle(variant).display !== 'none';
    }) as HTMLElement;
    return { layout: f.offsetWidth, visual: Math.round(f.getBoundingClientRect().width) };
  });
}

/** 四份投影里现在真的可见的那一份（auto 档下由媒体查询选出来） */
async function visibleVariant(p: Page): Promise<string | null> {
  return p.evaluate(() => {
    const el = Array.from(document.querySelectorAll('[data-published-variant]')).find(
      (node) => getComputedStyle(node).display !== 'none',
    );
    return el?.getAttribute('data-published-variant') ?? null;
  });
}

interface Fixture {
  projectId: string;
  carriers: Carriers;
  publicPath: string;
}

/**
 * 夹具的搭建要**在具体用例里面**做：`test.info().project` 带着那个用例的视口配置，
 * 放到 `beforeAll` 里就丢掉了（`publishPublic` 点 studio 的发布按钮时用的是默认桌面档）。
 * 同一份 PUT + 同一次发布，两个用例各自摆一次自己该摆的桌面。
 */
async function buildFixture(browser: Browser, viewport?: { width: number; height: number }): Promise<Fixture> {
  const context = await browser.newContext(viewport ? { viewport } : {});
  try {
    const page = await context.newPage();
    const fixture = await reusableMemberWithProject(page, FIXTURE_EMAIL, FIXTURE_PASSWORD, `查看器夹具${RUN}`);
    const carriers = await authorViewerDocument(page, fixture.projectId);
    const publicPath = await publishPublic(page, fixture.projectId);
    console.log(
      `\n== 第十六片的载体：夹具账号${fixture.freshAccount ? '（本轮首次注册）' : '（复用，零注册）'} · ` +
        `项目 ${fixture.projectId}${fixture.freshProject ? '（本轮首次新建）' : '（复用，零建项目）'} · ${publicPath}`,
    );
    return { projectId: fixture.projectId, carriers, publicPath };
  } finally {
    await context.close();
  }
}

test.describe('@smoke §14/§85 第十六片：公开页的视口与缩放半边', () => {

  test('访客在 390 宽的真手机仿真里，用那一排链接把这一版重解、缩小、翻页', async ({ browser }) => {
    test.setTimeout(420_000);
    const { carriers, publicPath } = await buildFixture(browser, { width: 1280, height: 900 });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const visitor = await context.newPage();
    const url = (search: string): string => {
      const base = new URL(publicPath, 'http://localhost:3100');
      return `${base.pathname}${search ? `?${search}` : ''}`;
    };
    const open = async (search: string): Promise<Dataset> => {
      await visitor.goto(url(search));
      await expect(visitor.locator('[data-published-root]')).toBeVisible({ timeout: 30_000 });
      return reader(visitor);
    };

    // ── 腿 A：缺参数 = 按访客视口自动选档（§85 第三十一片 / ADR-0074）。
    //    这一页有一条 mobile 规则 ⇒ 四份投影同时在 DOM，390 下媒体查询选 mobile：375、规则生效。
    const auto = await open('');
    expect(auto.viewerAuto, '有规则且没写参数时，控件行应当自报"自动"').toBe('on');
    expect(auto.viewerBreakpoint, '自动选档不是"钉住某一档"').toBe('design');
    expect(await visibleVariant(visitor), '390 宽应当选中 mobile 那一份').toBe('mobile');
    expect((await frameReading(visitor)).layout, '选中的投影按 375 求解').toBe(375);
    await expect(
      visitor.locator(`[data-published-variant="mobile"] [data-node-id="${carriers.hideId}"]`),
      '选中的 mobile 投影里那条规则必须已生效：节点不在',
    ).toHaveCount(0);

    // ── 腿 A2：?viewport=design 才是"钉住设计尺寸"（原先缺参数的语义，现在明写成一颗按钮）
    const design = await open('viewport=design');
    const designW = Number(design.viewerResolvedWidth);
    expect(design.viewerBreakpoint, '?viewport=design 应当按设计尺寸求解').toBe('design');
    expect(design.viewerAuto, '钉住设计尺寸时不该自报自动').toBe('off');
    expect(Number(design.viewerDesignWidth), '控件行报的设计宽应与求解宽同源').toBe(designW);
    expect(design.viewerLiveBreakpoints, '页面上有断点规则 ⇒ 四档都该是可以点的').toBe('mobile,tablet,desktop,wide');
    await expect(visitor.locator(`[data-node-id="${carriers.hideId}"]`), '设计尺寸下那个节点本来是可见的').toHaveCount(1);
    // 门：设计宽必须**比 390 宽**，否则"移动端要平移"这个前提不存在，后面每一条都可能是白测
    expect(designW, `设计宽 ${designW} 不比访客视口宽：这一遍没有"横向溢出"可修`).toBeGreaterThan(390);

    // ── 腿 B：?viewport=mobile 真的改了画面（重解到 375，且那条 mobile 规则生效）
    const mobile = await open('viewport=mobile');
    expect(mobile.viewerBreakpoint).toBe('mobile');
    expect(Number(mobile.viewerResolvedWidth), '按 mobile 档重解应当解到断点表里那个宽度').toBe(375);
    expect(Number(mobile.viewerResolvedWidth)).toBeLessThan(designW);
    await expect(
      visitor.locator(`[data-node-id="${carriers.hideId}"]`),
      'mobile 规则说这个节点不显示，画面上它就必须不在（不是"显示但标灰"）',
    ).toHaveCount(0);
    expect((await frameReading(visitor)).layout, '画面盒子的布局宽就是重解出来的 375').toBe(375);

    // ── 腿 C：规则按 `<=` **向上级联**（applyResponsive 的既有语义，这里把它量成数而不是当作 bug）
    for (const [name, width] of [
      ['tablet', 768],
      ['wide', 1536],
    ] as const) {
      const reading = await open(`viewport=${name}`);
      expect(Number(reading.viewerResolvedWidth), `${name} 档应解到 ${width}`).toBe(width);
      await expect(
        visitor.locator(`[data-node-id="${carriers.hideId}"]`),
        `${name} ≥ mobile：那条 mobile 规则在这一档同样生效（级联，不是这一档自己写的规则）`,
      ).toHaveCount(0);
    }

    // ── 腿 D：非法值降级到"自动"而不是 404——写错一个字母不该让链接死掉
    const bogus = await open('viewport=phone');
    expect(bogus.viewerAuto, '认不出来的断点名应当回落到自动选档').toBe('on');
    expect(await visibleVariant(visitor), '回落之后 390 下仍是 mobile 那一份').toBe('mobile');
    expect((await frameReading(visitor)).layout).toBe(375);

    // ── 腿 E：?zoom=0.25 把"要平移多少"真的压掉了，而且改的是投影不是模型
    //    （第三十一片之后缺参数会先自动选档，所以对照组与缩放组都明写 design，单看 zoom 这一维）
    const at1 = await open('viewport=design');
    const pan1 = await panReading(visitor);
    const frameAt1 = await frameReading(visitor);
    const atQuarter = await open('viewport=design&zoom=0.25');
    const panR = await panReading(visitor);
    const frameAtQuarter = await frameReading(visitor);
    expect(Number(at1.viewerResolvedWidth), '对照组自己也得是设计宽').toBe(designW);
    expect(Number(atQuarter.viewerZoom), '缩放读数应回到控件行上').toBe(0.25);
    expect(Number(atQuarter.viewerResolvedWidth), '缩放不改求解：画面仍然是设计宽度').toBe(designW);
    expect(panR.boxVisual, '占位盒要按缩后的尺寸占位，否则缩小了页面照样平移一整屏').toBe(Math.round(designW * 0.25));
    expect(frameAtQuarter.layout, '布局宽不变：transform 不该改模型算出来的盒子（§16）').toBe(frameAt1.layout);
    expect(frameAtQuarter.visual, '视觉宽是布局宽的 0.25').toBe(Math.round(designW * 0.25));
    const panAt1Value = pan1.scroll - pan1.client;
    const panAtQuarter = panR.scroll - panR.client;
    expect(panAt1Value, `不缩放时那一层要横向平移 ${panAt1Value}px：第十三片量的就是这个数`).toBeGreaterThan(500);
    // 残余平移必须**只由那层容器的左右 gutter 解释**：首跑读数 1082→2，那 2px 不是画面盒子露出去的
    // （360 + 16 + 16 − 390 = 2），而是 `p-[var(--nexus-space-4)]` 这一圈内边距。
    // 断言写成这条算术而不是 `.toBe(0)`：将来 gutter 改了它照样说得通，而占位盒一旦不再跟着缩，它立刻红。
    const expectedResidual = Math.max(0, panR.boxVisual + panR.padLeft + panR.padRight - panR.client);
    expect(
      panAtQuarter,
      `缩到 0.25 后的残余平移应由盒宽 ${panR.boxVisual} + gutter ${panR.padLeft}/${panR.padRight} − 可视宽 ${panR.client} 解释＝${expectedResidual}（实测 ${panAtQuarter}）`,
    ).toBe(expectedResidual);
    expect(panAtQuarter, `缩到 0.25 至少要把 ${panAt1Value}px 压掉一个数量级（实测 ${panAtQuarter}）`).toBeLessThan(
      panAt1Value / 10,
    );
    console.log(
      `  缩放腿读数：设计宽 ${designW} · 不缩放需平移 ${panAt1Value}px（视觉宽 ${frameAt1.visual}）→ ` +
        `0.25 倍时占位盒 ${panR.boxVisual}、平移 ${panAtQuarter}px（可视区宽 ${panR.client}，` +
        `其中 gutter ${panR.padLeft}/${panR.padRight} 占 ${expectedResidual}px）`,
    );

    // ── 腿 F：点两下就能把两件事叠起来（参数互不覆盖，URL 键序固定所以可收藏）
    await visitor.goto(url(''));
    await visitor.click('[data-viewer-viewport-option="mobile"]');
    await expect(visitor.locator('[data-viewer-controls]')).toBeVisible({ timeout: 30_000 });
    await visitor.click('[data-viewer-zoom-option="0.5"]');
    const composed = new URL(visitor.url());
    expect(composed.search, '两个参数都留着且键序固定（同一个状态必须是同一个 URL）').toBe('?viewport=mobile&zoom=0.5');
    const composedReading = await reader(visitor);
    expect(composedReading.viewerBreakpoint).toBe('mobile');
    expect(Number(composedReading.viewerZoom)).toBe(0.5);
    expect(Number(composedReading.viewerResolvedWidth)).toBe(375);
    expect((await panReading(visitor)).boxVisual, '375 缩到 0.5 ⇒ 188').toBe(188);

    // ── 腿 G：翻一页不该把取景框丢掉（点了热点之后仍然按 mobile + 0.5 投影）
    await expect(visitor.locator('[data-interactive-hotspot]'), '跳页热点没铺出来：交互载体丢了').toHaveCount(1);
    // 热点是客户端组件：上面那两颗链接是整页重载，水合之前点下去不会有 onClick。
    // 把"点一下 → 地址栏出现 page="当成一次原子重试（toPass），而不是睡一个猜出来的毫秒数。
    await expect(async () => {
      await visitor.locator('[data-interactive-hotspot]').click({ timeout: 5_000 });
      await expect(visitor).toHaveURL(/[?&]page=/, { timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
    // 屏障必须等**地址栏**，不能等控件行：控件行在翻页前的那一页上本来就可见，`toBeVisible` 当场返回 true，
    // 于是读到的还是旧 URL（第一跑就是这么红的：`page` 是 null，而失败快照里的链接已经带着
    // `page=page-narrow-375&viewport=mobile&zoom=0.5`——翻页成功了，是我的读法快了）。
    await expect(
      visitor,
      '点了跳页热点之后地址栏没带上目标页；翻页本身没发生（或慢过这道屏障）',
    ).toHaveURL(/[?&]page=/, { timeout: 30_000 });
    const jumped = new URL(visitor.url()).searchParams;
    expect(jumped.get('page'), '点了热点要真的翻到那张窄页').toBe(carriers.endId);
    expect(jumped.get('viewport'), '翻页把 viewport 丢了').toBe('mobile');
    expect(jumped.get('zoom'), '翻页把 zoom 丢了').toBe('0.5');
    const jumpedReading = await reader(visitor);
    expect(jumpedReading.viewerBreakpoint, '到了第二页仍然按 mobile 投影').toBe('mobile');
    expect(Number(jumpedReading.viewerDesignWidth), '第二页自己写的是 375 的画布').toBe(375);

    // ── 腿 H：空按钮不摆。根宽 == 某一档的断点宽、且这一页一条规则都没有 ⇒ 那一档重解是逐字节相同的
    const narrow = await open(`page=${carriers.endId}`);
    expect(
      narrow.viewerLiveBreakpoints,
      '窄页没有规则、根宽 375 ⇒ 手机那一格重解出来与"按设计尺寸"逐字节相同，不该摆出来',
    ).toBe('tablet,desktop,wide');
    expect(Number(narrow.viewerResolvedWidth), '窄页按自己的画布求解').toBe(375);
    await expect(visitor.locator('[data-viewer-viewport-option="mobile"]')).toHaveCount(0);
    expect(narrow.viewerAuto, '没有规则的一页不铺四份，也不自报自动').toBe('off');
    await expect(
      visitor.locator('[data-viewer-viewport-option="auto"]'),
      '没有规则时"自动"与"设计"是同一份投影：那颗按钮不摆（§159）',
    ).toHaveCount(0);
    await expect(visitor.locator('[data-viewer-viewport-option="design"]'), '「设计」是回到默认的那一格，永远留着').toHaveCount(1);
    const here = await open(`page=${carriers.endId}&viewport=mobile`);
    expect(here.viewerBreakpoint).toBe('mobile');
    await expect(
      visitor.locator('[data-viewer-viewport-option="mobile"]'),
      '访客正在看这一档时它要留着——那是"你现在在这"的标记，不是按钮',
    ).toHaveCount(1);

    // ── 腿 I：这一排按钮不许把第十三片那栏读数弄长（WCAG 2.5.8 的 24×24 下限）
    const small = await visitor.evaluate(() =>
      Array.from(document.querySelectorAll('[data-viewer-controls] a'))
        .map((a) => {
          const r = a.getBoundingClientRect();
          return { text: (a.textContent ?? '').trim(), w: Math.round(r.width), h: Math.round(r.height) };
        })
        .filter((t) => Math.min(t.w, t.h) < 24),
    );
    expect(small, `控件行里有低于 24×24 的点击目标：${JSON.stringify(small)}`).toEqual([]);
    await context.close();
  });

  test('作者那一边的 /preview 用同一排控件、同一套参数名', async ({ browser }) => {
    test.setTimeout(240_000);
    const { projectId, carriers } = await buildFixture(browser, { width: 1280, height: 900 });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const author = await context.newPage();
    // `/preview` 走的是 `requireUser`：这一条要的是**作者本人**看到的那一版，所以把同一个夹具账号登进来
    const signedIn = await loginMemberIfPossible(author, FIXTURE_EMAIL, FIXTURE_PASSWORD);
    expect(signedIn, '夹具账号登不进来：作者那一边的预览没有载体').toBe(true);
    await author.goto(`/preview/${projectId}?viewport=tablet&zoom=0.5`);
    const reading = await reader(author);
    expect(reading.viewerBreakpoint, '预览页读的仍是同一个参数名').toBe('tablet');
    expect(Number(reading.viewerResolvedWidth)).toBe(768);
    await expect(author.locator('[data-preview-frame]')).toHaveCSS('width', '768px');
    const box = await author
      .locator('[data-preview-scale-box]')
      .evaluate((el) => Math.round(el.getBoundingClientRect().width));
    expect(box, '占位盒按缩后的尺寸占位（与公开页同一套画法）').toBe(384);
    await expect(
      author.locator(`[data-node-id="${carriers.hideId}"]`),
      'tablet ≥ mobile：那条规则在作者预览里同样生效',
    ).toHaveCount(0);
    await context.close();
  });

  test('缺参数时同一份快照在四档视口下由媒体查询各选一份，零 JS 也成立', async ({ browser }) => {
    test.setTimeout(420_000);
    const { carriers, publicPath } = await buildFixture(browser, { width: 1280, height: 900 });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const visitor = await context.newPage();
    const path = new URL(publicPath, 'http://localhost:3100').pathname;

    const bands = [
      { width: 390, variant: 'mobile', layout: 375 },
      { width: 768, variant: 'tablet', layout: 768 },
      { width: 1280, variant: 'desktop', layout: 1280 },
      { width: 1536, variant: 'wide', layout: 1536 },
    ] as const;
    for (const band of bands) {
      await visitor.setViewportSize({ width: band.width, height: 900 });
      await visitor.goto(path);
      await expect(visitor.locator('[data-published-root]')).toBeVisible({ timeout: 30_000 });
      // 四份投影真的同时在 DOM 里——不是"服务端只画了一份"的旧形状
      await expect(visitor.locator('[data-published-variant]'), '自动选档应当同时铺四份投影').toHaveCount(4);
      expect(await visibleVariant(visitor), `${band.width} 宽应当选中 ${band.variant}`).toBe(band.variant);
      expect((await frameReading(visitor)).layout, `${band.variant} 这一份按 ${band.layout} 求解`).toBe(band.layout);
      // 另外三份是 display:none：不占位，也不在可访问树里
      const hidden = await visitor.evaluate(() =>
        Array.from(document.querySelectorAll('[data-published-variant]'))
          .filter((el) => getComputedStyle(el).display === 'none')
          .map((el) => el.getAttribute('data-published-variant') ?? ''),
      );
      expect(hidden.sort(), `${band.variant} 之外的三份必须 display:none`).toEqual(
        ['mobile', 'tablet', 'desktop', 'wide'].filter((id) => id !== band.variant).sort(),
      );
      // mobile 规则按 `<=` 级联，四份里它都该生效
      await expect(
        visitor.locator(`[data-published-variant="${band.variant}"] [data-node-id="${carriers.hideId}"]`),
        `${band.variant} 这一份里那条 mobile 规则同样生效`,
      ).toHaveCount(0);
      console.log(`  自动选档：${band.width} 宽 → ${band.variant}（画框 ${band.layout}）`);
    }

    // 反向见证：没有规则的第二页还是只解一份（这一片不改那批页面的默认输出）
    await visitor.setViewportSize({ width: 390, height: 844 });
    await visitor.goto(`${path}?page=${carriers.endId}`);
    await expect(visitor.locator('[data-published-root]')).toBeVisible({ timeout: 30_000 });
    await expect(visitor.locator('[data-published-variant]'), '没有规则的一页只解一份').toHaveCount(1);
    expect(await visitor.locator('[data-viewer-auto]').getAttribute('data-viewer-auto')).toBe('off');
    await context.close();
  });
});
