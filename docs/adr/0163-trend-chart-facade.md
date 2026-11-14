# ADR-0163：按天曲线 `TrendChart.tsx` `.tc-` 门面化 + FE 首个 SVG 图表片 + 三轴语义色守恒 + 剥类全文零行为门（FE-15）

- 日期：2026-11-12
- 状态：Accepted
- 关联：ADR-0154（静态门锚真实代码、变异臂是判据的验伪器）、ADR-0158/0159/0160/0161/0162（FE-10~14 `.mp-`/`.mi-`/`.me-`/`.mr-`/`.an-` 门面序列）、ADR-0123（六红线零新增颜色 token）、ADR-0146（A11Y-1 forced-colors）、§CRIT-1（声称覆盖纪律）、§168（"别把图画成谎话"）

## 背景 / 缺口

`apps/web/src/app/analytics/TrendChart.tsx` 是 analytics 分析页按天曲线的 **server 组件**（无 'use client'、浏览器侧一行为它不付 JS），也是 FE 门面序列**首个 SVG 图表片**、analytics 页**最后一块裸 Tailwind**：改造前 **8 处静态 className / 13 个去重裸原子类**，含两个 SVG 专属任意值原子类 `fill-[var(--nexus-color-fg-3)]` 与 `text-[9px]`。FE-14（ADR-0162）已把同页 `analytics/page.tsx` 门面化，但明确把 `TrendChart.tsx` 另立 FE-15——它虽小，灵魂却与 HTML 门面片完全不同。

本片的成败不在"有没有图"，在 **§168「别把图画成谎话」**：opens / visitors / playTimeMs 三个量各有各的单位（次 / 人 / 秒）与纵轴，各有各的语义色（`--nexus-color-accent-2` / `brand` / `success`）；缺数据的日子画成**基线上一小段虚线短柱**（`fill=transparent` + 轴色描边 + `strokeDasharray=2 2` + `strokeOpacity=0.5`），不跳过、不画 0、不画满高。这些语义是 **SVG presentation attributes**（`fill`/`stroke`/`strokeDasharray`/`strokeOpacity`）与 `spec.color` 里的 **token 字符串**，**不是 className**——门面化必须守恒它们逐字节不动，只把 8 处布局/文字 className 换成 `.tc-` 门面类。

先量再治：`analytics-trend.integration.test.ts` / `analytics.integration.test.ts` 测的是 API/domain 层，不渲染 SVG 组件，改 className 零影响；`.mp-`/`.mi-`/`.me-`/`.mr-`/`.an-` 段已存在，本片新增 `.tc-` 段插在 FE-14 `.an-` 段**前方**，各段从各自首个前缀起互不重叠（横向 16 文件 190/190 全绿为证）。

## 决策：只动视觉、零行为；剥类全文零行为门 + 三轴语义色守恒

### 生产改造（3 文件，其中 tokens.css 是补字号阶梯）

1. `apps/web/src/app/analytics/TrendChart.tsx`：8 处静态 className 全换成 **`.tc-` 语义类**（`tc-root`/`tc-chart`/`tc-head`/`tc-title`/`tc-max`/`tc-svg`/`tc-axisLabel`/`tc-empty`，共 8 个门面类）。两个 SVG 专属任意值原子类 `fill-[var(--nexus-color-fg-3)] text-[9px]` 合成一个 `.tc-axisLabel`（SVG 的 `fill` 用 CSS `fill` 属性、非 `color`）。
2. `apps/web/src/app/globals.css`：新增 `§FE-15 / ADR-0163` 的 `.tc-` 视觉段（插 FE-14 `.an-` 段前方，各段互不污染），全锚既有 `--nexus-*` token，**零写死 hex、零新增颜色 token、双主题**。`.tc-svg` **严格等价 Tailwind `w-full`：只给 `width:100%`、不擅加 `display:block`**（Q01 等价臂守语义不守文本）。本片是纯展示 SVG、无焦点控件、无 hover 交互，**不设 `:focus-visible` / reduced 动效门**（无控件无动效则不设，沿用 FE-12 诚实纪律），不加渐变墨字、不触发 A11Y-1 联动。
3. `apps/web/src/styles/tokens.css`：**补齐 `--nexus-font-size-9: 9px`（字号阶梯 9→10 档）**——坐标轴日期标签原 `text-[9px]` 是全库唯一 9px 使用（90 天窗口底部要挤 12 个标签）。守 globals.css 铁律"字号全走 token、零 `font-size: Npx`"（现 0 处写死），补 token 而非写死裸 px，与 FE-14 补 size-11 同构（见 E01 臂的产品因果）。

