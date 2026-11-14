# ADR-0158：市场购买页 `.mp-` 门面化 + 交互态状态语言（FE-10 三兄弟模板片）

- 日期：2026-11-12
- 状态：Accepted
- 关联：ADR-0134/0136/0144（FE-5/6/8 门面范式与变异臂纪律）、ADR-0146（A11Y-1 forced-colors 渐变墨字回退）、ADR-0147（A11Y-2 focus/aria）、ADR-0154（静态门锚真实代码、变异臂是判据的验伪器）、§CRIT-1（声称覆盖纪律）、FE-9（not-found 404 门面）、FE-2（市场列表外壳 `.mk-`）

## 背景 / 缺口

FE-2 给市场**列表外壳**上了 `.mk-` 妆，但顶栏把 logged-in 用户送进的 3 个子页（purchases / earnings / reports）仍是**全裸 Tailwind 原子类**。其中 `apps/web/src/app/marketplace/purchases/page.tsx` 恰有全站最完整的交互态——loading / error / empty / busy / disabled / 三态徽标 / 结果消息——却没有任何门面语言。这是"**有状态无门面**"的断层，落在 ADR 长期记的"交互态欠账"最真实的落点（新访客与创作者高频路径）。

另探查坐实一处**全库 CSS 空白**：FE-1~FE-9 九个门面此前**零 `:active`、零 `:disabled` 视觉**——busy 下载态按下与禁用全无反馈。用户长期方向要求"前端魅力登峰造极、注重前后端协同"，本片是三兄弟的**模板片**，earnings / reports 留 FE-11。

## 决策：只动视觉、零行为；交互态语言克制在 `.mp-` 内

### 生产改造（2 文件）

1. `apps/web/src/app/marketplace/purchases/page.tsx`：把裸 Tailwind 状态色与主结构 className 换成 `.mp-` 语义类（`mp-root` / `mp-frame` / `mp-head` / `mp-heading` / `mp-title` / `mp-subtitle` / `mp-headActions` / `mp-back`；四态 `mp-error` / `mp-loading` / `mp-empty` / `mp-list`；行 `mp-row` / `mp-rowTop` / `mp-rowName` / `mp-type` / `mp-status` / `mp-statusLive` / `mp-statusPrivate` / `mp-statusDelisted` / `mp-date` / `mp-rowMeta` / `mp-download` / `mp-message`），并补一层纯装饰 `<div className="mp-frame">`。`statusOf` 三态徽标文案（在售 / 已转私密（已购仍可下载）/ 已下架（不再交付））**逐字保留**。
2. `apps/web/src/app/globals.css`：新增 `§FE-10 / ADR-0158` 的 `.mp-` 视觉段（1032-1182），全锚既有 `--nexus-*` token + `color-mix`，**零写死 hex、零新增颜色 token、双主题 token 化**。

**零行为铁律**：purchases 是 client 组件，状态机（`rows` / `error` / `busy` / `message` 与其 setter）、两个 fetch 端点（`/api/marketplace/purchases`、`/api/marketplace/${row.itemId}/content`）、`disabled={busy === row.itemId}` 契约、全部 `data-*` 判据钩子、四态渲染分支、状态推导 `statusOf`——**一字不动**，只换 className。

### 六红线 / A11Y

- **零新增颜色 token**（ADR-0123 红线）：`.mp-` 段只引用既有双主题 token；零 hex。
- **不触发 A11Y-1 联动**：本片**不加渐变墨字**（纯色标题 + 渐变压边轨道），故无需 forced-colors 墨字回退；全局不变式仍由 `forced-colors-style.test.ts` 守。
- **prefers-reduced-motion 真收口**：`.mp-loading` 的呼吸 `animation: mp-pulse` 在 reduce 下 `animation:none`；所有 transition / transform / active 收缩在 reduce 下归零。
- **`:focus-visible` 键盘描边**：`.mp-back` 与 `.mp-download` 都有 2px 品牌描边（真 `Tab` 验，非编程 focus）。
- **首次补交互态**：`.mp-download:active`（`scale(.97)` 按下反馈）、`:disabled`（`cursor:progress` + 降饱和 + 降透明度，busy 态终于有视觉）、`:hover` 抬升，全部 token 化动效，**克制在 `.mp-` 段内**、不动其它 9 个门面的共享约定（避免 FE-10 变成高风险共享改动）。

