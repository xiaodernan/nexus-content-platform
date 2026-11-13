import { Redis } from 'ioredis';
import type { DeadLetterSink, JobEnvelope, JobHandler, JobQueue, JobQueueDriver, JobQueueOptions } from './jobQueue';
import { MemoryJobQueue } from './memoryJobQueue';
import { consoleDeadLetterSink, makeDeadLetter } from './deadLetter';

/**
 * Redis Streams job queue.
 *
 * Producer appends with XADD; a consumer GROUP reads with XREADGROUP and acks with XACK. A job that
 * dies unacked becomes PENDING and is reclaimed by XAUTOCLAIM once it has been idle past `reclaimMs`,
 * so a crashed worker does not lose or permanently stall a job. Retries are bounded by `maxAttempts`:
 * a handler that keeps throwing is re-enqueued (fresh id, attempts+1) up to the ceiling, then dropped
 * and logged — dead-letter by log, since this platform has no dead-letter store yet.
 *
 * Two connections, deliberately: XREADGROUP BLOCK holds its connection until an entry arrives or the
 * block elapses. On a single connection that would starve enqueue/ack, which share the same socket and
 * are serialized by ioredis. The reader blocks; the writer serves the rest. (Same asymmetry the realtime
 * bus uses for pub/sub.)
 */
export class RedisStreamJobQueue implements JobQueue {
  readonly driver: JobQueueDriver = 'redis';

  private readonly streamKey: string;
  private readonly group: string;
  private readonly consumer: string;
  private readonly maxAttempts: number;
  private readonly blockMs: number;
  private readonly reclaimMs: number;
  private readonly maxLen: number;
  private readonly sink: DeadLetterSink;
  /** 只有部署方注入了 sink 才把账本通道透传给 handler；缺省 undefined ⇒ 默认行为逐字不变。 */
  private readonly ctx: { reportDeadLetter: DeadLetterSink } | undefined;

  private readonly reader: Redis;
  private readonly writer: Redis;
  private running = false;
  private loop: Promise<void> | null = null;