**零行为铁律**：`WIDTH=720`/`PAD_LEFT=44`/`PAD_RIGHT=8`/`MISSING_STUB=3` 常量、`dayLabel`/`secondOf` 纯函数、`labelEvery`/`max`/`plot`/`step`/`barWidth` 计算、三条 `spec` 的 key/title/formatMax/pick/missing/color/read 全部字段、SVG 的 `viewBox`/`x`/`y`/`width`/`height`/`fill`/`stroke`/`strokeDasharray`/`strokeOpacity`、`role="img"`/`aria-label`/`<title>` a11y 契约、7 个 `data-analytics-*` 钩子、全部诚实文案（含"虚线短柱 = 那一天一条心跳都没有，不是 0 秒"/"未采集（这一天没有心跳）"）——**逐字节不动**。

### 剥 className 后全文逐字节零行为门（本片最强门）

SVG 图表属性密集——`viewBox`/坐标/`fill`/`stroke`/`strokeDasharray`/`strokeOpacity`、三轴 `spec.color`/`pick`/`missing`/`read`、`dayLabel`/`secondOf` 纯函数、`MISSING_STUB`/`WIDTH`/`PAD_*` 常量、`<title>`/aria 文案——全部在 className 归一成 `@` 后仍须**整份文件逐字节恒等**。改前（全裸）与改后（`.tc-`）哈希同为 `e4ee0bb8aba25a5f6f208a84c16d9960f84221cff164b79cdc6aaa28117693d9`。

本片只有静态 `className="…"` 一种形态（无模板串/三元），故比 FE-14 的三形态归一简单；归一化函数为 `stripClassNames(src)`。它与契约门互补：**契约门锚剥注释后的 `code`，剥类门锚整份 `page` 原文**——臂 S11 改 data 钩子名时，剥类门（锚整份、含 data 属性）与钩子门同时红，两道门各有分工。**先红时行为/语义门本就绿**（三轴色守恒、缺数据语义、剥类哈希、data 钩子、纯函数契约、注释配对），红的全是视觉门（类名闭环 / `.tc-` 段 / size-9 token / 零裸 Tailwind）——这本身是"缺口纯视觉、零行为"的可执行证据，不是事后声明（延续 ADR-0154 / §CRIT-1）。

## 判据：静态 12 门 + 离线真 Chrome e2e 5 门

### 静态那一寸（`apps/web/test/trend-chart-visual-style.test.ts`，12/12）

延续 ADR-0154/0162 骨架并针对 SVG 语义色扩展：① 类名闭环（每个 `tc-*` 在 globals.css 有基础定义）；② 成规模视觉段（≥6 类、段长 >120）；③ 零写死 hex；④ token 真存在（`.tc-` 段每个 `var(--nexus-*)` 都在 tokens.css 声明过、**含新 size-9**）；⑤ 零新增颜色 token；⑥ **page 零裸 Tailwind**（8 处静态 className 全换、两个任意值原子类必消失）；⑦ **三轴语义色守恒**（每个 spec 的 key 后紧跟的 color token 逐字锚 `accent-2`/`brand`/`success`、两两不同、全锚既有 token）；⑧ **SVG 缺数据语义守恒**（`fill=transparent`/`stroke=spec.color`/`dasharray=2 2`/`opacity=0.5`/`MISSING_STUB` 短柱 + 基线 token + role/aria/title 逐字节）；⑨ **剥 className 后全文 SHA256 逐字节零行为**；⑩ **7 个 `data-analytics-*` 钩子一个不丢**（用 `\bdata-analytics-[a-z-]+` 抽**完整 token 集合**比对，见修实①）；⑪ 纯函数/常量/语义契约零行为含全部诚实文案；⑫ 注释定界符严格配对。

