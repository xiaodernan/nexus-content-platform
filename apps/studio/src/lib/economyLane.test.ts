import { describe, expect, it, vi } from 'vitest';

import { readEconomy } from './economyLane';

function makeFetch(handler: (url: string) => Response) {
  return vi.fn(async (url: string) => handler(url)) as unknown as typeof fetch;
}

describe('economyLane — readEconomy (M8 v274)', () => {
  it('asks the Studio\'s own door', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/economy?account=acct-ada&offset=0&receivedOffset=0&plansOffset=0');
      return new Response(JSON.stringify({ ok: true, subscriptions: [], plans: [], tips: [] }), { status: 200 });
    });
    const answer = await readEconomy('acct-ada', 0, 0, 0, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.subscriptions).toEqual([]);
    expect(answer.plans).toEqual([]);
    expect(answer.tips).toEqual([]);
  });

  it('a 503 carries the service\'s reason, not a status code', async () => {
    const answer = await readEconomy('acct-ada', 0, 0, 0,
      makeFetch(() => new Response(JSON.stringify({ ok: false, reason: 'server not built' }), { status: 503 })),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('server not built');
  });

  it('a 503 with no body still says what it was', async () => {
    const answer = await readEconomy('acct-ada', 0, 0, 0, makeFetch(() => new Response('', { status: 503 })));
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the economy answered HTTP 503');
  });

  it('something that is not JSON is a reason', async () => {
    const answer = await readEconomy('acct-ada', 0, 0, 0, makeFetch(() => new Response('<html>no</html>', { status: 200 })));
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the economy answered something that is not JSON');
  });

  it('a body with no arrays is a reason', async () => {
    const answer = await readEconomy('acct-ada', 0, 0, 0, makeFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the economy answered with no subscriptions or plans');
  });

  it('a thrown fetch answers with the error\'s message', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network down'); }) as unknown as typeof fetch;
    const answer = await readEconomy('acct-ada', 0, 0, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('network down');
  });

  it('maps valid subscription and tip arrays into rows', async () => {
    const body = {
      ok: true,
      subscriptions: [{ creatorId: 'acct-ada', planId: 'pro', priceCents: 1500, currency: 'CNY', active: true, subscribedAt: 1, expiresAt: null }],
      tips: [{ recipientId: 'acct-ada', amountCents: 500, message: 'thanks', anonymous: false }],
    };
    const answer = await readEconomy('acct-ada', 0, 0, 0, makeFetch(() => new Response(JSON.stringify(body), { status: 200 })));
    expect(answer.ok).toBe(true);
    const subs = answer.subscriptions ?? [];
    const tips = answer.tips ?? [];
    expect(subs).toHaveLength(1);
    expect(subs[0]!.planId).toBe('pro');
    expect(tips).toHaveLength(1);
    expect(tips[0]!.amountText).toBe('¥5.00');
  });

  it('drops malformed rows and keeps valid ones', async () => {
    const body = {
      ok: true,
      subscriptions: [{ creatorId: 'acct-ada', planId: 'good', priceCents: 1000, currency: 'CNY', active: true, subscribedAt: 1, expiresAt: null }, { planId: '' }],
      tips: [{ recipientId: 'acct-ada', amountCents: 500, message: '', anonymous: false }, { recipientId: '' }],
    };
    const answer = await readEconomy('acct-ada', 0, 0, 0, makeFetch(() => new Response(JSON.stringify(body), { status: 200 })));
    expect(answer.ok).toBe(true);
    const subs = answer.subscriptions ?? [];
    const tips = answer.tips ?? [];
    expect(subs).toHaveLength(1);
    expect(tips).toHaveLength(1);
  });

  it('v373 — carries the plans’ COUNT, so the panel can say its list is a window', async () => {
    const answer = await readEconomy('acct-ada', 0, 0, 0, async () =>
      new Response(
        JSON.stringify({
          ok: true,
          subscriptions: [],
          plans: [{ planId: 'pro', creatorId: 'acct-ada', priceCents: 1500, currency: 'CNY', period: 'month', active: true, createdAt: 1 }],
          planCount: 21,
        }),
        { status: 200 },
      ),
    );
    expect(answer.ok).toBe(true);
    expect(answer.planCount).toBe(21);
  });

  it('v392 — the three lists page INDEPENDENTLY, and the pages travel in the query', async () => {
    // The subscriptions held, the subscriptions received and the plans offered are three different
    // questions about three different sets: one page for all three would answer none of them.
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/economy?account=acct-ada&offset=20&receivedOffset=40&plansOffset=0');
      return new Response(
        JSON.stringify({
          ok: true,
          subscriptions: [],
          received: [],
          plans: [],
          limit: 20,
          subscriptionOffset: 20,
          receivedOffset: 40,
          planOffset: 0,
        }),
        { status: 200 },
      );
    });
    const answer = await readEconomy('acct-ada', 20, 40, 0, fetchImpl);
    expect(answer.ok).toBe(true);
    // and the answer echoes the windows it is FOR: three reads in flight cannot be mistaken for
    // each other's answers (v382's rule).
    expect(answer.subscriptionOffset).toBe(20);
    expect(answer.receivedOffset).toBe(40);
    expect(answer.planOffset).toBe(0);
    expect(answer.limit).toBe(20);
  });

  it('v392 — a NEGATIVE page is the first window, not a question about a page before the first', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/economy?account=acct-ada&offset=0&receivedOffset=0&plansOffset=0');
      return new Response(JSON.stringify({ ok: true, subscriptions: [], plans: [] }), { status: 200 });
    });
    const answer = await readEconomy('acct-ada', -5, -1, -9, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.subscriptionOffset).toBe(0);
    expect(answer.receivedOffset).toBe(0);
    expect(answer.planOffset).toBe(0);
  });

  it('maps the plans too — the creator’s own side of the economy (M7 v309)', async () => {
    const body = {
      ok: true,
      subscriptions: [],
      plans: [{ planId: 'pro', creatorId: 'acct-ada', priceCents: 1500, currency: 'CNY', period: 'month', active: true, createdAt: 1 }],
    };
    const answer = await readEconomy('acct-ada', 0, 0, 0, makeFetch(() => new Response(JSON.stringify(body), { status: 200 })));
    expect(answer.ok).toBe(true);
    const plans = answer.plans ?? [];
    expect(plans).toHaveLength(1);
    expect(plans[0]!.planId).toBe('pro');
    expect(plans[0]!.priceText).toBe('¥15.00');
    expect(plans[0]!.periodText).toBe('per month');
  });
});

