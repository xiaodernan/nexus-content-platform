import { describe, expect, it, vi } from 'vitest';

import { cancelSubscription, offerOnService, readPlans, readSubscriptions, repricePlan, retirePlan, subscribeOnService } from './planServer';
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

describe('planServer — repricePlan (v448)', () => {
  // The repricing write sits beside the offer in the same file and answers through its own reader, and
  // the contrast between the two doors is the reason this is its own increment: the offer POSTs a JSON
  // body with the claim NULL-FILLED (v447), while the repricing PUTs with the price in the QUERY and
  // carries ONLY the claimer — the handle, the assurance and the claimedAt never leave the browser.

  it('the repricing is a PUT to the plan’s own door, with the price and the period in the query', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, priceCents: 2500, period: 'year' }), { status: 200 });
    });
    await repricePlan('pro', 2500, 'year', CLAIM, fetchImpl);
    expect(seenUrl).toBe(`${nexusApiBase()}/plans/pro?claimer=acct-bob&price=2500&period=year`);
    expect(seenInit?.method).toBe('PUT');
    expect(seenInit?.body).toBeUndefined();
    expect(seenInit?.headers).toEqual({ accept: 'application/json' });
  });

  it('the plan id and the claimer are URL-ENCODED into the query', async () => {
    let seenUrl = '';
    const fetchImpl = makeFetch((url) => {
      seenUrl = url;
      return new Response(JSON.stringify({ ok: true, priceCents: 100, period: 'month' }), { status: 200 });
    });
    await repricePlan('pro plan/x', 100, 'month', { accountId: 'acct bob/../x' }, fetchImpl);
    expect(seenUrl).toBe(`${nexusApiBase()}/plans/pro%20plan%2Fx?claimer=acct%20bob%2F..%2Fx&price=100&period=month`);
  });

  it('ONLY the claimer travels — the handle, the assurance and the claimedAt stay behind (v447’s contrast)', async () => {
    let seenUrl = '';
    const fetchImpl = makeFetch((url) => {
      seenUrl = url;
      return new Response(JSON.stringify({ ok: true, priceCents: 100, period: 'month' }), { status: 200 });
    });
    await repricePlan('pro', 100, 'month', CLAIM, fetchImpl);
    expect(seenUrl).not.toContain('handle');
    expect(seenUrl).not.toContain('assurance');
    expect(seenUrl).not.toContain('claimedAt');
    expect(seenUrl).toContain('claimer=acct-bob');
  });

  it('the ask carries the SERVICE budget of 15 seconds, pinned on AbortSignal.timeout (v337)', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true, priceCents: 100, period: 'month' }), { status: 200 }));
      await repricePlan('pro', 100, 'month', CLAIM, fetchImpl);
      expect(timeoutSpy).toHaveBeenCalledWith(15_000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('a refusal keeps the service’s OWN WORDS, even though the body carries no `ok` field (v313)', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ error: 'not-owner', message: 'only the plan’s own creator may reprice it' }), { status: 403 }),
    );
    const answer = await repricePlan('pro', 100, 'month', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('only the plan’s own creator may reprice it');
  });

  it('a refusal that DOES carry `ok: false` keeps its reason too', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: false, reason: 'a plan’s price cannot be negative' }), { status: 400 }),
    );
    const answer = await repricePlan('pro', -1, 'month', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('a plan’s price cannot be negative');
  });

  it('an answer that is neither carries a reason about the HTTP status, naming the door', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ error: 'not-owner' }), { status: 403 }));
    const answer = await repricePlan('pro', 100, 'month', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('403');
    expect(answer.reason).toContain("the service's plans door");
  });

  it('a success carries the NEW price and period the service answered with', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: true, priceCents: 2500, period: 'year' }), { status: 200 }),
    );
    const answer = await repricePlan('pro', 2500, 'year', CLAIM, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.priceCents).toBe(2500);
    expect(answer.period).toBe('year');
  });

  it('an answer whose price is not a number leaves the field absent, not zero', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: true, priceCents: '2500', period: 7 }), { status: 200 }),
    );
    const answer = await repricePlan('pro', 2500, 'year', CLAIM, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.priceCents).toBeUndefined();
    expect(answer.period).toBeUndefined();
  });

  it('an answer that is not JSON is a refusal naming the HTTP status, in the door’s own words', async () => {
    const fetchImpl = makeFetch(() => new Response('<html>gateway</html>', { status: 502 }));
    const answer = await repricePlan('pro', 100, 'month', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('502');
    expect(answer.reason).toContain('not JSON');
  });

  it('a repricing that never arrived answers UNREACHABLE with the address named', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const answer = await repricePlan('pro', 100, 'month', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('nexus-api unreachable');
    expect(answer.reason).toContain(nexusApiBase());
  });

  it('a slow repricing says it was LATE, not unreachable — the v337 distinction', async () => {
    const late = new Error('The operation was aborted due to timeout');
    late.name = 'TimeoutError';
    const fetchImpl = makeFetch(() => {
      throw late;
    });
    const answer = await repricePlan('pro', 100, 'month', CLAIM, fetchImpl);
    expect(answer.reason).toContain('did not answer within 15 seconds');
    expect(answer.reason).not.toContain('unreachable');
  });
});

