# ADR 0272 — 编排车道接进生产入口：/api/ai/run 的 x-nexus-orchestration 分流（默认 lane-a，零静默切换）

## 背景

ai-service 有两条产出**逐字节同构**（同一 AiResponse zod 契约，ai-response.schema.json）的通路：

- lane-a → `/v1/ai/run`（顺序执行）
- stategraph → `/v1/ai/design-graph`（LangGraph StateGraph：七节点 + 条件边直通 END）

cont. 142/143 已批准 design-graph 为" sanctioned 路径"；cont. 169 把它做成了 /stategraph 公开落点。
但生产入口 `/api/ai/run` 只调 lane-a——状态图只在演示里跑，不进实际流量。这一次把车道接通。

## 决定

1. `/api/ai/run` 读取请求头 `x-nexus-orchestration: stategraph`（大小写不敏感）；否则读服务端 env
   `NEXUS_AI_ORCHESTRATION`（`lane-a` | `stategraph`）；都缺省即 `lane-a`。
   解析器：`apps/web/src/server/ai/orchestrationLane.ts`（纯函数，4 个单测）。
2. **缺省不换道。** 拼错的请求头/env 一律按「该层无判定」回落——生产不会因一次拼写错误换车道。
3. 响应头 `x-nexus-orchestration` 如实回声本次车道（含 demo 路径）；`/admin` 可通过
   `nexus_ai_run_lane_total{lane,capability}` 计数观测分流分布。
4. 切换机制是**服务端 canary**（env），不是客户端开关：客户端可以提 header 显式 opt-in，
   但大规模换道只能在服务端显式决定。

## 为什么不直接默认换道

StateGraph 首次调用要编译图（langgraph，数十秒，进程内复用）；默认换道会把
"每次 ai-service 重启后的第一单 AI 请求"拖慢数十秒。byte-parity 已多轮实测（cont. 142/169），
但冷启动延迟不是免费赠送的——先 env canary，再谈全量。

## 后果

- Studio/任何客户端可以按请求选择车道；环境变量可以给整机换道；`/stategraph` 试跑与生产同源。
- 指标让"到底有多少流量走状态图"成为可观测事实（在 /admin 指标里可直接出图）。
- 两车道长期并存：lane-a 保留为零风险回退位；合同契约不动，无迁移。
