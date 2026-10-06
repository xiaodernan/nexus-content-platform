import { receiptsOrNote, type CheckpointDecision } from './checkpointPolicy.js';
import type { Checkpoint, ToolRegistry } from './registry.js';
import type { Step, ToolResult, ToolSpec } from './types.js';
import type { BuildArcOutcome } from './buildArc.js';

/**
 * M6 v176 (ADR 0016 amendment 176, DEVELOPMENT PLAN item 8, the deploy leg): the DEPLOY ARC —
 * what a COMPLETED build arc does next. The honest shape of "deploy" in this runtime is not a
 * push or a publication: it is the arc's MEASURED FACTS — each verify step's own stdout, the
 * engine's words — becoming a durable record through an injected `DeploySink`. The runtime
 * holds no sink of its own (the Driver-seam rule the BuildVerifier established in v173): the
 * host injects one when it registers the tools, and a registry without the door records
 * nowhere — `no-sink`, stated loudly.
 *
 * The rules, restated from the lanes this file joins:
 * - ONLY a green arc can deploy. A failed, denied or never-walked arc deploys nothing —
 *   recording facts from a red arc would be a record of a build that did not happen.
 * - ONLY measured facts deploy. A step whose verdict carries no stdout verified green but
 *   measured nothing; it is NAMED as unmeasured rather than summarised (§60 — the record
 *   holds the engine's own words, not the walker's opinion of them).
 * - The plan is ONE piece of data (`executes: false` in its very type, v29's discipline),
 *   the walk goes door by door, and every `deploy.record` door asks §28 for itself — one
 *   gate per fact, never one for the arc.
 */

/** The ONE door the deploy arc walks. */
export const DEPLOY_RECORD_TOOL = 'deploy.record';

export const DEPLOY_TOOL_SPECS: ToolSpec[] = [
  {
    name: DEPLOY_RECORD_TOOL,
    description:
      "Record ONE measured fact of a completed build arc through the injected DeploySink. The fact is the engine's own stdout, verbatim — never a summary the walker wrote. A red answer means the sink refused the fact, and the arc stops.",
    permissions: ['write'],
    args: [
      { name: 'arcId', type: 'string', required: true },
      { name: 'stepId', type: 'string', required: true },
      { name: 'fact', type: 'string', required: true },
    ],
  },
];

/** What the runtime names; the injected sink answers. The runtime holds no sink of its own. */
export interface DeployRecordRequest {
  arcId: string;
  stepId: string;
  /** The engine's own measured answer (the verify step's stdout), verbatim. */
  fact: string;
}

export interface DeployRecordAnswer {
  ok: boolean;
  detail: string;
}

export type DeploySink = (request: DeployRecordRequest) => Promise<DeployRecordAnswer>;

export function registerDeployTools(registry: ToolRegistry, sink: DeploySink): ToolRegistry {
  for (const spec of DEPLOY_TOOL_SPECS) {
    registry.register(spec, async (args) => {
      const answer = await sink({
        arcId: String(args.arcId),
        stepId: String(args.stepId),
        fact: String(args.fact),
      });
      return { ok: answer.ok, detail: answer.detail };
    });
  }
  return registry;
}

/** One measured fact: the step, the argv that produced it, and the engine's own words. */
export interface DeployFact {
  stepId: string;
  argv: string[];
  stdout: string;
}

export interface DeployStage {
  stage: 'blueprint' | 'record';
  stepId?: string;
  detail: string;
}

export interface DeployPlan {
  arcId: string;
  goal: string;
  stages: DeployStage[];
  steps: Step[];
  /** The measured facts the record will carry — never a summary, always the engine's stdout. */
  facts: DeployFact[];
  /** Green steps that measured nothing (no stdout): named, not summarised, NOT in the record. */
  unmeasured: string[];
  /** Type-level honesty, v29's discipline: a plan records nothing. */
  executes: false;
}

export type DeployPlanDecision = { ok: true; plan: DeployPlan } | { ok: false; reason: string };

/**
 * The deploy plan as ONE pure function over the completed arc. Only `completed` arcs plan;
 * only steps whose verdict carries non-empty stdout become facts. A green arc that measured
 * nothing refuses by name — a record of nothing would be a deployment that never happened.
 */
export function planDeployArc(outcome: BuildArcOutcome): DeployPlanDecision {
  if (outcome.status !== 'completed') {
    return {
      ok: false,
      reason: `a build arc that did not complete (status "${outcome.status}") deploys nothing — the record holds what the engine MEASURED, and a red arc measured a refusal`,
    };
  }
  const facts: DeployFact[] = [];
  const unmeasured: string[] = [];
  for (let i = 0; i < outcome.steps.length; i++) {
    const step = outcome.steps[i]!;
    const res: ToolResult | undefined = outcome.results[i];
    const verdict = res?.output as { ok?: boolean; stdout?: string } | undefined;
    if (verdict && typeof verdict.stdout === 'string' && verdict.stdout.trim() !== '') {
      facts.push({ stepId: step.stepId, argv: (step.args.argv as string[]) ?? [], stdout: verdict.stdout });
    } else {
      unmeasured.push(step.stepId);
    }
  }
  if (facts.length === 0) {
    return {
      ok: false,
      reason: 'every step verified green but the engine measured nothing (no stdout) — a record of nothing would be a deployment that never happened (§60)',
    };
  }
  const steps: Step[] = facts.map((f) => ({
    stepId: f.stepId,
    tool: DEPLOY_RECORD_TOOL,
    args: { arcId: outcome.arcId, stepId: f.stepId, fact: f.stdout },
    rationale: "record the engine's own measured answer for this step",
  }));
  const stages: DeployStage[] = [
    {
      stage: 'blueprint',
      detail: `${facts.length} measured fact(s) from the completed arc${unmeasured.length > 0 ? `, ${unmeasured.length} green step(s) measured nothing and are named as unmeasured` : ''} — inert data, nothing recorded`,
    },
    ...facts.map((f) => ({
      stage: 'record' as const,
      stepId: f.stepId,
      detail: `record "${f.stdout}" through the ONE ${DEPLOY_RECORD_TOOL} door (§28)`,
    })),
  ];
  return { ok: true, plan: { arcId: outcome.arcId, goal: outcome.goal, stages, steps, facts, unmeasured, executes: false } };
}

