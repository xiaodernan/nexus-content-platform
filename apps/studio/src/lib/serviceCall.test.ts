import { describe, expect, it } from 'vitest';

import { SERVICE_CALL_TIMEOUT_MS, serviceCallSignal, serviceUnreachableReason } from './serviceCall';

/**
 * M7 v337 — the Studio's own door to the service, and how long it waits.
 *
 * Two rules this file grades:
 *
 * 1. **A call to the service is BOUNDED.** Every door in the Studio's lib folder fetches the service, and
 *    a fetch with no budget is a fetch that can wait forever — which, for a server-rendered page, is a
 *    reader waiting forever with no sentence and no reason.
 * 2. **A TIMEOUT is not an unreachable service.** The service may well be there, and slow. Saying
 *    "unreachable" about a service that is merely busy is the same kind of lie the house's rule about
 *    failed reads is about: a reader who is told the thing is gone when it is only late stops looking
 *    for it.
 */
describe('serviceCall — the budget on the Studio’s own door', () => {
  it('the budget is long enough for a cold write and short enough for a reader', () => {
    expect(SERVICE_CALL_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    expect(SERVICE_CALL_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });

  it('every call gets a signal that can stop it', () => {
    const signal = serviceCallSignal();
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it('a TIMEOUT says the service did not answer — not that it is unreachable', () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    const reason = serviceUnreachableReason('http://127.0.0.1:8080', timeout);
    expect(reason).toContain('did not answer');
    expect(reason).not.toContain('unreachable');
    expect(reason).toContain('15 seconds');
  });

  it('a service that is really unreachable still says so, and says where it looked', () => {
    const reason = serviceUnreachableReason('http://127.0.0.1:8080', new Error('connect ECONNREFUSED'));
    expect(reason).toContain('unreachable');
    expect(reason).toContain('http://127.0.0.1:8080');
    expect(reason).toContain('connect ECONNREFUSED');
  });
});
