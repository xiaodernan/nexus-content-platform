import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ADR 0066 — the outage boundary, MEASURED. `enqueue` must never throw into the request it serves:
 * a Redis blip degrades to a MISSED notice (loud log), not to a failed download and not to a silent
 * in-memory substitution. Mocking a failing XADD keeps this deterministic on a host with NO Redis —
 * no unreachable port, no TCP timeout, no live dependency. The point is the contract, not the socket.
 */

// Hoist a BLANK mock. The rejecting behaviour is installed inside the test with mockRejectedValueOnce,
// so no rejected promise is ever created at hoist/factory time (which vitest would score as unhandled).
const xadd = vi.hoisted(() => vi.fn());

vi.mock('ioredis', () => ({
  Redis: class {
    xadd = xadd;
    xgroup = vi.fn(async () => {});
    xreadgroup = vi.fn(async () => null);
    xautoclaim = vi.fn(async () => ['0', [], []]);
    xack = vi.fn(async () => 1);
    disconnect = vi.fn();
  },
}));

import { RedisStreamJobQueue } from '@/server/queue/redisStreamJobQueue';

describe('degraded enqueue (Redis XADD fails)', () => {
  beforeEach(() => xadd.mockReset());

  it("resolves to an empty id and logs, never rejecting the caller's request", async () => {
    // Exactly one XADD fails — the wire-blip case. enqueue must absorb it.
    xadd.mockRejectedValueOnce(new Error('Connection is closed.'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const q = new RedisStreamJobQueue({ url: 'redis://127.0.0.1:1' });
      const id = await q.enqueue('build.complete', { projectId: 'p' });
      expect(id, 'a failed enqueue resolves to an empty id — the download request proceeds').toBe('');
      expect(xadd).toHaveBeenCalledTimes(1);
      expect(err, 'the drop is LOUD, not a silent loss').toHaveBeenCalled();
      expect(String(err.mock.calls[0]?.[0])).toContain('enqueue failed');
    } finally {
      err.mockRestore();
    }
  });
});
