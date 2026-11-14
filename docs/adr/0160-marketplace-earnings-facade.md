# ADR-0160：创作者收入页 `.me-` 门面化 + 伪元素动画判据假绿修实（FE-12 三兄弟第二片）

- 日期：2026-11-12
- 状态：Accepted
- 关联：ADR-0158（FE-10 `.mp-` 模板片）、ADR-0159（FE-11 `.mi-` 交互原子 + JS 段 SHA256 硬门）、ADR-0154（静态门锚真实代码、变异臂是判据的验伪器）、§CRIT-1（声称覆盖纪律）、ADR-0123（六红线零新增颜色 token）、ADR-0146（A11Y-1 forced-colors）

## 背景 / 缺口

FE-2 只给市场**列表外壳**上了 `.mk-`，FE-10 给三兄弟之一的 purchases 上了 `.mp-` 门面，但顶栏送 logged-in 用户进的**三兄弟**（purchases / earnings / reports）里，earnings `apps/web/src/app/marketplace/earnings/page.tsx` 仍是**全裸 Tailwind 原子类**——loading / error / empty / data 四态 + 汇总卡（累计收入 / 总销量）+ 每日明细表格，全无门面语言。这是 ADR-0158/0159 反复记的"三兄弟欠账"的第二个，也是 FE-10 `.mp-` 模板片最稳的复用（同为 client 组件、同为四态）。

先量再治：`marketplace-earnings.integration.test.ts` 是 API/domain 层测试（导 `GET /api/marketplace/earnings` route + `getCreatorEarnings` 域函数、直连 DB），**不渲染页面组件**，改 className 零影响；`.mk-`/`.mp-`/`.mi-` 段已存在，本片新增 `.me-` 段与它们正交、不碰共享约定。

## 决策：只动视觉、零行为；哈希锚点适配"多个提前 return"

### 生产改造（2 文件）

1. `apps/web/src/app/marketplace/earnings/page.tsx`：只换 className（裸 Tailwind → 21 个 `.me-` 语义类）。四态 `me-loading/error/empty/root`、结构 `me-title/summary/summaryGrid/stat/statLabel/statValue/statValueAccent`、表格 `me-section/sectionTitle/table/tr/th/thRight/td/tdRight/tdAccent`、空明细 `me-emptyDetail`。
2. `apps/web/src/app/globals.css`：新增 `§FE-12 / ADR-0160` 的 `.me-` 视觉段（插在 FE-11 `.mi-` 段**前方**，故 FE-11 的 `miSegment` 从第一个 `.mi-` 起不含 `.me-`、本片 `meSegment` 从第一个 `.me-` 到第一个 `.mi-` 之前，互不污染），全锚既有 `--nexus-*` token + `color-mix`，**零写死 hex、零新增颜色 token、双主题**。汇总卡 token 化 hover、表格行 hover 高亮、四态视觉分档、loading 呼吸点 + fade-in，`prefers-reduced-motion` 真收口。纯色标题、不加渐变墨字，不触发 A11Y-1 联动。

**零行为铁律**：`useEffect`、fetch 端点 `/api/marketplace/earnings`、401→`router.push('/login')`、依赖 `[router]`、**3 个 useState**（含两处带泛型）、3 个提前 return 分支、两个 `data-earnings-*` 钩子、`summary.totalEarned/totalSales/dailyBreakdown.map` 与 `day.date/salesCount/totalAmount` 插值——**一字不动**，只换 className。

### 哈希锚点适配"多个提前 return"（相对 FE-11 的一处工程适配）

FE-11 的 `MarketplaceItemRow` 只有一个末尾 `return (`，哈希锚"文件头到 `return (` 之前"即可钉死全部 JS。earnings 却有 **3 个提前 `return <div>`**（loading/error/empty）+ 末尾主 `return (`，且这 3 个提前 return 的 JSX **带 className**（要被换皮），不能纳入哈希。故本片哈希锚取**文件头到第一个 `if (loading)` 之前**（1151 字节、`677abf1341e37de986b0e91d817f4d4398051ea26092df14ac0e6728b7128bba`）——这段含 imports + 两个 interface + 组件签名 + `useRouter` + 3 useState + 完整 useEffect（fetch / 401 跳转 / setter），**绝不含 className**；4 个分支判断、data-* 钩子、插值由"状态机/交互契约零行为门"逐条锚守。双重保险，臂 B（改 fetch 端点）与臂 E（删 401 块）分别证明两道门都有牙。