## 判据：静态 12 门 + 离线真 Chrome e2e 6 门

### 静态那一寸（`apps/web/test/marketplace-purchases-visual-style.test.ts`，12/12）

延续 ADR-0154「锚剥注释后的真实代码、别被 JSDoc 喂绿」：类名闭环（page 每个 `mp-*` 类在 globals.css 有**基础定义**、剔 reduced-motion、堵"出现过≠定义过"）、成规模视觉段（≥16 类）、零 hex、token 真存在、零新增颜色 token、结构/`data-*` 钩子一个不丢、**状态机/交互契约零行为门**（守 fetch 端点/setter/disabled/四态分支/statusOf 都在）、四态各有专属 `.mp-` 类、`:active`/`:disabled`/`:hover` 交互态语言存在、reduced-motion 真关掉、`:focus-visible`、注释定界符配对。

### 浏览器那一寸（`e2e/marketplace-purchases-visual.spec.ts`，6/6，真 Chrome）

离线 `page.setContent` 注入真实产物字节（本机 3100 上游常 502，purchases 又是登录后页要库+会话，门面正确性只取决于真产物的结构/文案/`data-*` 与 `.mp-` CSS 在真 Chromium 下的渲染，二者与后端数据无关）：**样本锚真实产物门**（见下修实）、深/浅双主题四态渲染 + 三态徽标 + 零 console error、busy `:disabled` 真视觉、真 `Tab` 的 `:focus-visible`、hover/`:active`/reduced-motion 的 A/B。

## 验证

- **静态判据 12/12**；横向 10 个静态门文件 **118/118**（`style-tokens` / `forced-colors-style` / `token-usage` / `state-styles` / `profile` / `published` / `play` / `storyboard` / `not-found` + 本片）——`.mp-` 段未污染任何他段。
- **e2e 6/6**（真 Chrome，单 worker，离线 config 跑完即删不提交）。
- **工程门**：eslint 3 文件（page / 静态判据 / e2e spec）单进程 **RC=0**；`tsc -p apps/web --noEmit` **RC=0**；`tsc -p e2e --noEmit` **RC=0**（eslint / tsc 冷启动遇 SIGTERM 时改后台长窗口 + 限堆 4096MB，拿真码；未 skip hook）。globals.css 在 eslint 下报"无匹配配置"无害 warning（CSS 不走 eslint）。
- **未 push**。

## 变异臂：判据自身的验伪（4 条 CSS 臂 + 1 条样本锚定臂，全红并恢复）

延续 ADR-0151/0154/0155「变异臂是判据自身的验伪器」，每臂备份、md5 断言变异发生、恢复核验基线 `c53910a4…`（CSS）/ `ce932db9…`（spec），红绿只认退出码：

| 臂 | 变异 | 期望门 | 实测 |
| --- | --- | --- | --- |
| A | 删产品 reduced 块里 `.mp-row:hover` 的 `transform:none` | e2e hover/active/reduced 门红 | rc=1，收到 `matrix(1,0,0,1,0,-1)` 而非 `none` |
| B | 删 `.mp-download:active` 的 `scale(.97)` | 同上 `:active` 段红 | rc=1，poll 3s 超时，DOMMatrix.a 恒 1 |
| C | 删 `.mp-download:disabled` 的 `cursor:progress` | e2e busy 态门红 | rc=1，收到 `default` |
| D（样本锚定） | SAMPLE 里一个 `mp-frame` 改成 `mp-frameTypo` | e2e 样本锚真实产物门红 | rc=1，`missingClasses: ["mp-frameTypo"]` |

**臂 A 是本片最关键的一击**：它证明下方"修实"去掉手工兜底后，e2e 抓的确实是**产品 globals.css 的真 reduced-motion 规则**——该规则退化，门立刻红。

