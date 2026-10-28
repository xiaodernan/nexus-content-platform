import { expect, test } from '@playwright/test';
import { reusableMemberWithProject } from './support/auth-session';
import { keyboardWalk, type WalkOptions } from './support/keyboard-walk';

/**
 * §85 第七片：**第三片那六扇门搬到创作者真正待着的界面上**。
 *
 * 为什么要搬：第三片的走查本体把"页内"钉死在 `[data-published-root]`，于是 Studio／发现／
 * 市场／通知这些面的 tab 序、焦点陷阱、"鼠标能点键盘碰不到"的控件**结构上不可能被发现**——
 * 而第四片已经把同一句话说成过教训：扫不到的面不许说它过。门本体抽进 `support/keyboard-walk.ts`
 * 之后，这一片只负责点名"每张界面里哪个控件绝不能退化成鼠标专用"。
 *
 * 纪律不变：不断言阈值，只钉六道结构不变式（非空转／点名在册／无陷阱／覆盖／顺序／焦点可见），
 * 读数打印进报告再抄 docs/EVALUATION.md。
 *
 * 会话与项目都用**同一个夹具账号**（`reusableMemberWithProject`）：注册按 IP 限流 10 次/小时、
 * 建项目 20 次/小时（`docs/ENVIRONMENT.md`），而这一份读数要的是"一个真 member、一个真项目"，
 * 不是"每次都是新的空项目"。所以第二轮起零注册零建项目，**两道闸一次都没为测试放宽**。
 *
 * 一处照实的边界：`root: 'body'` 量的是**当前渲染出来的**控件。Studio 收起的面板在 DOM 里但
 * `display:none`，会从分母蒸发并被打印成排除项——它与第四片 axe 那条"扫不到默认收起的面板"
 * 是同一个边界，这一片没有越过它。
 */

const RUN = Date.now().toString(36);

interface Surface extends WalkOptions {
  path: (projectId: string) => string;
  /** 这一张真渲染出来的判据——白页与"没扫"都不该算读数 */
  ready: string;
}

const SURFACES: Surface[] = [
  {
    label: '首页（导航 / 账号 / 新建项目）',
    path: () => '/',
    ready: '[data-auth-identity]',
    root: 'body',
    // 为什么不是 `data-create-project`：那颗按钮在项目名为空时**就该** disabled，而 disabled 的控件
    // 按判据从分母里退出（首跑实测：排除项里明写着 `button[data-create-project=true]（disabled）`）。
    // 点名要点的是"任何时候都不许退化成鼠标专用"的那三件：进发现的链接、进 Studio 的项目行、建项目的输入框。
    require: ['data-nav-discover=', 'data-project-row=', 'data-project-name-input='],
  },
  {
    label: 'Studio（画布 + 面板 + 视图切换）',
    path: (id) => `/studio/${id}`,
    ready: '[data-canvas-frame]',
    root: 'body',
    require: ['data-panel-tab=', 'data-view='],
  },
  {
    label: '发现（排序页签 / 卡片）',
    path: () => '/discover',
    ready: '[data-discover-root]',
    root: 'body',
    require: ['data-discover-tab='],
  },
  {
    label: '市场（分类导航 / 在售列表）',
    path: () => '/marketplace',
    ready: '[data-marketplace-type-nav]',
    root: 'body',
    require: ['data-marketplace-type=all'],
  },
  {
    label: '通知（收件箱）',
    path: () => '/notifications',
    ready: '[data-notification-page]',
    root: 'body',
  },
];

test('§85 键盘可达性：只用键盘走完登录后那五张界面（WCAG 2.1.1）', async ({ page }) => {
  test.setTimeout(420_000);
  const { projectId, freshAccount, freshProject } = await reusableMemberWithProject(
    page,
    'kbd-walk+fixture@nexus.test',
    'e2e-secret-123',
    `键盘走查夹具${RUN}`,
  );
  console.log(
    `\n== §85 第七片的会话：夹具账号${freshAccount ? '（本轮首次注册）' : '（复用，零注册）'} · ` +
      `项目 ${projectId}${freshProject ? '（本轮首次新建）' : '（复用名下已有，零建项目）'}`,
  );

  const summary: string[] = [];
  for (const surface of SURFACES) {
    await page.goto(surface.path(projectId));
    await expect(page.locator(surface.ready), `${surface.label} 没渲染出来`).toBeVisible({ timeout: 60_000 });
    const walk = await keyboardWalk(page, surface);
    summary.push(
      `${surface.label}：分母 ${walk.population.length} · 命中 ${walk.reached.length} · 排除 ${walk.excluded.length} · 无指示 ${walk.blind.length}`,
    );
  }

  console.log(`\n== §85 第七片汇总（五张界面 · 只用键盘 · 六道结构门全过） ==`);
  for (const line of summary) console.log(`  ${line}`);
});
