import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

/**
 * M7 v495 (ADR 0016 amendment 488) — the economy ROUTE, graded directly.
 *
 * `economyServer.test.ts` has always graded the lib: how a call to the service composes an address,
 * waits, and reads an answer back. This file grades the hop above it, whose decisions belong to nothing
 * else: which refusals happen BEFORE the service is asked, which values are forwarded exactly as the
 * caller wrote them, what the browser\u2019s HTTP status does and does not mean, and what vocabulary the
 * route\u2019s own refusal sentences claim.
 *
 * This door reads THREE lists at once — what the account backs, who backs it, and what it offers — and
 * the rule that matters most is that a failed read is NOT an empty economy: the panel says why it could
 * not read, rather than showing "no subscriptions" and being wrong.
 *
 * The service is faked at the `fetch` boundary rather than injected, because the route calls the lib\u2019s
 * defaults and those read the global `fetch` per call — so a stub grades the route without asking any
 * source file to carry a seam for the test\u2019s benefit.
 */

interface Call {
  url: string;
}

let calls: Call[] = [];
let subs: { status: number; json?: unknown } = { status: 200, json: { subscriptions: [], totalsByPeriod: [], count: 0, limit: 20 } };
let received: { status: number; json?: unknown } = { status: 200, json: { subscriptions: [], totalsByPeriod: [], count: 0, limit: 20 } };
let plans: { status: number; json?: unknown } = { status: 200, json: { plans: [], count: null, limit: 20 } };

