# ADR-0272：§63 自修环接线 StateGraph（verify → 有界 fix → 复验）

- 日期：2026-11-17
- 状态：已实现并通过 agents/runtime 全量测试（675/675，新增 6 个用例）
- 关联：ADR-0270（本仓 StateGraph 语义与 LangGraph 对齐）、§63（自动修）、ADR-0163/§25（任务可中断可审计）

## 背景

ADR-0270 把 LangGraph 的核心语义落成 TS（`StateGraph` + BSP super-step + 条件边 + recursionLimit + checkpoint 缝），当时名下只有 `stategraph.test.ts`（11/11）与两个 demo 级调用点——**图没接进任何真实循环**。用户指令要求「把 StateGraph 做进项目里面」。

## 决定

把 §63 的 verify → 有界自动修 → 复验环重写成显式 StateGraph：

```
START ─cond: green‖maxFixRounds==0‖预算耗尽──▶ END
      └─cond────▶ fixRound (fix-N: fs.append 提案 → verify-N+1: test.run 复验)

fixRound ─cond: done‖green‖attempt≥maxFixRounds‖预算耗尽──▶ END
             └─cond───────────────────────────────────▶ fixRound
```

- 语义**逐字节等价**：事件序列（`fix-N` 与 `verify-N+1` 的顺序与 `at` 计数）、步数预算（`invoke` 仍是 stepsUsed 的唯一写入方；图经引用读预算，不抄不存）、`plan.steps` 追加顺序、`failed_verification` 终态判定、零修首绿场景全部不变——`agent.test.ts` / `chain.test.ts` / `pipeline.test.ts` 无需改动即全绿。
- 这轮之中外部可见的行为只有三个（测试钉死）：`fixRoundsUsed`（审计用）、零修不跑、预算硬停。
- 图实例每次调用新编译：零共享状态，Map 分配的常数可以忽略；不写缓存式单例（那是让错误的复用变得可能的典型捷径）。
- `recursionLimit = maxFixRounds + 2`：把「修不完冒泡成无限循环」的风险钉进类型层面——超限抛 `StateGraphRecursionError`（§159 不回半成品）。
- 不做的：checkpoint/time-travel/interrupt 仍是 Non-goal——没有真实审计消费者之前不造。

## 证据

- `test/verify-loop-graph.test.ts`（6 用例）：首绿零修 / 一轮转绿（fix-1→verify-2）/ 双失败跑满+步骤成对 / 预算硬停零修 / 第二轮预算耗尽 / maxFixRounds=0。
- `npm run test -w @nexus/agent-runtime` → **48 files · 675 tests 全绿**（此前 669）。
- `npm run build -w @nexus/agent-runtime` → 0 错；`tsc -p tsconfig.test.json` → 0 错。

## 后果

- `runTask` 的控制流里现在真实经过 StateGraph（不是旁路 demo）；`agents/runtime/src/verifyFix.ts` 持有接线。
- ADR-0270 的遗留「/studio 或 docs/AGENTS.md 里「graph 这个词指的就是这个」的交叉引用」未在本片完成——studio 侧不动（v811-815 决策：Studio 中文母语作者台）。
- /tasks 页若要看 fix/verify 图检查点，平路已在：`onStep` 传进 `compile()`（见 stategraph.ts `StateGraphNodeConfig.onStep`）。下一次动 `/tasks` 时接。
