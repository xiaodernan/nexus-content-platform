# ADR-0147：disclosure 契约全库收口——每个 aria-expanded 都指向一个真实 id

- 状态：已采纳（2026-11-11 深夜 ~ 2026-11-12 跨零点，§A11Y-2，承接 §A11Y-1 / ADR-0146、§85 / HealthPanel、ADR-0123）
- 关联：`apps/web/test/disclosure-controls.test.ts`（本片新增，全库静态不变式）、
  `e2e/disclosure-controls.spec.ts` + `e2e/disclosure-controls.config.ts`（本片新增，离线真浏览器因果）、
  `apps/web/src/studio/use-popover-dismiss.ts`（平台既有浮层收口标准，本片不碰）、
  `apps/web/src/studio/HealthPanel.tsx:146`（同款契约的既有先例）
- 触发（user 长期点名）：**前端美观/魅力登峰造极 + 前后端协同**里被忽略的一寸——可访问性 / 键盘与读屏可达。

## 背景：一个被平台自己承认过、却没推广到全库的契约分裂

§85 时代，`HealthPanel:146` 就留下过一段明确的先例注释：展开键原来只有 `aria-expanded`、没有 `aria-controls`，
"读屏用户听到'已折叠/已展开'，却不知道它管的是哪一块"；并立下两条纪律——**id 只在面板真渲染时存在、
收起时不留指向不存在 id 的引用**；"说得出可展开却永远展不开的键是给读屏用户的假控件（§159）"。
此后 `PublishPanel` / `ExportPanel` 用 `usePopoverDismiss` + `aria-controls={open ? PANEL_ID : undefined}`
与 `id={PANEL_ID}` 共用常量的范式把顶栏浮层收口；`SearchBox`、`StudioShell` 也各自配了。
**但全库仍有一批 disclosure 触发键只写了 `aria-expanded`、缺 `aria-controls`**，平台内部两种写法长期并存。

本片读码坐实 6 处待补（都有条件渲染的受控面板、稳定 `data-*` 钩子，纯语义可补、零行为变化）：

| 触发键 | 受控面板 | 状态 | id 方案 |
|---|---|---|---|
| `MarketplaceItemRow:211` 改价 | `:260` edit-panel | `editing` | `marketplace-edit-${item.id}` |
| `MarketplaceItemRow:232` 举报 | `:296` report-panel | `reportOpen` | `marketplace-report-${item.id}` |
| `WorldWalk:606` 对话 | `:612` talk | `talkOpen` | `world-talk`（单例） |
| `HistoryPanel:271` 快照比较 | `:298` diff-list | `comparing` | `snapshot-diff-${snapshot.id}` |
| `HistoryPanel:383` 历史明细 | `:391` diff-list | `open===entry.id` | `history-diff-${entry.id}` |
| `StoryboardPanel:847` 改来源 | `:884` source-editor | `sourceEditing` | `storyboard-source-editor`（单例） |

**为什么值得做**：`aria-controls` 拼错/指向不存在的 id 会**静默失效**——读屏用户听到"已展开"却找不到它管哪块，
比没写更坏（声明了关系但是假的）。而浏览器 axe 结构上扫不到：这些面板全是条件渲染（展开才挂载），
收起态 DOM 里根本没有它，展开态又得真去点每一处（市场改价/举报、3D 对话、快照比较、历史明细、分镜改来源），
后端与交互前置一大堆。故按 JSX 字面写法做全库静态门（同 `control-names.test.ts` 的纪律）。

## 决定

**硬契约（本片守的）**：每个 `aria-expanded` 触发键必须用 `aria-controls` 指向**同一文件里真实存在的** `id=` 定义；
条件式 `{open ? id : undefined}` 认（面板 id 只在展开态存在，收起不留悬空引用，与 HealthPanel:148 同纪律）。
6 处补齐只加 `id=` / `aria-controls=` / 2 个 id 常量 + 1 条注释——**零交互逻辑/状态/文案/`data-*` 钩子变化**，
逐文件 diff 审计确认。id 对列表多行实例用 `item.id`/`snapshot.id`/`entry.id` 派生，互不串味。

