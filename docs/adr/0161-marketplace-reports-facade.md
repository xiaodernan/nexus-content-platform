# ADR-0161：我的举报页 `.mr-` 门面化 + 数据驱动状态类视觉/契约边界（FE-13 三兄弟收官）

- 日期：2026-11-12
- 状态：Accepted
- 关联：ADR-0158（FE-10 `.mp-` 模板片）、ADR-0159（FE-11 `.mi-` 交互原子 + JS 段 SHA256 硬门）、ADR-0160（FE-12 `.me-` 收入页 + 伪元素动画独立槽）、ADR-0154（静态门锚真实代码、变异臂是判据的验伪器）、§CRIT-1（声称覆盖纪律）、ADR-0123（六红线零新增颜色 token）、ADR-0146（A11Y-1 forced-colors）

## 背景 / 缺口

顶栏把 logged-in 用户送进的三兄弟（purchases / earnings / reports）里，reports `apps/web/src/app/marketplace/reports/page.tsx` 是**最后一个仍全裸 Tailwind** 的页面——FE-10 已给 purchases 上 `.mp-`、FE-11 给交互原子上 `.mi-`、FE-12 给 earnings 上 `.me-`，唯独 reports 的 denied / empty / list 三态、四状态徽标、工单行、页脚全无门面语言。三兄弟在此收官。

本片同时是 FE 门面序列里**两个"首次"**，决定了零行为边界比前三片更微妙：

1. **首个 server 组件**（`export default async function`，无 hooks、无 useEffect、无 client 状态）——读路径是 `await currentUserOrNull()` + `await listReportsByReporter(user.id)` 两次直连域函数，静态门要钉的是这两个调用与 denied/empty/list 分支，而不是前三片的状态机。
2. **首个数据驱动状态色映射**：`STATUS_LABELS: Record<ReportStatus, { label; className }>` 的 4 个 `className` 值本就是**配色**（改造前是裸 `text-green-400` 等原子类），属**视觉**、应换成 `.mr-statusXxx` 语义类；但 4 个状态**键**、4 个 `label` **文案**、`Record<ReportStatus, …>` **类型**、三个纯函数、两段结案文案属**行为契约**，必须逐字钉死。这意味着"className 值"这一文字层**故意不纳入 JS 逻辑哈希**——由视觉门而非哈希门看守，是本片的核心设计边界（臂 C 专门证伪这条边界）。

先量再治：`marketplace-reports.integration.test.ts` 是 API/domain 层测试，不渲染页面组件，改 className 零影响；`.mp-`/`.mi-`/`.me-` 段已存在，本片新增 `.mr-` 段插在 FE-12 `.me-` 段**前方**，各段互不污染（横向 12 文件 147/147 为证）。

## 决策：只动视觉、零行为；哈希锚点拆成双段

### 生产改造（2 文件）

1. `apps/web/src/app/marketplace/reports/page.tsx`：只换 className 与状态映射的 className 值（裸 Tailwind → 26 个 `.mr-` 语义类）。三态 `mr-denied/mr-empty/mr-root`、结构 `mr-title/subtitle/head/heading/back/loginLink/deniedCopy/count/list/footer`、工单行 `mr-row/rowTop/rowTitle/itemState/rowMeta/metaTime/desc/outcomeNote`、状态徽标 `mr-status` 骨架 + 四个 `mr-statusPending/Reviewing/Resolved/Dismissed`。
2. `apps/web/src/app/globals.css`：新增 `§FE-13 / ADR-0161` 的 `.mr-` 视觉段（插在 FE-11 `.mi-` / FE-12 `.me-` 段前方，各门 segment 从各自首个前缀起互不重叠），全锚既有 `--nexus-*` token + `color-mix`，**零写死 hex、零新增颜色 token、双主题**。工单行渐层底 + accent-2 左竖线 + hover 抬升、四状态徽标各配色（resolved 用 nexus `success` token 替换裸 `text-green-400`，`color-mix` 淡背景双主题都过 AA）、两个 `<Link>` `:focus-visible` 描边、`prefers-reduced-motion` 真收口。纯色标题、不加渐变墨字，不触发 A11Y-1 联动。