describe('economyLane — when the budget FIRES the door says it was LATE (v482)', () => {
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

  it('a fired budget says the economy was LATE — the lane’s own door and the 45 seconds, not the platform’s string', async () => {
    const fetchImpl = makeFetch(() => {
      throw late();
    });
    const answer = await readEconomy('acct-ada', 0, 0, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the economy did not answer within 45 seconds');
    expect(answer.reason).not.toContain('aborted');
  });


  it('a door that is GONE keeps its own message — the distinction is real, not a rename', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('network down');
    });
    const answer = await readEconomy('acct-ada', 0, 0, 0, fetchImpl);
    expect(answer.reason).toBe('network down');
    expect(answer.reason).not.toContain('45 seconds');
  });


  it('the fired budget keeps the answer a refusal, not an empty panel — no rows are invented for a late door', async () => {
    const fetchImpl = makeFetch(() => {
      throw late();
    });
    const answer = await readEconomy('acct-ada', 0, 0, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.subscriptions).toBeUndefined();
    expect(answer.plans).toBeUndefined();
    expect(answer.reason).toBe('the economy did not answer within 45 seconds');
  });

  it('a DOMException from a real AbortSignal is read the same way — the branch keys on the name, not the class', async () => {
    const fetchImpl = makeFetch(() => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    const answer = await readEconomy('acct-ada', 0, 0, 0, fetchImpl);
    expect(answer.reason).toBe('the economy did not answer within 45 seconds');
  });
});
