# ADR-0162：创作数据页 `.an-` 门面化 + 首个三元动态类 + 剥类全文零行为门 + size-11 token 缺口修复（FE-14）

- 日期：2026-11-12
- 状态：Accepted
- 关联：ADR-0154（静态门锚真实代码、变异臂是判据的验伪器）、ADR-0158/0159/0160/0161（FE-10~13 `.mp-`/`.mi-`/`.me-`/`.mr-` 门面序列）、ADR-0123（六红线零新增颜色 token）、ADR-0146（A11Y-1 forced-colors）、§CRIT-1（声称覆盖纪律）、§168（创作数据"每个数字说的是不是真话"）

## 背景 / 缺口

`apps/web/src/app/analytics/page.tsx` 是**全库裸 Tailwind 密度最高**的一片：改造前 **88 处静态 className / 45 个去重完整值 / 58 个去重裸原子类 / 1 处三元动态 className / 27 个 `data-analytics-*` 钩子**。它是 FE 门面序列里**最大的 server 门面页**，也是**首个三元动态 className**（range option 选中态 `className={option === windowDays ? 'text-fg-1 underline' : 'text-accent-2-ink underline'}`）——此前 FE-10~13 全是静态 `className="…"` 或模板串 `className={`…`}`，判据首次要处理"条件保留、只换两分支类值"的动态形态。

这页的成败不在"有没有图"，在**每个数字说的是不是真话**（§168）：双层口径（窗口 vs 累计不可互推）、12 条 DEFINITIONS 诚实文案、12 列表格、agent 规则分析区、按天趋势区、CSV 导出、7 类告警 / 爬虫 / 截断旁注——全裸 Tailwind。门面化必须**逐字节不动**这些诚实文案与取数链。

同页 `TrendChart.tsx`（SVG 三轴 opens/visitors/playTimeMs 语义色守恒）**本片不碰**，另立 FE-15。

先量再治：`analytics.integration.test.ts` 是 API/domain 层，不渲染页面组件，改 className 零影响；`.mp-`/`.mi-`/`.me-`/`.mr-` 段已存在，本片新增 `.an-` 段插在 FE-13 `.mr-` 段**前方**，各段从各自首个前缀起互不重叠（横向 13 文件全绿为证）。

## 决策：只动视觉、零行为；三道零行为哈希 + 首个三元门

### 生产改造（3 文件，其中 tokens.css 是补缺口）

1. `apps/web/src/app/analytics/page.tsx`：88 处静态 + 1 处三元 className 全换成 **`.an-` 语义类**（denied/page/title/defs/panel/table/cell/flag/focus/reduced 等约 50 个门面类）。三元改成 `className={option === windowDays ? 'an-rangeOn' : 'an-rangeOff'}`——**条件逐字不动，只换两分支类值**。
2. `apps/web/src/app/globals.css`：新增 `§FE-14 / ADR-0162` 的 `.an-` 视觉段（插 FE-13 `.mr-` 段前方，各段互不污染），全锚既有 `--nexus-*` token + `color-mix`，**零写死 hex、零新增颜色 token、双主题**。多 Link `:focus-visible`、row hover、`an-fade-in`、`prefers-reduced-motion` 真收口。纯色标题、不加渐变墨字，不触发 A11Y-1 联动。
3. `apps/web/src/styles/tokens.css`：**补齐 `--nexus-font-size-11: 11px`（字号阶梯 8 档→9 档）**——这是本片先红静态门抓出的**真实公共缺口**（详见"判据自身与账本的当场修实"修实③）。

**零行为铁律**：`dynamic = 'force-dynamic'`、`currentUserOrNull()` / `creatorAnalytics` / `creatorOverview` / `publicationTrend` / `buildCreatorFact` / `analyzeCreatorFacts` / `dayWindow(utcDay(new Date()))` 八项域函数直连、`RANGE_OPTIONS=[7,30,90]` 窗口钳制、`rows.length === 0` 空/表分支、`Cell`/`CompletionCell` 两个带 JSX 逻辑组件的 `value===null`/`toLocaleString`/`avgPct`/`over` 分支、12 条 DEFINITIONS 的 label+meaning、12 列表头、7 类诚实旁注文案、**27 个 `data-*` 钩子**（含 5 value / 7 window / 4 project-window 计数）、`role="region"`/`aria-label`/`tabIndex={0}`/CSV `download`/外链 `noreferrer` a11y 契约——**逐字节不动**。

### 三道零行为哈希（本片工程核心，逐层加严）

FE 序列逐片加严的哈希边界在此收成三层互补：