**显式豁免清单（带理由，不许静默塞）**：
- `studio/AgentPanel.tsx`：折叠区展开的是 `<p data-agent-step-summary>` 与 draft 区**两块**，
  无单一受控面板、无明确单一 id；常驻内联展开、非浮层/disclosure 弹层。强加得先重构成包裹容器、动结构，
  超出"零行为变化"边界。正确收口是先给 step 详情一个真实 id（另立片），而非硬塞。
- `StudioShell:362/390` 两颗本就带 `aria-controls="nexus-inspector"` 指向 `:382` 真实 id，是合规范式，正常放行、不豁免。

**不在本片（诚实边界）**：**Escape 关闭 / Tab 离开 / 焦点回退**一概不强制——那些是浮层交互收口、会改行为，
且平台自己 `use-popover-dismiss.ts:15-18` 对轻量 disclosure 明说"不承诺焦点陷阱"（那要 `aria-modal` + 背景
`inert` 一整套）。本片只守"声明关系真实"这条站得住的硬契约，不伪装成 WCAG 焦点陷阱硬门。

## 判据（静态那一寸，纯内存、零浏览器/零真库/零时钟）

`disclosure-controls.test.ts` **4 门**，关键设计是**动态发现**而非硬编码 6 处：扫全库 `.tsx` 的每个
`aria-expanded` 触发键，要求每个都有 `aria-controls` 指向同文件真实 id。这样将来任何人新增一个只写
`aria-expanded` 的触发键，判据自动抓到——守的是"所有 disclosure 声明都必须有真实受控对象"这条**不变式**。

**解析纪律（首跑先红逼出来的真严谨性，逐条固化进验电）**：
1. **先剔除注释**（行注释/斜杠星号块注释/JSDoc/JSX 花括号注释），等长空白替换、保留换行不漂行号，
   并保护字符串字面量（`'http://…'` 的 `//` 不能误吃后续代码）——`HealthPanel:146/150` 的注释正文里
   就写着 `aria-expanded` 字样、正在讲"原来没有 aria-controls"，不剔就是假红；
2. **只从真正的 JSX 开标签内**定位 `aria-expanded`（开标签跨 `{}`/字符串取完整，`onClick={() => set(x > 0)}`
   里的 `>` 不截断）；纯字符串/注释字样不算触发键；
3. **属性取值按花括号深度配平**，不靠正则猜——`aria-controls={flag ? `x-${id}` : undefined}` 的模板插值
   `${…}` 会让 `\{([^{}]*)\}` 正则提前截断/匹配失败；
4. **id token 共用一套口径**：字面量整串、模板静态前缀（含插值取 `${` 前）、裸标识符都归一，
   `id=` 定义与 `aria-controls` 引用用同一提取器比对；`data-id=`/`paymentId=` 用 `(?<![\w-])` 排除，
   防悬空引用撞上某个 `data-*` 值而假绿；
5. **豁免清单自卫**：每条必须带理由、文件真实存在、**且真的命中一处被扫到的违规**——
   首跑踩过"豁免路径写相对 SRC、scanAll 用相对项目根，豁免静默失效"的坑，此门专钉。

**先红 → 转绿**：补齐前 1 门红、精准命中 6 处待补；补齐后 **4/4**。
**四变异臂全部干净有牙**（逐条当场备份 + md5 断言变异真发生 + `trap EXIT` 恢复 + 恢复后核验）：
- 臂 A：删 `MarketplaceItemRow` 一处 `aria-controls` → "无 aria-controls" 门红；
- 臂 B：把 `WorldWalk` 的 `aria-controls` 指向改成不存在的 `world-talk-TYPO` → "指向不存在的 id" 门红（悬空门有牙）；
- 臂 C：把豁免理由删短 → 豁免自卫门红；
- 臂 D：把豁免路径写回错的相对路径 → 豁免存在性门红（专钉首跑那个静默失效 bug）。

## 真浏览器那一寸（离线 A/B 因果，`1 passed`）

`e2e/disclosure-controls.spec.ts` + 专用 `e2e/disclosure-controls.config.ts`：
- **刻意离线**：`page.setContent`，不访问 URL、不依赖后端，专用 config **不配 `webServer`**
  （主 config 探活在本机后端 502 时会等满 180s，A11Y-1 / FE-7 同款坑）。真 Chrome、单 worker。
