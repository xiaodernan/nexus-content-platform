import type { AgentPlan } from '@nexus/schemas';
import {
  GOAL_MAX,
  READINESS_STEPS,
  STEP_KINDS,
  buildReadinessPlan,
  stepSpec,
  validatePlan,
  type StepKind,
} from './agent-runtime';

/**
 * §PLAN-1 · 多步 Agent 规划器里"模型说了算"的那一半——纯函数，无 I/O（§112/§159）。
 *
 * 为什么不直接让模型吐一整份 AgentPlan
 * ------------------------------------
 * 模型会编步骤、编 Agent、编依赖，也可能把 `game` 写成 `gmae`。若照单全收，
 * 计划里就会出现"没有执行方的步骤"（validatePlan 拒收）或"名册里没有的 Agent"
 * （runtime 的能力校验拒收）——整份作业跑不起来，用户只看到一次失败。
 *
 * 所以模型只能决定**三件不危险的事**：
 *   1. 从九种真实步骤里挑选一个子集（order）——它挑不到不存在的步骤；
 *   2. 给这些步骤排序——执行顺序由它定，但依赖箭头仍从配方取；
 *   3. 为每一步改写一句更贴合本次目标的标题（titles），并给整份计划补风险提示（risks）。
 *
 * agent / artifact / dependsOn / requires 这些**真值**一律从 READINESS_STEPS 重建，
 * 模型给的同类字段一律忽略。最后整份过 validatePlan——模型若挑了 `report` 却漏了它的
 * 三个前置，依赖会缺，validatePlan 拒收，调用方回退确定性配方。
 *
 * 这样"用了模型规划"与"计划仍可执行"两件事同时成立，且每一步都能离线钉住。
 */

/** 给模型看的步骤清单：只有 id 与一句用途，不含 agent/能力这些它碰不得的真值。 */
export interface PlannerStepOption {
  id: StepKind;
  purpose: string;
}

export function plannerStepOptions(): PlannerStepOption[] {
  return READINESS_STEPS.map((spec) => ({ id: spec.kind, purpose: spec.title }));
}

/**
 * system 提示刻意短且字节稳定：这段每次规划都要重发，长一句就多一份 token。
 * 它不描述游戏类型——类型是显式入参、不猜（§159），让模型猜就是假 AI。
 */
export const PLANNER_SYSTEM = [
  '你是一个任务规划器。只能从给定的步骤清单里挑选步骤并排序，不能创造新步骤、不能改步骤 id。',
  '输出严格的 JSON 对象，形如 {"order":["context","qa-audit"],"titles":{"context":"..."},"risks":["..."]}。',
  'order 是步骤 id 的数组，必须全部来自清单，可以少于清单但不能多；titles 可选，key 必须是 order 里出现过的 id，值为一句中文短标题；risks 可选，最多 3 条。',
  '不要输出 markdown、解释或清单以外的任何字段。',
].join('\n');

export function buildPlannerUserPrompt(goal: string, gameKind: string): string {
  const lines = plannerStepOptions().map((s) => `- ${s.id}: ${s.purpose}`);
  return [
    `目标：${goal.trim().slice(0, GOAL_MAX) || '上架前检查'}`,
    `这一型（不要改，也不要从目标里猜）：${gameKind}`,
    '可用步骤（只能用这里的 id）：',
    ...lines,
    '请按执行顺序给出 order；依赖仍由系统从配方重建，你不必写 dependsOn。',
  ].join('\n');
}

/** 模型回执里我们认的字段。多出来的字段一律丢弃——不照单全收是这一片的纪律。 */
export interface PlannerReply {
  order: StepKind[];
  titles: Partial<Record<StepKind, string>>;
  risks: string[];
}

const isStepKind = (v: unknown): v is StepKind => typeof v === 'string' && (STEP_KINDS as readonly string[]).includes(v);

