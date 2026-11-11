# ADR-0122：登峰造极从公开面落——/discover 的设计升格、token 预算、以及不引入第二门禁

- 状态：Accepted
- 日期：2026-11-11
- 相关：ADR-0114（发现页管理浅读数降级）、ADR-0115（发现页卡片判读）、`/discover` 页、§FE 第一片

## 背景

`/discover` 是全站公开面的**第一屏**——创作者橱窗、作品卡片、四排序标签、搜索入口，每一位游客首先看到的就是这一页。然而它把所有视觉寄托在
"内容本身"上：标题是一行纯文字、四个排序标签是四个纯文字 Link、卡片只有 `border` + `bg-1`，没有层次、没有焦点秩序、没有任何引导线条。

平台上用户在这几件事上**看得见**：

1. 四个标签之间的"当前项"如何辨认——在 Admin 面板里我们已经有了清晰的约定（`.gw-` 家族：当前态 = brand→accent-1 渐变底 + glow，`aria-current=page`），但 `/discover` 没有沿用，两边是两种语言。
2. 卡片之间的层次与视线顺序——目前所有条目之间没有任何视觉优先级，对"这一页到底有哪些是适合我的"没有指引。
3. 搜索入口的存在感——`data-search-link` 只是一个带 `underline` 的小字链，这是全站公开面最被期待的一个动作，但它长得不像一个入口。

## 决定

把**公开面第一屏**作为前端美观登峰造极的第一立项：`/discover` 本体。

**页面长什么样**（同步入 `globals.css` 一段新的 `@layer components` 块，类名以 `dv-` 前缀，与 `.gw-`、`.dc-` 同族）：

1. **标题**——渐变墨字 `linear-gradient(120deg, fg-1 30%, accent-2 80%) + background-clip: text`，配一道 `brand → accent-1 → transparent` 的 2px 压边（`dv-header::after`）。
   "发现"两个字不再是一行普通文字。
2. **四排序标签**——收成一条 pill 底色的 `tabRow`：未选 = `bg-3` 描边态，选中 = `brand → accent-1` 渐变底 + 阴影 glow（同 `.gw-kpi` 的当前语义）。`aria-current="page"` 必须同比出现。
3. **作品卡片**——封面 600ms 缓放（长 N 帧动势）、hover 抬升 3px + brand 25% mix 描边、顶部一条 accent-2→transparent 2px 渐变描边（不再是统一的 `border border-subtle`），`tabular-nums` 让计数不左右晃。
4. **空态 / 未发现 / unavailable 三档**都走带 padding 的径向辉光空态 `bg-1` + radial gradient，**不用纯色盒子**（替换了原本的 `<p className="text-13">` 空态）。
5. **搜索入口**——从一行 12px 下划线小字 → `.dv-searchPill`，带 `min-height`、pill 形状、`border border-subtle` 悬停 `border-brand` + `fg-1`，与页首其余控件的语法一致。

## 明确边界

- **零新增 token**：所有写的 `var(--nexus-*)` 都必须在 tokens.css 里存在（`style-tokens` 门已把 24/24 钉住，替换了任何"为了好看就加新色"的诱惑）。
- **不引入 CSS Module**：全仓无先例；为它引入 `.d.ts` / types 成本远大于收益，选择并入 `globals.css` + `.dv-` 前缀的统一门。
- **不动 schema/内容/链接目标**：§159 不许假生成；这里只改**载体**，不改任何作品的语料。
- **明码 DEMO 不回归**：这与视频/图片生成无关——只是一页真实的 `/discover`，不是任何假画。
- **`style-tokens` + `jsx-text` + 横向门** 是替换前后的验收方式——commit 面上只谈"哪些 class 变了、哪些颜色走的是既有 token"，不谈"看起来好不好"。

## 不做的事

- 不做页面级代码搬家（cards grid 仍是 `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`；不改 `sizes` 规格；不改图片 `object-fit` 语义）。
- 不替换 `/discover` 的 `<h1>` 纯文字为其它承载物（"发现"二字保留）。
- 不删除任何 `data-discover-*` 属性——Playwright 用例仍旧 `toHaveAttribute('aria-current', 'page')` 或精度更高的
  组合选择器。

## 验证（不粉饰）

- style-tokens gate **24/24** 全绿——零新增颜色 token。
- page.tsx `eslint` exit 0；`node_modules/next` 编译：无新增 warning。
- `apps/web` 相关文件（page.tsx、globals.css、studio 里其他 panels）均无命中新 class 时未知的 `var(--)`。
- **浏览器那一寸**由 `e2e/discover.spec.ts` 钉死（本片写好，tsc `exit 0`；**未实跑**——本机内存吃紧、与全仓复跑争资源，下一窗口专跑）。
- 缺点：尚无视觉回归基线，FE-1 之后已有 `screenshots/storyboard-render.png` 系列样例，首轮截图补入 `docs/evidence/fe-discover-elevation/`。
