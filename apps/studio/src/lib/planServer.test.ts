import { describe, expect, it, vi } from 'vitest';

import { offerOnService, readPlans, subscribeOnService } from './planServer';
import { nexusApiBase } from './publishServer';

/**
 * M7 v313 — the server-side half of the PLANS and SUBSCRIPTIONS lane.
 *
 * The rule this file exists for: **a refusal keeps the service's own words.** The service's error body is
 * `{error, message}` — it carries NO `ok` field — so a reader that only looked for the reason when the
 * body said `ok: false` threw away every message the service ever wrote and answered "the answer was HTTP
 * 400" instead. A refusal that loses its reason is a refusal that has to be run again to learn anything.
 */
function makeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init)) as unknown as typeof fetch;
}

const CLAIM = { accountId: 'acct-bob', handle: 'bob', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 };

describe('planServer — the door to the service is BOUNDED (v337)', () => {
  it('the call carries a signal — a service that never answers cannot hold the Studio forever', async () => {
    // The doors in this folder used to fetch the service with no budget at all, so a service that never
    // answered left the Studio waiting forever. The signal is what turns a hang into a sentence.
    let seen: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      seen = init?.signal ?? undefined;
      return new Response(JSON.stringify({ error: 'invalid-subscription', message: 'nope' }), { status: 400 });
    }) as unknown as typeof fetch;

    await subscribeOnService('pro', CLAIM, fetchImpl);

    expect(seen).toBeInstanceOf(AbortSignal);
  });
});

describe('planServer — subscribeOnService (server half)', () => {
  it('a refusal keeps the service\u2019s OWN WORDS, even though the body carries no `ok` field', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(
        JSON.stringify({
          error: 'invalid-subscription',
          message: 'this account cancelled this subscription, and it cannot be made again',
        }),
        { status: 400 },
      ),
    );
    const answer = await subscribeOnService('pro', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('this account cancelled this subscription, and it cannot be made again');
  });

  it('a refusal that DOES carry `ok: false` keeps its reason too', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: false, reason: 'a subscription needs an account to hold it' }), { status: 400 }),
    );
    const answer = await subscribeOnService('pro', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('a subscription needs an account to hold it');
  });

  it('an answer that is neither carries a reason about the HTTP status, and not a fake one', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ error: 'invalid-subscription' }), { status: 400 }));
    const answer = await subscribeOnService('pro', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('400');
  });

  it('a success carries the subscription it made', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(
        JSON.stringify({
          ok: true,
          subscriptions: [{ planId: 'pro', priceCents: 1500, currency: 'CNY', period: 'month' }],
        }),
        { status: 201 },
      ),
    );
    const answer = await subscribeOnService('pro', CLAIM, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.subscription?.planId).toBe('pro');
    expect(answer.subscription?.priceCents).toBe(1500);
  });
});

describe('planServer — readPlans PAGES the plans (v396)', () => {
  // v392 moved the plans door onto rows: `limit` and `offset` are query parameters, and the answer
  // echoes the window it answered. The read here has to FORWARD both, and it has to come back naming
  // the window — the profile page's pager (v396) says which plans it is showing, and it cannot
  // say that from a URL it did not send.
  const plansBody = (n: number, count: number) =>
    JSON.stringify({
      ok: true,
      plans: Array.from({ length: n }, (_unused, i) => ({ planId: 'p-' + i, priceCents: 100, currency: 'CNY', period: 'month' })),
      count,
      limit: 20,
      offset: 20,
    });

  it('the ask carries the window as limit and offset rows', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(plansBody(2, 21), { status: 200 });
    });
    const answer = await readPlans('acct-ada', 20, 20, fetchImpl);
    expect(seen).toContain('creator=acct-ada');
    expect(seen).toContain('limit=20');
    expect(seen).toContain('offset=20');
    expect(answer.ok).toBe(true);
    expect(answer.count).toBe(21);
    expect(answer.limit).toBe(20);
    expect(answer.offset).toBe(20);
  });

  it('a negative offset is clamped to the first window, not refused', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(plansBody(1, 1), { status: 200 });
    });
    const answer = await readPlans('acct-ada', 20, -5, fetchImpl);
    expect(seen).toContain('offset=0');
    expect(answer.offset).toBe(0);
  });

  it('an answer that does not echo a limit keeps the one that was asked for', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: true, plans: [], count: 0 }), { status: 200 }),
    );
    const answer = await readPlans('acct-ada', 7, 0, fetchImpl);
    expect(answer.limit).toBe(7);
    expect(answer.offset).toBe(0);
  });

  it('a refusal still names the window it was asked for', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(JSON.stringify({ error: 'plans-unavailable' }), { status: 503 });
    });
    const answer = await readPlans('acct-ada', 20, 20, fetchImpl);
    expect(seen).toContain('offset=20');
    expect(answer.ok).toBe(false);
    expect(answer.limit).toBe(20);
    expect(answer.offset).toBe(20);
    expect(answer.reason).toContain('503');
  });
});