/**
 * 把模型文本收成一个受约束的回执。任何一处不合规就返回 null（调用方回退确定性配方）。
 * 这里不 validatePlan 的循环/缺依赖——那是构造出 AgentPlan 之后的事，见 planFromReply。
 */
export function parsePlannerReply(raw: string): PlannerReply | null {
  const text = raw.trim();
  if (!text) return null;
  const jsonText = text.startsWith('```') ? text.replace(/^```(?:json)?\s*/, '').replace(/\s*```\s*$/, '') : text;
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.order)) return null;
  const order: StepKind[] = [];
  const seen = new Set<StepKind>();
  for (const item of obj.order) {
    if (!isStepKind(item) || seen.has(item)) return null; // 非法 id 或重复 ⇒ 整份拒收
    seen.add(item);
    order.push(item);
  }
  if (order.length === 0) return null;

  const titles: Partial<Record<StepKind, string>> = {};
  if (obj.titles && typeof obj.titles === 'object' && !Array.isArray(obj.titles)) {
    for (const [key, value] of Object.entries(obj.titles as Record<string, unknown>)) {
      if (!isStepKind(key) || !seen.has(key)) continue; // 没被挑中的步骤，标题不认
      if (typeof value !== 'string' || !value.trim()) continue;
      titles[key] = value.trim().slice(0, 160);
    }
  }

  const risks: string[] = [];
  if (Array.isArray(obj.risks)) {
    for (const item of obj.risks) {
      if (typeof item !== 'string' || !item.trim()) continue;
      risks.push(item.trim().slice(0, 240));
      if (risks.length >= 3) break;
    }
  }

  return { order, titles, risks };
}

/**
 * 把受约束回执重建为一份完整 AgentPlan。**真值全部来自配方**：
 * agent / dependsOn / artifact 用 stepSpec(kind)，标题用模型覆盖（若有），
 * 风险用模型的（若有）；无论如何都追加一条"计划由模型挑选步骤、执行仍由配方保证"的诚实注记。
 *
 * 过不了 validatePlan（例如漏了依赖的前置）就返回 null——让调用方回退，而不是跑一份半残计划。
 */
export function planFromReply(reply: PlannerReply, goal: string, gameKind: string): AgentPlan | null {
  const base = buildReadinessPlan(goal, gameKind);
  const tasks = reply.order.flatMap((kind) => {
    const spec = stepSpec(kind);
    if (!spec) return []; // isStepKind 已挡过，这里是类型收窄
    return [{
      id: kind,
      title: reply.titles[kind] ?? spec.title,
      agent: spec.agentName,
      status: 'pending' as const,
      dependsOn: [...spec.dependsOn],
      artifact: spec.artifact,
    }];
  });
  const ids = new Set<string>(reply.order);
  const plan: AgentPlan = {
    ...base,
    tasks,
    // 依赖只保留两端都在子集里的箭头；漏前置的情况由 validatePlan 判 missing-dep
    dependencies: base.dependencies.filter(([from, to]) => ids.has(from) && ids.has(to)),
    // 风险文案必须与"这次真的用了模型"一致：不能回退到 base.risks 里那句
    // "本机没有真 provider：计划由确定性配方生成"——那是谎话（§159/§160）。
    risks: [
      ...(reply.risks.length ? reply.risks : ['步骤顺序由模型按本次目标挑选；如与预期不符可关掉 NEXUS_AGENT_LLM_PLANNER 用确定性配方']),
      '步骤由模型从真实配方中挑选与排序；执行方与依赖仍由配方保证',
    ],
    validation: [...base.validation, '模型挑选的步骤全部有真执行方，且依赖完整'],
  };
  return validatePlan(plan).length === 0 ? plan : null;
}

/** 一步到位：模型文本 → 可执行计划。任一步不合规返回 null。 */
export function planFromPlannerText(raw: string, goal: string, gameKind: string): AgentPlan | null {
  const reply = parsePlannerReply(raw);
  return reply ? planFromReply(reply, goal, gameKind) : null;
}