describe('planServer — readSubscriptions (v449)', () => {
  // The read door beside the three writes. Three of its decisions are the reason this is its own
  // increment, and all three are measured divergences from its neighbours rather than oversights to be
  // smoothed: the read carries NO signal where every write in this file carries the 15-second budget
  // (v337); a non-ok answer keeps the HTTP STATUS rather than the service's own words, the exact
  // opposite of the writes' v313 rule; and a wire with no count falls back to the WINDOW'S LENGTH,
  // where readPlans (v372) falls back to null.

  const sub = (planId: string) => ({
    creatorId: 'acct-ada',
    planId,
    priceCents: 1500,
    currency: 'CNY',
    active: true,
    subscribedAt: 1_700_000_000_000,
    expiresAt: 1_800_000_000_000,
    subscriberId: 'acct-bob',
    id: 'sub-' + planId,
  });

  it('the read asks BY SUBSCRIBER, encoded, as a plain GET with an accept header', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, subscriptions: [sub('pro')], totalCents: 1500, count: 1 }), { status: 200 });
    });
    await readSubscriptions('acct bob/../x', fetchImpl);
    expect(seenUrl).toBe(`${nexusApiBase()}/subscriptions?subscriber=acct%20bob%2F..%2Fx`);
    expect(seenInit?.method).toBeUndefined();
    expect(seenInit?.headers).toEqual({ accept: 'application/json' });
  });

  it('the read carries NO signal — pinned as MEASURED, the budget gap named a fourth time (v337/v441/v442/v445)', async () => {
    // Every WRITE in this file carries the service's 15-second budget; this READ does not. The gap is
    // pinned here as observed rather than smoothed over: a test that asserted a budget nobody wrote
    // would be the lie this house refuses.
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((_url, init) => {
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, subscriptions: [], totalCents: 0, count: 0 }), { status: 200 });
    });
    await readSubscriptions('acct-bob', fetchImpl);
    expect(seenInit?.signal).toBeUndefined();
  });

  it('a non-ok answer is a refusal naming the HTTP STATUS — and NOT the body’s words (the writes’ v313 contrast)', async () => {
    // The write doors read the service's message whenever the answer is not ok (v313). This read does
    // not: a non-ok status answers with the status alone. Pinned as measured, not argued.
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ error: 'subs-unavailable', message: 'the subscriptions table is being rebuilt' }), { status: 503 }),
    );
    const answer = await readSubscriptions('acct-bob', fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('503');
    expect(answer.reason).not.toContain('the subscriptions table is being rebuilt');
  });

  it('a 200 whose body is not JSON is a refusal saying so, in this door’s own words', async () => {
    // The not-JSON branch is reached only when the status says ok: a 502 answers with the status
    // alone, and this 200 with an HTML body is the only way to ask the JSON branch directly.
    const fetchImpl = makeFetch(() => new Response('<html>gateway</html>', { status: 200 }));
    const answer = await readSubscriptions('acct-bob', fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('not JSON');
  });

  it('an answer with no subscriptions ARRAY is a refusal — a failed read is NOT an empty list', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true, totalCents: 0 }), { status: 200 }));
    const answer = await readSubscriptions('acct-bob', fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.subscriptions).toEqual([]);
    expect(answer.reason).toContain('no subscriptions');
  });

  it('a success carries the subscriptions as they came, with the total the wire named', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: true, subscriptions: [sub('pro'), sub('team')], totalCents: 6400, count: 2 }), { status: 200 }),
    );
    const answer = await readSubscriptions('acct-bob', fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.subscriptions).toHaveLength(2);
    expect(answer.subscriptions[0]?.planId).toBe('pro');
    expect(answer.totalCents).toBe(6400);
    expect(answer.count).toBe(2);
  });

  it('a wire with no totalCents answers zero, and a wire with no count answers the WINDOW’S LENGTH (v372’s opposite)', async () => {
    // readPlans answers a missing count with null — UNKNOWN. This door answers it with the length of
    // what came back. Two doors, two fallbacks, both pinned as measured.
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: true, subscriptions: [sub('pro'), sub('team')] }), { status: 200 }),
    );
    const answer = await readSubscriptions('acct-bob', fetchImpl);
    expect(answer.totalCents).toBe(0);
    expect(answer.count).toBe(2);
  });

  it('a read that never arrived answers UNREACHABLE with the address named', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const answer = await readSubscriptions('acct-bob', fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.subscriptions).toEqual([]);
    expect(answer.reason).toContain('nexus-api unreachable');
    expect(answer.reason).toContain(nexusApiBase());
  });

  it('a slow read says it was LATE, not unreachable — the v337 distinction', async () => {
    const late = new Error('The operation was aborted due to timeout');
    late.name = 'TimeoutError';
    const fetchImpl = makeFetch(() => {
      throw late;
    });
    const answer = await readSubscriptions('acct-bob', fetchImpl);
    expect(answer.reason).toContain('did not answer within 15 seconds');
    expect(answer.reason).not.toContain('unreachable');
  });
});

