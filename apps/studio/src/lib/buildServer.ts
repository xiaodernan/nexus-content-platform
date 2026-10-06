/**
 * M6 v175 (ADR 0016 amendment 175): the SERVER half of the dock's BUILD face now PLANS. The
 * pattern is v174's pinned face lifted one level: the ARC is no longer one hand-pinned
 * constant — the server holds a step CATALOG (frozen argv templates the container policy has
 * validated) and the request's GOAL summons templates through the runtime's template planner
 * (`templateBuildPlanner`, am. 175). The browser can name a GOAL; it can still never name a
 * single argv — the planner invents nothing, it only selects among the catalog, in catalog
 * order, deterministically per (arcId, goal), and the answer carries the provenance (backend,
 * seed, picked) so the panel states WHO planned the arc, not just who ran it.
 *
 * Everything v174 established holds: the walk uses the runtime's own recording checkpoint
 * (`policyCheckpoint` — `build.verify` granted because the human allowed the arc once,
 * everything else default-deny), each verify step runs inside the SAME policy wall as every
 * container exec, and the receipts travel with the answer per callId.
 */
import {
  planContainerRun,
  containerVerifyRunner,
  type SpawnLike,
} from '@nexus/exec-host';
import {
  policyCheckpoint,
  registerBuildTools,
  runBuildArc,
  templateBuildPlanner,
  validateCheckpointPolicy,
  ToolRegistry,
  type BuildArcOutcome,
  type BuildArcProvenance,
  type BuildArcSpec,
  type BuildArcStatus,
  type BuildStepTemplate,
  type CheckpointPolicy,
} from '@nexus/agent-runtime';

import { containerLaneState, createStudioContainerHost, STUDIO_CONTAINER_IMAGE, STUDIO_CONTAINER_POLICY } from './containerServer';

/** The ONE arc id this face serves; every callId joins to it. */
export const STUDIO_BUILD_ARC_ID = 'studio-build-arc';
/** The goal the face plans for when the request names none — also what the panel displays. */
export const STUDIO_BUILD_GOAL = 'verify the dock build lane end to end inside the pinned container';
/**
 * The step CATALOG: the planner's entire freedom. Each argv is frozen here and validated
 * against the SAME container allowlist the exec lane serves (see the allowlist check below) —
 * a template that the policy would refuse can never exist in this lane.
 */
export const STUDIO_BUILD_CATALOG: readonly BuildStepTemplate[] = [
  {
    id: 'runtime',
    argv: ['node', '--version'],
    rationale: 'the container runtime answers with its own version',
    keywords: ['runtime', 'verify', 'lane', 'container'],
  },
  {
    id: 'compute',
    argv: ['node', '-e', 'console.log("arc ok:" + String(2 + 3))'],
    rationale: 'the container computes and prints — stdout is the measured fact',
    keywords: ['compute', 'verify', 'check'],
  },
];
/** WHO answers the verify doors — the same engine the container lane names. */
export const STUDIO_BUILD_ENGINE = `container:${STUDIO_CONTAINER_IMAGE}`;

/**
 * The dock's §28 stance as data: the panel's Allow-once is the human gate; the route
 * answers for it ON RECORD (the recording checkpoint keeps every decision for the ledger).
 */
export const STUDIO_BUILD_CHECKPOINT_POLICY: CheckpointPolicy = {
  rules: [{ tool: 'build.verify', grant: true, reason: 'the human allowed this arc once at the dock panel (§28 Allow-once)' }],
  default: { grant: false, reason: 'no rule named this tool — default-deny' },
};

