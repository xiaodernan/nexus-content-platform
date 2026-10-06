/**
 * M6 v174 (ADR 0016 amendment 174): the SERVER half of the dock's BUILD face — the first
 * product consumer of the build arc (am. 173). The pattern is v172's container lane lifted
 * one level: the ARC is pinned here as data (the browser cannot name a single argv — the
 * POST body is empty by design), each verify step runs inside the SAME policy wall as every
 * container exec (am. 166/172), and the walk uses the runtime's own recording checkpoint
 * (`policyCheckpoint`) so the §28 receipts travel with the answer — the panel shows WHO the
 * door let in and why, per callId, not a bare green tick.
 *
 * The human gate stays where v172 put it: the dock panel's Allow-once dialog. The route's
 * checkpoint policy states that out loud — `build.verify` is granted BECAUSE the human
 * allowed the arc once, and every other tool is default-deny.
 */
import {
  planContainerRun,
  containerVerifyRunner,
  type SpawnLike,
} from '@nexus/exec-host';
import {
  planBuildArc,
  policyCheckpoint,
  registerBuildTools,
  runBuildArc,
  validateCheckpointPolicy,
  ToolRegistry,
  type BuildArcSpec,
  type BuildArcStatus,
  type CheckpointPolicy,
} from '@nexus/agent-runtime';

import { containerLaneState, createStudioContainerHost, STUDIO_CONTAINER_IMAGE, STUDIO_CONTAINER_POLICY } from './containerServer';

/** The ONE arc this face serves, pinned as data — the request can never name a step. */
export const STUDIO_BUILD_ARC_ID = 'studio-build-arc';
export const STUDIO_BUILD_ARC: BuildArcSpec = {
  arcId: STUDIO_BUILD_ARC_ID,
  goal: 'verify the dock build lane end to end inside the pinned container',
  steps: [
    { stepId: 'runtime', argv: ['node', '--version'], rationale: 'the container runtime answers with its own version' },
    { stepId: 'compute', argv: ['node', '-e', 'console.log("arc ok:" + String(2 + 3))'], rationale: 'the container computes and prints — stdout is the measured fact' },
  ],
};
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

/** Every pinned step must fit the SAME container allowlist the exec lane serves — asserted, not assumed. */
export function studioBuildArcAllowlistError(): string | null {
  const planned = planBuildArc(STUDIO_BUILD_ARC);
  if (!planned.ok) return planned.reason;
  for (const step of STUDIO_BUILD_ARC.steps) {
    const decision = planContainerRun({ argv: [...step.argv], ...(step.cwd === undefined ? {} : { cwd: step.cwd }) }, STUDIO_CONTAINER_POLICY);
    if (!decision.ok) return `step "${step.stepId}" is outside the container policy: ${decision.reason}`;
  }
  return null;
}

/** What the dock's build status line states: the probe's honest answer plus the pinned arc facts. */
export interface BuildArcState {
  available: boolean;
  serverVersion: string;
  reason: string;
  arcId: string;
  goal: string;
  engine: string;
  steps: string[][];
}

export async function buildArcState(options: { spawnLike?: SpawnLike } = {}): Promise<BuildArcState> {
  const lane = await containerLaneState(options);
  return {
    available: lane.available,
    serverVersion: lane.serverVersion,
    reason: lane.reason,
    arcId: STUDIO_BUILD_ARC.arcId,
    goal: STUDIO_BUILD_ARC.goal,
    engine: STUDIO_BUILD_ENGINE,
    steps: STUDIO_BUILD_ARC.steps.map((s) => [...s.argv]),
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
 * The route's answer. A walked-but-red arc is an HONEST answer (`status: 'failed'` plus the
 * engine's own words), never an error; only an unexpected route failure is `ok: false`.
 */
export type BuildArcAnswer =
  | { ok: false; reason: string }
  | {
      ok: true;
      status: BuildArcStatus;
      stoppedAt?: string;
      reason?: string;
      /** One line for the panel and the ledger — the arc's verdict in its own words. */
      detail: string;
      steps: BuildArcAnswerStep[];
      /** §28 receipts for THIS walk's doors, in ask order — callId joins them to the arc. */
      receipts: { callId: string; granted: boolean; reason: string }[];
    };

export async function runStudioBuildArc(options: { spawnLike?: SpawnLike } = {}): Promise<BuildArcAnswer> {
  const host = createStudioContainerHost(options);
  const registry = registerBuildTools(new ToolRegistry(), containerVerifyRunner(host));
  const checkpoint = policyCheckpoint(STUDIO_BUILD_CHECKPOINT_POLICY);
  const outcome = await runBuildArc(STUDIO_BUILD_ARC, { registry, checkpoint, recordReceipts: true });
  const steps: BuildArcAnswerStep[] = outcome.results.map((r) => {
    const verdict = (r.output ?? {}) as { ok?: boolean; detail?: string; stdout?: string };
    return {
      callId: r.callId,
      stepId: r.callId.slice(STUDIO_BUILD_ARC_ID.length + 1),
      ok: r.ok && verdict.ok === true,
      detail: r.ok ? (verdict.detail ?? '') : (r.error ?? 'refused'),
      ...(verdict.stdout === undefined ? {} : { stdout: verdict.stdout }),
    };
  });
  const green = steps.filter((s) => s.ok).length;
  const detail =
    outcome.status === 'completed'
      ? `build arc ${outcome.arcId}: ${green}/${steps.length} step(s) green — engine ${STUDIO_BUILD_ENGINE}`
      : outcome.status === 'denied'
        ? `build arc ${outcome.arcId}: denied at ${outcome.stoppedAt ?? '?'} — ${outcome.reason ?? ''}`
        : `build arc ${outcome.arcId}: ${outcome.status} at ${outcome.stoppedAt ?? '?'} — ${outcome.reason ?? ''}`;
  return {
    ok: true,
    status: outcome.status,
    ...(outcome.stoppedAt === undefined ? {} : { stoppedAt: outcome.stoppedAt }),
    ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
    detail,
    steps,
    receipts: (outcome.decisions ?? []).map((d) => ({ callId: d.call.callId, granted: d.granted, reason: d.reason })),
  };
}