## 判据：静态 12 门 + 离线真 Chrome e2e 5 门

### 静态那一寸（`apps/web/test/marketplace-earnings-visual-style.test.ts`，12/12）

延续 ADR-0154 / FE-11 骨架：类名闭环（每个 `me-*` 有 globals.css **基础定义**、剔 reduced-motion）、成规模视觉段（≥16）、零 hex、token 真存在、零新增颜色 token、**page 零裸 Tailwind**、两个 `data-earnings-*` 钩子、**JS 逻辑段 SHA256 逐字节零行为**、状态机/交互契约零行为（fetch / 401 / useEffect 依赖 / 3 useState 含泛型 / 3 分支 / 全部插值，**含计数**）、四态各有专属 `.me-` 类 + `me-root`、reduced-motion 真关掉（含**伪元素**）、注释定界符配对。

**诚实删门**：earnings 是**纯展示页**（无按钮/链接/输入），故**不设 `:focus-visible` 交互态门**——该门只在有键盘交互控件的门面（FE-10 `.mp-` / FE-11 `.mi-`）成立；JSDoc 明确写出为何不成立，不硬凑门数。eslint 当场抓到配套 `meRules`/`meRuleLines` 辅助函数成了死代码（初版为交互态门准备、删门后忘清），已删除。

### 浏览器那一寸（`e2e/marketplace-earnings-visual.spec.ts`，5/5，真 Chrome）

离线 `page.setContent` 注入真实产物字节（本机 3100 上游常 502，earnings 要库 + 会话 + 销售数据）：**样本锚真实产物门**（**内置 FE-11 教训**：只锚组件真实写死的静态文案，`{summary.totalEarned}` 等动态假数据不锚产物）、双主题四态渲染 + 表格三行 + 零 console error、四态视觉分档、reduced-motion 下 `fade-in` 与**伪元素 `me-pulse`** 都被产品块真关（纯 `emulateMedia`、零手工 `!important` 兜底）。

## 验证

- **静态判据 12/12**；横向 12 个静态门文件 **145/145**（含 FE-10 `.mp-` / FE-11 `.mi-` / `style-tokens` / `forced-colors-style` 等）——`.me-` 段未污染任何他段。
- **e2e 5/5**（真 Chrome，单 worker，离线 config 跑完即删不提交）。
- **工程门**：eslint 3 文件单进程 **RC=0**（首跑抓到一处 `meRuleLines` 未用死代码、删后复验 0）；`tsc -p apps/web --noEmit` **RC=0**；`tsc -p e2e --noEmit` **RC=0**（后台长窗口 + 限堆 4096MB 拿真码，未 skip hook）。
- **未 push**。

## 变异臂：判据与产品规则的验伪（5 静态 + 1 e2e，全红并恢复）

延续 ADR-0151/0154/0155，每臂备份、md5 断言变异发生、恢复核验基线（component `3bdc2655…` / CSS `a48cf92d…`），红绿只认退出码：

| 臂 | 变异 | 期望门 | 实测 |
| --- | --- | --- | --- |
| A | `me-root` 塞回裸类 `p-6` | 静态零裸 Tailwind 门红 | rc=1，报 `['p-6']` |
| B | fetch 端点 `earnings` → `earnings-v2` | 静态 JS 逻辑段哈希门红 | rc=1，哈希变 `4becde2c…` |
| C | 删 `.me-loading::before { animation: none }` | 静态 reduced-motion 门红 | **首跑假绿 rc=0 → 修实后 rc=1，报 `['me-loading::before']`**（见下） |
| D | error 态 `me-error` → `me-loading` | 静态四态专属类门红 | rc=1，报"缺 me-error* 类" |
| E | 删 401 跳转块 | 静态契约零行为门红 | rc=1，报"401 未登录跳登录页契约丢了" |
| **F（e2e 伪元素臂）** | 删 `.me-loading::before { animation: none }` | e2e reduced 门红 | rc=1，真计算样式 `getComputedStyle(el,'::before').animationName` 收 `me-pulse` 而非 `none` |

**臂 C 是本片最有价值的一击**：它当场抓出一处**判据自身的假绿**（见下修实①）。臂 C（修实后）与臂 F 从"静态选择器解析"和"真 Chrome 计算样式"两个角度共同钉死伪元素动画槽的关闭。

## 判据自身的当场修实（诚实账本，§CRIT-1 纪律）