describe('planServer — cancelSubscription and retirePlan (v450)', () => {
  // The last two write doors in this file, and they share one shape: a DELETE naming the thing and the
  // claimer in the QUERY, no body, the service's 15-second budget, and an answer whose VERB field
  // (`ended` / `retired`) must be present for the write to count as done. A 200 carrying no verb is a
  // refusal — and a verb that is false is a SUCCESS: already ended, already retired.

  it('a cancellation is a DELETE naming the subscription and the claimer, and only those', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(JSON.stringify({ ended: true }), { status: 200 });
    });
    await cancelSubscription('sub pro/1', CLAIM, fetchImpl);
    expect(seenUrl).toBe(`${nexusApiBase()}/subscriptions/sub%20pro%2F1?claimer=acct-bob`);
    expect(seenInit?.method).toBe('DELETE');
    expect(seenInit?.body).toBeUndefined();
    expect(seenInit?.headers).toEqual({ accept: 'application/json' });
  });

  it('a cancellation carries the SERVICE budget of 15 seconds, pinned on AbortSignal.timeout (v337)', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ended: true }), { status: 200 }));
      await cancelSubscription('sub-1', CLAIM, fetchImpl);
      expect(timeoutSpy).toHaveBeenCalledWith(15_000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('a cancellation refusal keeps the service’s OWN WORDS, even though the body carries no `ok` field (v313)', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ error: 'not-owner', message: 'only the subscriber may end this subscription' }), { status: 403 }),
    );
    const answer = await cancelSubscription('sub-1', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.ended).toBe(false);
    expect(answer.reason).toBe('only the subscriber may end this subscription');
  });

  it('an answer with NO verb is a refusal even at 200 — the write must say whether it moved', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const answer = await cancelSubscription('sub-1', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('200');
  });

  it('a subscription that was ALREADY ENDED is a success answering ended:false — not a failure', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ended: false }), { status: 200 }));
    const answer = await cancelSubscription('sub-1', CLAIM, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.ended).toBe(false);
  });

  it('a cancellation that never arrived answers UNREACHABLE with the address named, and a slow one says LATE', async () => {
    const dead = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const gone = await cancelSubscription('sub-1', CLAIM, dead);
    expect(gone.ok).toBe(false);
    expect(gone.ended).toBe(false);
    expect(gone.reason).toContain('nexus-api unreachable');
    expect(gone.reason).toContain(nexusApiBase());

    const late = new Error('The operation was aborted due to timeout');
    late.name = 'TimeoutError';
    const slow = makeFetch(() => {
      throw late;
    });
    const tardy = await cancelSubscription('sub-1', CLAIM, slow);
    expect(tardy.reason).toContain('did not answer within 15 seconds');
    expect(tardy.reason).not.toContain('unreachable');
  });

  it('a retirement is a DELETE naming the plan and the claimer, and only those', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(JSON.stringify({ retired: true }), { status: 200 });
    });
    await retirePlan('pro plan/1', CLAIM, fetchImpl);
    expect(seenUrl).toBe(`${nexusApiBase()}/plans/pro%20plan%2F1?claimer=acct-bob`);
    expect(seenInit?.method).toBe('DELETE');
    expect(seenInit?.body).toBeUndefined();
    expect(seenInit?.headers).toEqual({ accept: 'application/json' });
  });

  it('a retirement carries the SERVICE budget of 15 seconds, pinned on AbortSignal.timeout (v337)', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const fetchImpl = makeFetch(() => new Response(JSON.stringify({ retired: true }), { status: 200 }));
      await retirePlan('pro', CLAIM, fetchImpl);
      expect(timeoutSpy).toHaveBeenCalledWith(15_000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('a retirement refusal keeps the service’s OWN WORDS, even though the body carries no `ok` field (v313)', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ error: 'not-owner', message: 'only the plan’s own creator may retire it' }), { status: 403 }),
    );
    const answer = await retirePlan('pro', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.retired).toBe(false);
    expect(answer.reason).toBe('only the plan’s own creator may retire it');
  });

  it('an answer with NO verb is a refusal even at 200 — the retirement must say whether it happened', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const answer = await retirePlan('pro', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('200');
  });

  it('a plan that was ALREADY RETIRED is a success answering retired:false — the promises stand', async () => {
    // Retiring takes the OFFER away and leaves the subscriptions alone; a second retirement of an
    // already-retired plan says so with retired:false and is still an ok answer.
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ retired: false }), { status: 200 }));
    const answer = await retirePlan('pro', CLAIM, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.retired).toBe(false);
  });

  it('a retirement that never arrived answers UNREACHABLE with the address named, and a slow one says LATE', async () => {
    const dead = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const gone = await retirePlan('pro', CLAIM, dead);
    expect(gone.ok).toBe(false);
    expect(gone.retired).toBe(false);
    expect(gone.reason).toContain('nexus-api unreachable');
    expect(gone.reason).toContain(nexusApiBase());

    const late = new Error('The operation was aborted due to timeout');
    late.name = 'TimeoutError';
    const slow = makeFetch(() => {
      throw late;
    });
    const tardy = await retirePlan('pro', CLAIM, slow);
    expect(tardy.reason).toContain('did not answer within 15 seconds');
    expect(tardy.reason).not.toContain('unreachable');
  });
});
