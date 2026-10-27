import { describe, expect, it } from 'vitest';

import { readDesk, readTally, acknowledgeOnService, type DeskEntry } from './moderationServer';

/**
 * M7 v407 — the server-side half of the OWNER’S DESK: the reader, the tally and the disposition.
 *
 * Three rules this file exists for. **The narrowing is the SERVICE’s** — the reason travels with the
 * question (v326) and so does the page (v389), so a desk with a thousand reports never has to be read
 * whole to show the spam ones. **A tally that does not count is a refusal, not a row of zeros** — an
 * answer missing its totals says the tally could not be read, because “nobody reported this” and “the
 * counts could not be read” are different facts. And **a disposition says whether the status MOVED** —
 * the service answers 200 whether or not the report moved, so a panel is never told a report moved when
 * it did not.
 */
function makeFetch(handler: (url: string, init?: RequestInit) => Response) {
  const seen: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

const deskRow = (i: number): DeskEntry => ({
  reportId: `rep-${i}`,
  targetProjectId: 'pub-1',
  targetTitle: 'Harbour at dusk',
  reason: 'spam',
  detail: `detail ${i}`,
  status: 'standing',
  createdAt: 1_776_000_000_000,
});

const deskBody = (n: number) =>
  JSON.stringify({
    reports: Array.from({ length: n }, (_unused, i) => deskRow(i)),
    limit: 100,
  });

describe('moderationServer — readDesk reads the owner’s desk (v407)', () => {
  it('the ask names the owner and the cap, and the answer echoes the cap the service applied', async () => {
    const { fetchImpl, seen } = makeFetch(() => new Response(deskBody(2), { status: 200 }));
    const answer = await readDesk('acct-o', 100, null, 0, fetchImpl);
    expect(seen[0]!.url).toContain('owner=acct-o');
    expect(seen[0]!.url).toContain('limit=100');
    expect(seen[0]!.url).toContain('offset=0');
    expect(seen[0]!.url).not.toContain('reason=');
    expect(answer.ok).toBe(true);
    expect(answer.reports).toHaveLength(2);
    expect(answer.limit).toBe(100);
  });

  it('a reason travels with the question — trimmed, and only when it is not blank', async () => {
    const withReason = makeFetch(() => new Response(deskBody(0), { status: 200 }));
    await readDesk('acct-o', 100, '  spam  ', 0, withReason.fetchImpl);
    expect(withReason.seen[0]!.url).toContain('reason=spam');

    const blank = makeFetch(() => new Response(deskBody(0), { status: 200 }));
    await readDesk('acct-o', 100, '   ', 0, blank.fetchImpl);
    expect(blank.seen[0]!.url).not.toContain('reason=');

    const none = makeFetch(() => new Response(deskBody(0), { status: 200 }));
    await readDesk('acct-o', 100, null, 0, none.fetchImpl);
    expect(none.seen[0]!.url).not.toContain('reason=');
  });

  it('a negative offset is clamped to the first window, the way the service clamps it', async () => {
    const { fetchImpl, seen } = makeFetch(() => new Response(deskBody(0), { status: 200 }));
    await readDesk('acct-o', 100, null, -5, fetchImpl);
    expect(seen[0]!.url).toContain('offset=0');
  });

  it('a refusal names the service’s message when there is one, and the status when there is not', async () => {
    const { fetchImpl: withMessage } = makeFetch(() =>
      new Response(JSON.stringify({ message: 'the owner is unknown' }), { status: 200 }),
    );
    const answered = await readDesk('acct-o', 100, null, 0, withMessage);
    expect(answered.ok).toBe(false);
    expect(answered.reason).toBe('the owner is unknown');
    expect(answered.reports).toEqual([]);

    const { fetchImpl: noMessage } = makeFetch(() => new Response(JSON.stringify({ error: 'boom' }), { status: 503 }));
    const refused = await readDesk('acct-o', 100, null, 0, noMessage);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain('503');
  });

  it('a body that is not JSON is a refusal with a reason, not a throw', async () => {
    const { fetchImpl } = makeFetch(() => new Response('not json', { status: 200 }));
    const answer = await readDesk('acct-o', 100, null, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('not JSON');
  });

  it('a call that never answers is an unreachable reason, not a hang', async () => {
    const { fetchImpl } = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const answer = await readDesk('acct-o', 100, null, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('unreachable');
  });
});

describe('moderationServer — readTally counts EVERY report, not the window (v407)', () => {
  it('the ask names the owner and the answer carries the counts and the breakdowns', async () => {
    const { fetchImpl, seen } = makeFetch(() =>
      new Response(
        JSON.stringify({ total: 137, open: 42, byReason: { spam: 100, abuse: 37 }, byStatus: { standing: 42, withdrawn: 95 } }),
        { status: 200 },
      ),
    );
    const answer = await readTally('acct-o', fetchImpl);
    expect(seen[0]!.url).toContain('owner=acct-o');
    expect(answer.ok).toBe(true);
    expect(answer.total).toBe(137);
    expect(answer.open).toBe(42);
    expect(answer.byReason).toEqual({ spam: 100, abuse: 37 });
    expect(answer.byStatus).toEqual({ standing: 42, withdrawn: 95 });
  });

  it('missing breakdowns answer empty maps, not undefined', async () => {
    const { fetchImpl } = makeFetch(() => new Response(JSON.stringify({ total: 3, open: 1 }), { status: 200 }));
    const answer = await readTally('acct-o', fetchImpl);
    expect(answer.byReason).toEqual({});
    expect(answer.byStatus).toEqual({});
  });

  it('a tally that does not count is a refusal — not a row of zeros read as “nobody reported this”', async () => {
    const { fetchImpl } = makeFetch(() => new Response(JSON.stringify({ open: 2 }), { status: 200 }));
    const answer = await readTally('acct-o', fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.total).toBe(0);
    expect(answer.reason).toContain('tally');
  });

  it('a refusal names the service’s message when there is one', async () => {
    const { fetchImpl } = makeFetch(() =>
      new Response(JSON.stringify({ message: 'the owner is unknown' }), { status: 404 },
    ));
    const answer = await readTally('acct-o', fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the owner is unknown');
  });

  it('a call that never answers is an unreachable reason, not a hang', async () => {
    const { fetchImpl } = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const answer = await readTally('acct-o', fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('unreachable');
  });
});

describe('moderationServer — acknowledgeOnService moves a report, or says it did not (v407)', () => {
  it('POSTs to the report’s own door with the owner named, and reads the status it moved to', async () => {
    const { fetchImpl, seen } = makeFetch(() =>
      new Response(JSON.stringify({ reportId: 'rep-1', status: 'acknowledged', moved: true }), { status: 200 }),
    );
    const answer = await acknowledgeOnService('rep-1', 'acct-o', fetchImpl);
    expect(seen[0]!.url).toContain('/moderation/reports/rep-1/acknowledge');
    expect(seen[0]!.url).toContain('owner=acct-o');
    expect(seen[0]!.init?.method).toBe('POST');
    expect(answer.ok).toBe(true);
    expect(answer.reportId).toBe('rep-1');
    expect(answer.status).toBe('acknowledged');
    expect(answer.moved).toBe(true);
  });

  it('an answer that moved nothing says so: moved is false, and that is not an error', async () => {
    const { fetchImpl } = makeFetch(() => new Response(JSON.stringify({ status: 'acknowledged', moved: false }), { status: 200 }));
    const answer = await acknowledgeOnService('rep-1', 'acct-o', fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.moved).toBe(false);
    expect(answer.reason).toBeUndefined();
  });

  it('an answer with no reportId keeps the one that was asked about', async () => {
    const { fetchImpl } = makeFetch(() => new Response(JSON.stringify({ status: 'acknowledged', moved: true }), { status: 200 }));
    const answer = await acknowledgeOnService('rep-9', 'acct-o', fetchImpl);
    expect(answer.reportId).toBe('rep-9');
  });

  it('moved is read strictly — a truthy non-boolean is not a move', async () => {
    const { fetchImpl } = makeFetch(() => new Response(JSON.stringify({ moved: 'yes' }), { status: 200 }));
    const answer = await acknowledgeOnService('rep-1', 'acct-o', fetchImpl);
    expect(answer.moved).toBe(false);
  });

  it('a refusal names the service’s message when there is one, and the status when there is not', async () => {
    const { fetchImpl: withMessage } = makeFetch(() =>
      new Response(JSON.stringify({ message: 'this report is not on your desk' }), { status: 403 }),
    );
    const answered = await acknowledgeOnService('rep-1', 'acct-other', withMessage);
    expect(answered.ok).toBe(false);
    expect(answered.reason).toBe('this report is not on your desk');

    const { fetchImpl: noMessage } = makeFetch(() => new Response(JSON.stringify({ error: 'boom' }), { status: 500 }));
    const refused = await acknowledgeOnService('rep-1', 'acct-o', noMessage);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain('500');
  });

  it('a body that is not JSON is a refusal naming the status, not a crash', async () => {
    const { fetchImpl } = makeFetch(() => new Response('<html>gateway</html>', { status: 502 }));
    const answer = await acknowledgeOnService('rep-1', 'acct-o', fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('502');
    expect(answer.reason).toContain('not JSON');
  });

  it('a call that never answers is an unreachable reason, not a hang', async () => {
    const { fetchImpl } = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const answer = await acknowledgeOnService('rep-1', 'acct-o', fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('unreachable');
  });
});
