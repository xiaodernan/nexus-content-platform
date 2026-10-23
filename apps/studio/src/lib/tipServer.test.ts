import { describe, expect, it, vi } from 'vitest';

import { readTips, readTipsGiven, tipOnService, type TipEntry } from './tipServer';

/**
 * M7 v404 — the server-side half of the TIPS reader and writer.
 *
 * Two rules this file exists for. **The answer names the window it is FOR** — the tips lists page by
 * rows (v391), and a read that came back without the window it answered would leave a panel saying
 * “showing 21–40 of 150” about the rows from 160 on (v386’s correction). And **a refusal is NOT an
 * empty day**: “nobody tipped this account” and “the tips could not be read” are different facts, and a
 * lane that answered the first when it knew the second would tell a creator nobody cared.
 *
 * The two readers (received / given) are deliberately NOT identical, and the differences are graded
 * rather than smoothed over: they check the HTTP status at different points, and only the received
 * reader falls back to the carried rows for its count.
 */
function makeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init)) as unknown as typeof fetch;
}

const tip = (i: number): TipEntry => ({
  id: `tip-${i}`,
  recipientId: 'acct-r',
  payerId: 'acct-p',
  amountCents: 500 + i,
  currency: 'USD',
  message: `thanks ${i}`,
  anonymous: false,
  createdAt: 1_776_000_000_000,
  handle: `h${i}`,
  assurance: 'unsigned-local',
});

const tipsBody = (n: number, totalCents: number, count?: number) =>
  JSON.stringify({
    tips: Array.from({ length: n }, (_unused, i) => tip(i)),
    totalCents,
    ...(count === undefined ? {} : { count }),
    limit: 20,
    offset: 20,
  });

describe('tipServer — readTips PAGES the tips an account RECEIVED (v404)', () => {
  it('the ask carries the window as limit and offset rows, and the answer echoes it', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(tipsBody(2, 1500, 21), { status: 200 });
    });
    const answer = await readTips('acct-r', 20, 20, fetchImpl);
    expect(seen).toContain('recipient=acct-r');
    expect(seen).toContain('limit=20');
    expect(seen).toContain('offset=20');
    expect(answer.ok).toBe(true);
    expect(answer.tips).toHaveLength(2);
    expect(answer.totalCents).toBe(1500);
    expect(answer.count).toBe(21);
    expect(answer.limit).toBe(20);
    expect(answer.offset).toBe(20);
  });

  it('a negative offset is clamped to the first window, not refused', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(tipsBody(1, 500, 1), { status: 200 });
    });
    const answer = await readTips('acct-r', 20, -5, fetchImpl);
    expect(seen).toContain('offset=0');
    expect(answer.offset).toBe(0);
  });

  it('an answer with no window keeps the one that was asked for', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ tips: [], totalCents: 0, count: 0 }), { status: 200 }),
    );
    const answer = await readTips('acct-r', 20, 20, fetchImpl);
    expect(answer.limit).toBe(20);
    expect(answer.offset).toBe(20);
  });

  it('the count falls back to the rows carried, not to zero', async () => {
    // The received reader’s answer shape predates the explicit count; a body that carries tips but
    // no count still says how many it answered with.
    const fetchImpl = makeFetch(() => new Response(tipsBody(3, 1500), { status: 200 }));
    const answer = await readTips('acct-r', 20, 0, fetchImpl);
    expect(answer.count).toBe(3);
  });

  it('an HTTP refusal is named with its status, and it is NOT a day nobody tipped', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ error: 'tips-unavailable' }), { status: 503 }));
    const answer = await readTips('acct-r', 20, 20, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('503');
    expect(answer.tips).toEqual([]);
    expect(answer.offset).toBe(20);
  });

  it('an answer with no tips array is a refusal, not an empty list', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ totalCents: 0 }), { status: 200 }));
    const answer = await readTips('acct-r', 20, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('no tips');
  });

  it('a body that is not JSON is a refusal with a reason, not a throw', async () => {
    const fetchImpl = makeFetch(() => new Response('not json', { status: 200 }));
    const answer = await readTips('acct-r', 20, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('not JSON');
  });

  it('a call that never answers is an unreachable reason, not a hang', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const answer = await readTips('acct-r', 20, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('unreachable');
  });
});

