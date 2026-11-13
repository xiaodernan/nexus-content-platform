import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ADR 0065 — the FIRST real lane on the job queue: the post-export `build.complete` notification.
 *
 * These tests grade the part of the lane that does not need Redis: the opt-in switch (off by default so
 * the synchronous path and its integration tests stay untouched), the producer→handler handoff, and —
 * the thing that makes at-least-once safe — the idempotency anchor. `job-queue.test.ts` grades the Redis
 * Streams transport itself (delivery, retry, XAUTOCLAIM reclaim of a dead worker's pending entry).
 *
 * The idempotency contract, stated plainly: a worker that crashes AFTER `emit` but BEFORE XACK is
 * re-delivered the same job. If the handler minted its own exportId, that crash would write a SECOND
 * notification. So the PRODUCER mints it, carries it in the payload, and `notify-plan` keys on it.
 * Three facts, graded below: same id survives the handoff, notify-plan derives one dedupeKey from it,
 * and a poison payload never reaches emit.
 */

// The mock must accept a REQUIRED event argument or tsc narrows it to a zero-arg function (and the
// re-delivery assertions below lose their `.mock.calls[0][0]` tuple slot). `unknown` keeps it honest
// about the untrusted wire shape; individual assertions narrow it where they read a field.
const emit = vi.hoisted(() => vi.fn(async (_event: unknown) => 'created' as const));
vi.mock('@/server/domain/notifications', () => ({ emit }));

import { planNotification } from '@/lib/notify-plan';
import { __parseBuildComplete, JOB_HANDLERS } from '@/server/queue/handlers';
import {
  __resetJobWorker,
  getJobQueue,
  jobQueueEnabled,
  JOB_QUEUE_ENABLED_ENV,
  startJobWorker,
  stopJobWorker,
} from '@/server/queue/worker';
import { notifyBuildComplete } from '@/server/domain/export';

const baseArgs = {
  projectId: '11111111-1111-4111-8111-111111111111',
  projectName: '作品',
  actorId: '22222222-2222-4222-8222-222222222222',
  ok: true,
  counts: { design: 1, code: 7, assets: 2, storyboard: 0, character: 0 },
  missingAssets: 0,
  durationMs: 1234,
  detail: '内容 10 个文件',
};

beforeEach(async () => {
  emit.mockClear();
  await stopJobWorker().catch(() => {});
  __resetJobWorker();
  delete process.env[JOB_QUEUE_ENABLED_ENV];
  delete process.env.NEXUS_REDIS_URL;
});

describe('opt-in switch', () => {
  it('is OFF by default: no queue is opened and the lane literally does nothing here', () => {
    expect(jobQueueEnabled()).toBe(false);
    expect(getJobQueue()).toBeNull();
  });

  it('reads 1 / true / on as on, and anything else as off', () => {
    for (const on of ['1', 'true', 'ON']) {
      process.env[JOB_QUEUE_ENABLED_ENV] = on;
      expect(jobQueueEnabled()).toBe(true);
    }
    for (const off of ['0', 'false', '', 'yes-please']) {
      process.env[JOB_QUEUE_ENABLED_ENV] = off;
      expect(jobQueueEnabled()).toBe(false);
    }
  });

  it('opens NO connection when the lane is off, even with a Redis URL present', () => {
    process.env.NEXUS_REDIS_URL = 'redis://127.0.0.1:56379';
    expect(getJobQueue()).toBeNull();
  });

  it('picks the in-memory driver when opted in but no Redis URL is set', () => {
    process.env[JOB_QUEUE_ENABLED_ENV] = '1';
    expect(getJobQueue()?.driver).toBe('memory');
  });
});

describe('producer → handler → emit (in-memory driver, no Redis needed)', () => {
  it('mints ONE exportId in the producer and hands exactly that payload to the handler', async () => {
    process.env[JOB_QUEUE_ENABLED_ENV] = '1';
    let minted = '';
    let resolveSeen!: (id: string) => void;
    const seen = new Promise<string>((r) => (resolveSeen = r));
    emit.mockImplementation(async (event) => {
      minted = (event as unknown as { exportId: string }).exportId;
      resolveSeen(minted);
      return 'created';
    });

    await notifyBuildComplete(baseArgs); // opted in → enqueue, no inline emit
    expect(emit).not.toHaveBeenCalled(); // the whole point: the download path no longer waits on emit

    // Start the worker; it must drain the ALREADY-queued job (no sleep — wait on the emit latch).
    const drain = startJobWorker();
    await Promise.race([seen, new Promise((_, rej) => setTimeout(() => rej(new Error('worker never drained the queued job')), 3000))]);
    await drain;
    await stopJobWorker();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(minted).toMatch(/^[0-9a-f-]{36}$/);

    // Re-delivering the SAME job (the crash-before-XACK case) must reuse that exact id.
    const redelivered = __parseBuildComplete({
      recipientId: baseArgs.actorId,
      projectId: baseArgs.projectId,
      projectName: baseArgs.projectName,
      exportId: minted,
      ok: baseArgs.ok,
      counts: baseArgs.counts,
      missingAssets: 0,
      durationMs: baseArgs.durationMs,
      detail: baseArgs.detail,
    })!;
    await JOB_HANDLERS['build.complete']!({
      id: 'redelivery', type: 'build.complete', payload: redelivered, attempts: 2, createdAt: Date.now(),
    });
    expect(emit).toHaveBeenCalledTimes(2);
    const secondId = (emit.mock.calls[1]![0] as { exportId: string }).exportId;
    expect(secondId, 'a redelivery must not mint a fresh id, or emit writes a second notification').toBe(minted);
  });

  it('notify-plan derives ONE dedupeKey from that id, so a redelivery collapses to one row', () => {
    const event = {
      kind: 'build' as const,
      recipientId: baseArgs.actorId,
      projectId: baseArgs.projectId,
      projectName: baseArgs.projectName,
      exportId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      ok: true,
      counts: { design: 1, code: 7, assets: 2 },
      missingAssets: 0,
      durationMs: 1000,
      detail: null,
    };
    const first = planNotification(event)!;
    const second = planNotification(event)!; // byte-identical redelivery
    expect(first.dedupeKey).toBe(`build:${event.exportId}`);
    expect(second.dedupeKey).toBe(first.dedupeKey);
    // emit() inserts with ON CONFLICT DO NOTHING on dedupeKey — one key, one row, however many redeliveries.
  });
});

describe('untrusted payload boundary', () => {
  const good = {
    recipientId: 'r', projectId: 'p', projectName: 'n', exportId: 'e', ok: true,
    counts: { design: 1, code: 2, assets: 3 }, missingAssets: 0, durationMs: 5, detail: 'd',
  };

  it('accepts a well-formed payload and coerces non-finite numbers to 0 (never NaN in a title)', () => {
    const parsed = __parseBuildComplete({ ...good, counts: { design: NaN, code: '7', assets: Infinity }, missingAssets: undefined })!;
    expect(parsed.counts).toEqual({ design: 0, code: 0, assets: 0 });
    expect(parsed.missingAssets).toBe(0);
    expect(parsed.exportId).toBe('e');
  });

  it('rejects a payload missing any idempotency anchor (no emit with a fake build:<undefined> key)', async () => {
    for (const drop of ['recipientId', 'projectId', 'projectName', 'exportId', 'counts']) {
      const raw = { ...good } as Record<string, unknown>;
      delete raw[drop];
      expect(__parseBuildComplete(raw), `dropping ${drop} must be rejected`).toBeNull();
    }
    for (const bad of [null, 42, 'string', []]) {
      expect(__parseBuildComplete(bad)).toBeNull();
    }
  });

  it('a poison entry is acked away, not retried forever, and never reaches emit', async () => {
    await JOB_HANDLERS['build.complete']!({ id: 'poison', type: 'build.complete', payload: { exportId: 'only' }, attempts: 1, createdAt: Date.now() });
    expect(emit).not.toHaveBeenCalled();
  });
});
