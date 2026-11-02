import { expect, test, type Locator, type Page } from '@playwright/test';
import { reusableMemberWithProject } from './support/auth-session';

/**
 * §14 断点规则的**人工入口**那一寸（ADR-0069 欠的半边）。
 *
 * 在这一片之前，一条断点规则只有两个写入方：AI 配方与代码视图的变体类；面板只读地显示
 * "tablet 下为 W×H"。作者想自己把某个元素在手机档藏掉，得先去写代码视图。这一片给的就是
 * Properties 面板里那节「断点」，所以每一条断言都走**界面**（点 tab、点隐藏、填数字、点撤销），
 * 而不是在测试里调 store——要证的正是"人能把它点出来"。
 *
 * 三条不容易一眼看出、必须钉住的语义：
 * ① **一次点击 = 一条可撤销事务**（§150）。所以"点一次隐藏、撤销一次就回到还没有规则"，
 *    而不是撤销两次才干净。
 * ② **写进模型的每个键都真的改变那一档的投影**（responsive-editor 的判据）。
 *    所以"把显示写成它本来就在的值"这条腿必须留下零事务、零规则、撤销键仍然是灰的。
 * ③ 规则按 `<=` **向上级联**（applyResponsive），所以平板那一档看得见手机规则的投影、
 *    却没有自己的清除键；反过来手机档不沾平板的规则。这条语义在访客那半边同样量一遍。
 * ④ 徽标数的是**模型里所有的键**，面板摆不摆得出输入口都算数（腿 H2）：`layout.padding` 这种
 *    没有那一格的键，界面上单独点名"这几处面板没有输入口"，而「清掉这一档」连着它们一起删。
 * ⑤ 面板的行是内核按 `appliesTo` 现推的（腿 G3）：`layout.mode`/`layout.gap`/`typography.fontSize`
 *    有了输入口，而列数那一格**只在投影出来是网格的那一档**出现；改回竖排后模型里那个
 *    `layout.columns` 键还在，于是它从"这一格能改"变成要点名的"面板没有输入口"。
 *
 * 落库那条腿读的是 `GET /api/projects/<id>` 里服务端自己那份文档，不是顶栏的"已保存"字样
 * ——自动保存的标签会在事务落地前就写着旧值。
 */

const RUN = Date.now().toString(36);

/** 与 `viewer+fixture@nexus.test` 分开的夹具账号：两个 spec 写同一个项目会互相盖掉规则；
 *  注册 10/小时、建项目 20/小时两道闸不吃第二遍（也不为跑测试放宽它们）。 */
const FIXTURE_EMAIL = 'responsive+fixture@nexus.test';
const FIXTURE_PASSWORD = 'e2e-secret-123';

interface RawNode {
  id: string;
  name?: string;
  responsive?: unknown;
  [key: string]: unknown;
}
interface RawPage {
  id: string;
  name: string;
  rootId: string;
  nodes: Record<string, RawNode>;
  [key: string]: unknown;
}
interface RawDoc {
  pages: RawPage[];
  activePageId: string;
  [key: string]: unknown;
}

interface Carriers {
  eyebrowId: string;
  ctaId: string;
  /** 腿 G3 要在画布上量两个按钮的相对位置：这是 Primary 旁边那一个 */
  secondaryId: string;
  /** 字号那一格的载体：一个真有 `typography` 对象的文字节点（frame 没有，那一格摆不出来） */
  headlineId: string;
  rootId: string;
  /** 腿 H2/G3 的载体：一个容器，`layout.*` 那几格只对**有子节点**的元素摆得出输入口 */
  actionsId: string;
  /**
   * 起手埋进 Actions 的那条 tablet 规则。`layout.mode` 现在面板有输入口了，所以这条腿
   * 同时带着**能改的键**和**不能改的键**（`layout.padding`）——点名那句必须只说后者。
   * 两个值都由这个节点自己的设计值推出来（取反 / +24），不是手抄的数。
   */
  seeded: {
    breakpoint: 'tablet';
    editableKey: 'layout.mode';
    outsideKey: 'layout.padding';
    modeValue: string;
    padding: { top: number; right: number; bottom: number; left: number };
  };
  /** 起手时根画框在设计尺寸里的那个宽（切视口之后必须还是它——投影不改模型，§16） */
  designRootWidth: unknown;
  /** 起手时页面画布的宽（「页面」那一节的注要把它和断点宽同时给出来） */
  designPageWidth: number;
  /** 起手时 eyebrow 在设计尺寸里的宽：写第二条键之前先记下，用来判"这一档真的改了投影" */
  eyebrowDesignWidth: unknown;
  /** 起手时 Headline 在设计档的字号（面板那格的「设计」读数，也是访客腿 design 那份的读数） */
  headlineDesignFontSize: number;
}

/**
 * 把这份稿子清成"除了一条埋给腿 H2 的 layout 规则，别的节点一条断点规则都没有"，并交出各条腿的载体节点。
 *
 * 必须在**进工作台之前**写：store 里留着旧副本的话，自动保存可能在卸载时把上一轮的规则盖回来
 * （§167 那条链撞过的事）。夹具项目反复用，起点不洗净的话"改 1 处投影"这类读数会莫名其妙多一格。
 */
