import { describe, expect, it, vi } from 'vitest';

import { cancelSubscription, offerPlan, repricePlan, retirePlan, subscribeToPlan } from './planLane';

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

describe('planLane — cancelSubscription (client half)', () => {
  it('asks the Studio’s own door, with the subscription id and the claimer', async () => {
    const fetchImpl = makeFetch((url, init) => {
      expect(url).toBe('/api/subscriptions?subscriptionId=sub-1&claimer=acct-ada');
      expect(init?.method).toBe('DELETE');
      return new Response(JSON.stringify({ ok: true, subscriptionId: 'sub-1', ended: true }), { status: 200 });
    });
    const answer = await cancelSubscription('sub-1', CLAIM, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.ended).toBe(true);
  });

  it('a REFUSAL carries the service’s reason', async () => {
    const answer = await cancelSubscription(
      'sub-1',
      CLAIM,
      makeFetch(() =>
        new Response(
          JSON.stringify({ ok: false, reason: 'this subscription was made by another account, and only its holder may end it' }),
          { status: 502 },
        ),
      ),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('only its holder may end it');
    expect(answer.ended).toBe(false);
  });

  it('a subscription that was ALREADY ended is not a failure, and not an ending either', async () => {
    const answer = await cancelSubscription(
      'sub-1',
      CLAIM,
      makeFetch(() => new Response(JSON.stringify({ ok: true, subscriptionId: 'sub-1', ended: false }), { status: 200 })),
    );
    expect(answer.ok).toBe(true);
    expect(answer.ended).toBe(false);
  });
});

describe('planLane — repricePlan (client half)', () => {
  it('asks the Studio’s own door, with the plan id, the claimer, the price and the period', async () => {
    const fetchImpl = makeFetch((url, init) => {
      expect(url).toBe('/api/plans?planId=pro&claimer=acct-ada&price=2500&period=month');
      expect(init?.method).toBe('PUT');
      return new Response(JSON.stringify({ ok: true, planId: 'pro', priceCents: 2500, period: 'month' }), { status: 200 });
    });
    const answer = await repricePlan('pro', 2500, 'month', CLAIM, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.priceCents).toBe(2500);
  });

  it('a REFUSAL carries the service’s reason, not a status code', async () => {
    const answer = await repricePlan(
      'pro',
      2500,
      'month',
      CLAIM,
      makeFetch(() =>
        new Response(
          JSON.stringify({ ok: false, reason: 'this plan was offered by another account' }),
          { status: 502 },
        ),
      ),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('this plan was offered by another account');
  });
});
});


/**
 * v440 — the two WRITES the plans lane had never been asked about.
 *
 * `retirePlan`, `cancelSubscription` and `repricePlan` are graded above. `subscribeToPlan` and
 * `offerPlan` were reached only through the plan bar, and the rule that makes them interesting is
 * the one `readAnswer` spells out: the SERVICE answers a write with a LISTING shape
 * (`subscriptions`, `plans`) while the Studio's own door forwards a SINGLE row (`subscription`,
 * `plan`), and this lane reads BOTH. A lane that understood only one of them would report a price
 * of zero for a real subscription.
 */