- **诚实边界**：注入的最小 DOM 是复刻的（真组件渲染要 Next dev + 后端，本机 502 无干净窗口），
  但**每对 aria/id token 都从 4 个真组件源码读出**（6 个 token，预检断言 ≥6），不是凭空捏的；
  验的是 Chromium 原生 ARIA reflection（`Element.ariaControlsElements`，缺则退回 `getElementById`）对三态的
  可区分因果：① 正向：aria-controls 指向存在 id ⇒ 解析到那个面板元素（count=1、dataset 命中）；
  ② 对照臂：指向 typo id ⇒ 解析为空（证明门非空、能区分假关系）；③ 收起态：无 aria-controls + 面板未挂载
  ⇒ 无悬空引用。**不宣称**"真组件在真页面逐一点开过"，那属真库/真浏览器集成、列仍欠、不编。
- 结果：真 Chrome **`1 passed`（14.7s / 复跑 15.4s，非 skip）**。

## 验证（诚实分层）

- 静态 `disclosure-controls` **4/4**；四变异臂全红并 trap 恢复；
- **a11y 静态门横向 14/14**：本片 4 + `control-names` 3 + `keyboard-guards` 7，既有门零回归；
- **全量静态横向 47/47**：上三者 + `style-tokens` 24 + `forced-colors-style` 9，零串味；
- 工程门：`eslint`（判据 + 5 组件）**EXIT=0**、`tsc -p apps/web` **EXIT=0**、`tsc -p e2e` **EXIT=0**；
  **tsc 抓出真类型错**（e2e fallback 的 `.filter((x): x is Element)` 谓词类型不匹配，改 `HTMLElement`）——
  vitest/e2e 跑绿 ≠ 类型对，工程门必跑（PERF-3 同款教训）；
- 相关组件有真库集成测（marketplace-* / storyboard-* / world 等），本机多 agent 抢同一 Postgres 无干净窗口，
  **未硬跑、不编绿灯**——本片是纯 DOM 语义属性改动、不动读路径/交互，静态门 + 类型门已覆盖其判据面。

## 诚实边界

- **不夸大缺陷**：这是"声明关系真实"的语义收口，不是"修了键盘用户点不开的弹层"——Escape/焦点收口属
  `use-popover-dismiss` 的既有职责（且仅顶栏浮层有），本片没动、也不声称覆盖；
- **AgentPanel 折叠区豁免**是明确的已知边界（两块内容无单一受控 id），不是漏网；收口它要先做结构改造，另立片；
- 跨 UA/读屏器实测：验的是 Chromium 原生 ARIA reflection + 静态契约，未在 NVDA/VoiceOver 等真读屏器逐处听读；
- 真库/真 Redis 套件本机无干净窗口，未硬跑、不编绿灯；未 push。

## 协作边界

开工 HEAD 为 A11Y-1 的 `4a2aac88`；验证期间并行会话先后提交 SC-64b（`26319e97`）与 SC-65（`cb2e580c`），
HEAD 前移，但其改动（java/config/smoke）与本片 apps/web 组件 + 判据**完全正交**，且会话已自行提交、
工作树无其实时编辑残留。本片只碰 4 个组件 + 2 个 e2e 文件 + 1 个静态判据 + 本 ADR +
ROADMAP/CURRENT-STATE/memory 增量登记。精确 stage 避开 `.next-dev-archives/`（本片归档陈旧 test-results 的
零删除 mv 落点）、`test-results-mine*/`、`.git/a11y2-arm*.bak`、`.git/diag-a11y2*.mjs`、`.git/*COMMIT_MSG.txt`。
ADR 编号查重：0146 被 A11Y-1 占用，本片用 **0147**。文档基准取自最新 HEAD，只追加不 rewrite。

## 仍欠

- 给 `AgentPanel` step 详情一个真实 id、拆除豁免（需小范围结构改造，另立片）；
- 顶栏浮层之外若将来要求 Escape/Tab 收口，沿用 `use-popover-dismiss` 范式逐处补（属交互改动，另立片）；
- 真读屏器（NVDA/VoiceOver）逐处听读、真组件在真页面的集成 e2e：待干净窗口，不承诺；
- 墙钟/性能指标与本片无关（纯语义属性），不承诺。
