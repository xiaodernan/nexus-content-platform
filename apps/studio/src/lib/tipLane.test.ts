import { describe, expect, it, vi } from 'vitest';

import { readMyTips, readMyTipsGiven } from './tipLane';

/**
 * M7 v331 / v332 / v333 / v334 — the browser half of the TIPS lane.
 *
 * Two rules this file grades:
 *
 * 1. **The lane asks the right door for each direction.** "What I was given" and "what I gave" are two
 *    different questions about the same relation, and the lane asks the one it means.
 * 2. **The lane does not narrow the answer away.** The payer's name (v331) and the instant (v333, v334)
 *    were on the wire all along; a lane that narrows them away is a lane that throws facts out.
 */
function makeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init)) as unknown as typeof fetch;
}

const A_TIP = {
  id: 'tip-1',
  recipientId: 'acct-ada',
  payerId: 'acct-bob',
  amountCents: 500,
  currency: 'CNY',
  message: 'the harness tips you',
  anonymous: false,
  createdAt: 1_700_000_000_000,
  handle: 'bob',
  assurance: 'unsigned-local',
};

describe('tipLane — the received side (the recipient\u2019s view)', () => {
  it('asks the door for the tips this account RECEIVED', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/tips?recipient=acct-ada&offset=0');
      return new Response(JSON.stringify({ ok: true, tips: [A_TIP], totalCents: 500, count: 1 }), { status: 200 });
    });

    const answer = await readMyTips('acct-ada', 0, fetchImpl);

    expect(answer.ok).toBe(true);
    expect(answer.tips).toHaveLength(1);
  });

  it('keeps the payer\u2019s name and the instant — the wire\u2019s facts, not narrowed away', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: true, tips: [A_TIP], totalCents: 500, count: 1 }), { status: 200 }),
    );

    const answer = await readMyTips('acct-ada', 0, fetchImpl);

    expect(answer.tips[0]?.handle).toBe('bob');
    expect(answer.tips[0]?.createdAt).toBe(1_700_000_000_000);
  });
});

describe('tipLane — the given side (the payer\u2019s receipt)', () => {
  it('asks the door for the tips this account GAVE', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/tips?payer=acct-bob&offset=0');
      return new Response(JSON.stringify({ ok: true, tips: [A_TIP], totalCents: 500, count: 1 }), { status: 200 });
    });

    const answer = await readMyTipsGiven('acct-bob', 0, fetchImpl);

    expect(answer.ok).toBe(true);
    expect(answer.tips).toHaveLength(1);
    expect(answer.totalCents).toBe(500);
  });

  it('a REFUSED read is NOT an empty receipt — it carries the reason', async () => {
    const answer = await readMyTipsGiven(
      'acct-bob',
      0,
      makeFetch(() => new Response(JSON.stringify({ ok: false, reason: 'the tips could not be read' }), { status: 502 })),
    );

    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the tips could not be read');
    expect(answer.tips).toEqual([]);
  });

  // v391 — both windows can be PAGED, and the page is part of the ask.

  it('v391 — a named OFFSET travels in the query, in rows, on the received side', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/tips?recipient=acct-ada&offset=40');
      return new Response(JSON.stringify({ ok: true, tips: [A_TIP], totalCents: 500, count: 57, limit: 20 }), { status: 200 });
    });

    const answer = await readMyTips('acct-ada', 40, fetchImpl);

    expect(answer.ok).toBe(true);
    // and the answer echoes the window it is FOR: two reads in flight cannot be mistaken for each other.
    expect(answer.offset).toBe(40);
    expect(answer.limit).toBe(20);
    expect(answer.count).toBe(57);
  });

  it('v391 — and on the given side', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/tips?payer=acct-bob&offset=20');
      return new Response(JSON.stringify({ ok: true, tips: [A_TIP], totalCents: 500, count: 37, limit: 20 }), { status: 200 });
    });

    const answer = await readMyTipsGiven('acct-bob', 20, fetchImpl);

    expect(answer.ok).toBe(true);
    expect(answer.offset).toBe(20);
    expect(answer.limit).toBe(20);
  });

  it('v391 — a negative offset is the first window, not a refusal', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/tips?recipient=acct-ada&offset=0');
      return new Response(JSON.stringify({ ok: true, tips: [], totalCents: 0, count: 0, limit: 20 }), { status: 200 });
    });

    const answer = await readMyTips('acct-ada', -5, fetchImpl);

    expect(answer.ok).toBe(true);
    expect(answer.offset).toBe(0);
  });
});