export function studioBuildCheckpointPolicyError(): string | null {
  try {
    validateCheckpointPolicy(STUDIO_BUILD_CHECKPOINT_POLICY);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Every catalog template must fit the SAME container allowlist the exec lane serves — asserted, not assumed. */
export function studioBuildCatalogAllowlistError(): string | null {
  const planner = templateBuildPlanner(STUDIO_BUILD_CATALOG, STUDIO_BUILD_ARC_ID);
  for (const t of STUDIO_BUILD_CATALOG) {
    const decision = planContainerRun({ argv: [...t.argv], ...(t.cwd === undefined ? {} : { cwd: t.cwd }) }, STUDIO_CONTAINER_POLICY);
    if (!decision.ok) return `template "${t.id}" is outside the container policy: ${decision.reason}`;
  }
  const draft = planner({ goal: STUDIO_BUILD_GOAL });
  return draft.ok ? null : `the default goal plans nothing from this catalog: ${draft.reason}`;
}

/** What the dock's build status line states: the probe's honest answer plus the pinned lane facts. */
export interface BuildArcState {
  available: boolean;
  serverVersion: string;
  reason: string;
  arcId: string;
  goal: string;
  engine: string;
  /** The step CATALOG (what CAN be planned), not a promise of what will run. */
  steps: string[][];
}

export async function buildArcState(options: { spawnLike?: SpawnLike } = {}): Promise<BuildArcState> {
  const lane = await containerLaneState(options);
  return {
    available: lane.available,
    serverVersion: lane.serverVersion,
    reason: lane.reason,
    arcId: STUDIO_BUILD_ARC_ID,
    goal: STUDIO_BUILD_GOAL,
    engine: STUDIO_BUILD_ENGINE,
    steps: STUDIO_BUILD_CATALOG.map((t) => [...t.argv]),
  };
}

/** One walked step, display-ready: the engine's own detail (and stdout, when it printed). */
export interface BuildArcAnswerStep {
  callId: string;
  stepId: string;
  ok: boolean;
  detail: string;
  stdout?: string;
}

/**
 * The route's answer. A planner that finds nothing to summon and a walked-but-red arc are
 * both HONEST answers (`status: 'unplanned'` / `'failed'` plus the stated reason), never
 * errors; only an unexpected route failure is `ok: false`.
 */
export type BuildArcAnswer =
  | { ok: false; reason: string }
  | {
      ok: true;
      status: BuildArcStatus | 'unplanned';
      stoppedAt?: string;
      reason?: string;
      /** The goal this walk planned for (the request's, or the face's default). */
      goal: string;
      /** WHO chose the steps — the planner's provenance, stamped on the answer (§63). */
      planned?: BuildArcProvenance;
      /** One line for the panel and the ledger — the arc's verdict in its own words. */
      detail: string;
      steps: BuildArcAnswerStep[];
      /** §28 receipts for THIS walk's doors, in ask order — callId joins them to the arc. */
      receipts: { callId: string; granted: boolean; reason: string }[];
    };

/**
 * v177 (ADR 0016 amendment 177): what the deploy face needs — the DISPLAY answer AND the
 * raw BuildArcOutcome (`planDeployArc`'s input). `outcome` is present iff the arc was
 * actually planned and walked; an unplanned goal walks nothing, so there is no outcome.
 */
export interface StudioBuildWalk {
  answer: BuildArcAnswer;
  outcome: BuildArcOutcome | null;
}

export async function runStudioBuildArcOutcome(options: { spawnLike?: SpawnLike; goal?: string } = {}): Promise<StudioBuildWalk> {
  const planner = templateBuildPlanner(STUDIO_BUILD_CATALOG, STUDIO_BUILD_ARC_ID);
  const goal = typeof options.goal === 'string' && options.goal.trim() !== '' ? options.goal : STUDIO_BUILD_GOAL;
  const drafted = planner({ goal });
  if (!drafted.ok) {
    return {
      outcome: null,
      answer: {
        ok: true,
        status: 'unplanned',
        reason: drafted.reason,
        goal,
        detail: `build arc ${STUDIO_BUILD_ARC_ID}: unplanned — ${drafted.reason}`,
        steps: [],
        receipts: [],
      },
    };
  }
  const spec: BuildArcSpec = drafted.draft.spec;
  const host = createStudioContainerHost(options);
  const registry = registerBuildTools(new ToolRegistry(), containerVerifyRunner(host));
  const checkpoint = policyCheckpoint(STUDIO_BUILD_CHECKPOINT_POLICY);
  const outcome = await runBuildArc(spec, { registry, checkpoint, recordReceipts: true });
  const steps: BuildArcAnswerStep[] = outcome.results.map((r) => {
    const verdict = (r.output ?? {}) as { ok?: boolean; detail?: string; stdout?: string };
    return {
      callId: r.callId,
      stepId: r.callId.slice(spec.arcId.length + 1),
      ok: r.ok && verdict.ok === true,
      detail: r.ok ? (verdict.detail ?? '') : (r.error ?? 'refused'),
      ...(verdict.stdout === undefined ? {} : { stdout: verdict.stdout }),
    };
  });
  const green = steps.filter((s) => s.ok).length;
  const plannedBy = `planned by ${drafted.draft.provenance.backend} (seed ${drafted.draft.provenance.seed}; picked ${drafted.draft.provenance.picked.join('+')})`;
  const detail =
    outcome.status === 'completed'
      ? `build arc ${outcome.arcId}: ${green}/${steps.length} step(s) green — engine ${STUDIO_BUILD_ENGINE} — ${plannedBy}`
      : outcome.status === 'denied'
        ? `build arc ${outcome.arcId}: denied at ${outcome.stoppedAt ?? '?'} — ${outcome.reason ?? ''}`
        : `build arc ${outcome.arcId}: ${outcome.status} at ${outcome.stoppedAt ?? '?'} — ${outcome.reason ?? ''}`;
  return {
    outcome,
    answer: {
      ok: true,
      status: outcome.status,
      ...(outcome.stoppedAt === undefined ? {} : { stoppedAt: outcome.stoppedAt }),
      ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
      goal,
      planned: drafted.draft.provenance,
      detail,
      steps,
      receipts: (outcome.decisions ?? []).map((d) => ({ callId: d.call.callId, granted: d.granted, reason: d.reason })),
    },
  };
}

export async function runStudioBuildArc(options: { spawnLike?: SpawnLike; goal?: string } = {}): Promise<BuildArcAnswer> {
  return (await runStudioBuildArcOutcome(options)).answer;
}
