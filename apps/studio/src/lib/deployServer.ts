/**
 * M6 v177 (ADR 0016 amendment 177): the SERVER half of the dock's DEPLOY face — the deploy
 * arc's FIRST PRODUCT CONSUMER. The shape is v174/v175's build face lifted one leg: the
 * request's GOAL plans and walks the build arc through the SAME container wall (v175's
 * planner invents nothing), and a green arc's measured facts — each verify step's stdout,
 * verbatim — are recorded through the runtime's ONE write door (`deploy.record`, am. 176)
 * into a JSONL file on THIS server. The runtime holds no sink and no write path; THIS module
 * is the host that injects one, so "deploy" means exactly what am. 176 says: the engine's
 * own words become a durable record, one §28 gate per fact. It is NOT a push or a publish.
 *
 * The panel's Allow-once is the human gate: `STUDIO_DEPLOY_CHECKPOINT_POLICY` grants
 * `deploy.record` on record (the route answers for the human who pressed Deploy), everything
 * else default-deny, and every decision rides the answer as a receipt.
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  DEPLOY_RECORD_TOOL,
  planDeployArc,
  policyCheckpoint,
  registerDeployTools,
  runDeployArc,
  validateCheckpointPolicy,
  ToolRegistry,
  type CheckpointPolicy,
  type DeploySink,
} from '@nexus/agent-runtime';
import type { SpawnLike } from '@nexus/exec-host';

import { buildArcState, STUDIO_BUILD_ARC_ID, STUDIO_BUILD_ENGINE, runStudioBuildArcOutcome, type BuildArcState } from './buildServer';

/** Where the deploy records live — one JSONL line per recorded fact, append-only. */
export const STUDIO_DEPLOY_RECORDS_PATH = '.nexus/deployments.jsonl';

/**
 * The dock's §28 stance for the write door: pressing Deploy IS the human's allow-once for
 * recording this arc's facts; every other tool stays default-deny, on record.
 */
export const STUDIO_DEPLOY_CHECKPOINT_POLICY: CheckpointPolicy = {
  rules: [{ tool: DEPLOY_RECORD_TOOL, grant: true, reason: 'the human allowed this deployment once at the dock panel (§28 Allow-once)' }],
  default: { grant: false, reason: 'no rule named this tool — default-deny' },
};