  constructor(options?: JobQueueOptions) {
    const url = options?.url ?? process.env.NEXUS_REDIS_URL ?? 'redis://127.0.0.1:6379';
    this.streamKey = options?.streamKey ?? 'nexus:jobs:v1';
    this.group = options?.group ?? 'nexus-workers';
    this.consumer = options?.consumer ?? `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    this.maxAttempts = options?.maxAttempts ?? 5;
    this.blockMs = options?.blockMs ?? 2000;
    this.reclaimMs =
      options?.reclaimMs ?? (options?.blockMs != null ? Math.max(options.blockMs * 5, 10_000) : 10_000);
    // `MAXLEN ~` trims OLD (already-ACKed) entries past the cap; `~` keeps XADD O(1) over macro
    // nodes. If an UNPROCESSED backlog exceeds the cap, the oldest are shed to bound memory — the
    // stated trade in ADR 0066 for advisory side-effects.
    this.maxLen = options?.maxLen ?? RedisStreamJobQueue.DEFAULT_MAX_LEN;
    this.sink = options?.onDeadLetter ?? consoleDeadLetterSink;
    const custom = options?.onDeadLetter;
    this.ctx = custom ? { reportDeadLetter: custom } : undefined;
    // Reader: blocking reads must not queue offline; writer: a send that cannot go should not hang a request.
    this.reader = new Redis(url, { maxRetriesPerRequest: null, enableOfflineQueue: false } as never);
    this.writer = new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: true } as never);
  }

  /** Default bound; overridable per lane so a small-cap test can prove the trim without 10k XADDs. */
  private static readonly DEFAULT_MAX_LEN = 10_000;

  /** The single append path for both a fresh enqueue and a retry — one MAXLEN policy, no drift. */
  private async append(type: string, payload: unknown, attempts: number): Promise<string> {
    const id = await this.writer.xadd(
      this.streamKey, 'MAXLEN', '~', String(this.maxLen),
      '*', 'type', type, 'body', JSON.stringify(payload ?? null), 'attempts', String(attempts),
    );
    return id ?? '';
  }

  async enqueue<T>(type: string, payload: T): Promise<string> {
    try {
      // A null id from a blip is reported as an empty id rather than throwing into the caller's
      // request path — the enqueue never fails the request it serves.
      return await this.append(type, payload, 0);
    } catch (err) {
      console.error(`[job-queue] enqueue failed for ${type}; request proceeds without async work:`, err);
      return '';
    }
  }

  async start(handler: JobHandler): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.writer.xgroup('CREATE', this.streamKey, this.group, '0', 'MKSTREAM');
    } catch (err) {
      // BUSYGROUP is expected when the group already exists; anything else is real.
      const msg = String((err as Error)?.message ?? err);
      if (!msg.includes('BUSYGROUP')) console.error(`[job-queue] create group failed:`, err);
    }
    this.loop = this.drain(handler);
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.loop;
    this.reader.disconnect();
    this.writer.disconnect();
  }

  private async drain(handler: JobHandler): Promise<void> {
    while (this.running) {
      try {
        // Reclaim entries this consumer (or a dead one) left pending too long. Reclaimed entries carry
        // their raw id+fields so a poison one can be acked away too — dropping null here would strand it
        // in PENDING forever, where XAUTOCLAIM would keep re-handing it to us each tick (v667 fix).
        const claimed = await this.reclaim();
        for (const [id, fields] of claimed) await this.handleEntry(id, fields, handler);

        const res = (await this.reader.xreadgroup(
          'GROUP',
          this.group,
          this.consumer,
          'COUNT',
          '10',
          'BLOCK',
          String(this.blockMs),
          'STREAMS',
          this.streamKey,
          '>',
        )) as [string, [string, string[]][]][] | null;
        if (!res) continue;
        for (const [, entries] of res) {
          for (const [id, fields] of entries) await this.handleEntry(id, fields, handler);
        }
      } catch (err) {
        // A blip in the read loop must not kill the worker; log and retry next tick.
        console.error('[job-queue] read loop error:', err);
        await new Promise((r) => setTimeout(r, this.blockMs));
      }
    }
  }

  /** Return raw id+fields (not envelopes) so the poison path still has the id to XACK. */
  private async reclaim(): Promise<[string, string[]][]> {
    try {
      const out = (await this.writer.xautoclaim(
        this.streamKey,
        this.group,
        this.consumer,
        String(this.reclaimMs),
        '0',
        'COUNT',
        '10',
      )) as [string, [string, string[]][], string[]];
      return out[1] ?? [];
    } catch {
      return [];
    }
  }

  /**
   * The one funnel for both fresh reads and reclaimed entries. A poison entry (unparseable body / missing
   * fields) is ACKed away AND reported to the sink — ADR 0066 promises "logged and ACKed away", which the
   * old `if (job) process(...)` silently violated for null envelopes (never acked, re-claimed forever).
   */
  private async handleEntry(id: string, fields: string[], handler: JobHandler): Promise<void> {
    const job = this.toEnvelope(id, fields);
    if (!job) {
      this.sink(makeDeadLetter({ kind: 'poison', type: this.rawType(fields), attempts: 0, body: this.rawBody(fields) }));
      await this.writer.xack(this.streamKey, this.group, id);
      return;
    }
    await this.process(job, handler);
  }

  /** Best-effort type/body out of a malformed field list, for the poison record only. Never throws. */
  private rawType(fields: string[]): string {
    for (let i = 0; i + 1 < fields.length; i += 2) if (fields[i] === 'type') return fields[i + 1] ?? '';
    return '<unknown>';
  }
  private rawBody(fields: string[]): string {
    for (let i = 0; i + 1 < fields.length; i += 2) if (fields[i] === 'body') return fields[i + 1] ?? '';
    return '';
  }

  private async process(job: JobEnvelope, handler: JobHandler): Promise<void> {
    try {
      await handler(job, this.ctx);
      await this.writer.xack(this.streamKey, this.group, job.id);
    } catch (err) {
      console.error(`[job-queue] handler failed for ${job.type} (attempt ${job.attempts}):`, err);
      if (job.attempts < this.maxAttempts) {
        // Re-enqueue a fresh entry and ack the old one so it leaves the pending set. Same MAXLEN cap
        // as the producer path — a retry that skipped it would be the hole that lets the stream grow.
        await this.append(job.type, job.payload, job.attempts + 1);
      } else {
        // Terminal: report to the sink (default keeps the old log line) instead of only console.error.
        this.sink(makeDeadLetter({ kind: 'exhausted', type: job.type, attempts: job.attempts, err, body: job.payload }));
      }
      await this.writer.xack(this.streamKey, this.group, job.id);
    }
  }

  private toEnvelope(id: string, fields: string[]): JobEnvelope | null {
    const map: Record<string, string> = {};
    for (let i = 0; i + 1 < fields.length; i += 2) {
      const key = fields[i];
      const value = fields[i + 1];
      if (key !== undefined && value !== undefined) map[key] = value;
    }
    const type = map.type ?? '';
    let payload: unknown;
    try {
      payload = map.body !== undefined ? JSON.parse(map.body) : null;
    } catch {
      return null; // poison entry — handleEntry() reports it to the sink and XACKs it (v667)
    }
    const attempts = Number(map.attempts ?? '0') + 1;
    return { id, type, payload, attempts, createdAt: Date.now() };
  }
}

/**
 * Build the right driver for the environment. Redis when NEXUS_REDIS_URL (or options.url) is set, else
 * the in-memory fallback. Call sites get one `JobQueue` and never branch on which.
 */
export function createJobQueue(options?: JobQueueOptions): JobQueue {
  const url = options?.url ?? process.env.NEXUS_REDIS_URL;
  if (url) return new RedisStreamJobQueue(options);
  return new MemoryJobQueue(options);
}