- **段 A SHA256**（`0b1f28fc…`）：文件头到 `function Cell` 前——imports / `dynamic` / `duration` / 全部 12 条 DEFINITIONS，本就零 className，恒等。
- **段 B SHA256**（`dd0dd3ea…`）：`creatorAnalytics` 到 `publicationTrend` 的 8 项取数链 + 窗口钳制，本就零 className，恒等。
- **剥 className 后全文逐字节哈希**（`614916b9…`，**本片最强、全库最大门面页专属**）：把所有 className 的**值**归一成 `@`（静态 `className="…"`、模板串 `className={`…`}`、三元 `className={…}` 两形态全归一），**保留三元条件、Cell/CompletionCell 分支结构、全部文案、data 钩子、域逻辑**。改前（全裸）与改后（`.an-`）必须**整份文件逐字节恒等**，从而证明"除 className 字面值外一个字节都没动"。

三者的分工：**段 A/B 锚原样字节**（这两段本就没有 className），**剥类门锚 class 值之外的整份文件**（覆盖段 A/B 之间那道"含 JSX 逻辑的主渲染段"——段 A/B 哈希盖不到的地方）。层 A/B 是"两个零 className 岛"的严格逐字节，剥类门是"其余全都只动了 class 值"的全覆盖。臂 S5（改 `Cell` 的 `value===null` 分支）与 S6（改一个诚实文案）只红剥类门而**段 A/B 仍绿**，正是这道全覆盖门价值的铁证。

**先红时行为门本就绿**：未门面化时视觉门（类名闭环 / 零裸 Tailwind 等）红，而三道哈希 / 27 data 钩子 / 契约零行为 / a11y 契约**本就绿**——这本身是"缺口纯视觉、零行为"的可执行证据，不是事后声明（延续 ADR-0154 / §CRIT-1）。

### 首个三元动态类门

判据 `ternaryClass()` 从真实代码提取三元的**条件**与**两分支值**，钉死三件事：① 条件逐字是 `option === windowDays`；② 两分支恰是 `['an-rangeOn','an-rangeOff']`；③ globals.css 里两档声明**不同**（选中态 fg-1 + 实线，未选中 accent-2-ink + 虚线）。`allClassNameTokens()` 三形态全扫：静态 `className="…"`、模板串 `className={`…`}`（剔除 `${…}` 插值）、**三元 `className={…}` 里的引号字面量**——首个让"动态类值"进入零裸 Tailwind 门的形态。臂 S4（两档撞色）精确红这条门。

## 判据：静态 16 门 + 离线真 Chrome e2e 8 门

### 静态那一寸（`apps/web/test/analytics-visual-style.test.ts`，16/16）

延续 ADR-0154/0159/0160/0161 骨架并针对三元与三级哈希扩展：类名闭环（每个 `an-*` 含三元两分支都有 globals.css **基础定义**、剔 reduced-motion）、成规模视觉段（≥28）、零写死 hex（扫整段含续行）、**token 真存在**（`.an-` 段每个 `var(--nexus-*)` 都在 tokens.css 声明过）、零新增颜色 token、**page 零裸 Tailwind**（三形态 className 全扫）、**首个三元动态类门**、**27 个 `data-*` 钩子**（锚剥注释的 `code`、含 5 value / 7 window / 4 project-window 计数）、**段 A/B SHA256 逐字节零行为**、**剥 className 后全文 SHA256 逐字节零行为**、域函数/纯函数/DEFINITIONS/诚实文案契约零行为**含计数**（12 条定义 / 12 列表头 / 三类"只有你自己…" / 四类"未计入"）、a11y 契约零行为（横滚 region / CSV download / 外链 noreferrer）、告警数字旁注各有专属 `.an-*` 类（`text-amber-300`→`an-flagWarn` 用 `--nexus-color-warn-ink`）、多 Link `:focus-visible`、reduced-motion 真关掉、注释定界符配对。

### 浏览器那一寸（`e2e/analytics-visual.spec.ts`，8/8，真 Chrome）

离线 `page.setContent` 注入真实产物字节（本机 3100 上游常 502，analytics 还要库 + 会话 + 发布记录 + 心跳）：**样本锚真实产物门**（**内置 FE-11 教训**：SAMPLE 的 `an-*` 类 / `data-analytics-*` 钩子 / 静态文案逐字出自 `page.tsx`，**动态假数据不锚**）、双主题三态（denied/empty/list）渲染 + 12 列表格 + 零 console error、**三元 range 两档视觉分档**（`an-rangeOn` 比 `an-rangeOff` 颜色真不同、实线 vs 虚线）、**告警徽标 token 化双主题 AA**（暗亮色值真切换且亮主题更暗）、**补齐 size-11 后密集辅助字真渲染 11px**（双主题 × 3 门面类，验 `var()` 不再回退继承值 16px）、多 Link 真 `Tab` `:focus-visible` 描边、row hover + reduced-motion 下 fade/transition/hover 背景都被产品块真关（纯 `emulateMedia`、零手工 `!important` 兜底）。

