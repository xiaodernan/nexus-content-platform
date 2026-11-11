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

/**
 * 一条没能完成的作业的去向记录（ADR 0066 的 "dead-letter by log" 第一步：从一行日志升级为可查询的事件）。
 *
 * `kind` 区分两种终态：
 * - `exhausted`：handler 一直抛，重试到 `maxAttempts` 上限后被丢弃；
 * - `poison`：条目本身取不出可执行的 envelope（Redis 侧 body JSON 解析失败 / 缺字段），无法交给任何 handler。
 *
 * 只带**摘要**不带完整 payload：`bodyPreview` 截到定长，且不保证是合法 JSON。advisory side-effect lane
 * 不该把用户数据（通知 payload 里可能有标题 / 链接）再复制进一份长期账本；需要完整内容时应回放 Redis
 * stream 本身（在 MAXLEN 窗口内），而不是指望这条记录。
 */
export interface DeadLetterEntry {
  kind: 'exhausted' | 'poison';
  type: string;
  attempts: number;
  reason: string;
  at: number;
  bodyPreview: string;
}

/** 可选观察者：两驱在作业进入终态（重试耗尽 / 毒条目）时调用。缺省则退回 console.error，行为不变。 */
export type DeadLetterSink = (entry: DeadLetterEntry) => void;

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
  /** 终态作业（重试耗尽 / 毒条目）的观察者。不设则只记日志——与 v661 行为完全一致。 */
  onDeadLetter?: DeadLetterSink;
}
