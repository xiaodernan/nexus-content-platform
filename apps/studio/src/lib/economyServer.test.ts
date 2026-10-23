import { describe, expect, it, vi } from 'vitest';

import { readSubscriptions, readReceivedSubscriptions, readPlans } from './economyServer';

/**
 * M7 v406 — the server-side half of the ECONOMY readers.
 *
 * Three rules this file exists for. **The answer names the window it is FOR** — three reads go out
 * together here (what I back, who backs me, what I offer) and they answer in whatever order the network
 * chooses, so an answer that carries its own window cannot be mistaken for another one’s (v382’s rule,
 * echoed since v392). **A count is either the whole table or UNKNOWN** — the plans reader answers
 * `count: null` when the wire carries none, because the window’s length is a fact about the read and
 * not about the creator (v373); the subscriptions readers fall back to the rows they carried. And **the
 * per-period totals are filtered, not trusted** — a group with no currency or no finite amount is
 * dropped rather than rendered as a total of nothing.
 */
function makeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init)) as unknown as typeof fetch;
}

const sub = (i: number) => ({
  id: `sub-${i}`,
  subscriberAccountId: 'acct-s',
  creatorAccountId: 'acct-c',
  planId: 'plan-1',
  amountCents: 500,
  currency: 'USD',
  period: 'monthly',
  status: 'active',
  createdAt: 1_776_000_000_000,
});

const subsBody = (n: number, count?: number, totals?: unknown) =>
  JSON.stringify({
    subscriptions: Array.from({ length: n }, (_unused, i) => sub(i)),
    ...(count === undefined ? {} : { count }),
    ...(totals === undefined ? {} : { totalsByPeriod: totals }),
    limit: 20,
    offset: 20,
  });

const plansBody = (n: number, count?: number) =>
  JSON.stringify({
    plans: Array.from({ length: n }, (_unused, i) => ({
      id: `plan-${i}`,
      creatorAccountId: 'acct-c',
      name: `Tier ${i}`,
      amountCents: 500,
      currency: 'USD',
      period: 'monthly',
    })),
    ...(count === undefined ? {} : { count }),
    limit: 20,
    offset: 20,
  });

describe('economyServer — readSubscriptions reads what one account BACKS (v406)', () => {
  it('the ask names the subscriber with the window as rows, and the answer echoes it', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(subsBody(2, 9), { status: 200 });
    });
    const answer = await readSubscriptions('acct-s', 20, 20, fetchImpl);
    expect(seen).toContain('subscriber=acct-s');
    expect(seen).toContain('limit=20');
    expect(seen).toContain('offset=20');
    expect(answer.ok).toBe(true);
    expect(answer.subscriptions).toHaveLength(2);
    expect(answer.count).toBe(9);
    expect(answer.limit).toBe(20);
    expect(answer.offset).toBe(20);
  });

  it('a negative offset is clamped to the first window, not refused', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(subsBody(1, 1), { status: 200 });
    });
    const answer = await readSubscriptions('acct-s', 20, -5, fetchImpl);
    expect(seen).toContain('offset=0');
    expect(answer.offset).toBe(0);
  });

  it('the per-period totals are filtered — a group with no currency or no finite amount is dropped', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(
        subsBody(1, 1, [
          { period: '2026-10', currency: 'USD', totalCents: 1500 },
          { period: '2026-10', currency: '', totalCents: 100 },
          { period: '', currency: 'USD', totalCents: 100 },
          { period: '2026-10', currency: 'USD', totalCents: 'lots' },
          { period: '2026-10', currency: 'USD' },
          'nonsense',
          null,
        ]),
        { status: 200 },
      ),
    );
    const answer = await readSubscriptions('acct-s', 20, 0, fetchImpl);
    expect(answer.totalsByPeriod).toEqual([{ period: '2026-10', currency: 'USD', totalCents: 1500 }]);
  });

  it('a body with no totals answers an empty list of them, not a crash', async () => {
    const fetchImpl = makeFetch(() => new Response(subsBody(1, 1), { status: 200 }));
    const answer = await readSubscriptions('acct-s', 20, 0, fetchImpl);
    expect(answer.totalsByPeriod).toEqual([]);
  });

  it('a refusal names the service’s message when there is one, and the window it was asked for', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ message: 'the subscriber is unknown' }), { status: 200 }),
    );
    const answer = await readSubscriptions('acct-s', 20, 20, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the subscriber is unknown');
    expect(answer.offset).toBe(20);
    expect(answer.count).toBe(0);
  });

  it('a refusal with no message names the HTTP status, and a non-JSON body is a refusal too', async () => {
    const noMessage = makeFetch(() => new Response(JSON.stringify({ error: 'boom' }), { status: 503 }));
    const refused = await readSubscriptions('acct-s', 20, 0, noMessage);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain('503');

    const notJson = makeFetch(() => new Response('not json', { status: 200 }));
    const broken = await readSubscriptions('acct-s', 20, 0, notJson);
    expect(broken.ok).toBe(false);
    expect(broken.reason).toContain('not JSON');
  });

  it('a call that never answers is an unreachable reason, not a hang', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const answer = await readSubscriptions('acct-s', 20, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('unreachable');
  });
});