**e2e 判据自身修实**（见下修实①②）：denied/empty/list 三态选择器初版写成后代式、静态计数初版把 `data-analytics-value` 写死 12（真实是 10），两处都是判据问题、生产一字未改。

## 验证

- **静态判据 16/16**；**横向 13 个静态门文件 163/163 全绿**（`.an-` 段 + 新增 size-11 token 未污染 `.mp-`/`.mi-`/`.me-`/`.mr-`/`style-tokens`/`forced-colors-style`/`state-styles` 等任何他段）。
- **e2e 8/8**（真 Chrome，单 worker，离线 config `e2e/pw-fe14.config.ts` 跑完即删不提交）。
- **工程门**：eslint 三文件 **RC=0**；`tsc -p apps/web --noEmit` **RC=0**；`tsc -p e2e --noEmit` **RC=0**（后台长窗口 + 限堆 4096MB 拿真码，未 skip hook）。
- **未 push**。

## 变异臂：判据与产品规则的验伪（12 静态 + 4 e2e，全红并恢复）

延续 ADR-0151/0154/0155/0160/0161，每臂备份、md5 断言变异发生、按**目标门 fullName 是否进 failed 集合**（静态）/ **目标 e2e 标题是否真 `N failed` 且非 `no tests found`**（e2e）判红、恢复核验基线（page `c1dc72e2…` / CSS `9e114167…` / tokens `181ed65e…`），红绿只认退出码与结构化结果：**16 PASS / 0 FAIL**。

静态 12 臂：S1 className 回裸 `text-21`→零裸门红；S2 未声明 token 混入 `.an-` 段→token 门红；S3 写死 hex→零 hex 门红；S4 三元两档撞色→三元门红；**S5 改 `Cell` 的 `value===null` 分支 / S6 改一个诚实文案→只红剥类全文门、段 A/B 哈希仍绿（全覆盖门价值铁证）**；S7 改 `creatorOverview` 取数链→段 B 哈希 + 剥类 + 契约三红；S8 删横滚 data 钩子→钩子门 + 剥类红；S9 删一个 Link `:focus-visible`→focus 门红；S10 注释掉产品 `animation:none`→reduced 门红；S11 `an-flagWarn` 的 warn-ink 换 fg-3→告警 token 门红；S12 注入孤立注释闭合→定界符门红。

e2e 4 臂：**E1 删 tokens.css size-11 声明→真计算样式回退继承值、11px 门红**（本片新修缺口的产品因果）；E2 三元撞色→range 分档门红；E3 warn-ink 改写死单色→双主题 AA 门红；**E4 组件层 reduced 写死时长绕开 token 双保险→产品块门红**（修实②，见下）。

## 判据自身与账本的当场修实（诚实账本，§CRIT-1 纪律）