describe('planServer — offerOnService (v447)', () => {
  // The OFFER is the third server-side write door in this family to be asked directly (likes in v436,
  // comments in v437, follows in v445). The family shape is what makes it worth pinning: the claim is
  // NULL-FILLED here too — every absent field written as `null` rather than dropped — and the answer is
  // read through the same reader the subscription write uses, so a refusal keeps the service's own
  // words (v313) and a success carries the FIRST plan of the answer's list.

  it('the offer is POSTed to the plans door with all five fields in the JSON body', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, plans: [{ planId: 'pro', priceCents: 1500, currency: 'CNY', period: 'month' }] }), { status: 201 });
    });
    await offerOnService('pro', 1500, 'CNY', 'month', CLAIM, fetchImpl);
    expect(seenUrl).toBe(`${nexusApiBase()}/plans`);
    expect(seenInit?.method).toBe('POST');
    expect(seenInit?.headers).toMatchObject({ 'content-type': 'application/json', accept: 'application/json' });
    expect(JSON.parse(String(seenInit?.body))).toEqual({
      planId: 'pro',
      priceCents: 1500,
      currency: 'CNY',
      period: 'month',
      claim: { accountId: 'acct-bob', handle: 'bob', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 },
    });
  });

  it('the claim is NULL-FILLED, not dropped — the family shape the follows door shares (v445)', async () => {
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((_url, init) => {
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, plans: [] }), { status: 201 });
    });
    await offerOnService('pro', 100, 'CNY', 'month', { accountId: 'acct-bob' }, fetchImpl);
    expect(JSON.parse(String(seenInit?.body)).claim).toEqual({ accountId: 'acct-bob', handle: null, assurance: null, claimedAt: null });
  });

  it('the ask carries the SERVICE budget of 15 seconds, pinned on AbortSignal.timeout (v337)', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true, plans: [] }), { status: 201 }));
      await offerOnService('pro', 100, 'CNY', 'month', CLAIM, fetchImpl);
      expect(timeoutSpy).toHaveBeenCalledWith(15_000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('a refusal keeps the service’s OWN WORDS, even though the body carries no `ok` field (v313)', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ error: 'invalid-plan', message: 'a plan needs a price above zero' }), { status: 400 }),
    );
    const answer = await offerOnService('pro', 0, 'CNY', 'month', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('a plan needs a price above zero');
  });

  it('a refusal that DOES carry `ok: false` keeps its reason too', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: false, reason: 'this account already offers that plan' }), { status: 409 }),
    );
    const answer = await offerOnService('pro', 100, 'CNY', 'month', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('this account already offers that plan');
  });

  it('a refusal carries no plan — a refused offer is not a plan that was made', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ error: 'invalid-plan', message: 'nope' }), { status: 400 }),
    );
    const answer = await offerOnService('pro', 100, 'CNY', 'month', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.plan).toBeUndefined();
  });

  it('a success carries the FIRST plan of the answer’s list', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(
        JSON.stringify({
          ok: true,
          plans: [
            { planId: 'pro', priceCents: 1500, currency: 'CNY', period: 'month' },
            { planId: 'team', priceCents: 4900, currency: 'CNY', period: 'year' },
          ],
        }),
        { status: 201 },
      ),
    );
    const answer = await offerOnService('pro', 1500, 'CNY', 'month', CLAIM, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.plan?.planId).toBe('pro');
    expect(answer.plan?.priceCents).toBe(1500);
  });

  it('an ok answer carrying no plan leaves the field absent rather than inventing one', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true, plans: [] }), { status: 201 }));
    const answer = await offerOnService('pro', 100, 'CNY', 'month', CLAIM, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.plan).toBeUndefined();
  });

  it('an answer that is not JSON is a refusal naming the HTTP status', async () => {
    const fetchImpl = makeFetch(() => new Response('<html>gateway</html>', { status: 502 }));
    const answer = await offerOnService('pro', 100, 'CNY', 'month', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('502');
    expect(answer.reason).toContain('not JSON');
  });

  it('an offer that never arrived answers UNREACHABLE with the address named', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const answer = await offerOnService('pro', 100, 'CNY', 'month', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('nexus-api unreachable');
    expect(answer.reason).toContain(nexusApiBase());
  });

  it('a slow offer says it was LATE, not unreachable — the v337 distinction', async () => {
    const late = new Error('The operation was aborted due to timeout');
    late.name = 'TimeoutError';
    const fetchImpl = makeFetch(() => {
      throw late;
    });
    const answer = await offerOnService('pro', 100, 'CNY', 'month', CLAIM, fetchImpl);
    expect(answer.reason).toContain('did not answer within 15 seconds');
    expect(answer.reason).not.toContain('unreachable');
  });
});
