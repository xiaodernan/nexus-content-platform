/**
 * cont. 170 · 编排车道（orchestration lane）解析器 —— /api/ai/run 唯一用来决定走哪条谁的纯函数。
 *
 * 背景：NEXUS 的 AI 编排有两条产出**逐字节同构**响应（同一 AiResponse 契约）的通路：
 *   - lane-a     → ai-service `/v1/ai/run`（顺序执行）
 *   - stategraph → ai-service `/v1/ai/design-graph`（LangGraph StateGraph：validate → check_provider
 *                  → build_prefix → call_llm → cache_read → parse_and_release → assemble）
 *
 * 解析优先级：请求头 `x-nexus-orchestration` > 环境变量 `NEXUS_AI_ORCHESTRATION` > 默认 `lane-a`。
 * 任一来源的非法值按「该层无判定」处理（header 非法 → env 决定；env 亦非法 → lane-a）——
 * 一个拼写错误绝不把生产流量悄悄换车道。
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
  return normalize(headerValue) ?? normalize(envValue) ?? 'lane-a';
}
