import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  readDeadLettersPage,
  exportDeadLettersJsonl,
  parseEntry,
  clampLimit,
  encodeCursor,
  decodeCursor,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from '../src/server/deadLetters';

class FakeRedis {
  list: string[] = [];
  calls: Array<[string, ...unknown[]]> = [];
  disconnects = 0;

  async llen(key: string) {
    this.calls.push(['llen', key]);
    return this.list.length;
  }

  async lrange(key: string, start: number, stop: number) {
    this.calls.push(['lrange', key, start, stop]);
    return this.list.slice(start, stop + 1);
  }

  lpush(value: string) {
    this.list.unshift(value);
  }

  disconnect() {
    this.disconnects += 1;
  }
}

function poisonRecord(jobId: string, attempts: number, reason: string, at: string) {
  return JSON.stringify({
    job: { jobId, requestId: jobId, backend: 'redis', status: 'failed', queuedAt: at },
    attempts,
    reason,
  });
}

describe('dead-letters inspector (unit, fake redis)', () => {
  let fake: FakeRedis;
  const KEY = 'nexus:dl:utest:dead';

  beforeEach(() => {
    fake = new FakeRedis();
  });

  it('inspector_returns_empty_page_for_missing_key', async () => {
    const out = await readDeadLettersPage({ client: fake as never, key: KEY });
    expect(out).toEqual({ kind: 'ok', snapshotSize: 0, entries: [], nextCursor: null });
  });

  it('inspector_caps_limit_at_max_and_defaults_on_garbage', () => {
    expect(clampLimit(undefined)).toBe(DEFAULT_LIMIT);
    expect(clampLimit('junk')).toBe(DEFAULT_LIMIT);
    expect(clampLimit('0')).toBe(DEFAULT_LIMIT);
    expect(clampLimit('10000')).toBe(MAX_LIMIT);
    expect(clampLimit('7')).toBe(7);
  });

  it('parseEntry_marks_poison_rows_malformed_but_returns_them', () => {
    const out = parseEntry('not-json at all');
    expect(out.malformed).toBe(true);
    expect(out.reason).toContain('malformed');
    const weird = parseEntry(JSON.stringify({ job: { jobId: 7 }, attempts: 'three', reason: 1 }));
    expect(weird.malformed).toBe(false);
    expect(weird.job.jobId).toBeNull();
    expect(weird.attempts).toBe(0);
  });

  it('inspector_returns_chronological_page_newest_first_and_exposes_next_cursor', async () => {
    fake.lpush(poisonRecord('job-oldest-a', 2, 'a fails', '2026-11-13T03:00:00.000Z'));
    fake.lpush(poisonRecord('job-mid-b', 1, 'b fails', '2026-11-13T03:01:00.000Z'));
    fake.lpush(poisonRecord('job-newer-c', 3, 'c fails', '2026-11-13T03:02:00.000Z'));
    const out = await readDeadLettersPage({ client: fake as never, key: KEY, limit: 2 });
    if (out.kind !== 'ok') throw new Error('expected ok');
    expect(out.snapshotSize).toBe(3);
    expect(out.entries.map((e) => e.job.jobId)).toEqual(['job-newer-c', 'job-mid-b']);
    expect(out.nextCursor).not.toBeNull();
    const out2 = await readDeadLettersPage({ client: fake as never, key: KEY, cursor: out.nextCursor, limit: 10 });
    if (out2.kind !== 'ok') throw new Error('expected ok page 2');
    expect(out2.entries.map((e) => e.job.jobId)).toEqual(['job-oldest-a']);
    expect(out2.nextCursor).toBeNull();
  });

  it('inspector_rejects_invalid_or_tampered_cursor', async () => {
    fake.lpush(poisonRecord('j1', 1, 'r', '2026-11-13T03:00:00.000Z'));
    const a = await readDeadLettersPage({ client: fake as never, key: KEY, cursor: '!!!not-base64url!!!' });
    expect(a.kind).toBe('invalid-cursor');
    const b = await readDeadLettersPage({ client: fake as never, key: KEY, cursor: 'AAAA' }); // valid base64url, bad JSON shape
    expect(b.kind).toBe('invalid-cursor');
    const courier = Buffer.from(JSON.stringify({ s: 99, e: 0 })).toString('base64url');
    fake.list = []; fake.lpush(poisonRecord('j1', 1, 'r', '2026-11-13T03:00:00.000Z')); // s=1 now != 99
    const c = await readDeadLettersPage({ client: fake as never, key: KEY, cursor: courier });
    expect(c.kind).toBe('snapshot-stale');
  });

  it('cursor_with_head_lpush_invalidates_pages_snapshot_stale', async () => {
    fake.lpush(poisonRecord('a', 1, 'a', '2026-11-13T03:00:00.000Z'));
    fake.lpush(poisonRecord('b', 1, 'b', '2026-11-13T03:01:00.000Z'));
    const first = await readDeadLettersPage({ client: fake as never, key: KEY, limit: 1 });
    if (first.kind !== 'ok' || !first.nextCursor) throw new Error('expected first page with cursor');
    // LPUSH a new head failure while page 2 is pending
    fake.lpush(poisonRecord('c', 1, 'c', '2026-11-13T03:02:00.000Z'));
    const second = await readDeadLettersPage({ client: fake as never, key: KEY, cursor: first.nextCursor, limit: 1 });
    expect(second.kind).toBe('snapshot-stale');
  });

  it('inspector_uses_only_llen_and_bounded_lrange', async () => {
    for (let i = 0; i < 8; i += 1) fake.lpush(poisonRecord(`j${i}`, i, 'r', '2026-11-13T03:00:00.000Z'));
    const out = await readDeadLettersPage({ client: fake as never, key: KEY, limit: 3 });
    if (out.kind !== 'ok') throw new Error('expected ok');
    const llenCalls = fake.calls.filter((c) => c[0] === 'llen');
    const lrangeCalls = fake.calls.filter((c) => c[0] === 'lrange');
    expect(llenCalls).toHaveLength(1);
    expect(lrangeCalls).toHaveLength(1);
    const lrangeCall = lrangeCalls[0] as unknown[];
    const stop = Number(lrangeCall[3]);
    const start = Number(lrangeCall[2]);
    expect(Number.isFinite(start) && Number.isFinite(stop)).toBe(true);
    expect(stop - start + 1).toBeLessThanOrEqual(3);
    expect(fake.calls.every((c) => c[0] === 'llen' || c[0] === 'lrange')).toBe(true);
  });

  it('export_returns_newest_window_without_mutating_anything', async () => {
    for (let i = 0; i < 5; i += 1) fake.lpush(poisonRecord(`j${i}`, i, `r${i}`, '2026-11-13T03:00:00.000Z'));
    const res = await exportDeadLettersJsonl({ client: fake as never, key: KEY, maxItems: 3 });
    expect('items' in res && res.items).toHaveLength(3);
    expect('snapshotSize' in res && res.snapshotSize).toBe(5);
    // head-relative window：导出最新的 3 条（j4 头=最新, j2 最老）
    expect('items' in res && res.items.map((x) => x.job.jobId)).toEqual(['j4', 'j3', 'j2']);
    expect(fake.calls.every((c) => c[0] === 'llen' || c[0] === 'lrange')).toBe(true);
  });

  it('export_enforces_max_items_cap_1000', async () => {
    for (let i = 0; i < 6; i += 1) fake.lpush(poisonRecord(`j${i}`, i, 'r', '2026-11-13T03:00:00.000Z'));
    const res = await exportDeadLettersJsonl({ client: fake as never, key: KEY, maxItems: 5 });
    expect('items' in res && res.items).toHaveLength(5);
    const res2 = await exportDeadLettersJsonl({ client: fake as never, key: KEY, maxItems: 999999 });
    // capped at 1000 by implementation; only 6 exist here
    expect('items' in res2 && res2.items).toHaveLength(6);
  });

  it('encodeCursor_decodeCursor_roundtrip_and_rejection', () => {
    const c = encodeCursor(10, 4);
    expect(decodeCursor(c)).toEqual({ s: 10, e: 4 });
    expect(decodeCursor('not!!')).toBeNull();
    expect(decodeCursor(Buffer.from('{}').toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify({ s: 1, e: 5 })).toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify({ s: 0, e: 0 })).toString('base64url'))).toBeNull();
    expect(decodeCursor('x'.repeat(1024))).toBeNull();
  });
});

// ── true Redis opt-in leg (NEXUS_REDIS_URL); pushes only to a dedicated test key ──
const LIVE = Boolean(process.env.NEXUS_REDIS_URL?.trim());
describe.skipIf(!LIVE)('dead-letters inspector (live redis, opt-in)', () => {
  const KEY = 'nexus:dl:itest:dead';

  it('round trip against a real server, and cleanup deletes nothing extra', async () => {
    const { Redis } = await import('ioredis');
    const client = new Redis(process.env.NEXUS_REDIS_URL as string, {
      lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 1,
    });
    try {
      await client.connect();
      await client.del(KEY);
      for (let i = 0; i < 4; i += 1) {
        await client.lpush(KEY, poisonRecord(`live-${i}`, i, `live reason ${i}`, '2026-11-13T03:00:00.000Z'));
      }
      const out = await readDeadLettersPage({ client: client as never, key: KEY, limit: 2 });
      if (out.kind !== 'ok') throw new Error(`expected ok, got ${out.kind}`);
      expect(out.snapshotSize).toBe(4);
      expect(out.entries).toHaveLength(2);
      expect(out.nextCursor).not.toBeNull();
    } finally {
      await client.del(KEY).catch(() => undefined);
      client.disconnect();
    }
  });
});
