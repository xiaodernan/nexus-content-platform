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
  `e2e/responsive-authoring.spec.ts` 腿 A–M 在真浏览器里走一遍——面板写入前画布上有这个节点、
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
  数的是**模型里所有的键**（六组 patch 里出现过的每一个键，候选只吃本档与更窄那几档的规则），
  面板没有输入口的那些由界面上单独一句点名。
  写入侧 `apps/web/test/studio-responsive.test.ts` 钉的是事务粒度与那条"等于原值的写入不占撤销栈"。

**第三片（2026-11-02）：`layout` / `typography` 也接进面板，输入口的名单由内核现推**

- 面板那一节的行不再是一份手抄的四通道清单：`RESPONSIVE_CHANNELS` 里每条 `ChannelSpec` 带一个
  `appliesTo(node, breakpoint)`，全过才上那一行。这一条同时决定三件事——那一格摆不摆得出来、
  徽标点名时说它"面板没有输入口"、以及 `withResponsiveValue` 认不认那个通道名（不认就抛，
  不静默写到一个错键上）。同源的理由是 §159：行的名单和"哪些没口"的名单若是两份抄本，下一片加了
  输入口，那句点名还在点名已经能改的键。
- 于是 `layout.mode`（竖排/横排/网格/换行四个说法，`stack`/`none` 不给——一条 patch 挪不动绝对定位的
  孩子，给了输入口就是允许写出一条什么都不改的规则）、`layout.gap`、`layout.columns`、
  `typography.fontSize` 有了输入口；`columns` 那一格**只在投影出来是网格的那一档**出现（读的是
  `applyResponsive` 解出来的 mode，不是设计值），字号那一格只在节点真有 `typography` 对象时出现。
- 徽标点名的口径跟着同一判别式走，所以"改成网格 → 列数那一格出现"和"改回竖排 → 那一格收回去、
  模型里那个键还在 ⇒ 它变成要点名的那一处"是同一条规则的两侧，界面上都读得出来。
- 见证换了量法：几何量的是 `nodeStyle` 落进 inline style 的 `left/top/width/height`，
  **不是 `getBoundingClientRect`**——画布整帧与公开页画框都被 `transform: scale(zoom)` 缩放
  （`PublishedFrame.tsx:50`），客户端矩形里掺着缩放，而"面板写下去的那个数改了投影没有"在模型坐标里。
  腿 G3 在画布上量两个按钮的相对位置（间距 40 在横排吃 `b.left-(a.left+a.width)`、翻成竖排后同一份
  间距改吃纵轴），腿 M/M2/M3 在公开页上按档量同一对盒子：design 那份仍是横排且字号仍是模型那份、
  mobile 那份竖排 + 那 40 + 小字号、tablet 那份继续吃手机的三条键**再叠上自己那条 `layout.padding`**
  （内缩比 design 那份多 24——正是面板摆不出输入口、只有「清掉这一档」碰得到的那个键，到访客脸上照样生效）。
- 读数：单元 `responsive-editor` 31 + `studio-responsive` 11 = **42 passed**；
  e2e 腿 A–M **1 passed（19.2s，暖服务，3101）**。

**第四片（2026-11-02）：这几键也进代码那一寸（codegen 发射 + code-parse 回写）**

第三片留下的缺口是：面板/画布/访客三处一致，而代码视图与导出的 ZIP 少 `style.opacity`、少
`layout.padding`，网格/换行那一档连 display 类都没有。这一片补的就是那一寸，两侧共用同一张表。

- `codegen.ts` 把排布 → 工具类那张表提出来导出了：`DISPLAY_CLASSES`（`vertical`→`flex flex-col`、
  `horizontal`→`flex flex-row`、`wrap`→`flex flex-wrap`、`grid`→`grid`，`stack`/`none` 空）、
  `gridColsClass()` 与 `PADDING_SIDES`（四条边 ↔ `pt/pr/pb/pl`）。基线发射（`layoutClasses`）与
  断点发射（`responsiveClasses`）都读它，回写侧也从它反推——**拼法只有一份**。
