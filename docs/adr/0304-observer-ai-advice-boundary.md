# ADR 0304 · 观察站 AI 清单：把服务端调用放回服务端，并给数字标出处

- 日期：2026-11-22
- 状态：已采纳
- 相关：ADR 0262（没报 ≠ 0）、§MOD-1（quote 逐字校验）、§ADMIN-13、§ADMIN-LLM-2

## 背景

`/admin/observe` 的「深度优化建议」区同时挂了两块 AI：

1. `ObserverDeepRead`：走 `/api/admin/observer/digest`，服务端算指标、服务端调模型、缺数字 502；
2. `ObserverAiAdvice`：结构化清单（priority / basis / impact / action），**由 client 组件直接
   `import { generateAiAdvice }`**。

第二块有三个问题，都是"看起来能用、其实没兑现"：

- **调用边界错了**：`generateAiAdvice` 里是 `chatWithCharacter`（server-only，读
  `NEXUS_AI_SERVICE_URL` 与 provider 凭据）。浏览器里这两样都没有，按钮点下去只会在
  client 侧抛异常——组件的 `catch` 把它显示成一行错误，页面看起来"有反应"，实际一次
  真调用都没发生。真机点击读数为 `items=[]`、`pageerror=[]`——错误被组件自己吞了。
- **样式不存在**：组件用了 `obs-aiAdvice` / `obs-aiAdviceKicker` / `obs-aiAdviceModel` /
  `obs-aiAdviceItem` / `obs-aiAdvicePriority` 五个类名，`globals.css` 里**一个都没定义**。
  整块是裸渲染的默认按钮与默认字体。
- **数字没有核对**：提示词写了"数字必须来自上述聚合值，不得编造"，但那只是请求，不是门。
  模型在 `basis`/`impact` 里写一个快照里从未出现的数，读者无从分辨。

## 决定

1. **服务端出口**：新增 `POST /api/admin/observer/advice`，与 DeepRead 同纪律——
   口令 123 / role=admin 才可进；DEMO MODE 409；每 IP 5 次/小时；指标由服务器
   `readObserverMetrics()` 现算。请求体只有 `locale`，页面不再把 `metrics` 当 props 传给 client。
2. **数字出处核对**：新增纯函数 `aiAdviceAudit.ts`。把**逐字喂给模型的那份 brief** 作为允许集，
   对每条建议的 `basis + impact` 抽数字比对；不在快照里的数字**不删、不改写**，只加一行
   可见标注「未在快照原文出现（可能是模型推算）」。千分位与百分号归一（`1,358` = `1358`，
   `20%` = `20`），避免把同一个数当成两个。
3. **门面样式**：补 `.obs-aiAdvice*` 全部类名（token 化、forced-colors、focus-visible），
   按钮有明确的 enabled/disabled 态。

## 后果

- 真机（gpt-6.2-sol，真 provider）：点击后返回 4 条结构化建议，其中 1 条被标注了一个
  快照里不存在的推算数字（`0.08%`）；`pageerror` 为 0。样式读数：`display:grid`、
  `padding:16px`、按钮背景为 accent 色——不再是裸按钮。
- 判据 13 条：数字归一/编造标注/去重保序/无数字不噪音 + 源码级边界（client 不得出现
  `generateAiAdvice(`、route 必须有门/限流/现算、页面不得传 `metrics`）+ 类名必须有样式。
- **诚实边界**：核对的是"这个数字有没有在快照里逐字出现"，不是"这个数对不对"。
  模型基于快照做的除法/外推（如占比、增长率）会被标注为"可能是推算"——这正是我们要的
  语义：它可能是对的，但它不是实测原文，读者有权知道差别。
