import { planTask, type PlannerOptions } from './planner.js';
import type { AgentTask, Plan } from './types.js';

/**
 * M2 v17 (§63 'live-model planning', seam edition): planning becomes a pluggable backend.
 * The DEFAULT stays the deterministic demo planner everywhere — nothing here pretends a
 * model exists (§60). A provider's plan is only ever adopted after validation against the
 * registered tools; rejection falls back to the demo planner AND records why.
 */
export interface Planned {
  plan: Plan;
  backend: string;
  /** Set when a non-demo backend produced something unusable and demo took over. */
  fellBack?: { from: string; reason: string };
}

export interface PlanBackend {
  name: string;
  plan(task: AgentTask, ctx: PlannerOptions, knownTool: (name: string) => boolean): Planned | Promise<Planned>;
}

export const demoPlanner: PlanBackend = {
  name: 'demo',
  plan: (task, ctx) => ({ plan: planTask(task, ctx), backend: 'demo' }),
};

export interface ProviderLike {
  completePlan(prompt: string): Promise<unknown>;
}

const MAX_STEPS = 12;

/** Total validation of a raw provider payload into a Plan; every failure returns a reason. */
export function validatePlan(raw: unknown, knownTool: (name: string) => boolean): { ok: true; plan: Plan } | { ok: false; reason: string } {
  const obj = raw as { steps?: unknown };
  if (typeof raw !== 'object' || raw === null || !Array.isArray(obj.steps)) return { ok: false, reason: 'steps must be an array' };
  if (obj.steps.length === 0) return { ok: false, reason: 'empty plan' };
  if (obj.steps.length > MAX_STEPS) return { ok: false, reason: `plan exceeds ${MAX_STEPS} steps` };
  const ids = new Set<string>();
  const steps: Plan['steps'] = [];
  for (const s of obj.steps) {
    const st = s as Partial<{ stepId: unknown; tool: unknown; args: unknown; rationale: unknown }>;
    if (typeof st.stepId !== 'string' || st.stepId === '' || ids.has(st.stepId)) return { ok: false, reason: `bad or duplicate stepId ${String(st.stepId)}` };
    ids.add(st.stepId);
    if (typeof st.tool !== 'string' || !knownTool(st.tool)) return { ok: false, reason: `unknown tool ${String(st.tool)}` };
    if (typeof st.args !== 'object' || st.args === null || Array.isArray(st.args)) return { ok: false, reason: `args for ${st.stepId} must be an object` };
    for (const [k, v] of Object.entries(st.args as Record<string, unknown>)) {
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return { ok: false, reason: `arg ${k} of ${st.stepId} must be a primitive` };
    }
    steps.push({ stepId: st.stepId, tool: st.tool, args: st.args as Record<string, unknown>, rationale: typeof st.rationale === 'string' ? st.rationale : 'provider plan' });
  }
  const seedRaw = (raw as { seed?: unknown }).seed;
  return { ok: true, plan: { goal: (raw as { goal?: unknown }).goal === undefined ? '' : String((raw as { goal?: unknown }).goal), seed: typeof seedRaw === 'number' ? seedRaw : 0, steps } };
}

export function routerPlanner(provider: ProviderLike, fallback: PlanBackend = demoPlanner): PlanBackend {
  return {
    name: 'router',
    async plan(task, ctx, knownTool) {
      let reason = 'invalid or unparseable plan';
      try {
        const raw = await provider.completePlan(JSON.stringify({ task, capabilities: { verify: ctx.hasVerify, index: ctx.hasIndex, memory: ctx.hasMemory }, seed: ctx.seed ?? 0 }));
        const v = validatePlan(raw, knownTool);
        if (v.ok) return { plan: { ...v.plan, goal: v.plan.goal || task.goal }, backend: 'provider' };
        reason = v.reason;
      } catch {
        /* provider spoke nonsense — fall back below */
      }
      const demo = await fallback.plan(task, ctx, knownTool);
      return { ...demo, fellBack: { from: 'provider', reason } };
    },
  };
}
