# ADR-0091：断点档的 `stack` / `none`（模型层差量类）——为什么要发一个标记类

日期：2026-11-08
依据：`docs/adr/0069-public-viewer-viewport-and-zoom.md`（第九/十片）、`docs/ROADMAP.md` §14（"mode 的 stack/none 仍欠"）、
`packages/design-model/src/codegen.ts` 的 `DISPLAY_CLASSES`（`stack`/`none` 今天给空数组）与 `positionVariantClasses`（已落地的
"父级 merged 到这一档是 none/stack ⇒ 子节点 absolute"那一刀）。

## Context

§14 的断点 patch 里，`layout.mode` 写了 `{mode:"none"}` / `{mode:"stack"}` 之后：

- **画布与访客**：生效（求解器的 none/stack 分支把子节点按 `position` 绝对摆放）；
- **代码与 ZIP**：这个**父级本身**在那一档得不到任何类——`DISPLAY_CLASSES` 对这两种 mode 是空数组（
  "那两档靠子节点自己的绝对坐标摆放"，codegen.ts:66-77）。子节点的 `md:absolute`/`md:static` 差量类**有**发（`positionVariantClasses`，
  第九片），于是 CSS 层面的绝对化本身不依赖父级类。公开页（PublishedFrame）走 `nodeStyle` 内联绝对定位，**不吃 Tailwind 类**——
  `[--nexus-mode:none|stack]` 永远只出现在「代码视图 + 导出 ZIP（NexusExport 的 zip 产出）」里，公开 SSR 的 HTML class 里永远不会有这个类；
  前者是给作者的源码，后者是给访客的页面（§16）。
- **回写**：父级的模式 patch 找不到类来认领 ⇒ 从代码改回模型时，那一档的 `mode: none` **整条静默丢失**——
  作者在代码视图里看到的东西与模型不是同一份真值（§16/§19 的反例）。
- **面板**：`MODE_CHOICES` 只有 竖排/横排/网格/换行（responsive-editor.ts）——作者无法在面板上把一档的父级翻成自由定位。

所以这个洞不是"十几行 glue 没接"，而是**父级这一档的投影信息在 CSS 里没有物理落脚点**：Tailwind 没有 `flex-none`、没有 `display:contents`
能表达 absolute 子节点参与流式布局这一层语义（flex/grid 容器里 absolute 孩子根本不参与排布，模式根本无法用 display 表达）。

## Options

**A. 结构推理（md:relative + 孩子 absolute 同时出现 ⇒ 父级 mode = none/stack）**
- 优点：不引入任何新标记，代码外观干净。
- 代价：**跨节点推理**——`decodeVariant(tokens, node, ctx, bp, tierParentMode)` 只看自己那组 token，
  "孩子也绝对了"在父级这一层不知道。要真的做，`codeToPageOps` 必须在所有 node 解完之后再走一遍
  "凡 md:relative 且至少一个孩子 md:absolute-flip ⇒ 补一条 mode 补丁"，还要区分 "flex-ish relative" 的手写代码
  （手写 `md:relative` 的文档多得是，误报意味着盖掉作者本来写的 mode）。误报写进去的键还会被下一轮生成**静默吃掉**（§19）。
  排除 "手写介入" 的判据不存在——NEXUS 自己的生成物和手写物共用同一份白名单。
- 结论：否。

**B. 标记类：`md:[--nexus-mode:none]` / `md:[--nexus-mode:stack]`（Tailwind 任意属性）**
- 优点：
  - 单向：parser 读 `[--nexus-mode:none]` ⇒ patch `{layout:{mode:'none'}}`；合成端发同一个类；往返零补丁。
  - 不猜：不依赖兄弟子节点、不依赖人手白名单、误报空间为零。
  - Tailwind v4 对任意属性是核心能力，`md:[--x:y]` 编译成合法 media 块；即便 JS 被禁、CSS 裸奔，
    这条声明也只是个**无副作用的自定义属性声明**（没有任何选择器消费它——没人读它做布局），不改变任何渲染。
- 代价：
  - 生成的 HTML 里会多一条看起来没用的自定义属性——但文件头已经明说"由 NEXUS 从设计模型生成，解析不了的片段会在下一次生成时被模型覆盖"。
  - 不是 Tailwind utility，purge/tree-shaking 之外的消费者（如 HTML linter）可能报未知属性——
    接受，代价小于 A 的误报。
  - code-parse 要为任意属性开一条专门识别（`/^\[--nexus-mode:/`），并把 `none`/`stack` 之外的值一律 unmapped。
- 结论：**选 B**。

**C. 父级发 `md:static` 或 `md:block` 之类的真实类**
- 代价：Tailwind 里 `static` 只把 position 改成 static，不改变流向参与——
  父级本来是 flex 的孩子才 absolute；而且 `static`/`block` 对已有文档"本来就是 block"的语义相撞，解析端无法还原出 mode 名（stack 与 none 在 CSS 里做不出区别）。
- 结论：否。

**D. 永远保持欠着**
- 代价：§16 对这条键一直开口，作者只能整档重造或去代码视图手写+祈祷，不是长期态。
- 结论：否，但允许作为 fallback（若 B 的浏览器验证不过，回到本状态并在本 ADR 里再记）。

**落地记录（2026-11-08，同日第二笔，commit 85889a4）**：