1. **伪元素动画与基础类按类名归并 → 变异臂 C 假绿（本片最重要教训）**：初版 `meNames` 用 `base(sel)` 剥掉 `:before` 后缀，把 `.me-loading::before { animation: me-pulse }` 与 `.me-loading { animation: me-fade-in }` **归成同一个 key `me-loading`**；于是 reduced 块里关基础类的那条 `.me-loading { animation: none }` 被误当成"也关了伪元素"，删掉 `.me-loading::before { animation: none }` 后门**仍全绿**（臂 C 首跑 rc=0）——这是"声称覆盖"的口子：判据在说"伪元素 pulse 被关掉"时，其实验的是基础类的 fade-in。修法：`meNames` **保留 `::before`/`::after` 作独立 key**（`me-loading::before`），与基础类分别核对各自的 `animation:none`；修实后臂 C 精确红、报出 `me-loading::before`。这与 FE-10 把 `animation` 单列（别混进 transition/transform）是同类"动画槽粒度"问题的更深一层（伪元素 vs 基础类同名）。e2e 臂 F 再用真计算样式独立验一遍产品规则。
2. **`useState` 计数假红 + 泛型**：初版 `countOccurrences(code,'useState(')` 写死 3，但两处带泛型（`useState<CreatorEarningsSummary | null>` / `useState<string | null>`）不含 `useState(` 字面、实得 1 → 假红（与 FE-11 同类、本片初版又踩）。修法：正则 `/useState(?:<[^(>]+>)?\(/g` 认可选泛型计 3，逐个精确锚 `const [v, setV] = useState`。
3. **纯展示页强设交互态门会假红 + eslint 死代码**：初版 JSDoc 列了"交互链接 `:focus-visible` 门"，但 earnings 无任何按钮/链接/输入，该门本就不成立；诚实删门后，配套的 `meRules`/`meRuleLines` 辅助函数成未用死代码，eslint 抓到（`@typescript-eslint/no-unused-vars`）。修法：删门 + 删死代码，JSDoc 明确写出"纯展示页不设该门、门面收益在四态与表格层次"的理由，不为凑门数留假门或假绿。
4. **e2e 内置 FE-11 的样本锚教训**：样本金额/销量/日期是编造假数据（`{summary.*}` 动态值），初版若照 FE-10 骨架逐字锚产物必假红；本片从设计起就只锚组件真实写死的**静态 UI 文案**（四态/表头/汇总标签/空态提示），动态假数据明确不锚——把 FE-11 的修实前置为设计规范。

## 诚实边界 / 仍欠

1. 本片是**纯视觉门面 + 零行为**改造，状态机、fetch、401 跳转、插值一字未动，收益在前端门面完整度与四态/表格视觉层次。
2. e2e 用 `page.setContent` 注入**真实产物字节构造的静态样本**，验"真实门面类 + 结构钩子在真 Chrome 下的双主题渲染与四态因果"，**不声称"真页面点开过一遍"**（earnings 要库 + 会话 + 销售数据，本机无干净后端窗口）。样本锚门保证样本不与产物脱节，动态状态机由 JS 逻辑段 SHA256 + 契约门守。
3. `.me-` 段**不加渐变墨字**，故未做 forced-colors 墨字回退联动验证；全局 forced-colors 不变式由既有门守。表格行 hover 高亮用 `color-mix`，forced-colors 下由 UA 强制色接管，未逐帧人工看图。
4. 真读屏器听读、四态逐帧人工看图仍欠；`:active`/`:disabled`/`:focus-visible` 交互态语言只覆盖有交互控件的门面（`.mp-` FE-10 / `.mi-` FE-11），纯展示页不设。
5. **reports**（三兄弟第三个，server 组件 + 数据驱动 `STATUS_LABELS` 状态色映射）留 FE-13；analytics（裸 Tailwind 密度 86）/ credits（56）等为后继储备；未 push；真库真 Redis 全套与墙钟实测待干净窗口。

## 协作注记

开工与提交 HEAD 同一轮（`1bda53be` 我的 §FE-11），本轮无并行会话抢 web index、提交前未前移。本片纯 `apps/web/src/app/globals.css` + `marketplace/earnings/page.tsx` + 新静态判据 + 新 e2e spec + ADR + 三处文档，与并行 `services/**` 正交。精确 stage 只列本片文件，避开 `services/**` / `pom.xml` / gitignored 归档（`.next-dev-archives/` / `test-results-mine*`）/ 临时离线 config（跑完即删、不提交）/ 临时变异脚本；共享文档只追加不 rewrite。详见 ROADMAP / CURRENT-STATE。
