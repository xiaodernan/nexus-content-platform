# ADR-0069：访客那一侧也能改投影——公开页接上 `?viewport=` 与 `?zoom=`

## 背景

§85 第十三片（`docs/EVALUATION.md`，2026-10-29）第一次在手机尺寸下量公开作品页，拿到的原始事实是：
帧宽 **1440×900**，390 与 1280 两栏**一模一样**；`overflow-x-auto` 把溢出接住了，代价是**要横向平移
1082px**，首屏只看得见 **27%**。而**访客自己没有任何办法改变这件事**：

1. `apps/web/src/app/n/[handle]/[slug]/page.tsx` 里 `resolveLayout(page, { tokens, mode })`
   **没传 `breakpoint`**——作者（或 AI）按 §14 写的 `node.responsive` 变体在发布这一刻被整条丢掉：
   Studio 里能切 viewport，分享出去的链接不能；
2. 没有缩放这一档：帧宽由页面自己的尺寸决定，谁来看都是 1440。

`/preview` 那半边早就吃 `?viewport=`（§124 / ADR-0063 时代），但那份逻辑留在预览路由里，
公开页读都不读。§14 要的"用户可以在 Canvas 中切换 viewport"到这里只有一半：作者能切，访客不能。

## 选项

1. **客户端岛**：公开页挂一个组件，用按钮在浏览器里切换断点/缩放。
   ADR-0063 已经为同一件事否过一次，理由在这里同样成立：多一条与 SSR 并行的渲染路径，
   而且客户端只有 CSS 可用——真去改媒体查询就是"界面自己造一套响应式"，与 §16
   「设计模型是唯一真值」对着干。
2. **服务端查询参数 + 链接**：`?viewport=mobile`、`?zoom=0.5`，一排服务端渲染的 `<a>`。
   零 JS 也生效、可收藏、可分享，且与页面本体共用同一份 `resolveLayout`。选定。
3. **默认按访客视口自动选档/适配**：访客不用动手，这才是完整答案。但它要么在 CSS 里做
   长度除长度（`calc(390px / 1440px)` 非法），要么依赖 Client Hints（`Sec-CH-Viewport-Width`
   只有 Chromium 发），要么拿 UA 猜设备宽。三条都不足以让服务端**默认**改掉所有人看到的那一版。
   所以这一半留作欠账（见"后果"；后来由 ADR-0074 补上），这一片只把**手动**那半边做实。

## 决定

选 2，并且公开页与 `/preview` **共用同一套参数名、同一个控件行组件、同一个纯函数模块**
（`apps/web/src/studio/viewer-params.ts` + `ViewerControls.tsx`）：先前有两处手抄——预览路由里一份
断点表、Studio 顶栏里一份宽度数字——现在宽度一律取模型的 `BREAKPOINT_WIDTH`，
界面不再复制一份会过期的数。

五条约束：

- **缺参数一个字节都不改**（这条已被 ADR-0074 收窄：**没有断点规则**的页仍逐字节不变；有规则的页
  默认铺四份投影按访客视口选一份）。这一片写它的时候，没有 `viewport` 就是 `resolveLayout` 不吃断点，
  投影与第十三片那遍读数同源；它是"新控件不会把访客本来要看的东西换掉"的根据，也是腿 A 的全部内容。
- **认不出来就降级，不 404**（ADR-0063 同一条）。`?viewport=phone` 这一片当初回到设计尺寸，
  ADR-0074 之后回到**自动**（无规则的页自动=设计尺寸，所以那句读数没变，机制变了）；`?zoom=abc`、
  `0`、负数回到 1，合法值夹进 `[0.25, 1]`。一条过期或被手改的链接仍然应该看得到页面。
- **改投影不改模型，也不改快照**（§16）。缩放走 `transform: scale()`，外面再套一层按
  **缩后尺寸**占位的盒子（`data-published-scale-box`）；`ResolvedLayout.width` 保持不动，
  所以"缩小"不会让作者的 `fill` 子节点改尺寸，访客的 zoom 也不落库。
  占位盒那一层是必需的：只有 transform 而没有它，画面缩小了，页面照样横向平移一整屏。
- **换参数不丢彼此**。`viewerHref` 把其余键原样带过去，跳页热点也带（`keepViewerParams`）：
  看手机档不该顺带把缩放重置回原大，翻页不该把取景框丢掉。
  `next` 里**显式给键**（哪怕是 `undefined`）才算"清掉这一项"——"清掉"与"没提到"在界面上
  是两颗不同的按钮，混不起。同一状态必须是同一个 URL，所以键序固定（`page`→`viewport`→`zoom`→`state`）。
- **证明不了会变的按钮不摆**（§159）。`liveBreakpoints(page)`：页面上只要有任何一条 responsive
  规则就四档全留（规则按 `<=` 向上级联，且重解会搬动 `fill`/`hug` 的孩子，证明不了哪一档是空的）；
  没有规则、且根宽恰好等于某个 `BREAKPOINT_WIDTH`，那一档重解出来**逐字节相同**（这条同解由
  `packages/design-model/test/layout.test.ts` 钉住），于是那颗空按钮不渲染。
  唯一的例外是访客正在看的这一档——它是"你现在在这"的标记，不是按钮。

## 后果

- 访客第一次有了可收藏的投影链接。同一份发布快照、四种断点读法；作者写的 mobile 变体
  第一次落到访客眼里，这是 §14 那条"AI 必须能自动生成 responsive rules"的价值兑现的一半。