- 断点的 display 类取**这一档解出来**的排布（`applyResponsive(node, bp).layout.mode`），不是 patch 里
  `mode` 那一个键。两个理由：只写 `{columns:2}` 的规则不改排布，发一条 `grid-cols-[…]` 落在 flex
  容器上是不动的类（§159 说的同一件事：不许发一个什么都不改的类）；而从网格翻回横排时只发
  `md:flex-row` 不改 `display`，那份投影还是网格——所以 flex 系连 `flex` 一起发，把基线留下的
  `grid` 顶掉。列数只在**这一档自己声明了** `columns` 时发：没声明就沿用基线那条无前缀的类，
  凭空补一条 `grid-cols-[repeat(1,…)]` 会让回写读出一个模型里不存在的键。
- `layout.padding` 按 patch 写了哪几条边发哪几条（`applyResponsive` 对 `layout` 组是整键
  `Object.assign`，一条 `{padding:{top:24}}` 的意思就是"这一档的 padding 只有 top"）；四条边同值折成
  一条 `md:p-[…]`。回写把 `p-[…]` 展成四边，再折回同一条 ⇒ 往返不动。
- `style.opacity` 发 `md:opacity-[…]`，回写只收 `0..1` 的数字，其余进 `unmapped` 说清原因。
- `code-parse.ts` 的 `MODE_OF_DISPLAY_CLASS` 从同一张表反推，**只收唯一属于一个排布的那些类**：
  `flex` 竖/横/换行三档都发，认它等于猜，所以它被消费掉但不进 `checked`（否则一条手写的
  `md:flex` 会把整个节点的回写顶掉）。`decodeVariant` 的白名单就此与发射侧对齐。
- 读数：`packages/design-model/test` + `responsive-editor` + `studio-responsive` 三个文件集
  **432 passed（34 files）**；e2e 腿 A–N **1 passed（22.8s，暖服务，3101）**，腿 N 那一段 5.1s。
- **仍欠**：`mobile` 那一档的前缀是空串，覆盖与基类撞在同一特异性上（谁赢由框架产出顺序决定），
  正确做法是把基线改成"设计 + mobile 规则"那份移动优先投影——那是单独一片，今天照实**不发**，
  所以面板最常被点的那一档到代码这一寸仍然是断的。`layout` 的
  `justify`/`items`/`reverse`/`rowGap`/`crossGap`/`scroll`/`clipContent`、`mode` 的 `stack`/`none`
  两档，以及 `position`（x/y）在断点 patch 里都还发不出、读不回；`typography` 只有字号、
  `style` 只有填充与透明度。这些键画布与访客都吃，代码视图与 ZIP 不吃（§16 在这一寸上仍有缺口）。
  ——这一条的第一句由同日的**第五片**接上，第二句里的 `position` 也只在 `mobile` 那一档通了；
  此刻的真实缺口看本文件最后那个「仍欠」。

**第五片（2026-11-02）：`mobile` 那一档走基线——无前缀那组类就是「设计 + 手机规则」那份投影**

第四片把 `md:`/`lg:`/`xl:` 三档接通了，`mobile` 那一档照实不发：它的断点前缀是空串，
覆盖类和基类撞在同一个特异性上，`flex-row` 与 `flex-col` 谁赢由框架的产出顺序决定，不由类名书写顺序决定。
这一片选的是**移动优先基线**，不是 `max-md:` 那一类写法。

- 为什么不是 `max-md:`：那一套的语义是"窄屏才生效"，而 `applyResponsive` 的级联是
  "本档**与更窄几档**合起来生效"（`<=`，ADR-0069 第一片起就没换过）。一条手机规则在平板档照样生效，
  `max-md:` 到了平板就没了——发出去的那份代码和画布/访客读的是两份语义，那是 §16 的反面。
  反过来，无前缀 → `md:` → `lg:` → `xl:` 这个顺序和 `applyResponsive` 的级联**同构**：窄那一档的值
  一直跟着往上走，直到宽一档自己改写它。所以基线换成"设计 + mobile 规则"之后，`mobile` 那条规则
  就不该再发一遍（`responsiveClasses` 对空前缀 `continue`），发了会撞自己。
- 发射侧（`codegen.ts`）：`classOf` 拿的是 `baselineOf(node)` 与 `baselineOf(parent)` 那两份投影，
  尺寸/位置/排布/背景/样式/字型全部按基线解，只有 `responsiveClasses` 继续读**原始节点**
  ——宽档要的是"本档与更窄几档"整条级联，基线只是窄的那一半。`hidden` 同理落在基线里。
  `RenderCtx.baselines` 那张表按节点 id memo 一次，容器带很多孩子时不重复克隆。