### 浏览器那一寸（`e2e/trend-chart-visual.spec.ts`，5/5，真 Chrome）

离线 `page.setContent` 注入真实产物字节（本机 3100 上游常 502，TrendChart 又是 server 组件、真页面要库 + 会话 + 发布记录 + 心跳）：**样本锚真实产物门**（SAMPLE 的 `tc-` 类 / `data-*` / 三轴 color token / 静态文案逐字出自 `TrendChart.tsx`，**动态假数据不锚**）、双主题各一张（三轴正常柱 fill 解析成三个互异 rgb + SVG 结构齐全 + 零 console error）、**三轴语义色跨双主题恒定 + 缺数据虚线柱真渲染**（透明填充 / 轴色描边 / `2 2` 虚线 / `0.5` 透明 / `MISSING_STUB=3` 基线短柱）、**`.tc-axisLabel` 9px 字号与 fg-3 fill 真渲染**（size-9 token 落地、非回退继承值 16px）。

**e2e 判据自身修实**（见下修实② / ③）：初版把三轴语义色写成"随双主题切换"，读码证实 `brand`/`accent-2`/`success` 只在 tokens.css 暗 `root` 声明一次、亮主题段不覆盖——它们是**跨双主题恒定**的语义色（同量在两主题下若变色，读者会把"打开"读成两种量）；真正随主题切换的是 `fg-3` 轴标签 fill。另 `strokeDasharray` 计算样式在 Chrome 下是 `"2px, 2px"`（带逗号）而非写死的 `"2px 2px"`，改为归一化分隔符后比语义。两处都是判据问题、生产一字未改。

## 验证

- **静态判据 12/12**；**横向 16 个静态门文件 190/190 全绿**（9 FE 门面门 114/114 + 7 token/全局样式门 76/76；`.tc-` 段 + 新 size-9 token 未污染 `.mp-`/`.mi-`/`.me-`/`.mr-`/`.an-`/`style-tokens`/`token-usage`/`state-styles`/`forced-colors-style`/`theme`/`published-style`/`profile-style` 任何他段）。
- **e2e 5/5**（真 Chrome，单 worker，离线 config `e2e/pw-fe15.config.ts` 跑完即删不提交）。
- **工程门**：eslint 3 文件 **RC=0**（CSS 两文件 eslint 无匹配配置、warning 非 error，与 FE-14 同）；`tsc -p apps/web --noEmit` **RC=0**；`tsc -p e2e --noEmit` **RC=0**（后台长窗口 + 限堆 4096MB 拿真码，未 skip hook）。
- **未 push**。

## 变异臂：判据与产品规则的验伪（17 语义臂 + 2 等价臂，全红并恢复）

延续 ADR-0151/0154/0162，每臂备份、**md5 断言变异确实发生**、跑门、恢复核验基线（chart `8b99987e…` / CSS `b2e6bb76…` / tokens `675d94c8…`），红绿只认退出码与**结构化失败门集合**：静态从 vitest `--reporter=json` 的 `assertionResults[].fullName` 取 `status==='failed'` 集合、e2e 从 Playwright `--reporter=json` 取 `unexpected/failed` 的 spec 标题集合，点名的门**必须真进集合**才算 KILLED（不用文本 `includes` 猜——门名同时出现在 JSDoc，文本匹配会假 KILLED/假 ERROR，见修实①）。SIGTERM/无 status 判 ERROR（不算绿也不算红）。**17/17 语义臂 KILLED + 2/2 等价臂 EQUIV-OK + 0 异常**。