- 面板「自由定位」按钮落了：MODE_CHOICES value `none`、stack 保持仅代码可写；`withResponsiveValue` 走 generic `cleanMode`（`none` OK，`stack` REJECT）。
- codegen 发 marker，但**门只有一个**：`applyResponsiveBelow→resolved` 进入 none/stack 才发——设计态默认 mode=none 的叶子（`defaultLayout` 死命给 text/image 类写死 none）不发、继承来的档不补发。
  第一版没加这道门，`md:[--nexus-mode:none]` 在每个叶子、每个档上都平铺了，7 条 §14 往返测试（字重/字距/纵向对齐/圆角/字族）直接红了
  （text 默认 none ⇒ 每个 typography 规则旁边都多一枚 mode 补丁），当场按 flip-gate 收了。
- code-parse 以 marker 为权威判据：同档 `[--nexus-mode:none|stack]` 被认下→patch.mode；`relative` 与 marker 共现时同档消费（定位参照）；手写 marker 落 unmapped 不猜。
- 读数：`packages/design-model` 35 files / **499 passed**（+4）、`responsive-editor` **41/41**。基线 mid-tier 的 `relative` + marker 不在本片（mobile 继续走基线）。
- 浏览器腿 F7（同日已还）：Actions 翻「自由定位」（layout.mode:none）→ 两孩子失去 flow、画布 absolute 归各自 position（兄弟重叠落在 Actions 原点）→ 撤销恢复并排；
- 浏览器腿 F8（同日）：父级 flip 之后位置那两格按档**内**摆/收——mobile 不摆、tablet/wide 翻进 none 摆、撤销回并排又不摆；console `[ 7.9 s ] 腿 F8`、全链 A–F8–R **1 passed（6.0m）**。
- 浏览器腿 S（同日）：本片覆盖的**交付链的最后一寸**——tablet 翻 none → 真发布 → 访客两处兄弟重叠于 Actions 原点 → 撤销 → 再发 → 访客回到 vertical 流；console `[ 9 9 . 6 s ] 腿 S`、**1 passed（1.8m）**；spec 头注释 ⑯ 记了，这一刀把 panel → publish → public SSR 串成一条路，代价是一个 fixture 版本（已归零到 forwardRules）。
- 基线（mobile 档）模式标记同日补上：`layoutClasses` 无前缀那一档也发 `[--nexus-mode:…]`（没有 `md:` 前缀）——此前 mobile 档的 mode 无往返（§14 mobile-next-leg），live 页面与导出 ZIP 往返现在都能过；`decodeClasses` 同样消费 marker + `relative`（不猜）。

  全链 A–F7–R **1 passed（58.1s）**、console `[ 5.6 s ] 腿 F7`，独占生产构建（next start -p 3201）。
  两笔记账：影响徽标在埋的 padding+mode 下 flip 后仍读 2（而非预期的 1）——§159 数的是 model 键不找人情面；
  boxIn 读的是页面坐标、不是父级内坐标，所以翻完两个孩子应当是『完全重叠』而非各自为 0（第二条与腿 F3/F4 同一条判据）。

## Decision

**选 B。**断点档的父级 mode 通过任意属性标记类落脚：发射 `${variant}[--nexus-mode:{mode}]`，回写识别 `[--nexus-mode:none|stack]`；
面板 MODE_CHOICES 增加一个按钮「自由定位」→ patch `mode:'none'`（**stack 保持仅代码可写**——`stack` 与 `none` 在求解器里语义等同，
同时摆两个按钮是 §159 说的同一件事：两个位置做同一件事）；`stack`/`none` 的 children absolute 差量类的逻辑一字不改。

## Consequences

- 生成的 HTML 中会出现无消费方的自定义属性声明；不消费止血、不占 class 位以外的资源。
- code-parse 需要：
  - 任意属性识别（`--nexus-mode:`）；非法值（非 none/stack）unmapped 点名；认得之后必须能重投影出同类名（§19 的回写自检）。
  - 已有的 `positionVariantClasses` 与此无交叉：children 继续发 absolute/static。
- 面板：MODE_CHOICES 加「自由定位」（value `none`）；`MODE_VALUES` 同步；单测覆盖；不改 `ALIGNABLE_MODES`（自由定位档不吃 justify/items）。
- **发布门**：必须在一次"独占 + 安静"的机器上跑 `e2e/responsive-authoring.spec.ts` 全链 + 手写一段 md:[--nexus-mode:none] 从代码回写
  零补丁断言——本页今天不落盘实现，先钉住设计（本机共享 dev 3100 这段时间间歇 500，Run→test→screenshot 的纪律不放水）。
- 面板选中父级时可以把"这档翻成自由定位"作为一条规则写下；children 的差量类由既有 `positionVariantClasses` 承担，本片不重写它。

## 仍欠（落地本片时再动的清单，认的人抄底）

1. 面板「自由定位」按钮 + MODE_VALUES + `cleanMode` 收 `none`（保留 `stack` 仅可经代码/旧文档读到）。
2. codegen：`responsiveClasses` 父级分支发 `[--nexus-mode:…]`（不要动 `positionVariantClasses`）。
3. code-parse：decodeVariant 任意属性识别 + `style`-级零效果声明的回写自检；round-trip 零补丁。
4. 模型层测试：emit/decode/往返三份（含"笔误的 `--nexus-mode:grid` 进 unmapped 不猜"）。
5. 面板单测：`MODE_CHOICES` 多一格、`RESPONSIVE_CHANNELS` 计数不变（choice 还是四格+一格=5）。
6. e2e 新腿（安静的机器上）：父级翻成自由定位 → 子节点 md:absolute 不破坏基线那一档 → 平板那档往返回写 mode:none 零补丁。