export type DeployArcStatus = 'recorded' | 'not-green' | 'nothing-measured' | 'no-sink' | 'denied' | 'failed';

export interface DeployArcOutcome {
  arcId: string;
  goal: string;
  plan: DeployPlan;
  steps: Step[];
  results: ToolResult[];
  status: DeployArcStatus;
  /** Fact that did not land, when the arc stopped before its own end. */
  stoppedAt?: string;
  reason?: string;
  /** What the arc deliberately did NOT do, and why — never a silent omission. */
  notes: string[];
  /** The §28 receipts for THIS walk's doors, in ask order — v50's rule, inherited verbatim. */
  decisions?: CheckpointDecision[];
}

export interface DeployArcOptions {
  registry: ToolRegistry;
  /** One gate per fact (§28). Absent = deny: nothing is recorded, and the outcome says so. */
  checkpoint?: Checkpoint;
  /** The caller says this walk is HEADED FOR THE LEDGER, so it carries its own receipts (v50's rule). */
  recordReceipts?: boolean;
}

/**
 * Walk the deploy arc through whatever registry the caller holds. The plan is data; the walk
 * is where the doors open. First refusal → `denied`; first sink rejection → `failed` (the
 * sink answered, the fact did not land — a verdict, not an error); all recorded → `recorded`.
 * Results are NOT merged into the build arc's outcome: this is a separate walk with its own
 * callIds, and folding them into another stage's transcript would be a lie about what that
 * stage planned (§60, gitArc's rule).
 */
export async function runDeployArc(outcome: BuildArcOutcome, opts: DeployArcOptions): Promise<DeployArcOutcome> {
  const emptyPlan: DeployPlan = { arcId: outcome.arcId, goal: outcome.goal, stages: [], steps: [], facts: [], unmeasured: [], executes: false };
  const planned = planDeployArc(outcome);
  if (!planned.ok) {
    const status: DeployArcStatus = outcome.status !== 'completed' ? 'not-green' : 'nothing-measured';
    const bare: DeployArcOutcome = { arcId: outcome.arcId, goal: outcome.goal, plan: emptyPlan, steps: [], results: [], status, reason: planned.reason, notes: [] };
    return opts.recordReceipts ? { ...bare, decisions: [] } : bare;
  }
  const plan = planned.plan;
  const callIds = plan.steps.map((s) => `${outcome.arcId}:deploy:${s.stepId}`);
  const durable = (o: DeployArcOutcome): DeployArcOutcome => {
    if (!opts.recordReceipts) return o;
    const { decisions, note } = receiptsOrNote(opts.checkpoint, callIds);
    return { ...o, decisions, notes: note ? [...o.notes, note] : o.notes };
  };
  if (!opts.registry.has(DEPLOY_RECORD_TOOL)) {
    return durable({
      arcId: outcome.arcId,
      goal: outcome.goal,
      plan,
      steps: plan.steps,
      results: [],
      status: 'no-sink',
      reason: `no ${DEPLOY_RECORD_TOOL} in this registry — the facts are measured but there is nowhere to record them (§60); wire a DeploySink to give the arc its one door`,
      notes: plan.unmeasured.length > 0 ? [`${plan.unmeasured.length} green step(s) measured nothing: ${plan.unmeasured.join(', ')}`] : [],
    });
  }
  const results: ToolResult[] = [];
  for (const step of plan.steps) {
    const res = await opts.registry.invoke(
      { callId: `${outcome.arcId}:deploy:${step.stepId}`, tool: DEPLOY_RECORD_TOOL, args: step.args },
      { checkpoint: opts.checkpoint },
    );
    results.push(res);
    if (!res.ok) {
      const denied = (res.error ?? '').includes('checkpoint');
      return durable({
        arcId: outcome.arcId,
        goal: outcome.goal,
        plan,
        steps: plan.steps,
        results,
        status: denied ? 'denied' : 'failed',
        stoppedAt: step.stepId,
        reason: denied ? `denied at ${step.stepId}: ${res.error}` : `${step.stepId} did not run: ${res.error}`,
        notes: [],
      });
    }
    // The door RAN; the sink's own answer is the arc's answer. A rejection means the fact
    // did not land — that is the record failing, not the walk lying about it.
    const verdict = res.output as { ok?: boolean; detail?: string } | undefined;
    if (!verdict || verdict.ok !== true) {
      return durable({
        arcId: outcome.arcId,
        goal: outcome.goal,
        plan,
        steps: plan.steps,
        results,
        status: 'failed',
        stoppedAt: step.stepId,
        reason: `${step.stepId} was not recorded: ${verdict?.detail ?? 'the sink stated no detail'}`,
        notes: [],
      });
    }
  }
  return durable({
    arcId: outcome.arcId,
    goal: outcome.goal,
    plan,
    steps: plan.steps,
    results,
    status: 'recorded',
    notes: plan.unmeasured.length > 0 ? [`${plan.unmeasured.length} green step(s) measured nothing and are NOT in the record: ${plan.unmeasured.join(', ')}`] : [],
  });
}
