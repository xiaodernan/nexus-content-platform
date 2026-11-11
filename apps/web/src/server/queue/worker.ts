import type { JobEnvelope, JobHandler, JobHandlerContext, JobQueue } from './jobQueue';
import { createJobQueue } from './redisStreamJobQueue';
import { JOB_HANDLERS } from './handlers';
import { makeDeadLetter } from './deadLetter';

/**
 * The in-process job worker (ADR 0065). One consumer loop per Next server instance, held on globalThis
 * so dev hot-reload and per-route module graphs cannot start two loops that compete for the same group.
 *
 * TWO switches, deliberately separate:
 *  - `NEXUS_JOB_QUEUE=1` opts the lane IN. Off (default) means the old synchronous path runs and NO
 *    queue connection is opened. This is why the ten export integration tests stay byte-for-byte green.
 *  - `NEXUS_REDIS_URL` picks the driver. Set → Redis Streams (durable, cross-instance, reclaims a dead
 *    worker's pending entries). Unset → the in-memory driver (real queue, but dies with the process).
 *    Reusing NEXUS_REDIS_URL for DRIVER choice is fine; it is NOT the opt-in switch. An instance that
 *    wants Redis only for realtime fanout does not accidentally run a worker.
 *
 * Deliberate asymmetry with the realtime bus: that one silently degrades in-process when its Redis wire
 * is down (events are advisory and lossy). Here, with the knob ON but no Redis URL, we still run the
 * in-memory driver AND log a clear warning — durable side-effects silently running in memory would be a
 * durability lie. The warning makes "you asked for durable, you got process-local" visible.
 */

export const JOB_QUEUE_ENABLED_ENV = 'NEXUS_JOB_QUEUE';

export function jobQueueEnabled(): boolean {
  const v = process.env[JOB_QUEUE_ENABLED_ENV]?.trim().toLowerCase() ?? '';
  return v === '1' || v === 'true' || v === 'on';
}

export interface JobWorkerStats {
  running: boolean;
  driver: JobQueue['driver'] | 'none';
  handlers: string[];
  /** The job types seen since this worker started — for the admin diagnostic, not a durability claim. */
  processed: Record<string, number>;
  failed: number;
  startedAt: number | null;
}

const GLOBAL_KEY = '__nexus_job_worker__';
interface WorkerState {
  queue: JobQueue | null;
  stats: JobWorkerStats;
  startPromise: Promise<void> | null;
}
type GlobalStore = typeof globalThis & { [GLOBAL_KEY]?: WorkerState };
const store = globalThis as GlobalStore;

function state(): WorkerState {
  if (!store[GLOBAL_KEY]) {
    store[GLOBAL_KEY] = {
      queue: null,
      startPromise: null,
      stats: { running: false, driver: 'none', handlers: Object.keys(JOB_HANDLERS), processed: {}, failed: 0, startedAt: null },
    };
  }
  return store[GLOBAL_KEY];
}

/** The one place production config is read. Returns null (and logs) when the lane is off. */
export function getJobQueue(): JobQueue | null {
  if (!jobQueueEnabled()) return null;
  const s = state();
  if (s.queue) return s.queue;
  const url = process.env.NEXUS_REDIS_URL?.trim();
  if (!url) {
    console.warn(
      `[job-queue] ${JOB_QUEUE_ENABLED_ENV}=on 但没有 NEXUS_REDIS_URL：作业在进程内存中运行，` +
        `重启即失、不跨实例。要 durable 请设 NEXUS_REDIS_URL。`,
    );
  }
  s.queue = createJobQueue(url ? { url } : {});
  s.stats.driver = s.queue.driver;
  return s.queue;
}

/**
 * Start consuming. Idempotent and non-blocking: multiple calls share one in-flight start promise, so
 * `register()` may call it without awaiting and hot reloads cannot double-start the loop.
 */
/**
 * v668: 单个作业的分派，从 start() 的闭包里提出来成为**可用纯内存行为腿验证的导出函数**。
 * 三类 poison 汇入同一个 sink：transport 层（body 解析失败）在驱动内、schema 校验失败在 handler 内、
 * 未知 type 在这里。三处都保留 v661 现场日志逐字原样，且只在 `ctx` 存在（部署方注入 sink）时
 * 额外报告一次；`ctx` 为 undefined 时连 DeadLetterEntry 都不构造。返回（不抛）即让驱动 XACK，
 * 所以 poison 绝不重试、绝不卡 PENDING——ACK 语义相对 v661/v667 一字未动。
 */
export async function dispatchJob(
  job: JobEnvelope,
  ctx: JobHandlerContext | undefined,
  handlers: Record<string, JobHandler>,
  stats?: JobWorkerStats,
): Promise<void> {
  const handler = handlers[job.type];
  if (!handler) {
    console.error(`[job-queue] no handler for job type ${JSON.stringify(job.type)}; acking away entry ${job.id}`);
    ctx?.reportDeadLetter(makeDeadLetter({
      kind: 'poison', type: job.type, attempts: job.attempts,
      reason: `no registered handler for job type ${JSON.stringify(job.type)}`, body: job.payload,
    }));
    return;
  }
  try {
    await handler(job, ctx); // 透传 ctx：让 handler 内的 schema poison 也进同一账本
    if (stats) stats.processed[job.type] = (stats.processed[job.type] ?? 0) + 1;
  } catch (err) {
    if (stats) stats.failed += 1;
    throw err; // rethrow so the driver keeps it pending for retry/reclaim
  }
}

export function startJobWorker(): Promise<void> {
  const s = state();
  if (s.stats.running || s.startPromise) return s.startPromise ?? Promise.resolve();
  const queue = getJobQueue();
  if (!queue) return Promise.resolve(); // lane is off — a true no-op, no connection opened

  s.startPromise = queue
    .start((job, ctx) => dispatchJob(job, ctx, JOB_HANDLERS, s.stats))
    .then(() => {
      s.stats.running = true;
      s.stats.startedAt = Date.now();
    })
    .catch((err) => {
      // A failed start must not leave a poisoned promise that forever short-circuits every later call.
      console.error('[job-queue] worker failed to start:', err);
      s.startPromise = null;
    });
  return s.startPromise;
}

/** Stop consuming and release connections. Used by tests and graceful shutdown. */
export async function stopJobWorker(): Promise<void> {
  const s = state();
  if (!s.queue) {
    s.stats.running = false;
    return;
  }
  await s.queue.stop();
  s.stats.running = false;
  s.queue = null;
  s.startPromise = null;
}

export function getJobWorkerStats(): JobWorkerStats {
  return { ...state().stats, processed: { ...state().stats.processed }, handlers: [...state().stats.handlers] };
}

/** Test-only: drop the singleton so a later test re-reads the environment. */
export function __resetJobWorker(): void {
  delete store[GLOBAL_KEY];
}
