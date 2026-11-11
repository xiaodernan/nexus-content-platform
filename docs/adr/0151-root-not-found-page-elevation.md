# ADR-0151：根 404 门面化（`/not-found.tsx`）+ 渐变墨字 forced-colors 联动

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0123（FE 六红线）、ADR-0144/0146（FE-8 门面 / 渐变墨字高对比度回退）、
  ADR-0148（完成度口径诚实）、§159（内容诚实优先于视觉）、§FE-4~FE-8（公开门面矩阵）

## 背景：全站唯一没有门面的公开落点

公开门面矩阵已升 discover / marketplace / home / search / profile(`/u/…`) /
published(`/n/…`) / play(`/n/…/play`) / storyboard(`/n/…/storyboard`)；唯独 **404** 还是
Next.js 内建裸页——一色字、零品牌、零去处、零主题门面。它覆盖两类真实落点：

1. 9 个 `page.tsx` 里十余处页面级 `notFound()`（来自 `next/navigation`：作品 / 作者 /
   世界 / 试玩 / 分镜 / 预览 / studio / tasks / game）；
2. 一切 unmatched URL（访客手输、旧分享、被撤下作品）。

（`apps/web/src/server/http.ts` 里的同名 `notFound()` 是 JSON 404 响应，不渲染页面，不在本片范围。）

根 `app/not-found.tsx` 同时接住这两类，并继承 root layout 的 `data-nexus-theme` 双主题与
ThemeToggle，无需自带主题逻辑。此前项目无 `not-found.tsx` / `error.tsx` / `global-error.tsx`。

## 决策

### 1. 只动视觉 + 补诚实门面文案，零行为（ADR-0123 六红线）

新增 `.nf-` 语义视觉段（14 个基础类），结构与文案分离。`not-found.tsx` **不是** client
组件，无 hook / fetch / server action / 读路径 / params，与全部后端、真库解耦——判据里
有专门的"纯展示零行为"门锚它。零新增颜色 token（全用双主题 `--nexus-*` + `color-mix`），
零写死 hex，双主题 AA，动效收口 `prefers-reduced-motion`，两个链接有 `:focus-visible`。

### 2. 404 文案诚实：说清"没有内容"，不替访客猜（§159 / ADR-0148）

标题直接说"这个地址没有内容"，明说"不是加载慢、不是你操作错了"，列三种常见原因
（链接失效 / 作品撤下或转不公开 / 地址拼错），但用一整条诚实旁注收口：**"我们不会替你猜
是哪一种……得查只有作者和服务器知道的记录才说得准"**。不伪造"内容曾存在"的暗示，
不把 404 说成 500 或"正在加载"。给两个干净去处（回首页 `/`、去发现页 `/discover`），
都不指向会 502 的后端路径。

### 3. 渐变墨字 forced-colors 联动：独立成组，不碰既有 8 类序列

巨大 404 数字 `.nf-code` 与标题 `.nf-title` 用 `color: transparent` + `background-clip: text`
渐变墨字（与 FE-1~FE-8 门面同一语言）。这触发两条既有判据的动态发现：

- `forced-colors-style.test.ts` 从 CSS 扫出**所有**透明字类（现为 8+2=10 个），要求每个都在
  `@media (forced-colors: active)` 块有系统色回退——判据是"不变式"而非 8 个名字的快照，
  故**无需改测试文件**，只要在 globals.css 补回退即自动满足；
- `e2e/forced-colors.spec.ts:72` 有一条**硬编码 8 类顺序**的正则，把整个
  `.dv-title,…, .ss-title` 选择器组替换成 `.ink` 做 A/B。

**关键取舍**：把 `.nf-code, .nf-title` 的 forced 回退**单独成一组**规则，追加在既有 8 类组
之后、同一 `@media` 块内。若把 nf 类名插进那个 8 类序列，会令 e2e 的整组替换正则匹配失败。
单独成组同时满足：① 既有 e2e 的 8 类序列一字未动；② 动态发现门遍历所有 `fcRules` 时能
找到 nf 回退；③ 零 hex / 零 `var(--nexus-*)`（用 CSS 系统色 `CanvasText`，自动适配用户
自定义高对比度配色）。

### 4. 真浏览器那一寸：离线自证，不依赖后端窗口

本机 3100 端口是 WorkBuddy 网关代理，上游 Next dev server 未起时回
`502 upstream connect failed`（环境事实，非本片缺陷），Playwright `webServer` 探活会等满
180s。**不 kill 外部进程、不等待**，走 `forced-colors.spec.ts` 先例：e2e 全部用
`page.setContent` 离线注入**产物真实字节**（从 not-found.tsx 提取 JSX、从 globals.css 提取
`.nf-` 段、从 tokens.css 提取变量定义），零后端、零夹具、确定性。验四件静态门覆盖不到的：

