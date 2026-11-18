# ADR-0236 · LangGraph StateGraph 成为默认编排车道（cont. 222）

日期：2026-11-19 · 状态：已采纳（代码 + 集成/单测 + prod live probe 落盘）

## 背景

cont. 169/170 起 `/api/ai/run` 有两条逐字节同构响应的编排通路，默认 `lane-a` 顺序执行，
`x-nexus-orchestration: stategraph` 可切到 LangGraph StateGraph（validate → check_provider →
build_prefix → call_llm → cache_read → parse_and_release → assemble）。StateGraph 一直是一个
"没拧进主路线的旁路"——用户（总负责人）明确要求"**用 stategraph 来优化项目，把它做进项目里面**"。
把它留在默认关闭的侧道，等于它在产品里根本不存在。

## 决定

- **默认 `stategraph`**：`resolveOrchestrationLane` 的第 3 级回落从 `lane-a` 改为 `stategraph`；
  header > env `NEXUS_AI_ORCHESTRATION` > 默认值，非法值逐级回落默认。
- **`lane-a` 保留为显式逃生门**（回滚不锁死）：`x-nexus-orchestration: lane-a` 请求头或
  `NEXUS_AI_ORCHESTRATION=lane-a` 环境变量，随时降级。无任何静默切换。
- `/api/ai/run` 的分流不再以 env 作为"可有可无"的插件，而是**产品默认结构**；
  `/admin` 侧 `nexus_ai_run_lane_total` 计数照旧每条都记（observability 不动）。
- 两车道字节同构（同 AiResponse 契约）不变；ai-service 侧 `test_stategraph.py` 既有保障继续有效。

## 实测（prod build + prod start + ai-service，2026-11-19）

- 默认 POST `/api/ai/run`（真实注册新用户、真实建项目，prod）：**HTTP 200 · capability=real ·
  model=gpt-6.1-terra · x-nexus-orchestration=stategraph · tokensIn=87,095 · cachedTokens=80,254（92.1%）**
- 显式逃生门同请求 + header `lane-a`：HTTP 200 · orchestration=lane-a · capability=real ✓
- 单测 `orchestration-lane.test.ts` 4/4（默认已翻），集成 `ai-run-orchestration-lane.integration.test.ts`
  4/4（真库建账 + 回声）✓，fe-gates 147/147 ✓，tsc 0 errors ✓，live smoke 以上为证。

## 后果与边界

- 生产流量默认走图：错误分支仍是"条件边直达 END"，契约同构，provider 不可用时两车道都如实 503。
- 回滚只需一行 env（`NEXUS_AI_ORCHESTRATION=lane-a`），无需发版、无需改代码。
- 缓存：本车道与 lane-a 共享同一条 provider 出站口与 sticky prompt_cache_key；92.1% 复用是测出来的，不是承诺。
- guide / 说明书 / 两仓库的文案都更新为"默认 stategraph，逃生门 lane-a"（guideCopy 本轮同步）。
- 旧决定（cont. 170 的 lane-a 默认）被本条局部覆写：那是"先并轨、后翻默认"的两阶段，本条补完后者。