describe('planLane — subscribeToPlan (v440)', () => {
  it('backs a plan at the Studio’s own door, naming the plan and the claim', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, subscription: { planId: 'plan-1', priceCents: 500, period: 'month' } }), { status: 200 });
    });

    const answer = await subscribeToPlan('plan-1', CLAIM, fetchImpl);

    expect(seenUrl).toBe('/api/subscriptions');
    expect(seenInit?.method).toBe('POST');
    expect(seenInit?.headers).toEqual({ 'content-type': 'application/json', accept: 'application/json' });
    expect(JSON.parse(String(seenInit?.body))).toEqual({ planId: 'plan-1', claim: CLAIM });
    expect(answer.ok).toBe(true);
    expect(answer.subscription).toEqual({ planId: 'plan-1', priceCents: 500, period: 'month' });
  });

  it('reads the SINGLE row the Studio’s own door forwards', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: true, subscription: { planId: 'plan-1', priceCents: 500, period: 'month' } }), { status: 200 }),
    );
    const answer = await subscribeToPlan('plan-1', CLAIM, fetchImpl);
    expect(answer.subscription).toEqual({ planId: 'plan-1', priceCents: 500, period: 'month' });
    expect(answer.plan).toBeUndefined();
  });

  it('and reads the LISTING shape the service itself answers with', async () => {
    // The marquee rule: the same subscription arrives two shapes depending on which door answered,
    // and a lane that understood only the single row would report a price of zero here.
    const fetchImpl = makeFetch(() =>
      new Response(
        JSON.stringify({
          ok: true,
          subscriptions: [
            { planId: 'plan-1', priceCents: 500, period: 'month' },
            { planId: 'plan-2', priceCents: 900, period: 'month' },
          ],
        }),
        { status: 200 },
      ),
    );
    const answer = await subscribeToPlan('plan-1', CLAIM, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.subscription).toEqual({ planId: 'plan-1', priceCents: 500, period: 'month' });
  });

  it('an ok answer carrying no subscription leaves the field absent, not a zero', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const answer = await subscribeToPlan('plan-1', CLAIM, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.subscription).toBeUndefined();
    expect(answer.plan).toBeUndefined();
  });

  it('a refusal carries a reason and no subscription', async () => {
    const withReason = makeFetch(() =>
      new Response(JSON.stringify({ ok: false, reason: 'only one subscription at a time' }), { status: 200 }),
    );
    const refused = await subscribeToPlan('plan-1', CLAIM, withReason);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe('only one subscription at a time');
    expect(refused.subscription).toBeUndefined();

    const withMessage = makeFetch(() =>
      new Response(JSON.stringify({ error: 'subscriptions-unavailable', message: 'the subscriptions door is closed' }), { status: 503 }),
    );
    expect((await subscribeToPlan('plan-1', CLAIM, withMessage)).reason).toBe('the subscriptions door is closed');

    const bare = makeFetch(() => new Response(JSON.stringify({ error: 'nope' }), { status: 500 }));
    expect((await subscribeToPlan('plan-1', CLAIM, bare)).reason).toBe('the answer was HTTP 500');
  });

  it('an answer that is not JSON is a refusal, in this lane’s own words', async () => {
    const fetchImpl = makeFetch(() => new Response('<html>gateway', { status: 502 }));
    const answer = await subscribeToPlan('plan-1', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the answer was HTTP 502 with something that is not JSON');
  });

  it('a subscription that never arrived answers with the raw error', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('network down');
    });
    const answer = await subscribeToPlan('plan-1', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('network down');
  });

  it('a write carries the 45-second budget (v294), pinned on AbortSignal.timeout', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const fetchImpl = makeFetch(() =>
        new Response(JSON.stringify({ ok: true, subscription: { planId: 'plan-1', priceCents: 500, period: 'month' } }), { status: 200 }),
      );
      await subscribeToPlan('plan-1', CLAIM, fetchImpl);
      expect(timeoutSpy).toHaveBeenCalledWith(45_000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});

