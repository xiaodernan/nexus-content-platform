import { emit } from '@/server/domain/notifications';
import type { JobEnvelope } from './jobQueue';

/**
 * The registry of jobs this platform actually performs. A Redis Stream is only a transport; without
 * this table a worker would consume entries and do nothing. Adding a job type is a deliberate act:
 * name it here, give it a validator, and the worker will run it.
 *
 * The first lane (ADR 0065) is `build.complete`: the post-export notification. It used to be awaited
 * inline on the download response path — writing the notification row and pushing SSE before the zip
 * could be handed back. That IO has nothing to do with whether the bytes are ready, and it is the kind
 * of work that must happen once but may happen a moment later. It moves here behind an opt-in knob.
 *
 * AT-LEAST-ONCE CONTRACT: a crash after the handler runs but before XACK re-delivers the same job. The
 * idempotency anchor is `exportId` — minted by the PRODUCER (not here) and carried in the payload, so a
 * redelivery reuses it and `emit`'s `dedupeKey = build:<exportId>` collapses the second write. Minting
 * the id inside the handler would defeat this: each retry would write a second notification.
 */

export interface BuildCompletePayload {
  recipientId: string;
  projectId: string;
  projectName: string;
  /** Producer-minted, stable across redelivery — the idempotency anchor. */
  exportId: string;
  ok: boolean;
  counts: { design: number; code: number; assets: number };
  missingAssets: number;
  durationMs: number | null;
  detail: string | null;
}

/** Validate the untrusted JSON body. Returns null for a poison entry (logged and acked away, never
 *  allowed to kill the read loop or reach `emit` with a shape it did not agree to). */
function parseBuildComplete(raw: unknown): BuildCompletePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  const str = (k: string): string | null =>
    typeof v[k] === 'string' && (v[k] as string).length > 0 ? (v[k] as string) : null;
  const finite = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  const counts = v.counts && typeof v.counts === 'object' ? (v.counts as Record<string, unknown>) : null;

  // These four are identity/idempotency anchors — a job missing any of them must not reach emit.
  const recipientId = str('recipientId');
  const projectId = str('projectId');
  const projectName = str('projectName');
  const exportId = str('exportId');
  if (!recipientId || !projectId || !projectName || !exportId || !counts) return null;

  return {
    recipientId,
    projectId,
    projectName,
    exportId,
    ok: v.ok === true,
    // Numbers default to 0 (never NaN) so a partial payload cannot produce "NaN 个文件" in a title.
    counts: {
      design: finite(counts.design),
      code: finite(counts.code),
      assets: finite(counts.assets),
    },
    missingAssets: finite(v.missingAssets),
    durationMs: typeof v.durationMs === 'number' && Number.isFinite(v.durationMs) ? v.durationMs : null,
    detail: typeof v.detail === 'string' ? v.detail : null,
  };
}

export type JobHandler = (job: JobEnvelope) => Promise<void>;

/** `build.complete` → the real notification emitter. No behaviour is reimplemented here. */
const buildComplete: JobHandler = async (job) => {
  const payload = parseBuildComplete(job.payload);
  if (!payload) {
    console.error(`[job-queue] poison build.complete entry ${job.id}: payload did not match the contract; acking away`);
    return; // Returning (not throwing) lets the worker XACK it out of the pending set.
  }
  await emit({
    kind: 'build',
    recipientId: payload.recipientId,
    projectId: payload.projectId,
    projectName: payload.projectName,
    exportId: payload.exportId,
    ok: payload.ok,
    counts: payload.counts,
    missingAssets: payload.missingAssets,
    durationMs: payload.durationMs,
    detail: payload.detail,
  });
};

/** The closed set of jobs a worker will run. An unknown type is a poison entry, logged and acked. */
export const JOB_HANDLERS: Record<string, JobHandler> = {
  'build.complete': buildComplete,
};

/** Exported for a unit test of the untrusted-payload boundary without touching the DB. */
export const __parseBuildComplete = parseBuildComplete;
