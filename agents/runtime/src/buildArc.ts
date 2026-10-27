import { receiptsOrNote, type CheckpointDecision } from './checkpointPolicy.js';
import type { Checkpoint, ToolRegistry } from './registry.js';
import type { Step, ToolResult, ToolSpec } from './types.js';

/**
 * M6 v173 (ADR 0016 amendment 173, DEVELOPMENT_PLAN item 8, first slice): the BUILD ARC —
 * the orchestrator the autonomous-build milestone plans and verifies through. The shape is
 * gitArc's (v47), restated for building instead of releasing: the arc is ONE piece of data
 * (`planBuildArc` — inert, `executes: false` in its very type, v29's discipline), the walk
 * (`runBuildArc`) goes door by door, the first refusal or red answer ends it, and every
 * door asks §28 for itself — one gate per step, never one for the arc.
 *
 * What this file deliberately does NOT hold: any execution capability. The verify door
 * (`build.verify`) is a SEAM — a `BuildVerifier` the host injects when it registers the
 * tools. The runtime plans and walks; the FIRST wired runner is the container adapter in
 * @nexus/exec-host (`containerVerifyRunner`), which depends on this package in the legal
 * direction (am.167 — the runtime cannot reach exec-host, and does not try). A registry
 * without the door walks nowhere: `no-verifier`, stated loudly, is the §24 answer
 * (capability-by-absence) and the §60 answer (planning alone builds nothing).
 *
 * v172's bounds said the runtime's headless doors still had zero consumers; this arc is
 * the first headless consumer shape — its receipts use the same `receiptsOrNote` rule the
 * git arc and the run line use (v50/v54), so "empty" cannot mean two things in one repo.
 */

/** The ONE door the arc walks. */
export const BUILD_VERIFY_TOOL = 'build.verify';

export const BUILD_TOOL_SPECS: ToolSpec[] = [
  {
    name: BUILD_VERIFY_TOOL,
    description:
      'Run ONE step of a build arc through the injected BuildVerifier (e.g. inside the policy-pinned container). The arc plans the argv; this tool executes it; the registry-level §28 checkpoint decides whether it may. A red answer is the verification SUCCEEDING at proving the step bad.',
    permissions: ['exec'],
    args: [
      { name: 'arcId', type: 'string', required: true },
      { name: 'stepId', type: 'string', required: true },
      { name: 'argv', type: 'string[]', required: true },
      { name: 'cwd', type: 'string' },
    ],
  },
];

/** What the runtime names; the injected runner answers. The runtime holds no runner of its own. */
export interface BuildVerifyRequest {
  arcId: string;
  stepId: string;
  argv: string[];
  cwd?: string;
}

/**
 * Which kind of "no" a verify door's answer carries.
 *
 * <p>The runtime is spawn-free, so it never knows what failed — but the RUNNER it was handed does, and
 * a runner that knows the MACHINE failed must be able to say so across the seam. Otherwise the door
 * above has to guess from a sentence, and a guess reads a machine that never started as a step that
 * verified bad: two different facts, one number, and the caller rewrites the wrong thing.
 *
 * <p>Only the machine kind travels here. A refused ask is the arc's own business — a denial is a
 * verdict the arc reports in its own words — while "the machine could not do it" is a fact nobody
 * above should have to infer from prose.
 */
export type BuildVerifyFailure = 'the-machine';

export interface BuildVerifyAnswer {
  ok: boolean;
  detail: string;
  /** WHICH engine answered (e.g. the pinned image) — a green tick is traceable to its runner (§63). */
  engine: string;
  /** The engine's own stdout, when it has one — the proof's claim that the step COMPUTED rests on this, not on `ok` alone. */
  stdout?: string;
  /**
   * The machine failed — the runner knows it, and the arc cannot see it from the detail. Carried so
   * the door above can answer 503 instead of reading a failed verification as a refused ask.
   */
  failure?: BuildVerifyFailure;
}

export type BuildVerifier = (request: BuildVerifyRequest) => Promise<BuildVerifyAnswer>;

export function registerBuildTools(registry: ToolRegistry, verifier: BuildVerifier): ToolRegistry {
  for (const spec of BUILD_TOOL_SPECS) {
    registry.register(spec, async (args) => {
      const answer = await verifier({
        arcId: String(args.arcId),
        stepId: String(args.stepId),
        argv: args.argv as string[],
        ...(args.cwd === undefined ? {} : { cwd: String(args.cwd) }),
      });
      return {
        ok: answer.ok,
        detail: answer.detail,
        engine: answer.engine,
        ...(answer.stdout === undefined ? {} : { stdout: answer.stdout }),
        ...(answer.failure === undefined ? {} : { failure: answer.failure }),
      };
    });
  }
  return registry;
}