1. **静态判据 DEFINITIONS 计数初版假红**：先红时写死 `toBe(13)`，读码证实实际是 **12** 条（打开次数…连续有人来），当场修实为 12，先红结果从 10 failed/5 passed 变为 **9 failed/6 passed**——行为门全绿、视觉门全红，证明缺口纯视觉。
2. **e2e 三态选择器 + 数值钩子计数两处判据问题**（生产一字未改）：① denied/empty/list 钩子挂在 `<main data-state=…>` **自身**（denied）或**后代 `<p>`**（empty），初版一律写后代式→扫 0 个假红，改为 denied 同元素复合 `[data-state="denied"][data-analytics-denied]` / empty 后代式 / list `[data-state="list"].an-page`；② `data-analytics-value` 写死 `toHaveCount(12)`，而产物**真实是 10**（12 是表头列数，作品列与可见性列不带数值钩子），按产物真相改为 10。两者都是判据/样本问题、非产品缺陷。
3. **静态 token 存在门抓出真实公共缺口 → 补 size-11 而非降级视觉**：改后唯一红门是 `.an-` 段引用了**未声明**的 `--nexus-font-size-11`。先量：原始 page.tsx 有 **20 处 `text-11`**（原始视觉就是 11px），tokens.css 字号阶梯注释"8 档"从 12 起步，而 `.se-` 段早有 2 处同 token 引用——`var()` 无 fallback 在浏览器 computed-value 无效、回退到 body 继承的 16px，即这些小字**当前根本没渲染成 11px**。决策：**补 `--nexus-font-size-11: 11px`（8→9 档）**而非把 20 处降到 12px（后者是视觉失真、且 `.se-` 遗留缺口仍在）。新增声明向后兼容、不破坏任何门、不写死裸 px、不绕门。e2e 第 4 门（E1 臂）从真 Chrome 计算样式锁死"11px 真渲染、非回退 16px"。
4. **E4 变异臂两次假绿 → 深挖坐实 products reduced 并联双保险**（本片最有价值的验伪）：初版臂删组件层 `.an-` reduced 块 `transition:none` → e2e 仍绿（`rc=0`）；二版臂改删 token 层 `--nexus-motion-base:0ms` → 仍绿。**深挖**：产品对 reduced 有**并联双保险**——① 组件层 reduced 块直接 `transition:none`（不经 token）；② tokens.css reduced 块把 `--nexus-motion-*` 压成 0ms（经 token）。单拆任一层都被另一层兜住（**不是判据没牙，是变异没打穿**）；离线实验"两层同拆"得到 `Received: 0.2` 真红为证。修法：臂改为把组件层 `transition:none` 换成**写死 `color 200ms`**——既不经 token（②兜不住）、又让组件层不复存在（①兜不住），单文件单替换即绕开双保险、精确真红。**结论**：门是对的，产品双保险是真实存在的冗余，账本如实记。
5. **tsc-e2e 抓出判据自身类型缺口**：`e2e/analytics-visual.spec.ts` 告警门 `lum()` 里 `rgb.match(/\d+/g)!.map(Number)` 解构的 `r/g/b` 在 `noUncheckedIndexedAccess` 下是 `possibly undefined`（`TS18048` ×3）。修法：`?? []` + 解构默认值 `[r=0,g=0,b=0]`——上面已有 `.toMatch(/^rgb\(/)` 保证三数字、缺失分量按 0 不影响"比暗主题更暗"判定，纯类型收窄、零语义变化。修后 `tsc -p e2e` **RC=0**、e2e 8/8 与 eslint 3 文件重跑仍全绿。这种"生产门全绿但工程门抓出判据自身瑕疵"正是工程门不可省的理由。

## 诚实边界

- 纯视觉门面 + 一处 token 阶梯补齐，**零行为**：八项域函数直连、窗口钳制、Cell/CompletionCell 分支、12 条定义、12 列表头、7 类诚实旁注、27 个 `data-*` 钩子、a11y 契约逐字节未动（段 A/B 哈希 + 剥类全文哈希 + 契约门三重守）。
- e2e 验的是"**真实门面类 + 结构钩子 + 三元分档在真 Chromium 下的渲染因果**"，markup 是覆盖三态 + 三元两档 + 12 列表格的**复刻静态样本**（server 组件含 `{DEFINITIONS.map}` / `{rows.map}` / `{option === windowDays ? …}` / `{overview.totals.*}` 等 JS 表达式，裸 HTML 解释不了），不声称"真页面点开过一遍"；样本锚门保证静态文案 / 类 / 钩子不与产物脱节，动态假数据不锚，动态状态机由三道哈希 + 契约门守。
- hover / `:focus-visible` 只做 CSS + 静态门 + 真 Chrome 计算样式 / 真 `Tab` 因果，**未逐帧人工看图**；真读屏器听读仍欠。本片不加渐变墨字，不触发 A11Y-1 forced-colors 联动。
- 双主题告警色由计算样式钉死；range 两档以 fg-1/accent-2-ink + 实线/虚线双维度分档（臂 E2 证伪撞色）。
- **size-11 是全局字号阶梯新增档**，同时修复 `.se-` 段 2 处历史遗留的未声明引用（本片 token 存在门只扫 `.an-` 段，故 `.se-` 遗留不在本片门内，但补声明对它同样生效）——不宣称改动了 `.se-` 的视觉（它此前回退 16px、现在按设计渲染 11px，属修复而非门面化本片范围）。
- `TrendChart.tsx`（FE-15）、credits（裸密度 56）/ admin 系列等高裸 Tailwind 页面为后继储备；真库 / 真 Redis / 真 MQ 全套与墙钟性能实测仍待干净窗口；未 push。
- 本片纯 `apps/web/src/app/analytics/page.tsx` + `globals.css` 的 `.an-` 段 + `tokens.css` 的 size-11 补档 + 2 新判据 + 本 ADR + 三处文档，与并行 `services/**` 正交；精确 stage 避 `.next-dev-archives/` / `test-results-mine*` / 临时 config `pw-fe14.config.ts` / 临时臂脚本 / 基线备份 `.an-base.txt`。开工 HEAD `e490ff1b`。详见 ADR-0162。