async function prepareRuleFreeDocument(page: Page, projectId: string): Promise<Carriers> {
  await page.goto('/');
  const csrf = (await page.context().cookies()).find((c) => c.name === 'nexus_csrf')?.value ?? '';
  const current = await page.request.get(`/api/projects/${projectId}`);
  expect(current.status(), `读取项目失败：${await current.text()}`).toBe(200);
  const doc = (await current.json()).document as RawDoc;
  // 先按名字认起手页，其次按 activePageId：服务端读回来的 pages 顺序不是这份契约的一部分
  const home =
    doc.pages.find((p) => p.name === 'Home') ?? doc.pages.find((p) => p.id === doc.activePageId) ?? doc.pages[0]!;
  const byName = (name: string): RawNode | undefined => Object.values(home.nodes).find((n) => n.name === name);
  const eyebrow = byName('Eyebrow');
  const cta = byName('Primary CTA');
  const secondary = byName('Secondary CTA');
  const headline = byName('Headline');
  const root = home.nodes[home.rootId];
  if (!eyebrow) throw new Error(`起手页（${home.name} / ${home.id}）里没有名为 Eyebrow 的节点：隐藏那条腿的载体不存在`);
  if (!cta) throw new Error('起手页里没有名为 Primary CTA 的节点：透明度那条腿的载体不存在');
  if (!secondary) throw new Error('起手页里没有名为 Secondary CTA 的节点：量画布几何那条腿只有半个对象');
  if (!headline) throw new Error('起手页里没有名为 Headline 的文字节点：字号那一格的载体不存在');
  if (!root) throw new Error(`起手页的根画框 ${home.rootId} 不在 nodes 里：切视口不改模型那条腿没有读数对象`);
  const headlineDesignFontSize = (headline.typography as { fontSize?: unknown } | undefined)?.fontSize;
  if (typeof headlineDesignFontSize !== 'number') {
    throw new Error(`Headline 的设计字号不是数字（${JSON.stringify(headlineDesignFontSize)}）：访客腿推不出"改小之后的那个数"`);
  }
  const designPageWidth = Number((home as { width?: unknown }).width);
  if (!Number.isFinite(designPageWidth)) throw new Error(`起手页没有数字宽度：${JSON.stringify((home as { width?: unknown }).width)}`);
  for (const p of doc.pages) for (const n of Object.values(p.nodes)) n.responsive = undefined;
  // 埋在进工作台**之前**：起点得是干净的（上一轮留下的规则会把"改 1 处"这类读数顶歪），
  // 而且这条规则里的 `layout.padding` 是面板摆不出输入口的那种键——客户端写不出这个起点。
  const actions = byName('Actions');
  if (!actions) throw new Error('起手页里没有名为 Actions 的容器：徽标数模型里所有键那条腿（腿 H2）没有载体');
  if ((actions.children as string[] | undefined)?.length !== 2) {
    throw new Error(`Actions 的孩子数不是 2（${JSON.stringify(actions.children)}）：量两个按钮几何那条腿的前提没了`);
  }
  const seededMode = (actions.layout as { mode?: unknown }).mode === 'vertical' ? 'horizontal' : 'vertical';
  // 设计 padding 每个边 +24：改动量由这个节点自己的数推出来，徽标该读到几处也就是推出来的
  const designPadding = (actions.layout as { padding?: Record<string, unknown> }).padding ?? {};
  const seedSide = (side: 'top' | 'right' | 'bottom' | 'left'): number => {
    const value = designPadding[side];
    if (typeof value !== 'number') {
      throw new Error(`Actions 的设计 padding.${side} 不是数字（${JSON.stringify(value)}）：+24 推不出来`);
    }
    return value + 24;
  };
  const seededPadding = {
    top: seedSide('top'),
    right: seedSide('right'),
    bottom: seedSide('bottom'),
    left: seedSide('left'),
  };
  actions.responsive = [
    { breakpoint: 'tablet', patch: { layout: { mode: seededMode, padding: seededPadding } } },
  ];
  const put = await page.request.put(`/api/projects/${projectId}`, {
    headers: { 'x-csrf-token': csrf },
    data: doc,
  });
  expect(put.status(), `清空断点规则失败：${await put.text()}`).toBe(200);
  return {
    eyebrowId: eyebrow.id,
    ctaId: cta.id,
    secondaryId: secondary.id,
    headlineId: headline.id,
    rootId: home.rootId,
    actionsId: actions.id,
    seeded: {
      breakpoint: 'tablet',
      editableKey: 'layout.mode',
      outsideKey: 'layout.padding',
      modeValue: seededMode,
      padding: seededPadding,
    },
    designRootWidth: (root.size as { width?: unknown } | undefined)?.width,
    designPageWidth,
    eyebrowDesignWidth: (eyebrow.size as { width?: unknown } | undefined)?.width,
    headlineDesignFontSize,
  };
}

/** 服务端自己那份文档里，这个节点此刻长什么样（两条落库腿共用一次读取） */
async function nodeOnServer(page: Page, projectId: string, nodeId: string): Promise<RawNode> {
  const res = await page.request.get(`/api/projects/${projectId}`);
  expect(res.status(), `读取项目失败：${await res.text()}`).toBe(200);
  const doc = (await res.json()).document as RawDoc;
  for (const p of doc.pages) {
    const node = p.nodes[nodeId];
    if (node) return node;
  }
  throw new Error(`服务端的文档里找不到节点 ${nodeId}：载体丢了`);
}

/** 这个节点带着哪些断点规则（落库那条腿的读数） */
async function rulesOfNodeOnServer(page: Page, projectId: string, nodeId: string): Promise<unknown> {
  return ((await nodeOnServer(page, projectId, nodeId)).responsive) ?? [];
}

/** 这个节点在设计尺寸里的那个数（切视口之后必须还是它） */
async function sizeWidthOnServer(page: Page, projectId: string, nodeId: string): Promise<unknown> {
  const size = (await nodeOnServer(page, projectId, nodeId)).size as { width?: unknown } | undefined;
  return size?.width;
}