**零行为铁律**：`dynamic = 'force-dynamic'`、`await currentUserOrNull()`、`if (!user)` denied 分支、`await listReportsByReporter(user.id)`、`reports.length === 0` 空/列表分支、`reports.map((report)`、`STATUS_LABELS[report.status]` 映射、4 个状态键与 4 个 label 文案、`stamp`/`itemState`/`reasonLabel` 三个纯函数、`itemState(report…)` ×2、`stamp(report.` ×2、`reasonLabel(report.reason)` ×1、`report.status === 'resolved'|'dismissed'` 两段结案分支与文案、17 个 `data-*` 钩子、`<Link>` 的 href——**一字不动**，只换 className。

### 哈希锚点适配：为何是双段，为何 className 值在哈希之外（本片最有价值的设计）

FE-11 只有一个末尾 `return (`、FE-12 有多个提前 return，都可取"文件头到某锚点前"的**单段**哈希。本片 `STATUS_LABELS` 夹在 imports 与纯函数之间，而它的 `className` 值**要被换皮**（不能进哈希），故把"锚全部 JS 逻辑"拆成**两段**：

- **段 A**（`5b4e2924ce6cf53f3bf3c49995ea7d213558076ab13c525d3779d72612f585cd`）：文件头到 `const STATUS_LABELS` **之前**——imports + `dynamic` + JSDoc，恒等。
- **段 B**（`2ebfd4105dd99871f97ad5d939d8031bcd729bb5120cda314d6a8ead629346f1`）：`/** 时间按 UTC 印` 到 `export default` **之前**——`stamp` / `itemState` / `reasonLabel` 三个纯函数，恒等。

`STATUS_LABELS` 自身由**两道门分守**：键 + `Record` 类型 + 4 个 label 文案由"域函数/契约零行为门"逐条钉死（臂 D 改 `待受理`→`已受理` 红）；4 个 `className` **值**由视觉门（类名闭环 + 四态徽标各有专属类）管，**故意不进双段哈希**——臂 C 把 `mr-statusResolved` 改回裸 `text-green-400`，视觉门红而双段哈希门**仍绿**，正好证明这条"值属视觉、不误触行为门"的边界成立。这是一种**刻意的门职责分离**，不是哈希漏盖。

## 判据：静态 13 门 + 离线真 Chrome e2e 6 门

### 静态那一寸（`apps/web/test/marketplace-reports-visual-style.test.ts`，13/13）

延续 ADR-0154/0159/0160 骨架并针对双段与数据驱动扩展：类名闭环（每个 `mr-*` 含 STATUS_LABELS 值里的状态类都有 globals.css **基础定义**、剔 reduced-motion）、成规模视觉段（≥16）、零 hex、token 真存在、零新增颜色 token、**page 零裸 Tailwind**——含模板串 `className={`mr-status ${status.className}`}` 的**字面部分**（剔除 `${…}` 插值）、**17 个 `data-*` 钩子**（锚剥注释的 `code`）、**双段 JS 逻辑 SHA256 逐字节零行为**、域函数/状态映射/纯函数契约零行为**含计数**（4 键 / 4 label / 2 `itemState(report…)` / 2 `stamp(report.` / 2 outcome-note / 2 处结案文案）、**四状态徽标各有专属 `.mr-statusXxx` 类**、**两个 `<Link>` 的 `:focus-visible`**、reduced-motion 真关掉（伪元素独立动画槽纪律沿用）、注释定界符配对。

与 FE-12 纯展示页**诚实删 `focus` 门**形成对照：本片确有 2 个键盘交互控件（去登录 / 回市场），故该门成立并保留。