describe('planLane — offerPlan (v440)', () => {
  it('offers a plan at the Studio’s own door with the price and the period', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, plan: { planId: 'plan-9', priceCents: 1200, period: 'month' } }), { status: 200 });
    });

    const answer = await offerPlan('plan-9', 1200, 'CNY', 'month', CLAIM, fetchImpl);

    expect(seenUrl).toBe('/api/plans');
    expect(seenInit?.method).toBe('POST');
    expect(JSON.parse(String(seenInit?.body))).toEqual({
      planId: 'plan-9',
      priceCents: 1200,
      currency: 'CNY',
      period: 'month',
      claim: CLAIM,
    });
    expect(answer.ok).toBe(true);
    expect(answer.plan).toEqual({ planId: 'plan-9', priceCents: 1200, period: 'month' });
  });

  it('the price travels as a number and the currency as the code it was given', async () => {
    let body: { priceCents?: unknown; currency?: unknown; period?: unknown } = {};
    const fetchImpl = makeFetch((_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, plan: { planId: 'plan-9', priceCents: 1200, period: 'month' } }), { status: 200 });
    });

    await offerPlan('plan-9', 1200, 'CNY', 'month', CLAIM, fetchImpl);

    expect(typeof body.priceCents).toBe('number');
    expect(body.priceCents).toBe(1200);
    expect(body.currency).toBe('CNY');
    expect(body.period).toBe('month');
  });

  it('reads the listing shape the service answers, the same way the subscription does', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: true, plans: [{ planId: 'plan-9', priceCents: 1200, period: 'month' }] }), { status: 200 }),
    );
    const answer = await offerPlan('plan-9', 1200, 'CNY', 'month', CLAIM, fetchImpl);
    expect(answer.plan).toEqual({ planId: 'plan-9', priceCents: 1200, period: 'month' });
  });

  it('a refusal carries a reason and no plan', async () => {
    const withReason = makeFetch(() =>
      new Response(JSON.stringify({ ok: false, reason: 'only the creator may reprice this plan' }), { status: 200 }),
    );
    const refused = await offerPlan('plan-9', 1200, 'CNY', 'month', CLAIM, withReason);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe('only the creator may reprice this plan');
    expect(refused.plan).toBeUndefined();
  });

  it('a non-JSON answer and a thrown fetch both answer with a reason', async () => {
    const html = makeFetch(() => new Response('<html>gateway', { status: 502 }));
    expect((await offerPlan('plan-9', 1200, 'CNY', 'month', CLAIM, html)).reason).toBe(
      'the answer was HTTP 502 with something that is not JSON',
    );

    const down = makeFetch(() => {
      throw new Error('network down');
    });
    expect((await offerPlan('plan-9', 1200, 'CNY', 'month', CLAIM, down)).reason).toBe('network down');
  });
});

describe('planLane — when the budget FIRES the door says it was LATE (v482)', () => {
  // The lane has carried a deadline since v294 (the writes) and v477–v481 (the reads), but a fired
  // budget surfaced the PLATFORM's string — "The operation was aborted due to timeout" — which names
  // neither the door nor the budget, and cannot tell a reader whether the door is gone or merely late.
  // The publish lane named this distinction in v294 and the service door in v337; v482 extends the
  // sentence to every lane.

  const late = () => {
    const error = new Error('The operation was aborted due to timeout');
    error.name = 'TimeoutError';
    return error;
  };
  const claim = { accountId: 'acct-bob', handle: 'bob', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 };

  it('a fired budget says the subscriptions was LATE — the lane’s own door and the 45 seconds, not the platform’s string', async () => {
    const fetchImpl = makeFetch(() => {
      throw late();
    });
    const answer = await subscribeToPlan('pro', claim, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the subscriptions did not answer within 45 seconds');
    expect(answer.reason).not.toContain('aborted');
  });


  it('a door that is GONE keeps its own message — the distinction is real, not a rename', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('network down');
    });
    const answer = await subscribeToPlan('pro', claim, fetchImpl);
    expect(answer.reason).toBe('network down');
    expect(answer.reason).not.toContain('45 seconds');
  });


  it('every call rides the same distinction — and each names its OWN door: subscriptions or plans', async () => {
    const fetchImpl = makeFetch(() => {
      throw late();
    });
    const subscribed = await subscribeToPlan('pro', claim, fetchImpl);
    const cancelled = await cancelSubscription('sub-1', claim, fetchImpl);
    const retired = await retirePlan('pro', claim, fetchImpl);
    const repriced = await repricePlan('pro', 200, 'month', claim, fetchImpl);
    const offered = await offerPlan('pro', 200, 'CNY', 'month', claim, fetchImpl);
    expect(subscribed.reason).toBe('the subscriptions did not answer within 45 seconds');
    expect(cancelled.reason).toBe('the subscriptions did not answer within 45 seconds');
    expect(retired.reason).toBe('the plans did not answer within 45 seconds');
    expect(repriced.reason).toBe('the plans did not answer within 45 seconds');
    expect(offered.reason).toBe('the plans did not answer within 45 seconds');
  });
});
