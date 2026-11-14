# ADR-0153：A11Y-2 收官——拆掉 AgentPanel aria-controls 豁免，全库零豁免

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0147（A11Y-2 disclosure 契约全库收口，留 AgentPanel 一条豁免）、ADR-0151（FE-9 根 404 门面）、§A11Y-2

## 背景：一条"另立片再收"的豁免，如今已被现实证伪

ADR-0147 把全库 `aria-expanded ⇒ aria-controls 指向真实 id` 的契约收口时，给
`studio/AgentPanel.tsx` 留了**唯一一条带理由的豁免**，理由是：折叠区展开的是摘要 `<p>`
与 draft 区**两块**、**没有单一受控面板与 id**，是常驻内联展开非浮层，强加要重构包裹容器、
超出"零行为变化"边界；并写明"若要收口，先给 step 详情一个真实 id（另立片）"。

FE-9 交付后按长期授权自主选下一片，读码逐条核对这条理由，**已不成立**：

- `AgentPanel.tsx:378` 的 `<p data-agent-step-summary>` **常驻渲染**，不随 `open` 折叠；
- `AgentPanel.tsx:381-409` 的 draft 区由 `step.draft` 控制，也**不受 `open` 控制**；
- 真正随 `open` 展开/收起的只有**唯一一块** `AgentPanel.tsx:410-427` 的条件渲染面板
  （counts / notes / handedOff / because）；
- `StepRow` 已自带天然单一键 `step.id`（`:370 data-agent-step`、`:378 data-agent-step-summary`）。

即 `open` 只控制一个边界清晰、条件渲染的**单一受控面板**，且单一 id 现成。旧豁免前提
（"两块 / 无单一受控面板 / 无 id"）被证伪，收口不需要动结构、不需要改行为。

## 决策

### 1. 零行为收口：只加两个静态属性

- `AgentPanel.tsx:410` 的详情面板 `<div>` 加 `id={` + '`agent-step-detail-${step.id}`' + '}`；
- `AgentPanel.tsx:371` 的触发键 `<button aria-expanded={open}>` 加
  `aria-controls={open ? `agent-step-detail-${step.id}` : undefined}`——**条件式**，因面板是
  `{open ? … : null}` 条件渲染、收起时不挂载，收起态不留悬空引用（HealthPanel:148 纪律）。

**不动** `open` 状态机（`:368`）、不动任何渲染分支、数据流、`data-agent-*` 钩子、onClick、文案。
仍守 ADR-0147 的诚实边界：本契约只守"声明关系真实"，**不承诺** Escape 关闭 / 焦点回退 /
焦点陷阱（属浮层交互收口、会改行为）。

### 2. 测试同步：清豁免，但保留豁免机制与自卫门

- `disclosure-controls.test.ts` 的 `EXEMPTIONS` **清空为 `[]`**，注释改为"曾有一条、经 ADR-0153
  证伪后收口"，下界门 `:250` 仍 ≥12（计的是 13 颗触发键总数，不是违规数，不动）；
- 新增**零豁免门**：断言 `EXEMPTIONS` 为空——防将来有人为图省事静默塞豁免把全库合规读成带病；
- **豁免机制本身保留**：`:262-270`"每条豁免须有理由 + 文件存在 + 真命中一处违规"的自卫门
  仍遍历空数组正常通过，将来真有无法收口的浮层才准带理由加回来，不许静默塞。

### 3. 不依赖改 e2e（已有同款范式覆盖）

`e2e/disclosure-controls.spec.ts` 的 `COMPONENTS` 硬编码 4 个组件、不含 AgentPanel，且
`HistoryPanel`（`:31`）已覆盖"条件式 + 模板插值 id"范式（验电⑩），与我新增写法同款。
拆豁免不需要改 e2e；可选把 AgentPanel 加进 COMPONENTS 属锦上添花，但 e2e 需真服务/502，
不纳入本片离线可判范围。

## 验证

- **先红**：清豁免但组件未补属性 → 255 门精确报 `AgentPanel.tsx:371 aria-expanded 无 aria-controls`
  （4 绿 1 红），证明门确实在守这唯一一处裸触发键、收口不是走过场。
- **转绿**：补两个静态属性 → **5/5**（4 原门 + 1 新增零豁免门）。
- **判据自身修实一次**：新增零豁免门初版误用 `unexempt.length > 0`（`unexempt` 是"有违规的
  文件"，全合规本就为空）而假红；改为只钉"零豁免"，"扫全"与"合规"分别交给 250 门
  （`triggerTotal≥12`）与 255 门。延续 FE-9 `code` 纪律：**断言必须锚对真实不变量，不能拿
  合规态的本应为空去冒充"扫到了东西"**。
- **三变异臂全红**（逐条当场备份 + md5 断言变异发生 + 恢复后 md5 对齐基线、只认退出码）：
  - A 静默塞回一条无真违规豁免 → **零豁免门 + 豁免自卫门双红**（既不能放水、机制也仍活）；
  - B 删组件 `aria-controls` 但豁免已清 → **合规门红**（证明收官靠真修、不靠删豁免放水）；
  - C `aria-controls` 指向错的 id 族（悬空引用）→ **合规门红**（前缀 token 匹配有牙，非随便抓标识符）。
  - 恢复 md5 `3c36bbda…` 全对齐，终态 5/5 绿。
- **横向零回归**：`disclosure-controls` + `control-names` + `style-tokens` 共 **32/32**。
- **工程门**：eslint 两文件各 RC=0（AgentPanel 首跑 200s 超时属资源抢占、不算绿不算红，
  加长 380s 拿真码 0）；`tsc -p apps/web --noEmit` RC=0（4096MB 限堆 + 420s）。

## 诚实边界 / 仍欠

- 真浏览器 e2e（A/B 验 `aria-controls` 解析到真实面板）本次**未重跑**——它的 4 个组件样本
  本就覆盖同款范式、且不依赖 AgentPanel；AgentPanel 的新增配对由静态门 + 三变异臂守，
  未声称"在真页面点开过 AgentPanel"。
- 豁免机制保留但当前为空；自卫门保证将来任何豁免都必须带理由且真命中违规。
- 未 push（长期纪律）；真读屏器听读仍欠（A11Y 跨片长期边界）。

## 协作

开工 HEAD `a9e3d6ad`（并行会话 §SC-68b/SC-70 已前移），本片纯 `apps/web/src/studio/
AgentPanel.tsx` + `apps/web/test/disclosure-controls.test.ts` + ADR + 三处文档，与并行的
`services/**`（java/config/actuator）完全正交，工作树无其实时编辑残留。ADR 编号 0152 已被
并行会话 `actuator-honesty-network` 占用，本片顺延 **0153**。精确 stage 只列本片文件，
避开 `services/**` 与 `.next-dev-archives/`/`test-results-mine*/` 等 gitignored 产物；
文档只追加不 rewrite。