export interface BuildArcStepSpec {
  stepId: string;
  argv: string[];
  rationale: string;
  /** Verifier-side relative workdir (the runner's jail root + this). Absent = the root. */
  cwd?: string;
}

export interface BuildArcSpec {
  arcId: string;
  goal: string;
  steps: BuildArcStepSpec[];
}

export interface BuildArcStage {
  stage: 'blueprint' | 'verify' | 'record';
  stepId?: string;
  detail: string;
}

export interface BuildArcPlan {
  goal: string;
  stages: BuildArcStage[];
  steps: Step[];
  /** Type-level honesty, v29's discipline: a plan executes nothing. */
  executes: false;
}

export type BuildArcPlanDecision = { ok: true; plan: BuildArcPlan } | { ok: false; reason: string };

/**
 * The arc as ONE pure function over the spec. `planBuildArc` validates, orders and freezes
 * the steps into the shared `Step` shape — planning alone still executes nothing, and a
 * malformed spec is a REFUSAL with its reason, never a half-plan.
 */
export function planBuildArc(spec: BuildArcSpec): BuildArcPlanDecision {
  if (typeof spec.arcId !== 'string' || spec.arcId.trim() === '') return { ok: false, reason: 'arcId must be a non-empty string' };
  if (typeof spec.goal !== 'string' || spec.goal.trim() === '') return { ok: false, reason: 'goal must be a non-empty string' };
  if (!Array.isArray(spec.steps) || spec.steps.length === 0) return { ok: false, reason: 'a build arc without steps is not an arc' };
  const seen = new Set<string>();
  const steps: Step[] = [];
  const verifyStages: BuildArcStage[] = [];
  for (const s of spec.steps) {
    if (typeof s.stepId !== 'string' || s.stepId === '') return { ok: false, reason: 'every step needs a non-empty stepId' };
    if (seen.has(s.stepId)) return { ok: false, reason: `duplicate stepId "${s.stepId}"` };
    seen.add(s.stepId);
    if (!Array.isArray(s.argv) || s.argv.length === 0 || s.argv.some((a) => typeof a !== 'string' || a === '')) {
      return { ok: false, reason: `step "${s.stepId}" argv must be a non-empty array of non-empty strings` };
    }
    steps.push({
      stepId: s.stepId,
      tool: BUILD_VERIFY_TOOL,
      args: { arcId: spec.arcId, stepId: s.stepId, argv: [...s.argv], ...(s.cwd === undefined ? {} : { cwd: s.cwd }) },
      rationale: s.rationale || 'verify one step of the build arc',
    });
    verifyStages.push({ stage: 'verify', stepId: s.stepId, detail: `verify "${s.argv.join(' ')}" through the ONE ${BUILD_VERIFY_TOOL} door (§28)` });
  }
  return {
    ok: true,
    plan: {
      goal: spec.goal,
      stages: [
        { stage: 'blueprint', detail: `${steps.length} step(s) planned — inert data, nothing executed` },
        ...verifyStages,
        { stage: 'record', detail: 'status, results and receipts stated from what actually ran' },
      ],
      steps,
      executes: false,
    },
  };
}

export type BuildArcStatus = 'completed' | 'failed' | 'denied' | 'no-verifier' | 'invalid-spec';

export interface BuildArcOutcome {
  arcId: string;
  goal: string;
  plan: BuildArcPlan;
  steps: Step[];
  results: ToolResult[];
  status: BuildArcStatus;
  /** Step that did not pass, when the arc stopped before its own end. */
  stoppedAt?: string;
  reason?: string;
  /**
   * The machine failed while this arc walked — the runner said so, and the arc carries it up so the
   * door above never has to read a failed verification as a failed ask. Absent when the machine
   * answered: a red verdict is a verdict, and a denial is the ask's own refusal.
   */
  failure?: BuildVerifyFailure;
  /** What the arc deliberately did NOT do, and why — never a silent omission. */
  notes: string[];
  /**
   * The §28 receipts for THIS walk's doors, in ask order — v50's rule, inherited verbatim:
   * only present on a durable walk (`recordReceipts`), and "empty" is always explained by
   * `receiptsOrNote`'s note so two empties cannot mean two things.
   */
  decisions?: CheckpointDecision[];
}