静态 13 臂：S1 缺数据 dasharray `2 2`→`3 3`→缺数据语义门红；S2 时长轴色撞访客轴→三轴撞色门红；S3 缺数据柱填实心→缺数据语义门红；S4 描边透明度 `0.5`→`0.9`→缺数据语义门红；S5 坐标轴标签退回裸 `mt-2 text-[9px]`→零裸门红；S6 `.tc-` 段引未声明 token→token 存在门红；S7 size-9 声明改名→token 存在门红；S8 `.tc-` 段塞写死 hex→零 hex 门红；S9 `.tc-` 段定义新颜色 token→零新增 token 门红；S10 `.tc-empty` 选择器改名→类名闭环门红；**S11 data 钩子 `bar-state`→`bar-statex`→钩子门 + 剥类全文门双红（本片假绿洞，见修实①）**；S13 纯函数 `dayLabel` 的 `/`→`.`→零行为契约门 + 剥类门双红；S14 三轴色脱离 token 写裸 hex→三轴色门红。

e2e 4 臂：**E1 删 size-9 声明→轴标签真计算样式回退继承值 16px、9px 门红**（新补 token 的产品因果；静态 token 门同时红，不声称 e2e 独有）；**E2 轴标签 fill 写死跨主题恒定的 brand→fg-3 不再随主题切换、跨双主题门红（`staticGreen=✓`，静态门全绿、唯 e2e 红）**；**E3 success 解析色改成与 accent-2 同青→真 Chrome 下三轴撞色、双主题门红（`staticGreen=✓`，静态门只锚 token 名全绿、唯真渲染能抓）**；E4 产物 dasharray 变 `4 4` 而 SAMPLE 没跟上→样本锚门红（样本与产物脱节即抓）。

**等价臂 2**（反过拟合，证明门锚语义非文本指纹）：Q01 `.tc-svg` 的 `width:100%`→CSS 等价 `inline-size:100%`→所有静态门仍绿（EQUIV-OK）；Q02 `className="tc-head"`→`className="tc-head "`（值内尾随空白）→剥类全文门允许 class 值自由变化、仍绿（EQUIV-OK）。两臂若被门杀死即说明门过拟合文本，实测未被杀。

## 判据自身与账本的当场修实（诚实账本，§CRIT-1 纪律）

1. **S11 变异臂抓出钩子门真实假绿洞**（本片最有价值的验伪）：初版钩子门用 `expected.filter((h) => !code.includes(h))` 子串判定；臂把 `data-analytics-bar-state` 改成 `data-analytics-bar-statex` 后，`includes('data-analytics-bar-state')` 对 `-statex` **仍为真** → 钩子门假绿、声称"钩子没丢"。同时臂门槛判定初版用"失败输出文本含门名"，而门名也出现在 JSDoc 第 34 行，导致 S11 报 `gateHit=false` 的假 ERROR。**两处一并修实**：① 钩子门改成用 `/\bdata-analytics-[a-z-]+/g` 抽**完整 token 集合**后做 `Set.has` 比对，`-statex` 是另一个 token、正确报缺；② 臂脚本升级到 **vitest/Playwright JSON reporter 结构化解析**，只认真正失败的断言/用例标题进集合，不再用文本猜。修实后重跑：静态 12/12 仍全绿、S11 变 KILLED（钩子门 + 剥类门双红）、全 17+2 臂 **0 异常**。
2. **e2e 三轴语义色判定初版拍错契约**（生产一字未改）：初版第 4 门要求三轴色"随暗/亮主题切换"，真跑 `Expected: not "rgb(34, 211, 238)"` 红。读码证实三色只在暗 `root` 声明一次、亮主题段不覆盖，是**跨双主题恒定**；真正切换的是 `fg-3` 轴标签。修法：门改为"三轴色跨双主题恒定 + 两主题下各自两两不同"，并补验 `fg-3` 轴标签 fill 确实随暗/亮变化——与 E2 臂（写死恒定色→红）互为因果。同时把文件头 JSDoc 第 23 行残留的"随暗/亮主题切换"旧措辞同步改正。
3. **e2e `strokeDasharray` 计算样式格式断言**（生产一字未改）：初版 `expect(mStyle.dash).toBe('2px 2px')`，真 Chrome 返回 `"2px, 2px"`（带逗号，随版本格式差异）。修法：`mStyle.dash.replace(/,\s*/g, ' ')` 归一化分隔符后比 `2px 2px` 语义，不比格式。e2e 从 4/5→**5/5**。
4. **E01 臂前提错（判据/臂自身，非产品）**：初版 E01 打 `alsoStaticMustStayGreen`（要求静态门全绿、唯 e2e 红），但删 size-9 声明时**静态 token 存在门本就该红**（S7 臂已证）；报 `staticGreen=✗` 假 ERROR。修法：去掉该前提，E01 定位为"e2e 真计算样式回退"因果臂（静态侧由 S7 覆盖）；真正的"静态盲区、e2e 独有"由 **E2/E3（均 `staticGreen=✓`）** 承担。修后 E01 KILLED。
5. **eslint 抓静态判据自身死代码**：`trend-chart-visual-style.test.ts` 从 FE-14 模板带来的 `ruleBlocks()` 函数定义后从未调用，`@typescript-eslint/no-unused-vars` 报 1 error。删该死函数（零语义变化）后 eslint 3 文件 RC=0、静态判据 12/12 重跑仍绿。与 FE-14 修实⑤（tsc 抓判据自身瑕疵）同类：**生产门全绿但工程门抓出判据自身问题，工程门不可省**。