1. 深/浅双主题门面真渲染、6 个 `data-not-found-*` 钩子 + 诚实文案 + 2 个真链接 + 零 console error；
2. 两主题下 `.nf-code`/`.nf-title` 仍是 transparent 字 + gradient（`background-clip:text` 预期）；
3. 真 `Tab` 键导航下两个去处的 `:focus-visible` 描边生效；
4. `forced-colors:active` 下 nf 渐变墨字从 `clip:text` 回退 `border-box` + 系统前景色（A/B 对照）。

> 注：离线载体必须注入真实 tokens.css，否则 `linear-gradient(var(--nexus-*))` 在
> computed-value time 因变量未定义整条失效（`background-image=none`）、`:focus-visible` 的
> `outline` 同理——那是载体缺变量上下文，不是产品缺陷。这一教训已写进 e2e 注释。

## 验证

- **静态判据** `apps/web/test/not-found-visual-style.test.ts`：14 门。先红（not-found.tsx
  不存在，ENOENT）→ 转绿 14/14。门类：类名闭环 / 成规模段 / 零 hex / token 存在 /
  零新增颜色 token / 6 结构钩子 / 诚实边界 / 2 干净去处 / 纯展示零行为 / reduced-motion
  收口 / 2 链接 focus-visible / 渐变墨字层优先级 + transparent/color / forced-colors 联动 /
  注释定界符配对。
- **横向零回归**：forced-colors-style / storyboard / profile / published / play 五组视觉段
  + style-tokens 全局，共 72/72 通过（新增 `.nf-` 段按前缀隔离，不污染他段；动态发现门
  自动纳入 10 个渐变墨字类且全有回退）。
- **变异臂**（4 条，每条当场备份 + md5 断言变异发生 + 恢复核验）：
  - A 删正文诚实旁注 → **首跑假绿**（判据锚整份文件，被 JSDoc 里"不替访客猜"喂绿）；
  - B 删 `.nf-discover:focus-visible` → 键盘门红；
  - C 删 nf forced 回退整组 → 联动门红；
  - D 给 `.nf-title` 挂 `text-fg-1` 覆盖色 utility → 层优先级门红。
- **变异臂 A 的假绿 → 判据修实**（本片最重要的自检）：根因是诚实/零行为等**语义门**锚了
  整份 `page`，注释里的同义词能喂绿任何"文件含某词"式断言。修法：新增去 JSDoc 的
  `code`，把类名提取 / 结构钩子 / 诚实文案 / 去处链接 / 零行为 / 层优先级全部改锚 `code`，
  判据守"渲染出来的文案与代码"而非"文件里含某词"。重跑臂 A → **诚实边界门精确转红**
  （rc=1），恢复后 14/14 回绿，终态 md5 `0dcef2c6…` 对齐。
- **真浏览器** `e2e/not-found-visual.spec.ts`：4/4 通过（真 Chrome，离线配置，见下）。
- **engineering gate**：eslint 三文件各 RC=0（`not-found.tsx` 限堆单跑；两新测试文件首轮撞
  并行会话压满 CPU（100%、25 node）SIGTERM / 150s 超时——按纪律**不算绿也不算红**不记败，
  改 1536MB 限堆 + 280s 长超时单跑各拿真码 0）；`tsc -p apps/web --noEmit` RC=0（4096MB
  限堆 + 400s）、`tsc -p e2e --noEmit` RC=0（2048MB + 280s）。SIGTERM 是资源抢占非失败，
  拉长窗口后全部真绿，无一挂账。
- **e2e runner 注意**：本片全程离线，用仓库内临时无-webServer 配置跑（不提交、跑完即删）。
  现有 `playwright.config.ts` 的 `webServer` 在无干净窗口时会等满 180s 才放弃。

## 诚实边界 / 仍欠

- 工程门已全部拿齐（eslint 三文件 0 / tsc-web 0 / tsc-e2e 0），无挂账；下面仅列范围边界。
- 真浏览器 e2e 是**离线载体**（`setContent` 注入产物字节），验证的是"结构 + CSS 因果"，
  不等于端到端起服务后走真实 unmatched URL 的 SSR 落点；待上游 dev server 有干净窗口时
  可补一条 `page.goto(死 URL)` 的真 SSR 门（当前环境 502 无法做）。
- 未 push（沿用长期纪律）。
- 真读屏器听读、FE hover 态人工逐帧看图仍欠（跨片长期边界）。
