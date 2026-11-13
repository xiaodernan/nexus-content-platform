import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createJobQueue } from '@/server/queue/redisStreamJobQueue';
import { MemoryJobQueue } from '@/server/queue/memoryJobQueue';
import type { JobEnvelope, JobQueue } from '@/server/queue/jobQueue';

/**
 * §MQ (2026-11-11) — the internal job queue delivers what was enqueued, retries on failure, and reclaims
 * abandoned work. The Redis Streams driver is graded against a real Redis (the proof host has one on
 * 56379); the in-memory fallback is graded without one. Where no Redis answers, the Redis cases skip —
 * a queue proof that needs Redis cannot grade a host that lacks it.
 */

const REDIS_URL = process.env.NEXUS_REDIS_URL ?? 'redis://127.0.0.1:56379';

async function redisUp(): Promise<boolean> {
  const r = new Redis(REDIS_URL, { connectTimeout: 2000, maxRetriesPerRequest: 1 });
  try {
    await r.ping();
    return true;
  } catch {
    return false;
  } finally {
    r.disconnect();
  }
}

const up = await redisUp();

function latch<T>(predicate: (items: T[]) => boolean, timeoutMs = 5000): {
  push: (item: T) => void;
  done: Promise<T[]>;
} {
  const items: T[] = [];
  let resolve!: (v: T[]) => void;
  const done = new Promise<T[]>((res) => (resolve = res));
  const timer = setTimeout(() => resolve(items), timeoutMs);
  return {
    push: (item) => {
      items.push(item);
      if (predicate(items)) {
        clearTimeout(timer);
        resolve(items);
      }
    },
    done,
  };
}

describe('MemoryJobQueue (no Redis required)', () => {
  it('delivers an enqueued job to the handler', async () => {
    const q = new MemoryJobQueue();
    const seen: JobEnvelope[] = [];
    await q.start(async (job) => {
      seen.push(job);
    });
    const id = await q.enqueue('echo', { hello: 'world' });
    expect(id).toMatch(/^mem-\d+$/);
    await new Promise((r) => setTimeout(r, 100));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.type).toBe('echo');
    expect(seen[0]!.payload).toEqual({ hello: 'world' });
    await q.stop();
  });

  it('retries a failing handler up to maxAttempts', async () => {
    const q = new MemoryJobQueue({ maxAttempts: 3 });
    let attempts = 0;
    await q.start(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('boom');
    });
    await q.enqueue('flaky', {});
    await new Promise((r) => setTimeout(r, 200));
    expect(attempts).toBe(3);
    await q.stop();
  });
});

