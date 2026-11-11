/**
 * An internal async job queue — the "message queue" slice of the platform.
 *
 * Why Redis Streams and not a broker: the honest map (ADR 0064) already says delivery to clients is
 * SSE and cross-instance fan-out is Redis pub/sub. A broker (Kafka/Rabbit) would be a second system to
 * operate for a workload this platform does not have yet. Redis Streams gives us what the async jobs
 * actually need — a durable, append-only log with consumer groups, at-least-once delivery, and
 * pending-message reclaim — using the Redis we already run. It is NOT a client-facing broker; it is the
 * "do this later, possibly on another instance" pipe.
 *
 * The contract is at-least-once: a crash between work and ack re-delivers the job, so handlers must be
 * idempotent. The Redis driver reclaims abandoned pending entries (an instance that died mid-job) via
 * XCLAIM, so a job is not lost and not stuck.
 */

export interface JobEnvelope<T = unknown> {
  /** The Redis stream entry id (or an in-memory sequence) — stable for the life of the job. */
  id: string;
  type: string;
  payload: T;
  /** How many times this job has been handed to a handler (1 on first delivery). */
  attempts: number;
  createdAt: number;
}

export type JobHandler = (job: JobEnvelope) => Promise<void>;

export type JobQueueDriver = 'redis' | 'memory';

export interface JobQueue {
  readonly driver: JobQueueDriver;
  /** Append a job. Resolves with the job id. Never throws for a transient network blip on the Redis
   *  driver — a job that cannot be enqueued is logged and the caller's request proceeds (the queue
   *  serves the work, the work must not block on the queue). */
  enqueue<T>(type: string, payload: T): Promise<string>;
  /** Begin consuming. Resolves once the consumer group exists and the read loop is running. */
  start(handler: JobHandler): Promise<void>;
  /** Stop consuming and release connections. Resolves once the loop has exited. */
  stop(): Promise<void>;
}

export interface JobQueueOptions {
  /** When unset, the in-memory driver is used (single-instance, no durability). */
  url?: string;
  streamKey?: string;
  group?: string;
  consumer?: string;
  /** Hard ceiling on redelivery; beyond this the job is dropped and logged (dead-letter by log). */
  maxAttempts?: number;
  /** Approximate stream length cap (`XADD ... MAXLEN ~`). Old/ACKed entries are trimmed past it. */
  maxLen?: number;
  /** How long a read blocks waiting for new entries, in ms. */
  blockMs?: number;
  /** Idle time after which an unacked pending entry is reclaimed by another worker (XAUTOCLAIM). */
  reclaimMs?: number;
}