/** 发布（公开）并回公开路径。同一项目重复发布是换版本，路径不变，夹具可以长用 */
async function publishPublic(page: Page, _projectId: string): Promise<string> {
  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-submit]')).toBeVisible({ timeout: 60_000 });
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 60_000 });
  return (await page.locator('[data-publish-url]').getAttribute('href'))!;
}

/** 断点那一格的读数：`data-breakpoint-impact` 是面板自己算出来的"这一档改了几处投影" */
const tab = (p: Page, bp: string) => p.locator(`[data-breakpoint-tab="${bp}"]`);
const reading = (p: Page) => p.locator('[data-responsive-reading]');
/** 顶栏那对撤销/重做。限定在 `header` 里：分镜面板也有同名按钮，strict mode 会撞 */
const undoButton = (p: Page) => p.locator('header').getByRole('button', { name: '撤销', exact: true });
const redoButton = (p: Page) => p.locator('header').getByRole('button', { name: '重做', exact: true });

/** 画布上某个节点此刻的透明度（渲染层把 `node.style.opacity` 写在 `[data-node-id]` 那个 div 上，
 *  render.ts:183）。读它而不是读模型，是为了证"这一档的键当场改了投影"（ADR-0063 那条同解链）。 */
async function canvasOpacity(p: Page, nodeId: string): Promise<string> {
  const el = p.locator(`[data-node-id="${nodeId}"]`);
  await expect(el, `画布上找不到节点 ${nodeId}：透明度的载体丢了`).toHaveCount(1);
  return el.evaluate((node) => getComputedStyle(node).opacity);
}

/** 画布或公开页的某一份投影：两者都靠 `[data-node-id]` 认节点 */
type BoxHost = { locator: (selector: string) => Locator };

/**
 * 这个节点此刻摆放出来的那一方盒子。读的是 `nodeStyle` 写进 inline style 的那几个数
 * （render.ts 把求解器的绝对坐标直接落成 `left/top/width/height`），**不是** boundingClientRect：
 * 画布整帧与公开页的画框都被 `transform: scale(zoom)` 缩放（PublishedFrame.tsx:50），
 * 客户端矩形里掺着缩放，而"面板写下去的那个数改了投影没有"这件事在模型坐标里。
 */
async function boxIn(root: BoxHost, nodeId: string, where: string): Promise<Box> {
  const el = root.locator(`[data-node-id="${nodeId}"]`);
  await expect(el, `${where}里找不到节点 ${nodeId}：几何读数的载体丢了`).toHaveCount(1);
  return el.evaluate((node) => {
    const style = (node as HTMLElement).style;
    const px = (value: string, key: string): number => {
      const parsed = Number.parseFloat(value);
      if (!Number.isFinite(parsed)) throw new Error(`inline style 的 ${key} 读不到像素数：${JSON.stringify(value)}`);
      return parsed;
    };
    return { left: px(style.left, 'left'), top: px(style.top, 'top'), width: px(style.width, 'width'), height: px(style.height, 'height') };
  });
}