- **自动那一半已补**（后来的 §85 第三十一片，见 `docs/adr/0074-published-auto-variant-by-media-query.md`）：
  公开页默认按访客视口选一份投影，显式 `?viewport=` 仍然覆盖。这一片当时留下的"要自己点一次
  「手机 375」"不再是终态，但那一版的 27% 首屏可见是**手动**路径上的读数，别读成自动档的读数。
- **另一处也补上了**：Properties 面板新增「断点（§14）」一节，作者第一次能不用 AI 配方、
  不用代码视图、直接在这一档写键（显示 / 宽 / 高 / 透明度），一次点击 = 一个键 = 一条可撤销事务（§150）。
  这条链现在有四份见证（详见文末"作者侧的人工入口"那一条）：面板点出来 → 落进服务端文档 →
  发布 → 访客 `?viewport=` 看见同一份差别。**仍然欠的是根画框**：断点面板编辑的是元素，
  根画框选不中——图层列表从根的孩子开始（`apps/web/src/studio/layers-flat.ts:45`），
  Ctrl+A 也排除根（`apps/web/src/studio/CanvasStage.tsx:272`），而 `runLayout` 里
  `finalRoot.width = viewportWidth ?? modelRoot.width`（`packages/design-model/src/layout.ts`）
  本来就让根宽在断点档上无效。面板把这件事写在「页面」那一节（`data-page-root-width-from-breakpoint`），
  没有摆一颗按下去没反应的按钮。
- 缩到底残余平移**不是 0 而是 2px**：1440×0.25＝360 的画面，外面那层 `p-[var(--nexus-space-4)]`
  的 gutter 让 `overflow-x-auto` 那层还剩 `360+16+16−390＝2`。那是容器内边距，不是画面露在外面；
  见证把这条算术钉住（而不是 `.toBe(0)`），gutter 改了它照样说得通，占位盒一旦不再跟着缩它立刻红。
- 这一排目标全部 ≥24×24（WCAG 2.5.8），所以第十三片"短边 <24px 的点击目标"那一栏不会因为
  多一排控件而变长。
- 顺带修了一条模型的类型谎（`packages/design-model/src/layout.ts`）：根画框写 `fill`/`hug` 时
  `axisSize` 把**关键字字符串**穿过 `||` 链直接写进 `ResolvedLayout.width`（声明是 `number`），
  外面 `layout.width * zoom` 就成了 NaN 尺寸。现在 `runLayout` 用 `rootAxis` 把关键字解成数字：
  `fill` → 可用宽（设计尺寸那一档没有外部约束，就是页面画布本身），`hug` → 内容实测，
  数字 → 原值。三条见证在 `layout.test.ts`，其中一条是对照（`hug` 没有被 `fill` 那条分支
  变成画布宽）。
- **测量会污染读数**：`recordView` 每次 SSR 加载给 `publishedProjects.views` +1、**没有去重**，
  所以这个夹具每跑一次 e2e 就涨若干"浏览"。夹具账号与项目是固定的
  （`viewer+fixture@nexus.test` / 同一个项目），这些数集中在夹具身上，不混进真实作品——
  但分析页上看到的那些浏览量不是真人。
- 见证：`e2e/viewer-breakpoint.spec.ts`（390×844 手机仿真，腿 A–I：缺参数不变、mobile 真的重解到 375
  且规则生效、级联在 tablet/wide 同样生效、非法值降级、缩放的布局宽 vs 视觉宽、两参数叠加、
  翻页带取景框、空按钮不摆、24px 下限）＋ 作者侧 `/preview` 同一排控件；
  纯函数层 `apps/web/test/viewer-params.test.ts`。
- 作者侧的人工入口（§14 那条"能写规则"的兑现，见 `docs/adr/` 之外还落在 `docs/STUDIO.md` 右面板一节）：
  `e2e/responsive-authoring.spec.ts` 腿 A–L 在真浏览器里走一遍——面板写入前画布上有这个节点、
  点「隐藏」当场没了、只藏被点名的那个、撤销恢复、重做再藏、级联在编辑面上同样生效、
  **切视口不写模型**（服务端根宽仍是设计值，且根节点一条规则都没多）、同一条规则里第二个键
  不顶掉第一个键（撤销回到只剩一个键、重做又回到两个）、第二节点第二通道（透明度）走的是
  数字输入失焦提交，一路打字不塞一串事务、两条规则落进服务端文档的**逐字段形状**
  （`{breakpoint:'mobile',patch:{visible:false,size:{width:200}}}` /
  `{breakpoint:'tablet',patch:{style:{opacity:0.4}}}`）、发布后访客那一侧按 ADR-0074 之后的真实形状读：
  不带参数时四份投影同在一个文档里，媒体查询按访客窗口放一份出来（1280 → desktop 那份两条规则都生效、
  把窗口改成 390 → mobile 那份只吃到手机那条、1600 → wide），显式 `?viewport=<档名>` 时文档里只有那一份
  （所以 `visibleVariant` 读出来的是 `mobile` 而不是 `design`），`?viewport=design` 才把画面交还给
  发布快照本身（两条规则一条都不生效）。
  这一串读数不靠顶栏那行"已保存"（ADR-0063 以来同一条纪律）。
  纯函数层 `apps/web/test/responsive-editor.test.ts` 钉的是徽标的算法：`data-breakpoint-impact`
  取两个判据的并——与设计值不同，或与"去掉这一档自己那条规则后的投影"不同。只取后一半会
  在"这一档把值改回设计值"时读 0（级联带来的改动看不见），只取前一半会在"继承来的改动被这一档
  自己抹平"时读 0；两种都是界面在说"这一档没变化"而画布和访客都变了（§159）。
  写入侧 `apps/web/test/studio-responsive.test.ts` 钉的是事务粒度与那条"等于原值的写入不占撤销栈"。