**首个模板串 className 提取**：`allClassNameTokens` 同时匹配 `className="…"` 与 `className={`…`}` 两种形态，并剔除 `${…}` 插值——动态状态类由 `statusClassValues` 单独从 `STATUS_LABELS` 提取、单独验闭环，避免"插值喂绿/喂红"。

### 浏览器那一寸（`e2e/marketplace-reports-visual.spec.ts`，6/6，真 Chrome）

离线 `page.setContent` 注入真实产物字节（本机 3100 上游常 502，reports 还要库 + 会话 + 工单数据）：**样本锚真实产物门**（**内置 FE-11 教训**：只锚组件真实写死的静态文案与 `data-reports?-*` 钩子，`{item.title}` 等动态假数据不锚产物）、双主题 denied/empty/list 三态渲染 + 四工单行 + 两结案备注 + 零 console error、**四状态徽标双主题配色四档各异且 resolved 随 success token 真切换**（数据驱动状态类闭环的浏览器因果）、两个 `<Link>` 真 `Tab` 的 `:focus-visible` 描边、row hover 抬升 + reduced-motion 下 fade-in / transition / hover transform 都被产品块真关（纯 `emulateMedia`、零手工 `!important` 兜底）。

**e2e 判据自身修实**（见下修实②）：初版 denied 钩子用**后代选择器** `main[data-sample="denied"] [data-reports-denied]`，但产物把该钩子挂在 `<main>` **自身**，扫到 0 个→假红；改为**同元素复合选择器** `main[data-sample="denied"][data-reports-denied="anonymous"]` 并顺带锚值，6/6 转绿。这是判据/载体问题、非产品缺陷。

## 验证

- **静态判据 13/13**；**横向 12 个静态门文件 147/147**（含 FE-10 `.mp-` / FE-11 `.mi-` / FE-12 `.me-` / `style-tokens` / `forced-colors-style` / `state-styles` / `not-found` / `play` / `storyboard` / `published` / `profile`）——`.mr-` 段未污染任何他段。
- **e2e 6/6**（真 Chrome，单 worker，离线 config `e2e/pw-fe13.config.ts` 跑完即删不提交）。
- **工程门**：eslint 三文件单进程 **RC=0**；`tsc -p apps/web --noEmit` **RC=0**；`tsc -p e2e --noEmit` **RC=0**（三件均后台长窗口 + 限堆 4096MB 拿真码，未 skip hook）。
- **未 push**。

## 变异臂：判据与产品规则的验伪（6 静态 + 2 e2e，全红并恢复）

延续 ADR-0151/0154/0155/0160，每臂备份、md5 断言变异发生、恢复核验基线（page `83405572…` / CSS `076e6925…`），红绿只认退出码：

| 臂 | 变异 | 期望门 | 实测 |
| --- | --- | --- | --- |
| A | 模板串字面塞回裸 `ml-auto text-11` | 静态零裸 Tailwind 门红 | rc=1，报 `['ml-auto','text-11']` |
| B | 纯函数 `stamp` 的 `UTC`→`GMT`（段 B 内） | 静态双段哈希门红 | rc=1，段 B 变 `29b3e8fc…` |
| C | `STATUS_LABELS.className` 改回裸 `text-green-400` | 视觉门红、**哈希门须仍绿** | C1 rc=1 报"仍是裸 Tailwind"；C2 **rc=0 仍绿**（证明"className 值属视觉、不纳入哈希"的边界正确） |
| D | label `待受理`→`已受理`（键/label 属契约） | 静态契约零行为门红 | rc=1，报"label「待受理」丢了" |
| E | `.mr-statusResolved` 选择器改名→类基础定义缺失 | 静态四态徽标专属类门红 | rc=1，报"globals.css 缺 mr-statusResolved 基础定义"（修实①后） |
| F | 删两个 `<Link>` 的 `:focus-visible` 规则 | 静态 Link focus 门红 | rc=1，报"去登录链接缺 :focus-visible" |
| **G（e2e 产品规则臂）** | 删产品 reduced `.mr-row:hover{transform:none}` | e2e reduced 门红 | rc=1，真计算样式收 `matrix(1,0,0,1,2,0)` 而非 `none` |
| **H（e2e 数据驱动臂）** | resolved 徽标配色改到与 pending 撞色 | e2e 四态分档门红 | rc=1，四档塌成 **3 档** `Expected 4 / Received 3` |