describe('economyServer — readReceivedSubscriptions reads who backs one creator (v406)', () => {
  it('the ask names the CREATOR, the other side of the same relation', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(subsBody(2, 41), { status: 200 });
    });
    const answer = await readReceivedSubscriptions('acct-c', 20, 20, fetchImpl);
    expect(seen).toContain('creator=acct-c');
    expect(seen).toContain('offset=20');
    expect(answer.ok).toBe(true);
    expect(answer.subscriptions).toHaveLength(2);
    expect(answer.count).toBe(41);
    expect(answer.offset).toBe(20);
  });

  it('a refusal is not an empty room — it is named with its status', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ error: 'nope' }), { status: 500 }));
    const answer = await readReceivedSubscriptions('acct-c', 20, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.subscriptions).toEqual([]);
    expect(answer.reason).toContain('500');
  });
});

describe('economyServer — readPlans reads what one creator OFFERS (v406)', () => {
  it('the ask names the creator with the window as rows, and the answer echoes it', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(plansBody(2, 7), { status: 200 });
    });
    const answer = await readPlans('acct-c', 20, 20, fetchImpl);
    expect(seen).toContain('creator=acct-c');
    expect(seen).toContain('limit=20');
    expect(seen).toContain('offset=20');
    expect(answer.ok).toBe(true);
    expect(answer.plans).toHaveLength(2);
    expect(answer.count).toBe(7);
    expect(answer.offset).toBe(20);
  });

  it('a wire with NO count says UNKNOWN — never the window’s length (v373)', async () => {
    // Counting what happened to be on the screen and calling it the creator’s whole catalogue is the
    // exact lie v373 removed: the answer is null, and a pager that cannot reach the end says so.
    const fetchImpl = makeFetch(() => new Response(plansBody(3), { status: 200 }));
    const answer = await readPlans('acct-c', 20, 0, fetchImpl);
    expect(answer.plans).toHaveLength(3);
    expect(answer.count).toBeNull();
  });

  it('a negative offset is clamped to the first window, not refused', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(plansBody(1, 1), { status: 200 });
    });
    const answer = await readPlans('acct-c', 20, -5, fetchImpl);
    expect(seen).toContain('offset=0');
    expect(answer.offset).toBe(0);
  });

  it('a refusal is not an empty catalogue — it is named, with an UNKNOWN count', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ message: 'the creator is unknown' }), { status: 200 }),
    );
    const answer = await readPlans('acct-c', 20, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.plans).toEqual([]);
    expect(answer.count).toBeNull();
    expect(answer.reason).toBe('the creator is unknown');
  });

  it('a non-JSON body and a never-answering call are refusals, not crashes', async () => {
    const notJson = makeFetch(() => new Response('not json', { status: 200 }));
    const broken = await readPlans('acct-c', 20, 0, notJson);
    expect(broken.ok).toBe(false);
    expect(broken.reason).toContain('not JSON');

    const dead = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const unreachable = await readPlans('acct-c', 20, 0, dead);
    expect(unreachable.ok).toBe(false);
    expect(unreachable.reason).toContain('unreachable');
  });
});