## 判据自身的两处当场修实（诚实账本）

1. **e2e reduced-motion 实验组去掉手工 `!important` 兜底（本片最有价值教训，§CRIT-1 纪律再次生效）**：初版 `htmlFor(scheme, reduced=true)` 在注入 CSS 后再补一段带 `!important` 的关闭规则，reduced 实验组验的其实只是"注入的 `!important` 生效"＝**同义反复**，掩盖产品 `.mp-` 段自带的 `@media (prefers-reduced-motion: reduce)` 是否真写对。修法：`htmlFor` 不再接受 `reduced` 参数、零手工注入，实验组只切 `page.emulateMedia({ reducedMotion: 'reduce' })` 触发**产品真规则**；因前半段已证非 reduced 下 hover 有 transform，此处的 `none` 只能来自产品块。臂 A 证明修实后门有牙。（另把 `:active` 从"测试名虚报"改成真 `page.mouse.down()` + `DOMMatrix.a<1` 断言。）
2. **e2e SAMPLE 与真实产物脱节的潜在假绿 → 新增"样本锚真实产物门"**：purchases 是 client 组件、JSX 含 `{error}` / `{rows.map(...)}` / `disabled={busy===...}`，裸 HTML 解释不了，故 `SAMPLE` 是人工构造的静态覆盖样本。但初版 JSDoc 声称"className/data-\*/文案逐字取自真实产物"却**无判据钉死**——样本一旦与产物脱节，测着自造样本也能全绿。修法：新增第一道门，把 SAMPLE 里所有 `mp-*` 类 / `data-*` 钩子 / 关键文案逐个对 `page.tsx` 真实字节断言存在（顺带消掉 eslint 抓到的未使用 `pageSrc`）；臂 D 证明有牙。

另：静态判据 reduced-motion 门把 `animation` **单列一类**——FE-9 骨架把 animation 近似算进 transition/transform，遇到 `.mp-loading` 的 `animation: mp-pulse` 会误红（正确关闭是 `animation:none`）；修实后认 `animation:none`、保留 transition/transform 两套检查，臂 B（删 `.mp-loading { animation:none }`）曾精确验证该门有牙。

## 诚实边界 / 仍欠

1. 本片是**纯视觉门面 + 零行为**改造：状态机、fetch、disabled、文案一字未动，收益在前端门面完整度与交互态反馈，不改任何业务语义。
2. e2e 用 `page.setContent` 注入**真实产物字节构造的静态样本**，验的是"真实门面类 + 结构钩子在真 Chrome 下的双主题渲染与交互态因果"，**不声称"真页面点开过一遍"**（purchases 要库 + 会话，本机无干净后端窗口）。样本锚真实产物门保证样本不与产物脱节，但动态状态机仍由静态判据的零行为门守。
3. `.mp-` 段**不加渐变墨字**，故未做 forced-colors 墨字回退的联动验证；全局 forced-colors 不变式由既有门守。
4. 真读屏器听读、FE hover / active 逐帧人工看图仍欠；`:active` / `:disabled` 视觉语言**只覆盖 `.mp-` 一个门面**，其它 9 个门面仍未补（本片刻意克制为模板片，推广另立片）。
5. FE-11（earnings / reports 子页门面化 + `MarketplaceItemRow.tsx` 裸按钮交互原子）未开始；未 push；真库真 Redis 全套与墙钟实测待干净窗口。

## 协作注记

开工 HEAD `ec5a7449`（我的 §PERF-5），本轮无并行会话抢 web index、提交前未前移。本片纯 `apps/web/src/app/globals.css` + `marketplace/purchases/page.tsx` + 新静态判据 + 新 e2e spec + ADR + 三处文档，与并行 `services/**` 正交。精确 stage 只列本片文件，避开 `services/**` / `pom.xml` / gitignored 归档（`.next-dev-archives/` / `test-results-mine*`）/ 临时离线 config（跑完即删、不提交）/ 临时变异脚本；共享文档只追加不 rewrite。详见 ROADMAP / CURRENT-STATE。
