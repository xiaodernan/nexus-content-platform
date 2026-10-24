import { describe, expect, it } from 'vitest';

import {
  SERVICE_CALL_TIMEOUT_MS,
  SERVICE_FAILURE_STATUS,
  serviceCallSignal,
  serviceFailureStatus,
  serviceUnreachableReason,
} from './serviceCall';

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

/**
 * M7 v507 (ADR 0016 amendment 500) — the RULE a door answers a failed ask by.
 *
 * The gap. v499 graded every door the same three questions and found the answers DIFFERENT: a read
 * refusal was a 502 on six doors and a 503 on three, and the plans door answered both — 502 for a read
 * that failed and 503 for a write that failed the same way. The audit that followed found no comment
 * anywhere defending either number: git shows the 503s come from the v284–v298 wave and the 502s from
 * the v305–v335 wave, which makes the split an accident of authoring order rather than a decision. A
 * door cannot answer honestly while the lib beneath it collapses four different truths — a refusal by
 * name, an HTTP error, an unreadable body, a call that never came back — into one `ok: false`.
 *
 * The proof. The kinds are named once, here, and every door’s status is DERIVED from them: the service
 * did not answer at all is a 503; the service answered and the answer could not be served is a 502. This
 * file grades the rule itself — the table, the safe default, and the two sentences an unreachable
 * service earns — so the thirteen doors that now read it have something standing behind them.
 */
describe('serviceCall — the failure kinds and the status each earns (v507)', () => {
  it('an answer that never arrived is a 503, and an answer that could not be served is a 502', () => {
    // The two truths, and the one status each earns. A door that answered 503 for a REFUSAL was claiming
    // the service was down when all it knew was that the answer was no good; a door that answered 502
    // for a timeout was claiming a bad response when there was no response at all.
    expect(SERVICE_FAILURE_STATUS.unreachable).toBe(503);
    expect(SERVICE_FAILURE_STATUS.invalid).toBe(502);
  });

  it('a failure that names no kind is an INVALID one — the safe default, not a guess', () => {
    // Every site that could not get an answer at all marks itself `unreachable`, so a failure without
    // the mark is one where the service DID answer and the answer could not be used. The default is the
    // safe one: a door never claims a service is down when all it knows is that the answer was no good.
    expect(serviceFailureStatus(undefined)).toBe(502);
    expect(serviceFailureStatus('invalid')).toBe(502);
    expect(serviceFailureStatus('unreachable')).toBe(503);
  });

  it('a TIMEOUT is a 503 that says the service did not answer in time — not that it is gone', () => {
    // v337’s rule, carried into the new vocabulary: a service that is merely slow is not an unreachable
    // one, and a reader told the thing is gone when it is only late will stop looking for it.
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    expect(serviceUnreachableReason('http://api:8787', timeout)).toBe(
      'the service at http://api:8787 did not answer within 15 seconds',
    );
    expect(serviceFailureStatus('unreachable')).toBe(503);
  });

  it('a THROWN call is a 503 naming the address it could not reach', () => {
    expect(serviceUnreachableReason('http://api:8787', new Error('connect ECONNREFUSED'))).toBe(
      'nexus-api unreachable at http://api:8787: connect ECONNREFUSED',
    );
  });

});
