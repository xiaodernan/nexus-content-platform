# ADR-0270：本仓 StateGraph 语义与 LangGraph 对齐表（§23·§25）

## 状态

已实现并通过单测（agents/runtime，11/11）。

## 背景

用户指令（长期指令）：「最好别忘了给项目加入 stategraph 的知识 内容」。本仓是 TS monorepo，LangChain/LangGraph（Python）的形状是 `BaseGraph` + `Runnable` + channel schema + pub/sub checkpointer。把 Python runtime 搬进来不是「加入知识」，是搬运依赖。

这个 ADR 记录：**我们把 LangGraph StateGraph 的核心语义逐条翻成 TS**，明确对齐口/偏差，让 `agents/runtime` 的调用方真正拥有「图、检查点、自环、递归上限」四个概念，而不是只看到 pipeline 把它们压平了。

## 对齐表

| LangGraph 概念 | 本仓实现 | 偏差/出处 |
|---|---|---|
| `StateGraph` + compiled graph | `new StateGraph<S>().addNode(...).addEdge(...).addConditionalEdges(...).compile()` | 无偏差 |
| `START` / `END` 哨兵 | 字符串常量 `START = '__start__'` / `END = '__end__'` | LangGraph 用相同字符串；本仓显式导出 |
| 通道 channel reducer | `addReducer<K extends keyof S>(key, reducer)`；默认 `lastValue` | LangGraph 的默认 channel（last value）同口径；本仓用 reducer 对象而非 schema 类 |
| `BinaryOperatorAggregate` | `binaryOp(fn)`（如 `(a,b)=>a+b`） | 与 LangGraph 同义 |
| `operator.add` / `Send` | `appendSeq<T>()` 或自定义 `binaryOp` | 不引入 `langgraph` 的 `Send`（本仓不做动态 fan-out API），用数组条件边表达 |
| BSP super-step | 每 super-step 内 `Promise.all` 激活节点、合并提交、再启动下一步 | 与 LangGraph 的 Pregel 模型一致 |
| `recursion_limit` | `recursionLimit`（默认 25），超限抛 `StateGraphRecursionError` | LangGraph 同名参数；LangGraph 抛 `GraphRecursionError`。
  本仓同名语义、换名字不弄虚作假 |
| checkpointer（每个超步落盘） | `onStep?: (state, stepIndex, active) => void` | 不做分布式 checkpointer（无冲突需求）；本就定位于「任务中断/审计缝」+ `/tasks` 联动 |
| `interrupt()` | 由 `onStep` + `throw` 组合表达 | 同源：throw 即终止，rollback 由调用方决定 |
| `interrupt`-resume、time-travel | **不实现**——无真实需求，记录为 Non-goal | 不要因为「LangGraph 有」就补 |
| graph visualization | `compile().mermaid()` 生成 `graph TD` 文本 | LangGraph `drawMermaid` 的等价物；不依赖 mermaid runtime（只产文本） |

## 设计选择

- **TS-only、ESM-first**（`apps/ai-service` 是 Python，但本仓 agent-runtime 是 TS；跨进程 handoff 协议在 `packages/schemas`，到引入真 provider 时照它走）。
- **lastValue 默认**：节点输出未写 reducer 的 key 时取后写覆盖先写（LangGraph 行为）；reducer 缺失不静默吞。
- **fan-out 交给边系统**：START→多个节点、或者条件边返回字符串数组 —— 就是 fan-out，不需要额外 API。
- **检查点最小缝**：`onStep` 在 super-step **提交之后**触发；若节点抛错，不会产生半成品状态（状态是不可变快照）——但也不会有「step 开始前的检查点」，那是语义，不歧义。
- **递归上限 = 报错而不是静默返回**（§159：返回半成品比不返回更坏）。

## 后果

- `agents/runtime` 的 index 现在导出 `StateGraph`；`dist/stategraph.{js,d.ts}` 照常构建（与现有模式一致）。
- 后续 `@nexus/executing`（若 M6 之后需要）可以直接 `graph = new StateGraph<TaskState>()…`。
- 测试证据：`agents/runtime/src/stategraph.test.ts`（11/11，vitest）。
- 尚未：`/studio` 或 `docs/AGENTS.md` 里「graph 这个词指的就是这个」的交叉引用——文档下次收口时带上。