- 反面也钉住了：节点**没有** mobile 规则时 `applyResponsive` 返回同一个对象引用，基线一个字节都不为
  这条链让路——所以既有页的导出代码逐字节不变，这一片的爆炸半径是"只有手机规则的节点"。
- 回写侧（`code-parse.ts`）：解码无前缀类时喂给 `decodeClasses` 的也是那份基线，读出来的值归谁由
  **谁声明的**决定：`mobileOwnedPaths` 把手机那条规则声明过的路径（`layout.padding` 连它下面四条边）
  列出来，命中的写回那条规则，没命中的照旧写设计值。落错地方不是"值差一点"而是**整条链断掉**：
  设计值写了、那条规则还盖在上面，重投影自检认不出那个类名 ⇒ 整个节点的回写被放弃（§19），
  作者那次编辑在代码里看着改成功了，画布上什么都没发生（§159）。
- 顺带修掉一处静默丢键：`responsiveOps` 原先手抄 `size|layout|style|typography` 四组来合并 patch，
  `position` 那一组被丢在门外 ⇒ 代码里改 `left-*/top-*` 落地的是"什么都不改"。名单现在来自
  `types.ts` 的 `RESPONSIVE_PATCH_GROUPS`，而 `code-parse.test.ts` 里有一条**编译期**的穷尽门：
  接口里多一组而这张表没跟上，那个 `Record<ResponsivePatchGroup, true>` 字面量编译不过。
  手抄的名单不会因为多一个键而报错，这一条会。
- 见证（六条变异臂，每条都是行为改动而不是删代码）：
  A 发射侧基线换成原始节点 → 红 5（codegen 那条移动优先 + 回写的往返/改值/非归属键/父级四腿）；
  A2 `hidden` 发射不读基线 → 红 1（手机档藏起来那条）；
  B1 回写侧基线换成原始节点 → 红 2（`hidden` 那条 + 父级那条，正是 A 照不到的两个接缝）；
  B2 归属分流整个关掉 → 红 4；
  B3 反向（一切无前缀类都归手机规则）→ 红 27，包括那条"没声明的键照旧写设计值"——
  这条腿只有反向臂能红，所以留下它，同时也记下它是个大锤（B3 不是那条腿的专用臂）；
  C `responsiveOps` 退回手抄四组 → 只红新增那条 position 回写腿。
  臂跑完逐个还原，`git diff` 里不留 `MUTATION-PROBE` 字样。
- 读数：`packages/design-model` **32 files / 398 passed**（390 起手 + 8 新腿，净 +8）；
  界面那半边 e2e 腿 A–**O** 见 `docs/ROADMAP.md` §14 那一节。
- **仍欠**：`position`（x/y）到这一片只在 `mobile` 那一档走得通——`responsiveClasses` 没有 position
  那一支，所以 `md:`/`lg:`/`xl:` 三档的位置覆盖仍然发不出、读不回。`layout` 的
  `justify`/`items`/`reverse`/`rowGap`/`crossGap`/`scroll`/`clipContent`、`mode` 的 `stack`/`none`
  两档，`typography` 除字号那几键，`style` 除填充与透明度，代码这一寸照旧不吃。
  面板那半边也还没有 `position` 的输入口（`RESPONSIVE_CHANNELS` 八格里没有它）。

**第六片（2026-11-02）：对齐那两格——`layout.justify` / `layout.items` 一次接满三处判据**

第五片把 `mobile` 那一档接进基线之后，`layout` 里剩下最"看得见"的两个键是主轴对齐与交叉轴：
画布上按下去东西真的会挪，但代码那一寸发不出、面板上也没有输入口。这一片一次把三处接上，
并且把它们钉在**同一个判据**上。

- 判据只有一份：`codegen.ts` 的 `ALIGNABLE_MODES = ["vertical", "horizontal"]`。求解器
  （`layout.ts`）的 grid 与 wrap 两个分支在碰 `justify`/`items` 之前就 `return` 了，所以画布上
  这两个键在那两档什么都不摆。发射（断点那一档 + 无前缀基线 + `reverse` 那一条）、回写
  （`decodeVariant` 收不收这个类名）、面板（`appliesTo` 摆不摆得出那一格）五处都指向这一个常量。