## 诚实边界

- 纯视觉门面 + 一处全局字号阶梯补档，**零行为**：常量 / 纯函数 / 三 spec 全字段 / SVG attributes / a11y 契约 / 7 个 data 钩子 / 全部诚实文案逐字节未动（剥类全文哈希 + 契约门 + 三轴色守恒门三重守）。
- e2e 验的是"**真实门面类 + SVG 语义色 + 缺数据虚线柱在真 Chromium 下的渲染因果**"，markup 是覆盖三轴各一根正常柱 + 一根缺数据柱 + 坐标轴标签的**复刻静态样本**（server 组件含 `{days.map(...)}` / `{showAxis ? … : null}` / `spec.color` / `spec.pick` 等 JS 表达式，裸 HTML 解释不了），**不声称"真页面点开过一遍"**；样本锚门保证静态文案 / 类 / 钩子 / 三轴 color token 不与产物脱节，动态假数据（数字 / 日期 / 柱高）不锚，动态状态机由剥类全文哈希 + 契约门守。
- **三轴语义色跨双主题恒定**是设计契约（`brand`/`accent-2`/`success` 只声明一次），文本层 `fg-3` 才随主题守对比度；各司其职、由 E2/E3 臂分别证伪。缺数据短柱语义（`transparent` 填充 + `2 2` 虚线 + `0.5` 描边 + `MISSING_STUB=3`）由静态门 + e2e 计算样式双重钉死，"别把图画成谎话"在浏览器那一寸也有因果。
- 本片纯展示 SVG、无焦点控件 / 无 hover 交互，故**不设 `:focus-visible` / reduced 动效门**（诚实：无控件无动效则不设）；未逐帧人工看图、真读屏器听读 `<title>`/`aria-label` 仍欠；不加渐变墨字、不触发 A11Y-1 forced-colors 联动。
- **size-9 是全局字号阶梯新增档**（10 档），仅本片坐标轴标签引用；补声明向后兼容、不破坏任何门、不写死裸 px。credits（裸密度 56）/ admin 系列等高裸 Tailwind 页面为后继储备；真库 / 真 Redis / 真 MQ 全套与墙钟性能实测仍待干净窗口；未 push。
- 本片纯 `TrendChart.tsx` + `globals.css` 的 `.tc-` 段 + `tokens.css` 的 size-9 补档 + 2 新判据 + 本 ADR + 三处文档，与并行 `services/**` 正交；精确 stage 避 `.next-dev-archives/` / `test-results-mine*` / 临时 config `pw-fe15.config.ts` / 临时臂脚本 `.tc-mutate.mjs`/`.tc-verify2.mjs` / JSON 报告 `.tc-*-report.json`/`.tc-*-probe.json` / 基线备份 `.tc-base.txt`（提交前均删）。开工 HEAD `00a2de55`（我的 §FE-14）。文档只追加不 rewrite。