describe('tipServer — readTipsGiven PAGES the tips an account GAVE (v404)', () => {
  it('the ask names the PAYER, the other side of the same relation', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(tipsBody(2, 1000, 2), { status: 200 });
    });
    const answer = await readTipsGiven('acct-p', 20, 0, fetchImpl);
    expect(seen).toContain('payer=acct-p');
    expect(answer.ok).toBe(true);
    expect(answer.tips).toHaveLength(2);
    expect(answer.totalCents).toBe(1000);
    expect(answer.offset).toBe(0);
  });

  it('a body that says ok:false carries its own message as the reason', async () => {
    // v313: the service’s error body carries no ok field at all, so the message is read whenever the
    // answer is not ok — the old shape threw away every message the service ever wrote.
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: false, message: 'the payer is unknown' }), { status: 200 }),
    );
    const answer = await readTipsGiven('acct-p', 20, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the payer is unknown');
  });

  it('an HTTP refusal with no message names the status instead', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ error: 'nope' }), { status: 500 }));
    const answer = await readTipsGiven('acct-p', 20, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('500');
  });

  it('the GIVEN reader counts zero when the body carries no count — the asymmetry, pinned', async () => {
    // readTips falls back to the rows it carried; this reader answers 0 instead. Neither is wrong —
    // the difference is recorded here so a future change to either side is a decision, not a drift.
    const fetchImpl = makeFetch(() => new Response(tipsBody(3, 1500), { status: 200 }));
    const answer = await readTipsGiven('acct-p', 20, 0, fetchImpl);
    expect(answer.tips).toHaveLength(3);
    expect(answer.count).toBe(0);
  });
});

describe('tipServer — tipOnService GIVES a tip (v404)', () => {
  const claim = { accountId: 'acct-p', handle: 'payer', assurance: 'unsigned-local', claimedAt: 1_776_000_000_000 };

  it('POSTs the tip with the claim exactly as the browser built it', async () => {
    let seen = '';
    let init: RequestInit | undefined;
    const fetchImpl = makeFetch((url, i) => {
      seen = url;
      init = i;
      return new Response(JSON.stringify({ ok: true, tips: [tip(0)] }), { status: 200 });
    });
    const answer = await tipOnService('acct-r', 500, 'thanks', false, claim, fetchImpl);
    expect(seen).toContain('/tips');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      recipientAccountId: 'acct-r',
      amountCents: 500,
      message: 'thanks',
      anonymous: false,
      claim: { accountId: 'acct-p', handle: 'payer', assurance: 'unsigned-local', claimedAt: 1_776_000_000_000 },
    });
    expect(answer.ok).toBe(true);
    expect(answer.tip?.id).toBe('tip-0');
  });

  it('an absent handle, assurance or instant travels as null — never as undefined', async () => {
    let init: RequestInit | undefined;
    const fetchImpl = makeFetch((_url, i) => {
      init = i;
      return new Response(JSON.stringify({ ok: true, tips: [tip(0)] }), { status: 200 });
    });
    await tipOnService('acct-r', 100, '', true, { accountId: 'acct-p' }, fetchImpl);
    const body = JSON.parse(String(init?.body)) as { claim: Record<string, unknown> };
    expect(body.claim).toEqual({ accountId: 'acct-p', handle: null, assurance: null, claimedAt: null });
  });

  it('a refusal carries a reason and NO tip — a refused tip is not a tip that found nobody', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ error: 'tip-too-small', message: 'the amount is below the floor' }), { status: 400 }),
    );
    const answer = await tipOnService('acct-r', 1, 'hi', false, claim, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.tip).toBeUndefined();
    expect(answer.reason).toBe('the amount is below the floor');
  });

  it('a refusal with neither reason nor message still names the HTTP status', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ error: 'boom' }), { status: 502 }));
    const answer = await tipOnService('acct-r', 500, 'thanks', false, claim, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('502');
  });

  it('a body that is not JSON is a refusal naming the status, not a crash', async () => {
    const fetchImpl = makeFetch(() => new Response('<html>gateway</html>', { status: 504 }));
    const answer = await tipOnService('acct-r', 500, 'thanks', false, claim, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('504');
    expect(answer.reason).toContain('not JSON');
  });

  it('a call that never answers is an unreachable reason, not a hang', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const answer = await tipOnService('acct-r', 500, 'thanks', false, claim, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('unreachable');
  });
});
