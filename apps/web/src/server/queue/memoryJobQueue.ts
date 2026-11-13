import type { DeadLetterSink, JobEnvelope, JobHandler, JobQueue, JobQueueOptions } from './jobQueue';
import { consoleDeadLetterSink, makeDeadLetter } from './deadLetter';

/**
 * Single-instance, in-memory job queue. Used when the job lane is opted into but no Redis URL is
 * available: no durability, no cross-instance work, but the same contract as the Redis driver so call
 * sites do not branch. A job enqueued on one instance is only ever worked on that instance — which is
 * exactly the single-instance deployment this fallback describes.
 *
 * It is a real queue, not a no-op: enqueue wakes a blocked drain, handlers run, and a throwing handler
 * is retried up to maxAttempts. What it cannot do is survive a process restart (that is what the Redis
 * Streams driver is for).
 */
export class MemoryJobQueue implements JobQueue {
  readonly driver = 'memory' as const;

  private readonly pending: JobEnvelope[] = [];
  private readonly maxAttempts: number;
  private readonly sink: DeadLetterSink;
  /** 只有部署方注入了 sink 才把账本通道透传给 handler；缺省 undefined ⇒ 默认行为逐字不变。 */
  private readonly ctx: { reportDeadLetter: DeadLetterSink } | undefined;
  private running = false;
  private loop: Promise<void> | null = null;
  private wakeDrain: (() => void) | null = null;
  private seq = 0;

  constructor(options?: JobQueueOptions) {
    this.maxAttempts = options?.maxAttempts ?? 5;
    this.sink = options?.onDeadLetter ?? consoleDeadLetterSink;
    const custom = options?.onDeadLetter;
    this.ctx = custom ? { reportDeadLetter: custom } : undefined;
  }

  async enqueue<T>(type: string, payload: T): Promise<string> {
    const id = `mem-${++this.seq}`;
    this.pending.push({ id, type, payload, attempts: 0, createdAt: Date.now() });
    // Wake a drain that is parked on an empty queue. One-shot: the drain clears it before waiting again.
    const wake = this.wakeDrain;
    this.wakeDrain = null;
    wake?.();
    return id;
  }

  async start(handler: JobHandler): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.loop = this.drain(handler);
  }

  async stop(): Promise<void> {
    this.running = false;
    const wake = this.wakeDrain;
    this.wakeDrain = null;
    wake?.();
    await this.loop;
  }

  private async drain(handler: JobHandler): Promise<void> {
    while (this.running) {
      const job = this.pending.shift();
      if (!job) {
        // Park until enqueue or stop wakes us. The latch is installed synchronously before the await,
        // so an enqueue that happens between the shift() and the await cannot be missed.
        await new Promise<void>((resolve) => {
          this.wakeDrain = resolve;
        });
        continue;
      }
      job.attempts += 1;
      try {
        await handler(job, this.ctx);
      } catch (err) {
        // At-least-once: a failed handler is put back for another attempt until the ceiling, then
        // dropped. Terminal jobs go to the same sink as the Redis driver (shape parity, v667).
        if (job.attempts < this.maxAttempts) this.pending.push(job);
        else this.sink(makeDeadLetter({ kind: 'exhausted', type: job.type, attempts: job.attempts, err, body: job.payload }));
      }
    }
  }
}