function stubService(next: {
  subs?: { status: number; json?: unknown };
  received?: { status: number; json?: unknown };
  plans?: { status: number; json?: unknown };
}) {
  subs = next.subs ?? { status: 200, json: { subscriptions: [], totalsByPeriod: [], count: 0, limit: 20 } };
  received = next.received ?? { status: 200, json: { subscriptions: [], totalsByPeriod: [], count: 0, limit: 20 } };
  plans = next.plans ?? { status: 200, json: { plans: [], count: null, limit: 20 } };
  calls = [];
  vi.stubGlobal(
    'fetch',
    async (input: string | URL) => {
      const url = String(input);
      calls.push({ url });
      const answer = url.includes('/subscriptions?subscriber=') ? subs : url.includes('/subscriptions?creator=') ? received : plans;
      return new Response(answer.json === undefined ? '' : JSON.stringify(answer.json), { status: answer.status });
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const get = (search: string) => GET(new Request(`http://studio.test/api/economy${search}`));

const hop = (which: 'subs' | 'received' | 'plans') =>
  calls.find((c) =>
    which === 'subs' ? c.url.includes('/subscriptions?subscriber=') : which === 'received' ? c.url.includes('/subscriptions?creator=') : c.url.includes('/plans?creator='),
  )!;

describe('economy route — the GET ask (v495)', () => {
  it('a missing account is refused BEFORE the service is asked', async () => {
    stubService({});
    const res = await get('');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: 'the economy belongs to an account, and this request names none' });
    expect(calls).toHaveLength(0);
  });

  it('a BLANK account is the same refusal — whitespace is not an account', async () => {
    stubService({});
    const res = await get('?account=%20%20');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the economy belongs to an account, and this request names none');
    expect(calls).toHaveLength(0);
  });

  it('the WHOLE account is read — three hops, not one and not two', async () => {
    stubService({});
    await get('?account=acct-ada');
    expect(calls).toHaveLength(3);
    expect(hop('subs').url).toContain('/subscriptions?subscriber=acct-ada');
    expect(hop('received').url).toContain('/subscriptions?creator=acct-ada');
    expect(hop('plans').url).toContain('/plans?creator=acct-ada');
  });

  it('the account is TRIMMED once and used for all three asks', async () => {
    stubService({});
    await get('?account=%20acct-ada%20');
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.url).toContain('=acct-ada');
      expect(call.url).not.toContain('%20acct-ada');
    }
  });

  it('a limit that is not a number falls back to 20 on every hop — NaN is never forwarded', async () => {
    stubService({});
    await get('?account=acct-ada&limit=abc');
    for (const call of calls) {
      expect(call.url).toContain('limit=20');
    }
  });

  it('a limit of ZERO is not a window of nothing — it is the default window', async () => {
    stubService({});
    await get('?account=acct-ada&limit=0');
    for (const call of calls) {
      expect(call.url).toContain('limit=20');
    }
  });

  it('the three windows are INDEPENDENT — an offset for one list moves no other', async () => {
    stubService({});
    await get('?account=acct-ada&offset=40&receivedOffset=80&plansOffset=120');
    expect(hop('subs').url).toContain('offset=40');
    expect(hop('received').url).toContain('offset=80');
    expect(hop('plans').url).toContain('offset=120');
  });

  it('an offset named for ONE list leaves the others on the first window', async () => {
    stubService({});
    await get('?account=acct-ada&receivedOffset=80');
    expect(hop('subs').url).toContain('offset=0');
    expect(hop('received').url).toContain('offset=80');
    expect(hop('plans').url).toContain('offset=0');
  });

  it('a NEGATIVE offset is clamped to the first window on every list', async () => {
    stubService({});
    await get('?account=acct-ada&offset=-40&receivedOffset=-80&plansOffset=-120');
    for (const call of calls) {
      expect(call.url).toContain('offset=0');
    }
  });

  it('a failed read is NOT an empty economy — the subscriptions refusal is a 502 with its own reason', async () => {
    stubService({ subs: { status: 503, json: { error: 'down', message: 'the subscriptions are down' } } });
    const res = await get('?account=acct-ada');
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe('the subscriptions are down');
    expect(body.subscriptions).toBeUndefined();
  });

  it('the RECEIVED refusal is answered when the subscriptions read fine', async () => {
    stubService({ received: { status: 503, json: { error: 'down', message: 'the received are down' } } });
    const res = await get('?account=acct-ada');
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('the received are down');
  });

  it('the PLANS refusal is answered when both subscription reads are fine', async () => {
    stubService({ plans: { status: 503, json: { error: 'down', message: 'the plans are down' } } });
    const res = await get('?account=acct-ada');
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('the plans are down');
  });

  it('when SEVERAL reads fail the subscriptions reason is the one answered — the first half named is the first half refused', async () => {
    stubService({
      subs: { status: 503, json: { error: 'down', message: 'the subscriptions are down' } },
      received: { status: 503, json: { error: 'down', message: 'the received are down' } },
      plans: { status: 503, json: { error: 'down', message: 'the plans are down' } },
    });
    const res = await get('?account=acct-ada');
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('the subscriptions are down');
  });

  it('an ok answer is a 200 carrying all three lists, their totals and the window each one is FOR', async () => {
    stubService({
      subs: { status: 200, json: { subscriptions: [{ id: 's-1' }], totalsByPeriod: [{ period: 'month', currency: 'CNY', totalCents: 500 }], count: 3, limit: 20 } },
      received: { status: 200, json: { subscriptions: [{ id: 's-2' }], totalsByPeriod: [{ period: 'year', currency: 'CNY', totalCents: 900 }], count: 1, limit: 20 } },
      plans: { status: 200, json: { plans: [{ planId: 'plan-1' }], count: 2, limit: 20 } },
    });
    const res = await get('?account=acct-ada&offset=40&receivedOffset=80&plansOffset=120');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      subscriptions: [{ id: 's-1' }],
      totalsByPeriod: [{ period: 'month', currency: 'CNY', totalCents: 500 }],
      subscriptionCount: 3,
      received: [{ id: 's-2' }],
      receivedTotalsByPeriod: [{ period: 'year', currency: 'CNY', totalCents: 900 }],
      receivedCount: 1,
      plans: [{ planId: 'plan-1' }],
      planCount: 2,
      limit: 20,
      subscriptionOffset: 40,
      receivedOffset: 80,
      planOffset: 120,
    });
  });
});
