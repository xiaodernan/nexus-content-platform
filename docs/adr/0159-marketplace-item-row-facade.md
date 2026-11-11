# ADR-0159：市场交互原子 `.mi-` 门面化 + 零行为 SHA256 硬门 + e2e 真抓产品缺陷（FE-11）

- 日期：2026-11-12
- 状态：Accepted
- 关联：ADR-0158（FE-10 `.mp-` 门面 + 交互态状态语言模板片）、ADR-0154（静态门锚真实代码、变异臂是判据的验伪器）、§CRIT-1（声称覆盖纪律）、ADR-0147（A11Y-2 disclosure aria 契约）、ADR-0123（六红线零新增颜色 token）、ADR-0146（A11Y-1 forced-colors）、FE-2（市场列表外壳 `.mk-`）

## 背景 / 缺口

FE-2 给市场**列表外壳**上了 `.mk-` 妆（`.mk-card`：渐变卡片 + accent-2 压边 + hover 抬升），但卡片**内部的交互控件全裸**。本片目标 `apps/web/src/marketplace/MarketplaceItemRow.tsx` 是**全站交互最密集的原子**：购买 / 下载 / 举报 / 编辑 / 下架 **5 类按钮**、**3 处 disabled busy**（purchasing / downloading / reportBusy）、**2 个 disclosure 面板**（edit / report）、表单输入与下拉、已购 / 已举报徽标——全是裸 Tailwind 原子类（`rounded bg-bg-3 px-2 text-11 hover:bg-bg-1` …）。这是"**外壳精致、控件全裸**"最刺眼的断层，也是 FE-10 建立的交互态状态语言（`.mp-`）最该推广的真实落点。

先量再治：`.mk-` 外壳段在 `globals.css:265-305`，扩展新 `.mi-` 段不碰它；`marketplace-earnings.integration.test.ts` / `marketplace-my-reports.integration.test.ts` 均为 API/domain 层测试、不渲染页面组件，改 className 零影响；`.mk-card` 全库**只被本组件使用**（`marketplace/page.tsx` 两处渲染同一组件），故 `mi-` 门面作用于该组件实例、不污染任何别处。

## 决策：只动视觉、零行为；判据比 FE-10 再升一级

### 生产改造（2 文件）

1. `apps/web/src/marketplace/MarketplaceItemRow.tsx`：只换 className（裸 Tailwind → `.mi-` 语义类），外壳 `.mk-card` 保留。21 个 `.mi-` 类：`mi-head/preview/title/tag/price/badgePurchased/badgeReported/creator/btn/panel/field/input/inputNum/inputNote/select/hint/desc/msg` + 三档按钮语气 `mi-btnPrimary/mi-btnGhost/mi-btnDanger`。按钮语气分档：主（购买/保存/提交举报）、幽灵（编辑/下载/取消）、危险（举报/下架，常态低调、hover 才显危险色）。
2. `apps/web/src/app/globals.css`：新增 `§FE-11 / ADR-0159` 的 `.mi-` 视觉段（插在 FE-10 `.mp-` 段前方，故 FE-10 的 `mpSegment` 提取不吞 `.mi-`、互不污染），全锚既有 `--nexus-*` token + `color-mix`，**零写死 hex、零新增颜色 token、双主题**。统一 `.mi-btn` 骨架（尺寸/圆角/动效/focus/disabled 一处定义，三档语气只覆写配色）+ 四态 `:hover`/`:active`/`:disabled`/`:focus-visible`（按钮 + input + select）+ `prefers-reduced-motion` 真收口 + `.mi-panel` 展开动画（`mi-panel-in`，reduced 下真关）。不加渐变墨字，不触发 A11Y-1 联动。

**零行为铁律**：5 个 fetch 端点、4 处 `csrfHeaders()`、2 处 `window.confirm`、3 处 `router.refresh()`、`saveBlob` 交付、`REPORT_REASONS` 枚举、**12 个 useState**（含两处带泛型）、3 处 `disabled={busy}`、disclosure 的 `editPanelId/reportPanelId` 派生与 `aria-controls/aria-expanded/id` 配对、全部 22 个 `data-*` 钩子——**一字不动**，只换 className。

### 判据升级：JS 逻辑段 SHA256 逐字节零行为门（本片最硬锚）

FE-10 的零行为门是"逐条正则锚端点/setter/disabled 在"，只能证明"没删"、证不了"没改一字"。本组件逻辑密集（6 个异步动作 + 12 状态），故升级为**哈希硬门**：把 `return (` 之前的全部字节（换行归一、跨 CRLF/LF 稳定）取 SHA256，恒等 `cf39bcd64e0bc3abd8f3bac202a25448ea08e59dd66ae358e693eea16d996dec`。任一逻辑篡改（哪怕 `if (downloading) return;` → `if (false) return;`）立刻红——变异臂 B 实测哈希变 `718565e5…`、门精确红。另加**return 段零裸 Tailwind 门**：所有 className token 只能是 `mk-card` 或 `mi-*`，保证门面真正**替代**裸原子类而非并列堆叠（变异臂 A 塞回一个 `flex` 精确红）。

