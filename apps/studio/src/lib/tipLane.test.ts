import { describe, expect, it, vi } from 'vitest';

import { giveTip, readMyTips, readMyTipsGiven } from './tipLane';

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


/**
 * v439 — the WRITE half of the tips lane.
 *
 * Both reads are graded above. `giveTip` was reached only through the tip bar, so what a tip carries
 * on its way out and what the answer means were never asked: the five fields of the ask, the fact
 * that the answer reports the FIRST tip of the list the door sends back, and the 45-second budget a
 * write carries for the same reason every other write here does (v294).
 */
describe('tipLane — giveTip (the write half, v439)', () => {
  const claim = { accountId: 'acct-bob', handle: 'bob', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 };

  it('a tip is POSTed to the Studio’s own door with all five fields of the ask', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, tips: [{ recipientId: 'acct-ada', amountCents: 500 }] }), { status: 200 });
    });

    const answer = await giveTip('acct-ada', 500, 'the harness tips you', false, claim, fetchImpl);

    expect(seenUrl).toBe('/api/tips');
    expect(seenInit?.method).toBe('POST');
    expect(seenInit?.headers).toEqual({ 'content-type': 'application/json', accept: 'application/json' });
    expect(JSON.parse(String(seenInit?.body))).toEqual({
      recipientAccountId: 'acct-ada',
      amountCents: 500,
      message: 'the harness tips you',
      anonymous: false,
      claim,
    });
    expect(answer).toEqual({ ok: true, tip: { recipientId: 'acct-ada', amountCents: 500 } });
  });

  it('anonymous travels as the boolean the payer chose, and the amount as a number', async () => {
    let body: { anonymous?: unknown; amountCents?: unknown } = {};
    const fetchImpl = makeFetch((_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, tips: [{ recipientId: 'acct-ada', amountCents: 1 }] }), { status: 200 });
    });

    await giveTip('acct-ada', 1, 'quietly', true, claim, fetchImpl);

    expect(body.anonymous).toBe(true);
    expect(body.amountCents).toBe(1);
    expect(typeof body.amountCents).toBe('number');
  });

  it('a message with quotes, newlines and markup survives the round trip', async () => {
    const message = 'line one\nline two "quoted" <&> \u2014 end';
    let sent: unknown;
    const fetchImpl = makeFetch((_url, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, tips: [{ recipientId: 'acct-ada', amountCents: 1 }] }), { status: 200 });
    });

    await giveTip('acct-ada', 1, message, false, claim, fetchImpl);

    expect((sent as { message: string }).message).toBe(message);
  });

  it('the answer reports the FIRST tip the door lists, narrowed to the receipt’s two facts', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(
        JSON.stringify({
          ok: true,
          tips: [
            { recipientId: 'acct-ada', amountCents: 500 },
            { recipientId: 'acct-bob', amountCents: 999 },
          ],
        }),
        { status: 200 },
      ),
    );
    const answer = await giveTip('acct-ada', 500, 'the harness tips you', false, claim, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.tip).toEqual({ recipientId: 'acct-ada', amountCents: 500 });
  });

  it('an ok answer carrying no tip leaves the field absent rather than inventing one', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const answer = await giveTip('acct-ada', 500, 'the harness tips you', false, claim, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.tip).toBeUndefined();
  });

  it('a refused tip carries a reason and no receipt', async () => {
    const withReason = makeFetch(() =>
      new Response(JSON.stringify({ ok: false, reason: 'cannot tip yourself' }), { status: 200 }),
    );
    const refused = await giveTip('acct-ada', 500, 'x', false, claim, withReason);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe('cannot tip yourself');
    expect(refused.tip).toBeUndefined();

    // v313 — the door's error body carries no ok field, so the reason is read from message.
    const withMessage = makeFetch(() =>
      new Response(JSON.stringify({ error: 'tips-unavailable', message: 'the tips door is closed' }), { status: 503 }),
    );
    expect((await giveTip('acct-ada', 500, 'x', false, claim, withMessage)).reason).toBe('the tips door is closed');

    const bare = makeFetch(() => new Response(JSON.stringify({ error: 'nope' }), { status: 500 }));
    expect((await giveTip('acct-ada', 500, 'x', false, claim, bare)).reason).toBe('the tips answered HTTP 500');
  });

  it('an answer that is not JSON is a refusal, not a crash', async () => {
    const fetchImpl = makeFetch(() => new Response('<html>gateway', { status: 502 }));
    const answer = await giveTip('acct-ada', 500, 'x', false, claim, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the tips answered HTTP 502 with something that is not JSON');
  });

  it('a tip that never arrived answers with the raw error, not a remote address', async () => {
    // The door is THIS Studio's own route, so a failure here has no remote service to name.
    const fetchImpl = makeFetch(() => {
      throw new Error('network down');
    });
    const answer = await giveTip('acct-ada', 500, 'x', false, claim, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('network down');
    expect(answer.reason).not.toContain('unreachable');
  });

  it('a write carries the 45-second budget (v294), pinned on AbortSignal.timeout', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const fetchImpl = makeFetch(() =>
        new Response(JSON.stringify({ ok: true, tips: [{ recipientId: 'acct-ada', amountCents: 500 }] }), { status: 200 }),
      );
      await giveTip('acct-ada', 500, 'x', false, claim, fetchImpl);
      expect(timeoutSpy).toHaveBeenCalledWith(45_000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});
