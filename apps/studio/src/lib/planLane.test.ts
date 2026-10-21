import { describe, expect, it, vi } from 'vitest';

import { retirePlan } from './planLane';

/**
 * M7 v314 — the browser half of the PLANS and SUBSCRIPTIONS lane.
 *
 * The case this file exists for: **a refusal keeps the reason.** The lane answers with a REASON and never a
 * thrown error, and the reason it reports is the SERVICE's own words — "only the account that offers it may
 * retire it" — and not a status code.
 */
function makeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init)) as unknown as typeof fetch;
}

const CLAIM = {
  accountId: 'acct-ada',
  handle: 'ada',
  assurance: 'unsigned-local' as const,
  claimedAt: 1_700_000_000_000,
};

describe('planLane — retirePlan (client half)', () => {
  it('asks the Studio\u2019s own door, with the plan id and the claimer', async () => {
    const fetchImpl = makeFetch((url, init) => {
      expect(url).toBe('/api/plans?planId=pro&claimer=acct-ada');
      expect(init?.method).toBe('DELETE');
      return new Response(JSON.stringify({ ok: true, planId: 'pro', retired: true }), { status: 200 });
    });
    const answer = await retirePlan('pro', CLAIM, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.retired).toBe(true);
  });

  it('a REFUSAL carries the service\u2019s reason, not a status code', async () => {
    const answer = await retirePlan(
      'pro',
      CLAIM,
      makeFetch(() =>
        new Response(
          JSON.stringify({
            ok: false,
            reason: 'this plan was offered by another account, and only the account that offers it may retire it',
          }),
          { status: 502 },
        ),
      ),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('only the account that offers it may retire it');
    expect(answer.retired).toBe(false);
  });

  it('a plan that was ALREADY retired is not a failure, and not a retirement either', async () => {
    const answer = await retirePlan(
      'pro',
      CLAIM,
      makeFetch(() => new Response(JSON.stringify({ ok: true, planId: 'pro', retired: false }), { status: 200 })),
    );
    expect(answer.ok).toBe(true);
    expect(answer.retired).toBe(false);
  });

  it('a THROWN fetch answers with a reason, never an exception', async () => {
    const answer = await retirePlan(
      'pro',
      CLAIM,
      makeFetch(() => {
        throw new Error('network down');
      }),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('network down');
  });
});