## 判据：静态 15 门 + 离线真 Chrome e2e 7 门

### 静态那一寸（`apps/web/test/marketplace-item-row-visual-style.test.ts`，15/15）

延续 ADR-0154「锚剥注释后的真实代码」：类名闭环（component 每个 `mi-*` 类有 globals.css **基础定义**、剔 reduced-motion、堵"出现过≠定义过"）、成规模视觉段（≥18）、零 hex、token 真存在、零新增颜色 token、**return 段零裸 Tailwind**、22 个 `data-*` 钩子一个不丢、**JS 段 SHA256 逐字节零行为**、交互契约零行为（5 fetch / 4 csrf / 2 confirm / 3 refresh / 12 useState / saveBlob / 枚举**含计数**、return 段 onClick/disabled/条件分支/表单绑定/文案分支）、**A11Y-2 disclosure aria 契约零回归**、交互态语言四态、reduced-motion 真关掉、徽标/按钮语气专属类、注释定界符配对。

### 浏览器那一寸（`e2e/marketplace-item-row-visual.spec.ts`，7/7，真 Chrome）

离线 `page.setContent` 注入真实产物字节（本机 3100 上游常 502，市场列表要库+会话，门面正确性只取决于真产物的结构/文案/`data-*` 与 `.mi-` CSS 在真 Chromium 下的渲染，二者与后端数据无关）：**样本锚真实产物门**、深/浅双主题三态渲染 + 三档按钮视觉分档（背景色两两不同）+ 零 console error、3 处 disabled busy 真反馈、真 `Tab` 的 focus-visible（按钮/input/select）、hover/`:active`/reduced-motion 的 A/B（纯 `emulateMedia` 触发产品真规则、零手工 `!important` 兜底）、disclosure 面板展开动画在 reduced 下真关。

## 验证

- **静态判据 15/15**；横向 11 个静态门文件 **133/133**（`style-tokens` / `forced-colors-style` / `token-usage` / `state-styles` / `profile` / `published` / `play` / `storyboard` / `not-found` + FE-10 `.mp-` + 本片）——`.mi-` 段未污染任何他段。
- **e2e 7/7**（真 Chrome，单 worker，离线 config 跑完即删不提交）。
- **工程门**：eslint 3 文件单进程 **RC=0**；`tsc -p apps/web --noEmit` **RC=0**；`tsc -p e2e --noEmit` **RC=0**（冷启动遇 SIGTERM 风险改后台长窗口 + 限堆 4096MB，拿真码；未 skip hook）。
- **未 push**。

## 变异臂：判据与产品修复的验伪（5 静态 + 1 e2e 产品修复臂，全红并恢复）

延续 ADR-0151/0154/0155，每臂备份、md5 断言变异发生、恢复核验基线（component `1416590c…` / CSS 修复态 `283943ac…` / spec `a1da2168…`），红绿只认退出码：

| 臂 | 变异 | 期望门 | 实测 |
| --- | --- | --- | --- |
| A | `mi-head` 塞回裸类 `flex` | 静态零裸 Tailwind 门红 | rc=1，报 `['flex']` |
| B | `if (downloading) return;` → `if (false) return;` | 静态 JS 段 SHA256 门红 | rc=1，哈希变 `718565e5…` |
| C | 删 `.mi-btn:disabled` 整条规则 | 静态交互态语言门红 | rc=1，正则不匹配 `:disabled` |
| D | `.mi-panel { animation: none }` → `inherit` | 静态 reduced-motion 门红 | rc=1，报 `['mi-panel']` |
| E | 拆掉 edit 的 `aria-controls` 配对 | 静态 disclosure aria 门红 | rc=1 |
| **F（产品修复臂）** | 把修好的 `:active` 组合规则**挪回 `:hover` 之前**（复现原缺陷） | e2e hover/`:active`/reduced 门红 | rc=1，poll 3s 超时 DOMMatrix.a 恒 1 |

**臂 B 是判据升级的铁证**：证明哈希门咬的是 return 前任一字节，而非几条能绕过的正则。**臂 F 是产品缺陷修复的铁证**：证明 e2e 抓的确实是"`:active` 相对 `:hover` 的 CSS 顺序"这个真实因果。

## e2e 真抓到的一个产品 CSS 缺陷（本片最有价值的交付，非判据想象）

