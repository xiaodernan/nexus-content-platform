/**
 * cont. 170 · cont. 222 默认翻转：编排车道（orchestration lane）解析器 —— /api/ai/run 唯一用来决定走哪条谁的纯函数。
 *
 * 背景：NEXUS 的 AI 编排有两条产出**逐字节同构**响应（同一 AiResponse 契约）的通路：
 *   - stategraph → ai-service `/v1/ai/design-graph`（LangGraph StateGraph：validate → check_provider
 *                  → build_prefix → call_llm → cache_read → parse_and_release → assemble）
 *   - lane-a     → ai-service `/v1/ai/run`（顺序执行）
 *
 * 2026-11-19 拍板（cont. 222）：**默认走 stategraph**——LangGraph 状态图不是可选实验品，
 * 它是每一次生成默认的执行结构；它在校验失败/provider 不可用时沿条件边直接落 END，
 * 状态、错误与计数全部成段记录（x-nexus-orchestration: stategraph 记数）。
 * `lane-a` 保留为显式逃生门：请求头 `x-nexus-orchestration: lane-a` 或
 * `NEXUS_AI_ORCHESTRATION=lane-a` 即可降级回顺序通路（回滚不锁死，运维决定可见）。
 *
 * 解析优先级：请求头 `x-nexus-orchestration` > 环境变量 `NEXUS_AI_ORCHESTRATION` > 默认 `stategraph`。
 * 任一来源的非法值按「该层无判定」处理（header 非法 → env 决定；env 亦非法 → stategraph）——
 * 一个拼写错误绝不把生产流量悄悄换到旧通路。
 */

export type OrchestrationLane = 'lane-a' | 'stategraph';

const VALID: ReadonlySet<string> = new Set<OrchestrationLane>(['lane-a', 'stategraph']);

function normalize(raw: string | null | undefined): OrchestrationLane | null {
  const v = (raw ?? '').trim().toLowerCase();
  return VALID.has(v) ? (v as OrchestrationLane) : null;
}

export function resolveOrchestrationLane(
  headerValue: string | null | undefined,
  envValue: string | null | undefined,
): OrchestrationLane {
  return normalize(headerValue) ?? normalize(envValue) ?? 'stategraph';
}