export interface BuildArcOptions {
  registry: ToolRegistry;
  /** One gate per step (§28). Absent = deny: nothing runs, and the outcome says so. */
  checkpoint?: Checkpoint;
  /** The caller says this walk is HEADED FOR THE LEDGER, so it carries its own receipts (v50's rule). */
  recordReceipts?: boolean;
}

/**
 * Walk the arc through whatever registry the caller holds. The plan is data; the walk is
 * where the doors open — and exactly ONE thing can execute per step: the `build.verify`
 * impl behind the injected verifier, gated by the SAME §28 checkpoint every other
 * dangerous door faces. First refusal → `denied`; first red verdict → `failed` (the
 * verification succeeded at proving the step bad — that is a verdict, not an error);
 * all green → `completed`. Results are NOT merged into any RunOutcome: this is a separate
 * walk with its own callIds, and rewriting another stage's plan to include them would be a
 * lie about what that stage planned (§60, gitArc's rule).
 */
export async function runBuildArc(spec: BuildArcSpec, opts: BuildArcOptions): Promise<BuildArcOutcome> {
  const emptyPlan: BuildArcPlan = { goal: spec.goal, stages: [], steps: [], executes: false };
  const planned = planBuildArc(spec);
  if (!planned.ok) {
    const bare: BuildArcOutcome = { arcId: spec.arcId, goal: spec.goal, plan: emptyPlan, steps: [], results: [], status: 'invalid-spec', reason: planned.reason, notes: [] };
    return opts.recordReceipts ? { ...bare, decisions: [] } : bare;
  }
  const plan = planned.plan;
  const callIds = plan.steps.map((s) => `${spec.arcId}:${s.stepId}`);
  const durable = (o: BuildArcOutcome): BuildArcOutcome => {
    if (!opts.recordReceipts) return o;
    const { decisions, note } = receiptsOrNote(opts.checkpoint, callIds);
    return { ...o, decisions, notes: note ? [...o.notes, note] : o.notes };
  };
  if (!opts.registry.has(BUILD_VERIFY_TOOL)) {
    return durable({
      arcId: spec.arcId,
      goal: spec.goal,
      plan,
      steps: plan.steps,
      results: [],
      status: 'no-verifier',
      reason: `no ${BUILD_VERIFY_TOOL} in this registry — planning alone builds nothing (§60); wire a BuildVerifier (e.g. the container runner) to give the arc its one door`,
      notes: [],
    });
  }
  const results: ToolResult[] = [];
  for (const step of plan.steps) {
    const res = await opts.registry.invoke({ callId: `${spec.arcId}:${step.stepId}`, tool: BUILD_VERIFY_TOOL, args: step.args }, { checkpoint: opts.checkpoint });
    results.push(res);
    if (!res.ok) {
      const denied = (res.error ?? '').includes('checkpoint');
      return durable({
        arcId: spec.arcId,
        goal: spec.goal,
        plan,
        steps: plan.steps,
        results,
        status: denied ? 'denied' : 'failed',
        stoppedAt: step.stepId,
        reason: denied ? `denied at ${step.stepId}: ${res.error}` : `${step.stepId} did not run: ${res.error}`,
        // The door did not ANSWER — it broke. The only way a registered build.verify door does not
        // answer here is to throw, and a throw is the machine failing, not the ask being refused.
        ...(denied ? {} : { failure: 'the-machine' as const }),
        notes: [],
      });
    }
    // The door RAN; its own verdict is the arc's verdict. A red answer is a failed
    // verification — the engine answered, the step is bad, and the detail is the engine's.
    const verdict = res.output as { ok?: boolean; detail?: string; failure?: BuildVerifyFailure } | undefined;
    if (!verdict || verdict.ok !== true) {
      return durable({
        arcId: spec.arcId,
        goal: spec.goal,
        plan,
        steps: plan.steps,
        results,
        status: 'failed',
        stoppedAt: step.stepId,
        reason: `${step.stepId} verified red: ${verdict?.detail ?? 'no detail was stated'}`,
        // The runner may KNOW more than the verdict says: a docker that never started is the
        // machine failing, and the runner is the only layer that can tell that from a red step.
        ...(verdict?.failure === undefined ? {} : { failure: verdict.failure }),
        notes: [],
      });
    }
  }
  return durable({ arcId: spec.arcId, goal: spec.goal, plan, steps: plan.steps, results, status: 'completed', notes: [] });
}