/** 这个节点此刻的字有多大（计算样式，`transform: scale()` 不动它） */
async function fontSizeIn(root: BoxHost, nodeId: string, where: string): Promise<string> {
  const el = root.locator(`[data-node-id="${nodeId}"]`);
  await expect(el, `${where}里找不到节点 ${nodeId}：字号读数的载体丢了`).toHaveCount(1);
  return el.evaluate((node) => getComputedStyle(node as HTMLElement).fontSize);
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 每腿之间的时间戳：这条链在开发模式里跑得慢，没有读数就只能猜哪一段吃掉了预算 */
const T0 = Date.now();
const stamp = (label: string): void => {
  console.log(`    [${((Date.now() - T0) / 1000).toFixed(1)}s] ${label}`);
};

test.describe('@smoke §14/ADR-0069 断点规则的人工入口：面板 → 落库 → 访客', () => {
  test('作者在面板里点出来的规则，落进服务端那份文档，访客按 ?viewport= 看见同一份差别', async ({ browser }) => {
    test.setTimeout(900_000);

    // ── 作者：登录（或首次注册）→ 洗净规则 → 就在**同一个会话**里进工作台。
    // 夹具与操作不能拆成两个 context：`/studio/<id>` 认会话，第二只浏览器上下文没有那枚 cookie，
    // 服务端直接 404（第一跑就是这么红的，`GET /studio/… 404` 在 dev 日志里）。
    const authorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const author = await authorContext.newPage();
    const fixture = await reusableMemberWithProject(author, FIXTURE_EMAIL, FIXTURE_PASSWORD, `断点夹具${RUN}`);
    const projectId = fixture.projectId;
    const carriers = await prepareRuleFreeDocument(author, projectId);
    console.log(
      `\n== 断点人工入口的载体：夹具账号${fixture.freshAccount ? '（本轮首次注册）' : '（复用，零注册）'} · ` +
        `项目 ${projectId}${fixture.freshProject ? '（本轮首次新建）' : '（复用，零建项目）'}`,
    );
    await author.goto(`/studio/${projectId}`);
    await expect(author.locator('[data-canvas-frame]')).toBeVisible({ timeout: 120_000 });
    stamp('进工作台（登录 + 洗净规则 + 首帧）');

    // 腿 A：面板摆在那儿，且起点一条规则都没有
    await author.click(`[data-layer-id="${carriers.eyebrowId}"]`);
    const editor = author.locator('[data-responsive-editor]');
    await expect(editor, '属性面板里没有「断点」这节：§14 的人工入口不存在').toBeVisible({ timeout: 30_000 });
    for (const bp of ['mobile', 'tablet', 'desktop', 'wide']) {
      await expect(tab(author, bp), `起点的 ${bp} 那一格应当报 0 处投影`).toHaveAttribute('data-breakpoint-impact', '0');
    }
    // 门：撤销栈必须是空的，否则腿 B 那条"没写进事务"的断言是在读别人的历史
    await expect(undoButton(author), '刚进工作台时撤销键就该是灰的：这条腿的前提是本地事务栈为空').toBeDisabled();

    // 腿 B：写一个"投影本来就是这个值"的键 ⇒ 零事务、零规则（§159：不假装改了东西）
    await author.click('[data-breakpoint-tab="mobile"]');
    await expect(editor).toHaveAttribute('data-responsive-breakpoint', 'mobile');
    await expect(reading(author), '点断点那一格要同时把画布切到那一档，改完当场看得见').toContainText('画布按 mobile 档呈现');
    await author.click('[data-responsive-visible="visible"]');
    await expect(tab(author, 'mobile'), '把显示写成它本来的值：一处投影都没改').toHaveAttribute('data-breakpoint-impact', '0');
    await expect(reading(author)).toContainText('还没有规则');
    await expect(author.locator('[data-responsive-clear="visible"]'), '没有覆盖就不该给清除键').toHaveCount(0);
    await expect(undoButton(author), '没改任何东西的点击不该占撤销栈').toBeDisabled();

    // 腿 C：点「隐藏」⇒ 一条事务、画布当场重解（同一个 DOM、只改了规则这一件事）
    await expect(author.locator(`[data-node-id="${carriers.eyebrowId}"]`), '写规则之前这个节点在画布上').toHaveCount(1);
    await author.click('[data-responsive-visible="hidden"]');
    await expect(tab(author, 'mobile')).toHaveAttribute('data-breakpoint-impact', '1');
    await expect(tab(author, 'mobile')).toContainText('改 1 处');
    await expect(reading(author)).toContainText('手机 375 这一档：改 1 处投影');
    await expect(author.locator(`[data-node-id="${carriers.eyebrowId}"]`), '这一档的规则要当场改画布，不是等发布').toHaveCount(0);
    // 空白画布也会让上一条通过，所以同时钉住"别的节点还在"
    await expect(author.locator(`[data-node-id="${carriers.ctaId}"]`), '画布不是整片没了：只藏了被规则点名的那个').toHaveCount(1);
    await expect(undoButton(author)).toBeEnabled();
    stamp('腿 B–D：空写入零事务 → 隐藏 → 撤销/重做');

    // 腿 D：一次点击 = 一条可撤销事务，撤销一次回到起点，重做又回来（§150）
    await undoButton(author).click();
    await expect(tab(author, 'mobile')).toHaveAttribute('data-breakpoint-impact', '0');
    await expect(reading(author)).toContainText('还没有规则');
    await expect(author.locator(`[data-node-id="${carriers.eyebrowId}"]`), '撤销真的把这一档的投影恢复了').toHaveCount(1);
    await redoButton(author).click();
    await expect(tab(author, 'mobile')).toHaveAttribute('data-breakpoint-impact', '1');
    await expect(author.locator(`[data-node-id="${carriers.eyebrowId}"]`)).toHaveCount(0);

    // 腿 E：级联在编辑面上也看得见——平板那一档显示着手机规则的结果，却没有自己的清除键
    await author.click('[data-breakpoint-tab="tablet"]');
    await expect(tab(author, 'tablet')).toHaveAttribute('data-breakpoint-impact', '1');
    await expect(
      author.locator('[data-responsive-channel="visible"]'),
      '平板这一档的投影是手机那条规则带上去的（applyResponsive 向上级联）',
    ).toContainText('这一档 隐藏');
    await expect(
      author.locator('[data-responsive-clear="visible"]'),
      '这一档自己没有规则：清除键不该出现（出现了就会让人以为按下去能撤销手机那条）',
    ).toHaveCount(0);
    await expect(author.locator(`[data-node-id="${carriers.eyebrowId}"]`), 'tablet ≥ mobile：画布同样藏着').toHaveCount(0);
    stamp('腿 E：级联在编辑面上的读数');

    // 腿 F：切视口只改投影，不改模型。根画框不是可选元素（图层列表面从根的孩子起，
    // layers-flat.ts:45，Ctrl+A 也显式排掉根，CanvasStage.tsx:272），所以这条读数在「页面」那一节：
    // 同一节里同时给出模型那份宽，和这一档按断点重解出来的宽——作者看得见"375 从哪儿来"。
    await author.click('[data-breakpoint-tab="mobile"]');
    await author.keyboard.press('Escape');
    const pageNote = author.locator('[data-page-root-width-from-breakpoint]');
    await expect(pageNote, '切到 mobile 后「页面」那一节要说清根宽来自断点').toHaveCount(1);
    await expect(pageNote).toContainText('375');
    await expect(pageNote, '注里要给的是模型那份宽，不是我手抄的数').toContainText(String(carriers.designPageWidth));
    await expect(author.locator('[data-page-resolved-size]'), '同一节还要给出这一档解出来的整帧')
      .toContainText(`mobile 下为 375 ×`);
    // 模型一个字节没动：服务端读回来还是起手那份宽，而且根身上没有规则
    expect(await sizeWidthOnServer(author, projectId, carriers.rootId), '切视口不该把断点宽写回模型').toBe(
      carriers.designRootWidth,
    );
    expect(await rulesOfNodeOnServer(author, projectId, carriers.rootId)).toEqual([]);

    // 腿 F2：同一条规则里写第二个键不抹掉第一个（一次点击只动一个键，同组别组都得留着）
    await author.click(`[data-layer-id="${carriers.eyebrowId}"]`);
    await expect(editor).toHaveAttribute('data-responsive-breakpoint', 'mobile');
    await expect(tab(author, 'mobile'), '这条腿的前提：这一档现在只有「显示」那一个键').toHaveAttribute(
      'data-breakpoint-impact',
      '1',
    );
    await author.fill('[data-responsive-input="size.width"]', '200');
    await author.press('[data-responsive-input="size.width"]', 'Enter');
    await expect(tab(author, 'mobile'), '宽 + 显示：一条规则里两个键都算进投影').toHaveAttribute(
      'data-breakpoint-impact',
      '2',
    );
    await expect(
      author.locator('[data-responsive-clear="visible"]'),
      '第二个键写下去不能把第一个键的清除键顶掉',
    ).toHaveCount(1);
    await expect(author.locator('[data-responsive-clear="size.width"]')).toHaveCount(1);
    await expect(author.locator('[data-responsive-channel="size.width"]')).toContainText('这一档 200');
    // 撤销这一次：只剩第一个键，徽标回到 1——事务的粒度是"一个键"，不是"整条规则"
    await undoButton(author).click();
    await expect(tab(author, 'mobile')).toHaveAttribute('data-breakpoint-impact', '1');
    await expect(author.locator('[data-responsive-clear="size.width"]'), '撤销要把第二个键抹干净').toHaveCount(0);
    await redoButton(author).click();
    await expect(tab(author, 'mobile')).toHaveAttribute('data-breakpoint-impact', '2');
    stamp('腿 F–F2：切视口不改模型 + 同一条规则里的第二个键');

    // 腿 G：第二个节点、另一档、另一个通道（数字输入走失焦提交，一路打字不该塞一串事务）
    await author.click(`[data-layer-id="${carriers.ctaId}"]`);
    await author.click('[data-breakpoint-tab="tablet"]');
    await expect(tab(author, 'tablet'), '这一档这一格现在一条规则都没有').toHaveAttribute('data-breakpoint-impact', '0');
    expect(await canvasOpacity(author, carriers.ctaId)).toBe('1');
    await author.fill('[data-responsive-input="style.opacity"]', '0.4');
    await author.press('[data-responsive-input="style.opacity"]', 'Enter');
    await expect(tab(author, 'tablet')).toHaveAttribute('data-breakpoint-impact', '1');
    await expect(author.locator('[data-responsive-channel="style.opacity"]')).toContainText('这一档 0.4');
    await expect(author.locator('[data-responsive-input="style.opacity"]')).toHaveValue('0.4');
    expect(await canvasOpacity(author, carriers.ctaId), '写下去的键当场改了画布的这一格投影').toBe('0.4');
    await expect(
      tab(author, 'mobile'),
      '平板的规则不向下生效：CTA 在手机档仍一处没改（级联只向上）',
    ).toHaveAttribute('data-breakpoint-impact', '0');

    // 腿 H：落库——读服务端自己那份文档，不读顶栏"已保存"那行字
    stamp('腿 G–H：第二节点第二通道 + 两条规则落进服务端文档');
    await expect
      .poll(() => rulesOfNodeOnServer(author, projectId, carriers.eyebrowId), { timeout: 30_000 })
      .toEqual([{ breakpoint: 'mobile', patch: { visible: false, size: { width: 200 } } }]);
    await expect
      .poll(() => rulesOfNodeOnServer(author, projectId, carriers.ctaId), { timeout: 30_000 })
      .toEqual([{ breakpoint: 'tablet', patch: { style: { opacity: 0.4 } } }]);

    // 腿 H2：徽标数的是**模型里所有的键**。起手埋在 Actions 上的那条 tablet 规则带着两个键：
    // `layout.mode`（面板现在摆得出这一格）和 `layout.padding`（摆不出，只有点名与「清掉这一档」碰得到它）。
    // 两个键画布与访客都真的在变 ⇒ 两个都进徽标，而那句点名只说得出没有输入口的那一个（§159）。
    await author.click(`[data-layer-id="${carriers.actionsId}"]`);
    await author.click('[data-breakpoint-tab="tablet"]');
    await expect(editor).toHaveAttribute('data-responsive-breakpoint', 'tablet');
    await expect(
      tab(author, 'mobile'),
      '更窄的那一档没有规则：layout 键埋在 tablet，mobile 档不该跟着涨',
    ).toHaveAttribute('data-breakpoint-impact', '0');
    await expect(tab(author, 'tablet'), '能改的键和改不了的键都进徽标').toHaveAttribute('data-breakpoint-impact', '2');
    await expect(reading(author)).toContainText('改 2 处投影');
    await expect(author.locator('[data-responsive-outside="1"]')).toContainText(
      `其中 1 处面板没有输入口：${carriers.seeded.outsideKey}`,
    );
    // 有输入口的那个键该长出这一格。读数里那个中文说法不手抄：从面板自己那颗按钮上取
    const seededLabel = (await author
      .locator(`[data-responsive-choice="${carriers.seeded.editableKey}:${carriers.seeded.modeValue}"]`)
      .innerText()).trim();
    await expect(author.locator('[data-responsive-channel="layout.mode"]')).toContainText(`这一档 ${seededLabel}`);
    await expect(
      author.locator('[data-responsive-clear="layout.mode"]'),
      '这一档自己有排布覆盖：清除键该出现',
    ).toHaveCount(1);
    await expect(
      author.locator('[data-responsive-clear="layout.padding"]'),
      '面板没有输入口的键不该长出清除键',
    ).toHaveCount(0);
    await expect(
      author.locator('[data-responsive-drop-rule="tablet"]'),
      '带着面板改不了的键也要按得动那颗「清掉这一档」',
    ).toBeEnabled();
    await author.click('[data-responsive-drop-rule="tablet"]');
    await expect(tab(author, 'tablet'), '两个键一起清掉').toHaveAttribute('data-breakpoint-impact', '0');
    await expect(author.locator('[data-responsive-outside]'), '整条规则没了，那句话该跟着没').toHaveCount(0);
    await expect(author.locator('[data-responsive-clear="layout.mode"]'), '清档把有输入口的那一格也抹了').toHaveCount(0);
    await undoButton(author).click();
    await expect(tab(author, 'tablet'), '撤销把埋着的那两个键原样放回来').toHaveAttribute('data-breakpoint-impact', '2');
    stamp('腿 H2：面板内外的键都进徽标 + 清掉这一档连着它们一起删');

    // 腿 G3：面板自己写 `layout` 那几格——间距、排布，以及只在网格档出现的那一格列数。
    // 每一步都量画布上两个按钮的真实坐标，不只读徽标：要证的是"人点得出来、点完画面真的动"。
    await author.click('[data-breakpoint-tab="mobile"]');
    await expect(tab(author, 'mobile'), '这一档现在还没有规则').toHaveAttribute('data-breakpoint-impact', '0');
    await expect(
      author.locator('[data-responsive-input="layout.columns"]'),
      '这一档投影出来的排布不是网格：列数那一格不该摆出来',
    ).toHaveCount(0);
    const buttons = async (where: BoxHost, label: string) => ({
      a: await boxIn(where, carriers.ctaId, label),
      b: await boxIn(where, carriers.secondaryId, label),
    });
    const flatRow = await buttons(author, '画布');
    expect(flatRow.b.top, '横排：两个按钮在同一行').toBe(flatRow.a.top);
    expect(flatRow.b.left, '横排：第二个落在第一个右边').toBeGreaterThan(flatRow.a.left + flatRow.a.width);

    await author.fill('[data-responsive-input="layout.gap"]', '40');
    await author.press('[data-responsive-input="layout.gap"]', 'Enter');
    await expect(tab(author, 'mobile')).toHaveAttribute('data-breakpoint-impact', '1');
    await expect(author.locator('[data-responsive-channel="layout.gap"]')).toContainText('这一档 40');
    const widerGap = await buttons(author, '画布');
    expect(widerGap.b.left - (widerGap.a.left + widerGap.a.width), '面板写的间距就是画布上那一段空').toBe(40);
    expect(widerGap.b.top).toBe(widerGap.a.top);

    await author.click('[data-responsive-choice="layout.mode:vertical"]');
    await expect(tab(author, 'mobile')).toHaveAttribute('data-breakpoint-impact', '2');
    const stacked = await buttons(author, '画布');
    expect(stacked.b.top - (stacked.a.top + stacked.a.height), '翻成竖排后同一份间距改吃纵轴').toBe(40);

    // 换成网格 ⇒ 列数那一格跟着出现：`appliesTo` 读的是**这一档投影出来**的排布，不是设计值
    await author.click('[data-responsive-choice="layout.mode:grid"]');
    await expect(author.locator('[data-responsive-input="layout.columns"]')).toHaveCount(1);
    await author.fill('[data-responsive-input="layout.columns"]', '2');
    await author.press('[data-responsive-input="layout.columns"]', 'Enter');
    await expect(tab(author, 'mobile')).toHaveAttribute('data-breakpoint-impact', '3');
    await expect(author.locator('[data-responsive-clear="layout.columns"]')).toHaveCount(1);

    // 再翻回竖排：那一格按 `appliesTo` 收回去了，可模型里的键还在起作用 ⇒ 它变成要点名的那一处
    await author.click('[data-responsive-choice="layout.mode:vertical"]');
    await expect(
      author.locator('[data-responsive-input="layout.columns"]'),
      '这一档的排布不是网格了，列数那一格该收回去',
    ).toHaveCount(0);
    await expect(tab(author, 'mobile'), '键还在模型里：徽标仍然数着它').toHaveAttribute('data-breakpoint-impact', '3');
    await expect(author.locator('[data-responsive-outside="1"]')).toContainText(
      '其中 1 处面板没有输入口：layout.columns',
    );
    stamp('腿 G3：面板写 layout 三个键 + 列数那一格随投影出现/收回去');

    // 腿 G4：文字节点的字号那一格。同时钉住这格的存在前提——容器没有 `typography` 对象，摆不出来；
    // 按下去什么都改不了的对象不该出现在面板上（§159），而写下去的那个数当场改画布。
    await expect(
      author.locator('[data-responsive-input="typography.fontSize"]'),
      '容器没有 typography 对象：字号那一格不该摆出来',
    ).toHaveCount(0);
    await author.click(`[data-layer-id="${carriers.headlineId}"]`);
    await author.click('[data-breakpoint-tab="mobile"]');
    await expect(tab(author, 'mobile'), '换节点：Headline 在这一档还没有规则').toHaveAttribute(
      'data-breakpoint-impact',
      '0',
    );
    expect(await fontSizeIn(author, carriers.headlineId, '画布'), '起手读数就是设计字号').toBe(
      `${carriers.headlineDesignFontSize}px`,
    );
    const smallerFont = carriers.headlineDesignFontSize - 16;
    await author.fill('[data-responsive-input="typography.fontSize"]', String(smallerFont));
    await author.press('[data-responsive-input="typography.fontSize"]', 'Enter');
    await expect(tab(author, 'mobile')).toHaveAttribute('data-breakpoint-impact', '1');
    await expect(author.locator('[data-responsive-channel="typography.fontSize"]')).toContainText(
      `这一档 ${smallerFont}`,
    );
    expect(await fontSizeIn(author, carriers.headlineId, '画布'), '字号那一格写下去当场改了画布').toBe(
      `${smallerFont}px`,
    );
    stamp('腿 G4：字号那一格 + 容器摆不出这一格');

    // 腿 H3：这几格也落进服务端那份文档——形状就是 AI 配方写的那种 layout/typography 组，
    // 区别只是这一次是人在面板上点出来的（顶栏"已保存"那行字不算证据）
    await expect.poll(() => rulesOfNodeOnServer(author, projectId, carriers.actionsId), { timeout: 30_000 }).toEqual([
      { breakpoint: 'mobile', patch: { layout: { gap: 40, mode: 'vertical', columns: 2 } } },
      { breakpoint: 'tablet', patch: { layout: { mode: carriers.seeded.modeValue, padding: carriers.seeded.padding } } },
    ]);
    await expect
      .poll(() => rulesOfNodeOnServer(author, projectId, carriers.headlineId), { timeout: 30_000 })
      .toEqual([{ breakpoint: 'mobile', patch: { typography: { fontSize: smallerFont } } }]);
    stamp('腿 H3：layout/typography 规则落库');

    // ── 发布：走界面上那颗发布按钮，与 §16 那条链同一个入口
    const publicPath = await publishPublic(author, projectId);
    console.log(`  发布的这一版：${publicPath}`);
    await authorContext.close();

    // ── 访客：同一份模型，四档各解一遍
    const visitorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const visitor = await visitorContext.newPage();
    const url = (search: string): string => {
      const base = new URL(publicPath, 'http://localhost:3100');
      return `${base.pathname}${search ? `?${search}` : ''}`;
    };
    const openVisitor = async (search: string): Promise<Record<string, string | undefined>> => {
      await visitor.goto(url(search));
      await expect(visitor.locator('[data-published-root]')).toBeVisible({ timeout: 60_000 });
      stamp(`访客 ${search || '（无参数）'}`);
      const row = visitor.locator('[data-viewer-controls]').first();
      await expect(row, '访客没有可以改投影的入口').toBeVisible({ timeout: 30_000 });
      return row.evaluate((el) => {
        const host = el as HTMLElement;
        const options = host.querySelector('[data-viewer-viewport-options]') as HTMLElement | null;
        return { ...(host.dataset ?? {}), ...(options?.dataset ?? {}) } as Record<string, string | undefined>;
      });
    };
    // ADR-0074 之后公开页有两种形状：自动档把四份投影同时铺进 DOM、由媒体查询放一份出来；
    // 钉住某一档只有一份。所以读数必须**按档取**，整页 `[data-node-id]` 那种数法在自动档里
    // 会把四份一起数进来（隐藏的几份只是 display:none，节点并没有从文档里走）。
    const variantIn = (bp: string) => visitor.locator(`[data-published-variant="${bp}"]`);
    const variantCount = () => visitor.locator('[data-published-variant]').count();
    const eyebrowIn = async (bp: string): Promise<number> =>
      variantIn(bp).locator(`[data-node-id="${carriers.eyebrowId}"]`).count();
    const ctaOpacityIn = async (bp: string): Promise<string> => {
      const el = variantIn(bp).locator(`[data-node-id="${carriers.ctaId}"]`);
      await expect(el, `公开页的 ${bp} 那一份里找不到那个按钮`).toHaveCount(1);
      return el.evaluate((node) => getComputedStyle(node).opacity);
    };
    /** 此刻**可见**的那一份的档名（媒体查询选出来的那份，不是作者钉的那份） */
    const visibleVariant = async (): Promise<string> => {
      const labels = await visitor.evaluate(
        () =>
          Array.from(
            document.querySelectorAll<HTMLElement>('[data-published-variant]'),
          ).filter((el) => getComputedStyle(el).display !== 'none').map((el) => el.dataset.publishedVariant ?? '')
      );
      expect(labels, '一份页面同一时刻只该有一份投影是可见的').toHaveLength(1);
      return labels[0]!;
    };

    // 腿 I：不带参数 = 自动档。这一页有规则 ⇒ 四份投影都在文档里，选哪一份由**访客的窗口**决定。
    // 「缺参数就一个字节都不改」（ADR-0069 腿 A）这句话今天只对**没有规则**的页成立，
    // 那条由 e2e/viewer-breakpoint.spec.ts 腿 J 钉着；这里钉的是有规则的那一半。
    const plain = await openVisitor('');
    expect(plain.viewerLiveBreakpoints, '这一页有两档规则 ⇒ 四档都该是可以点的').toBe('mobile,tablet,desktop,wide');
    expect(await variantCount(), '自动档：四份投影同时在 DOM 里').toBe(4);
    expect(await visibleVariant(), '1280 宽的访客落在 desktop 那一档').toBe('desktop');
    expect(await eyebrowIn('desktop'), 'desktop ≥ mobile：手机那条隐藏规则在这一档同样生效').toBe(0);
    expect(await ctaOpacityIn('desktop'), 'desktop 也吃到平板那条 0.4').toBe('0.4');

    // 腿 I2：同一个 URL、同一次加载，只把访客的窗口换成手机尺寸——投影自己跟着换，访客没点任何东西。
    // 这才是 §14 那排断点按钮对真实访客的意义：作者写的规则不用谁来手动选档也在生效。
    await visitor.setViewportSize({ width: 390, height: 844 });
    expect(await visibleVariant(), '390 落在 mobile 那一档（区间由模型的 BREAKPOINT_WIDTH 推出来）').toBe('mobile');
    expect(await eyebrowIn('mobile'), '手机档：面板里点出来的那条隐藏规则在访客这边真的生效了').toBe(0);
    expect(await ctaOpacityIn('mobile'), '平板的规则不向下生效').toBe('1');

    // 腿 I3：再换成宽屏，第三档
    await visitor.setViewportSize({ width: 1600, height: 900 });
    expect(await visibleVariant(), '1600 落在 wide 那一档').toBe('wide');
    expect(await eyebrowIn('wide'), 'wide ≥ mobile：手机那条一直跟着').toBe(0);
    expect(await ctaOpacityIn('wide'), 'wide 也吃到平板那条 0.4').toBe('0.4');

    // 腿 J：显式钉住 mobile ⇒ 文档里只有一份，且那一份就是 mobile
    await openVisitor('viewport=mobile');
    expect(await variantCount(), '钉住一档时不再铺四份').toBe(1);
    expect(await visibleVariant()).toBe('mobile');
    expect(await eyebrowIn('mobile'), '钉住手机档：隐藏规则生效').toBe(0);
    expect(await ctaOpacityIn('mobile'), '平板的规则不向下生效').toBe('1');

    // 腿 K：tablet / desktop / wide 三档都同时带着两条规则（向上级联）
    for (const bp of ['tablet', 'desktop', 'wide']) {
      await openVisitor(`viewport=${bp}`);
      expect(await visibleVariant(), `钉住 ${bp} 时文档里那一份就是 ${bp}，不是 design`).toBe(bp);
      expect(await eyebrowIn(bp), `${bp} ≥ mobile：手机那条规则在这一档同样生效`).toBe(0);
      expect(await ctaOpacityIn(bp), `${bp} 这一档吃到平板那条 0.4`).toBe('0.4');
    }

    // 腿 L：回到「设计」就是把画面交还给发布快照本身——两条规则一条都不生效
    await openVisitor('viewport=design');
    expect(await visibleVariant()).toBe('design');
    expect(await eyebrowIn('design')).toBe(1);
    expect(await ctaOpacityIn('design')).toBe('1');

    // 腿 M：面板写的 `layout` / `typography` 那几格也走到访客那一份投影里，量的还是盒子本身。
    // 之前的访客腿只量过 `visible`（少一个节点）和 `style.opacity`（一个数字）；排布与字号是
    // "整个坐标系跟着动"的键，只在画布上量过等于没证到访客那边（§158 要看的是那张真画面）。
    // 这一条就着上面已经打开的 design 那一份读，不必再走一次网络。
    const designFrame = await buttons(variantIn('design'), '公开页 design 那一份');
    const designActions = await boxIn(variantIn('design'), carriers.actionsId, '公开页 design 那一份');
    expect(designFrame.b.top, 'design 那一份不吃任何规则：两个按钮还是模型说的同一行').toBe(designFrame.a.top);
    const designGap = designFrame.b.left - (designFrame.a.left + designFrame.a.width);
    expect(designGap, '面板写的 40 没渗进 design；撞上 40 说明模型本来就用 40，这条腿得换个数').not.toBe(40);
    const designInset = designFrame.a.top - designActions.top;
    expect(
      await fontSizeIn(variantIn('design'), carriers.headlineId, '公开页 design 那一份'),
      '字号那条同理：design 那份还是模型那份',
    ).toBe(`${carriers.headlineDesignFontSize}px`);

    // 腿 M2：钉住 mobile ⇒ 竖排 + 那一段间距 + 那个字号，三件事一起在这份投影里成立
    await openVisitor('viewport=mobile');
    const mobileFrame = await buttons(variantIn('mobile'), '公开页 mobile 那一份');
    const mobileActions = await boxIn(variantIn('mobile'), carriers.actionsId, '公开页 mobile 那一份');
    expect(mobileFrame.b.top, '面板把横排翻成竖排：第二个不在旁边了').toBeGreaterThan(mobileFrame.a.top);
    expect(
      mobileFrame.b.top - (mobileFrame.a.top + mobileFrame.a.height),
      '面板写的间距就是访客这一档量出来的那一段空',
    ).toBe(40);
    expect(mobileFrame.a.top - mobileActions.top, '这一档没有 padding 覆盖：还是模型那份内缩').toBe(designInset);
    expect(
      await fontSizeIn(variantIn('mobile'), carriers.headlineId, '公开页 mobile 那一份'),
      '字号那一格写下去，访客这边的字真的变小了',
    ).toBe(`${smallerFont}px`);

    // 腿 M3：tablet ≥ mobile ⇒ 手机那三条键一直跟着上来，再叠上这一档自己的那条；
    // 而 `layout.padding` 正是面板摆不出输入口、只有「清掉这一档」碰得到的那个键——它照样到访客脸上。
    await openVisitor('viewport=tablet');
    const tabletFrame = await buttons(variantIn('tablet'), '公开页 tablet 那一份');
    const tabletActions = await boxIn(variantIn('tablet'), carriers.actionsId, '公开页 tablet 那一份');
    expect(
      tabletFrame.b.top - (tabletFrame.a.top + tabletFrame.a.height),
      '级联只向上：手机档那份间距在 tablet 同样生效',
    ).toBe(40);
    expect(
      tabletFrame.a.top - tabletActions.top,
      '摆不出输入口的那个键不是摆设：这一档的内缩就是模型那份 +24',
    ).toBe(carriers.seeded.padding.top);
    expect(tabletFrame.a.top - tabletActions.top, '读数与 design 那份的差就是埋进去的那 24').toBe(designInset + 24);
    expect(tabletFrame.a.left - tabletActions.left, 'padding 是四条边：左边同样吃到').toBe(
      carriers.seeded.padding.left,
    );
    expect(
      await fontSizeIn(variantIn('tablet'), carriers.headlineId, '公开页 tablet 那一份'),
      '手机档的字号跟到 tablet（tablet 那条规则没碰 typography）',
    ).toBe(`${smallerFont}px`);
    await visitorContext.close();
  });
});