- 为什么"少发一条类"不是审美问题而是 §16 问题，有两股相反的方向：
  ① **发出去而画布不动**：CSS 的 `justify-content`/`align-items` 在网格容器上是真生效的，
  而求解器不吃它们——发出去等于代码/访客动、画布不动，两份投影互相矛盾。
  ② **读了回来而发不出去**：回写若接受一个发射侧发不出的 token，重投影自检认不出它，
  §19 那条作废规则丢掉的是**整个节点**的回写——作者那次编辑静默蒸发，界面还显示成功。
  ②比①更贵，所以判据必须由发射与回写共用，而不是各抄一份"看起来一样"的条件。
- 表也只有一份：`JUSTIFY_CLASS` / `ITEMS_CLASS` 是导出的正表，`code-parse.ts` 的倒表由它
  `invert()` 派生（与 `DISPLAY_CLASSES` 同一条理由：手抄的映射迟早说谎）。
- 面板那两格是 `choice` 控件，取值联合直接来自模型的 `Layout["justify"]` / `Layout["items"]`，
  标签表就是那两个字段的键（编译期穷尽），所以撤销栈那句"手机断点：改主轴对齐"、徽标点名、
  `withResponsiveValue` 与 e2e 的读数用的是同一份内核名单（`RESPONSIVE_CHANNELS`，十格）。
- 见证（五条变异臂，每条改的是行为而不是删代码；预测红集与实际逐条相符）：
  A 断点档的发射判据换成"这一档自己声明了 mode" → 红 2；
  B 判据整个去掉（grid/wrap 也发）→ 红 1（那条"网格档一条都不发"）；
  C 回写判据去掉 → 红 2（不收的那条 + 往返那条）；
  D 回写接受、发射仍抑制 → 红 3。**这条是②的现形**：多出来的那一红不是"值差一点"，
  而是那条手写入射的腿整节点回写作废（补丁没了、`applied` 里没有 `responsive`）；
  E 基线（`mobile` 档）的判据去掉 → 红 1。
- 界面那半边：e2e **腿 P**（`e2e/responsive-authoring.spec.ts`）走满"面板点两格 → 画布摆放 →
  代码视图发得出 `md:justify-between md:items-end` → 落库形状 → 发布 → 访客 tablet 那一份的几何
  → 再从代码改一条 `md:items-*` 回写落库 + 面板读数跟着走"。两个平面比的是**相对盒子**
  （`relBox`：各页面的绝对原点不同，画布有画框偏移、公开页有页面留白），不是各算一遍求解器的算术。
- 腿 P 顺带量出一处真缺陷并修在夹具里：`publishPublic` 原先只等 `[data-publish-url]` 可见，
  而项目**已经发布过**时那句"当前公开地址（第 N 版）"在点「重新发布」之前就在面板上——
  于是它可能在 POST 落地前就返回，访客读到的是上一版快照（第一次跑腿 P 就是这样：画布 600×400
  贴右，访客那份还是旧的 hug 居中，差 1.5px）。现在它等面板自己报出**更高的那个 N**，
  这条同步点同时也是"面板那句版本号不是摆设"的见证。
- 读数：`packages/design-model` **32 files / 404 passed**（398 起手 + 6 新腿）；
  加上 `apps/web` 那两个响应式文件共 **34 files / 450 passed**；
  `tsc -p e2e/tsconfig.json --noEmit` 干净；e2e `@smoke §14/ADR-0069` 腿 A–**P** 一条链绿（35.9s）。
- **仍欠**（第六片之后）：`layout.reverse` 在代码那一寸仍是两份投影——`layoutClasses` 为它发
  `flex-col` + `flex-col-reverse`（同一个 CSS 属性的两种写法），而求解器**完全不读** `reverse`，
  画布不动；要么教会求解器，要么像这一片一样把发射关掉。`position`（x/y）只有 `mobile` 那一档通。
  `mode` 的 `stack`/`none` 两档、`rowGap`/`crossGap`/`scroll`/`clipContent`、`typography` 除字号、
  `style` 除填充与透明度，代码这一寸照旧不吃。