export function studioDeployCheckpointPolicyError(): string | null {
  try {
    validateCheckpointPolicy(STUDIO_DEPLOY_CHECKPOINT_POLICY);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** The fs the sink needs. Tests inject an in-memory fake; production uses node:fs. */
export interface StudioDeployFs {
  appendFileSync(path: string, data: string): void;
  readFileSync(path: string, encoding: 'utf8'): string;
}

/** One durable line in the records file — the engine's own words, plus WHO recorded them. */
export interface DeployRecord {
  at: number;
  arcId: string;
  goal: string;
  stepId: string;
  /** The verify step's stdout, byte for byte — the measured fact (am. 176). */
  fact: string;
  engine: string;
}

export function createStudioDeploySink(options: {
  fs: StudioDeployFs;
  recordsPath: string;
  arcId: string;
  goal: string;
  engine: string;
}): { sink: DeploySink; records: DeployRecord[] } {
  const records: DeployRecord[] = [];
  const sink: DeploySink = async (request) => {
    const record: DeployRecord = {
      at: Date.now(),
      arcId: options.arcId,
      goal: options.goal,
      stepId: request.stepId,
      fact: request.fact,
      engine: options.engine,
    };
    try {
      options.fs.appendFileSync(options.recordsPath, `${JSON.stringify(record)}\n`);
    } catch (e) {
      return { ok: false, detail: `the record did not land: ${e instanceof Error ? e.message : String(e)}` };
    }
    records.push(record);
    return { ok: true, detail: `recorded ${request.stepId} → ${options.recordsPath}` };
  };
  return { sink, records };
}

/** Count the durable lines already in the records file — 0 when none exist yet. */
export function studioDeployRecordCount(options: { fs: StudioDeployFs; recordsPath: string }): number {
  let raw: string;
  try {
    raw = options.fs.readFileSync(options.recordsPath, 'utf8');
  } catch {
    return 0;
  }
  return raw.split('\n').filter((l) => l.trim() !== '').length;
}

/** What the dock's deploy status line states: the build lane it deploys from, plus the records file. */
export interface DeployArcState extends BuildArcState {
  recordsPath: string;
  recordCount: number;
}

export async function deployArcState(options: { spawnLike?: SpawnLike; fs?: StudioDeployFs } = {}): Promise<DeployArcState> {
  const base = await buildArcState(options);
  const fs = options.fs ?? nodeDeployFs;
  return {
    ...base,
    recordsPath: STUDIO_DEPLOY_RECORDS_PATH,
    recordCount: studioDeployRecordCount({ fs, recordsPath: STUDIO_DEPLOY_RECORDS_PATH }),
  };
}

/** The node:fs-backed host store used in production (tests inject their own). */
export const nodeDeployFs: StudioDeployFs = {
  appendFileSync: (path, data) => {
    mkdirSync(dirname(path), { recursive: true }); // a records path is allowed to be the FIRST thing in its directory
    appendFileSync(path, data);
  },
  readFileSync: (path, encoding) => readFileSync(path, encoding),
};

/** One recorded (or refused) fact, display-ready. */
export interface DeployArcAnswerFact {
  stepId: string;
  stdout: string;
}

/**
 * The route's answer. A build arc that did not complete, an unplanned goal and a sink that
 * refused are all HONEST answers (`status: 'not-green'` / `'unplanned'` / `'failed'` plus the
 * stated reason), never errors; only an unexpected route failure is `ok: false`.
 */
export type DeployArcAnswer =
  | { ok: false; reason: string }
  | {
      ok: true;
      status: 'recorded' | 'not-green' | 'unplanned' | 'nothing-measured' | 'no-sink' | 'denied' | 'failed';
      stoppedAt?: string;
      reason?: string;
      /** The goal the arc was planned for (the request's, or the face's default). */
      goal: string;
      /** The BUILD verdict this deploy stands on — who built it, in the build face's own words. */
      build: { status: string; detail: string };
      /** One line for the panel and the ledger — the deploy's verdict in its own words. */
      detail: string;
      /** The facts the sink received, in door order — each one's stdout verbatim. */
      facts: DeployArcAnswerFact[];
      /** Green steps the engine measured nothing from — named, never summarized (am. 176). */
      unmeasured: string[];
      /** Where the records landed (present iff at least one fact was recorded). */
      recordsPath?: string;
      /** §28 receipts for THIS deploy's doors, in ask order. */
      deployReceipts: { callId: string; granted: boolean; reason: string }[];
    };

export async function runStudioDeployArc(
  options: { spawnLike?: SpawnLike; goal?: string; fs?: StudioDeployFs; recordsPath?: string } = {},
): Promise<DeployArcAnswer> {
  const walk = await runStudioBuildArcOutcome({ spawnLike: options.spawnLike, goal: options.goal });
  if (!walk.answer.ok) {
    return { ok: false, reason: walk.answer.reason };
  }
  const buildStatus = walk.answer.status;
  const buildDetail = walk.answer.detail;
  const goal = walk.answer.goal;
  if (buildStatus === 'unplanned' || walk.outcome === null) {
    return {
      ok: true,
      status: 'unplanned',
      reason: walk.answer.reason,
      goal,
      build: { status: buildStatus, detail: buildDetail },
      detail: `deploy arc ${STUDIO_BUILD_ARC_ID}: nothing deployed — ${walk.answer.reason ?? 'the goal planned no arc'}`,
      facts: [],
      unmeasured: [],
      deployReceipts: [],
    };
  }
  if (buildStatus !== 'completed') {
    return {
      ok: true,
      status: 'not-green',
      ...(walk.answer.stoppedAt === undefined ? {} : { stoppedAt: walk.answer.stoppedAt }),
      reason: walk.answer.reason,
      goal,
      build: { status: buildStatus, detail: buildDetail },
      detail: `deploy arc ${STUDIO_BUILD_ARC_ID}: nothing deployed — a build arc that did not complete (${buildStatus}) deploys nothing`,
      facts: [],
      unmeasured: [],
      deployReceipts: [],
    };
  }
  const planned = planDeployArc(walk.outcome);
  if (!planned.ok) {
    return {
      ok: true,
      status: 'nothing-measured',
      reason: planned.reason,
      goal,
      build: { status: buildStatus, detail: buildDetail },
      detail: `deploy arc ${STUDIO_BUILD_ARC_ID}: nothing deployed — ${planned.reason}`,
      facts: [],
      unmeasured: [],
      deployReceipts: [],
    };
  }
  const fs = options.fs ?? nodeDeployFs;
  const recordsPath = options.recordsPath ?? STUDIO_DEPLOY_RECORDS_PATH;
  const { sink, records } = createStudioDeploySink({ fs, recordsPath, arcId: STUDIO_BUILD_ARC_ID, goal, engine: STUDIO_BUILD_ENGINE });
  const registry = registerDeployTools(new ToolRegistry(), sink);
  const checkpoint = policyCheckpoint(STUDIO_DEPLOY_CHECKPOINT_POLICY);
  const outcome = await runDeployArc(walk.outcome, { registry, checkpoint, recordReceipts: true });
  const facts: DeployArcAnswerFact[] = records.map((r) => ({ stepId: r.stepId, stdout: r.fact }));
  const detail =
    outcome.status === 'recorded'
      ? `deploy arc ${STUDIO_BUILD_ARC_ID}: ${records.length} fact(s) recorded → ${recordsPath}`
      : `deploy arc ${STUDIO_BUILD_ARC_ID}: nothing recorded — ${outcome.status} at ${outcome.stoppedAt ?? '?'} — ${outcome.reason ?? ''}`;
  return {
    ok: true,
    status: outcome.status,
    ...(outcome.stoppedAt === undefined ? {} : { stoppedAt: outcome.stoppedAt }),
    ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
    goal,
    build: { status: buildStatus, detail: buildDetail },
    detail,
    facts,
    unmeasured: planned.plan.unmeasured,
    ...(records.length > 0 ? { recordsPath } : {}),
    deployReceipts: (outcome.decisions ?? []).map((d) => ({ callId: d.call.callId, granted: d.granted, reason: d.reason })),
  };
}