**臂 C + 臂 H 是本片最有价值的两击**：C 从**静态门职责分离**角度证明"数据驱动状态类的值归视觉门、不误触行为哈希门"；H 从**真 Chrome 计算样式**角度证伪"四状态其实是同一副裸样子/改配色判据也全绿"的口子。两者合起来把"数据驱动状态色映射"这一 FE 序列首次出现的结构在两个层面钉死。

## 判据自身与账本的当场修实（诚实账本，§CRIT-1 纪律）

1. **臂 E 变异脚本假红→修实为可靠变异**：初版把 `.mr-statusResolved` 的整块多行 CSS（含 `color-mix` 续行）写成单行精确串，bash 精确匹配数为 0、变异阶段即失败（**不算红也不算绿**，是脚本无效）。改为**单行选择器改名** `  .mr-statusResolved {` → `  .mr-statusResolvedGONE {`（匹配数恒 1、语义等价删掉该类基础定义），臂 E 精确红、恢复后 CSS md5 对齐 `076e6925…`。教训延续 PERF-2/A11Y-1：**GOOD 基线不能在被污染/无效变异状态下继续，每臂须有 md5 前后断言**。
2. **e2e denied 钩子选择器假红→同元素复合选择器**（见上"浏览器那一寸"）：产物把 `data-reports-denied` 挂在 `<main>` 自身而非后代，后代选择器扫 0 个。修为复合选择器并锚值，生产一字未改。
3. **CSS 段注释账本笔误**：初版段注释写"22 data-* 钩子"，而页面与静态判据实际是 **17** 个（判据第 237 行 expected 数组正好 17）。修正注释为 17——账本与判据对齐（注释改动剥掉后不影响任何判据，但会改 CSS 全文件 md5，故臂脚本 `BASE_CSS` 与新基线同步刷新为 `076e6925…`）。

## 诚实边界

- 纯视觉门面 + 一处账本注释数字修正，**零行为**：两个域函数调用、denied/empty/list 分支、状态映射键/label、三纯函数、两段结案文案、17 个 `data-*` 钩子逐字节未动（双段 SHA256 + 契约门守）。
- e2e 验的是"**真实门面类 + 结构钩子 + 数据驱动状态类在真 Chromium 下的渲染因果**"，markup 是覆盖三态的**复刻静态样本**（server 组件含 JS 表达式，裸 HTML 解释不了），不声称"真页面点开过一遍"；样本锚门保证样本不与产物脱节，动态假数据不锚，动态状态机由双段哈希 + 契约门守。
- hover / `:focus-visible` / `:active` 只做 CSS + 静态门 + 真 Chrome 计算样式/真 `Tab` 因果，**未逐帧人工看图**；真读屏器听读仍欠。
- 双主题配色四档由计算样式钉死；pending 与 dismissed 底色同为 `bg-3`，靠 `fg-2` / `fg-3` 文字色分档（臂 H 证伪了"撞色判据也全绿"）。
- 真库 / 真 Redis / 真 MQ 全套与墙钟性能实测仍待干净窗口；未 push。
- 本片纯 `apps/web/src/app/marketplace/reports/page.tsx` + `globals.css` 的 `.mr-` 段 + 2 新判据 + 本 ADR + 三处文档，与并行 `services/**` 正交；精确 stage 避 `.next-dev-archives/` / `test-results-mine*` / 临时 config / 临时臂脚本。开工 HEAD `1801dacb`。详见 ADR-0161。