初版 `.mi-btn:active:not(:disabled) { transform: scale(.97); }` 写在三档 `:hover` 规则**之前**。二者特异性相同（0,3,0），后写的 `.mi-btnPrimary:hover:not(:disabled)` 的 `transform: translateY(-1px)` **覆盖**了按下的 `scale(.97)`——主按钮（购买/保存/提交举报）按下时**看不到收缩反馈**。这不是静态门想象出来的，是 e2e 真鼠标 `page.mouse.down()` + `DOMMatrix.a<1` 读出来的（首跑红：a 恒 1）。

修法：把 `:active` 组合规则（`.mi-btn` + 三档）移到所有 `:hover` **之后**，让任何档位的按下都压过其自身 hover；reduced-motion 块同步逐一列出三档 active，确保 reduce 下 `transform:none` 同样胜出。臂 F 复现原缺陷证明修复与判据都有牙。**对比**：FE-10 的 `.mp-download` 恰好把 `:active` 写在 `:hover` 之后，没踩这个坑；本片按钮分档后才暴露该顺序陷阱，已记入工程常识。

## 判据自身的当场修实（诚实账本，§CRIT-1 纪律）

1. **静态 `useState` 计数假红 + 废断言**：初版 `countOccurrences(code, 'useState(')` 写死 12，但两处带泛型（`useState<string | null>` / `useState<ReportReason>`）不含 `useState(` 字面，实得 10 → 假红；且逐变量循环里 `expect(code).toContain('useState(')` 对 12 个变量断言**同一句话**＝废断言（等于没守）。修法：正则 `/useState(?:<[^(>]+>)?\(/g` 认可选泛型计 12，逐个精确锚 `const [v, setV] = useState`。
2. **e2e 样本锚门把动态假数据当静态文案 → 假红**：初版要求 SAMPLE 的标题/作者/价格数字（「潮汐组件包」「42 credits」等）逐字在组件里，但它们是 `{item.title}` / `{item.priceCredits}` 动态值，本就不该逐字锚产物。修法：只锚组件里**真实写死**的静态 UI 文案（按钮/徽标/option/hint/placeholder/message），样本的动态假数据诚实标注为编造数据、不锚。
3. **e2e `<img src="#">` 触发 `net::ERR_UNKNOWN_URL_SCHEME` → 载体缺失假红**：样本预览图用 `src="#"` 空壳，Chrome 报未知协议、零 console error 门红（非产品缺陷）。修法：换成 1×1 data URI GIF，去掉网络加载。
4. **e2e Tab 次数硬编码 + hover 验错档位**：① 写死"Tab 3 次到 input"漏算了组件里 `download` 在 `remove` 之前、实际要 5 次 → 改"循环 Tab 直到目标聚焦、最多 8 次"；② hover/`:active` 验的是幽灵按钮（`.mi-btnGhost:hover` 刻意只换配色、不设 transform），本就没有抬升 → 改验主按钮 `.mi-btnPrimary`（唯一定义 hover `translateY` 的档位），并补 `poll` 等过渡。四处全是**判据/载体问题**，生产文件一字未改（md5 恒等）。

## 诚实边界 / 仍欠

1. 本片是**纯视觉门面 + 零行为**改造（唯一例外是修了一个 `:active` CSS 顺序缺陷，属视觉交互态修复、非业务行为），业务语义、fetch、状态机一字未动。
2. e2e 用 `page.setContent` 注入**真实产物字节构造的静态样本**，验"真实门面类 + 结构钩子在真 Chrome 下的双主题渲染与交互态因果"，**不声称"真页面点开过一遍"**（市场列表要库 + 会话，本机无干净后端窗口）。样本锚真实产物门保证样本不与产物脱节，动态状态机由 JS 段 SHA256 + 契约门守。
3. `.mi-` 段**不加渐变墨字**，故未做 forced-colors 墨字回退联动验证；全局 forced-colors 不变式由既有门守。三档按钮的 `color-mix` 危险色 hover 在 forced-colors 下由 UA 强制色接管，未逐帧人工看图。
4. 真读屏器听读、hover/active 逐帧人工看图仍欠；`:active`/`:disabled`/`:focus-visible` 交互态语言已覆盖 `.mp-`（FE-10）与 `.mi-`（本片）**两个门面**，其它门面推广另立片。
5. earnings / reports 两个纯展示子页门面化顺延（FE-12/13）；未 push；真库真 Redis 全套与墙钟实测待干净窗口。

## 协作注记

开工与提交 HEAD 同一轮（`f934edb7` 我的 §FE-10），本轮无并行会话抢 web index、提交前未前移。本片纯 `apps/web/src/app/globals.css` + `marketplace/MarketplaceItemRow.tsx` + 新静态判据 + 新 e2e spec + ADR + 三处文档，与并行 `services/**` 正交。精确 stage 只列本片文件，避开 `services/**` / `pom.xml` / gitignored 归档（`.next-dev-archives/` / `test-results-mine*`）/ 临时离线 config（跑完即删、不提交）/ 临时变异脚本；共享文档只追加不 rewrite。详见 ROADMAP / CURRENT-STATE。