describe.skipIf(!up)('RedisStreamJobQueue (real Redis)', () => {
  let client: Redis;
  let key: string;

  beforeAll(() => {
    client = new Redis(REDIS_URL, { connectTimeout: 2000, maxRetriesPerRequest: 1 });
    key = `nexus:jobs:test:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
  });

  afterAll(async () => {
    await client.del(key);
    client.disconnect();
  });

  it('delivers an enqueued job with its payload', async () => {
    const q = createJobQueue({ url: REDIS_URL, streamKey: key, maxAttempts: 2, blockMs: 500 });
    const seen: JobEnvelope[] = [];
    const l = latch<JobEnvelope>((items) => items.length >= 1);
    await q.start(async (job) => {
      seen.push(job);
      l.push(job);
    });
    await q.enqueue('publish', { projectId: 'abc', title: 'Hello' });
    const got = await l.done;
    expect(got[0]!.type).toBe('publish');
    expect(got[0]!.payload).toEqual({ projectId: 'abc', title: 'Hello' });
    expect(got[0]!.attempts).toBe(1);
    await q.stop();
  });

  it('reclaims and retries a failing handler, then succeeds', async () => {
    const q = createJobQueue({ url: REDIS_URL, streamKey: key, maxAttempts: 4, blockMs: 500, reclaimMs: 600 });
    let attempts = 0;
    const l = latch<number>((a) => a.length >= 3, 8000);
    await q.start(async () => {
      attempts += 1;
      l.push(attempts);
      if (attempts < 3) throw new Error('transient');
    });
    await q.enqueue('flaky', { n: 1 });
    const got = await l.done;
    expect(got[got.length - 1]).toBeGreaterThanOrEqual(3);
    await q.stop();
  });

  it('reclaims a job a crashed worker left pending (XAUTOCLAIM)', async () => {
    // A dead worker reads a job but never XACKs it: the entry is pending, not lost.
    const orphanKey = `${key}:orphan`;
    const deadGroup = 'nexus-workers-orphan';
    await client.xgroup('CREATE', orphanKey, deadGroup, '0', 'MKSTREAM');
    await client.xadd(orphanKey, '*', 'type', 'orphan', 'body', '{"v":1}', 'attempts', '0');
    const read = await client.xreadgroup(
      'GROUP', deadGroup, 'dead-worker', 'COUNT', '1', 'STREAMS', orphanKey, '>',
    );
    expect(read, 'the dead worker really took ownership of the entry').not.toBeNull();
    await new Promise((r) => setTimeout(r, 600)); // idle past the claim threshold

    const l = latch<JobEnvelope>((a) => a.some((j) => j.type === 'orphan'), 8000);
    const q = createJobQueue({
      url: REDIS_URL, streamKey: orphanKey, group: deadGroup, consumer: 'live-worker',
      maxAttempts: 2, blockMs: 300, reclaimMs: 400,
    });
    try {
      await q.start(async (job) => l.push(job));
      const got = await l.done;
      expect(got.some((j) => j.type === 'orphan'), 'a live consumer must take over the abandoned job').toBe(true);
      // ioredis v6 returns raw Redis arrays; the DETAIL form lists pending entries directly.
      // The latch resolves when the HANDLER starts, while XACK happens just after it returns — so poll
      // for the ack instead of asserting at the instant the handler was handed the job (a real race).
      let pending = (await client.xpending(orphanKey, deadGroup, '-', '+', 10)) as unknown[][];
      for (let i = 0; i < 20 && pending.length > 0; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        pending = (await client.xpending(orphanKey, deadGroup, '-', '+', 10)) as unknown[][];
      }
      expect(pending.length, 'the reclaimed job must be ACKed out of pending').toBe(0);
    } finally {
      await q.stop();
      await client.del(orphanKey);
    }
  });

  it('bounds the stream with MAXLEN ~ so an unacked backlog cannot grow it without limit', async () => {
    // `~` trims whole macro nodes, so Redis may retain up to one node (~100 entries) ABOVE the cap;
    // that is the price of O(1) XADD, stated in ADR 0066. We append well past that slack. If the cap
    // were missing — or if the retry path used a second, uncapped XADD — XLEN would equal `total`.
    // No consumer is started here: every entry stays in the stream, so the trim is the only thing
    // that can keep XLEN down. Both the producer and the retry append go through the same MAXLEN path.
    const cap = 8;
    const total = 260;
    const trimKey = `${key}:trim`;
    const q = createJobQueue({ url: REDIS_URL, streamKey: trimKey, maxLen: cap });
    try {
      for (let i = 0; i < total; i += 1) await q.enqueue('trim', { i });
      const len = await client.xlen(trimKey);
      expect(len, 'the cap must actually shed old entries, not grow to every append').toBeLessThan(total);
      expect(len, '`~` may keep one macro node of slack above the cap, but no more').toBeLessThanOrEqual(cap + 100);
      expect(len, 'the stream must not be trimmed to empty').toBeGreaterThan(0);
      const tail = (await client.xrevrange(trimKey, '+', '-', 'COUNT', 1)) as [string, string[]][];
      expect(tail[0]?.[1]?.join(' '), 'the newest entry must survive the trim').toContain(`"i":${total - 1}`);
    } finally {
      await client.del(trimKey);
    }
  }, 15_000);

  it('reports the redis driver (not memory)', () => {
    const q: JobQueue = createJobQueue({ url: REDIS_URL, streamKey: key });
    expect(q.driver).toBe('redis');
  });
});
