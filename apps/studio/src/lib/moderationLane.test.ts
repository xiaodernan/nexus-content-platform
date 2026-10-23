import { describe, expect, it, vi } from 'vitest';

import { CALL_TIMEOUT_MS, acknowledgeReport, readDesk } from './moderationLane';

/**
 * M7 v415 — the browser half of the OWNER'S DESK, graded directly.
 *
 * The service's address is server-side, so the browser talks to THIS Studio's own `/api/moderation` and the
 * route forwards — which makes this lane the only place the browser's side of the desk is written. Its
 * server-side twin is graded in `moderationServer.test.ts`; what is THIS file's subject is the seam between
 * them: the ask that names the owner and the window, the refusals that arrive as answers rather than
 * throws, and the two readings a panel must not get wrong — a tally that could not be read is not a tally
 * of zero, and a disposition says whether the status MOVED.
 */
function makeFetch(handler: (url: string, init?: RequestInit) => Response) {
  const seen: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

const deskEntry = (i: number, status = 'open') => ({
  reportId: `rep-${i}`,
  targetProjectId: 'pub-1',
  targetTitle: 'Harbour at dusk',
  reason: 'spam',
  detail: `detail ${i}`,
  status,
  createdAt: 1_776_000_000_000,
});

const deskBody = (n: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ reports: Array.from({ length: n }, (_unused, i) => deskEntry(i)), limit: 20, ...extra });

describe('readDesk — the browser asks the Studio’s own door (v415)', () => {
  it('the ask names the owner and the window, and the answer echoes the window it is FOR', async () => {
    const { fetchImpl, seen } = makeFetch(() => new Response(deskBody(2), { status: 200 }));
    const answer = await readDesk('acct-o', null, 0, fetchImpl);
    expect(seen[0]!.url).toContain('/api/moderation?');
    expect(seen[0]!.url).toContain('owner=acct-o');
    expect(seen[0]!.url).toContain('offset=0');
    expect(seen[0]!.url).not.toContain('reason=');
    expect(seen[0]!.init?.method ?? 'GET').toBe('GET');
    expect(answer.ok).toBe(true);
    expect(answer.offset).toBe(0);
    expect(answer.reports).toHaveLength(2);
  });

  it('a negative offset is clamped to the first window — a page before the first is the first', async () => {
    const { fetchImpl, seen } = makeFetch(() => new Response(deskBody(0), { status: 200 }));
    const answer = await readDesk('acct-o', null, -5, fetchImpl);
    expect(seen[0]!.url).toContain('offset=0');
    expect(answer.offset).toBe(0);
  });

  it('a deeper window travels whole — the ask names the row it starts at', async () => {
    const { fetchImpl, seen } = makeFetch(() => new Response(deskBody(0), { status: 200 }));
    const answer = await readDesk('acct-o', null, 40, fetchImpl);
    expect(seen[0]!.url).toContain('offset=40');
    expect(answer.offset).toBe(40);
  });

  it('a reason travels with the question — trimmed, and only when it is not blank', async () => {
    const withReason = makeFetch(() => new Response(deskBody(0), { status: 200 }));
    await readDesk('acct-o', '  spam  ', 0, withReason.fetchImpl);
    expect(withReason.seen[0]!.url).toContain('reason=spam');

    const blank = makeFetch(() => new Response(deskBody(0), { status: 200 }));
    await readDesk('acct-o', '   ', 0, blank.fetchImpl);
    expect(blank.seen[0]!.url).not.toContain('reason=');
  });

  it('the rows are mapped through the shared desk-row rule — a malformed entry is dropped, not crashed on', async () => {
    const body = JSON.stringify({
      reports: [deskEntry(0), { targetProjectId: 'pub-1', reason: 'spam' }],
      limit: 20,
    });
    const { fetchImpl } = makeFetch(() => new Response(body, { status: 200 }));
    const answer = await readDesk('acct-o', null, 0, fetchImpl);
    expect(answer.reports).toHaveLength(1);
    expect(answer.reports[0]!.reportId).toBe('rep-0');
  });

  it('open counts only the rows still waiting', async () => {
    const body = JSON.stringify({
      reports: [deskEntry(0, 'open'), deskEntry(1, 'resolved'), deskEntry(2, 'standing')],
      limit: 20,
    });
    const { fetchImpl } = makeFetch(() => new Response(body, { status: 200 }));
    const answer = await readDesk('acct-o', null, 0, fetchImpl);
    expect(answer.open).toBe(1);
  });

  it('the cap the route applied is echoed; a body with no cap answers 20', async () => {
    const capped = makeFetch(() => new Response(deskBody(0, { limit: 50 }), { status: 200 }));
    expect((await readDesk('acct-o', null, 0, capped.fetchImpl)).limit).toBe(50);

    const noLimit = makeFetch(() => new Response(JSON.stringify({ reports: [] }), { status: 200 }));
    expect((await readDesk('acct-o', null, 0, noLimit.fetchImpl)).limit).toBe(20);

    const junkLimit = makeFetch(() => new Response(deskBody(0, { limit: 'lots' }), { status: 200 }));
    expect((await readDesk('acct-o', null, 0, junkLimit.fetchImpl)).limit).toBe(20);
  });

  it('the tally travels when the service gave one — the counts and both breakdowns', async () => {
    const body = JSON.stringify({
      reports: [],
      limit: 20,
      tally: { total: 7, open: 3, byReason: { spam: 5, abuse: 2 }, byStatus: { open: 3, resolved: 4 } },
    });
    const { fetchImpl } = makeFetch(() => new Response(body, { status: 200 }));
    const answer = await readDesk('acct-o', null, 0, fetchImpl);
    expect(answer.tally).toEqual({ total: 7, open: 3, byReason: { spam: 5, abuse: 2 }, byStatus: { open: 3, resolved: 4 } });
  });

  it('a tally the service did not count answers null — “nobody complained” and “could not be read” are different facts', async () => {
    const noTally = makeFetch(() => new Response(deskBody(0), { status: 200 }));
    expect((await readDesk('acct-o', null, 0, noTally.fetchImpl)).tally).toBeNull();

    const notAnObject = makeFetch(() => new Response(deskBody(0, { tally: 'seven' }), { status: 200 }));
    expect((await readDesk('acct-o', null, 0, notAnObject.fetchImpl)).tally).toBeNull();

    const noTotal = makeFetch(() => new Response(deskBody(0, { tally: { open: 3 } }), { status: 200 }));
    expect((await readDesk('acct-o', null, 0, noTotal.fetchImpl)).tally).toBeNull();
  });

  it('a refusal by name: the service’s reason travels, and the answer is not a throw', async () => {
    const { fetchImpl } = makeFetch(() => new Response(JSON.stringify({ ok: false, reason: 'not your desk' }), { status: 200 }));
    const answer = await readDesk('acct-o', null, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('not your desk');
    expect(answer.reports).toEqual([]);
  });

  it('an HTTP error falls back to the message, then to the status — never to silence', async () => {
    const withMessage = makeFetch(() => new Response(JSON.stringify({ message: 'route exploded' }), { status: 500 }));
    expect((await readDesk('acct-o', null, 0, withMessage.fetchImpl)).reason).toBe('route exploded');

    const bare = makeFetch(() => new Response(JSON.stringify({}), { status: 503 }));
    expect((await readDesk('acct-o', null, 0, bare.fetchImpl)).reason).toBe('the desk answered HTTP 503');
  });

  it('an answer that is not JSON is a named refusal', async () => {
    const { fetchImpl } = makeFetch(() => new Response('<html>nope</html>', { status: 200 }));
    const answer = await readDesk('acct-o', null, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('not JSON');
  });

  it('a thrown fetch is caught and named — a panel says so rather than spinning', async () => {
    const { fetchImpl } = makeFetch(() => {
      throw new Error('network down');
    });
    const answer = await readDesk('acct-o', null, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('network down');
  });
});

describe('acknowledgeReport — the browser says the owner has seen it (v415)', () => {
  it('the POST goes to the desk door with the owner named and the report in the body', async () => {
    const { fetchImpl, seen } = makeFetch(() => new Response(JSON.stringify({ ok: true, moved: true, status: 'resolved' }), { status: 200 }));
    const answer = await acknowledgeReport('rep-9', 'acct-o', fetchImpl);
    expect(seen[0]!.url).toContain('owner=acct-o');
    expect(seen[0]!.init?.method).toBe('POST');
    expect(JSON.parse(String(seen[0]!.init?.body))).toEqual({ reportId: 'rep-9' });
    expect(answer.ok).toBe(true);
    expect(answer.moved).toBe(true);
    expect(answer.status).toBe('resolved');
  });

  it('moved is read STRICTLY — a truthy non-boolean is not a move', async () => {
    const { fetchImpl } = makeFetch(() => new Response(JSON.stringify({ ok: true, moved: 'yes' }), { status: 200 }));
    const answer = await acknowledgeReport('rep-9', 'acct-o', fetchImpl);
    expect(answer.moved).toBe(false);
    expect(answer.status).toBeUndefined();
  });

  it('a refusal and a broken answer are named, not thrown', async () => {
    const refused = makeFetch(() => new Response(JSON.stringify({ ok: false, reason: 'already resolved' }), { status: 200 }));
    expect((await acknowledgeReport('rep-9', 'acct-o', refused.fetchImpl)).reason).toBe('already resolved');

    const notJson = makeFetch(() => new Response('<html>nope</html>', { status: 200 }));
    expect((await acknowledgeReport('rep-9', 'acct-o', notJson.fetchImpl)).reason).toContain('not JSON');

    const thrown = makeFetch(() => {
      throw new Error('network down');
    });
    expect((await acknowledgeReport('rep-9', 'acct-o', thrown.fetchImpl)).reason).toBe('network down');
  });
});

describe('moderationLane — the read rides the budget (v480)', () => {
  // v480 — `readDesk` fetched with no signal at all, so a door that never answered hung the owner's desk
  // forever with no reason to show; the acknowledge already rode the budget.
  it('the read carries a live, un-aborted signal', async () => {
    const { fetchImpl, seen } = makeFetch(() => new Response(deskBody(1), { status: 200 }));

    await readDesk('acct-o', null, 0, fetchImpl);

    expect(seen[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    expect(seen[0]?.init?.signal?.aborted).toBe(false);
  });

  it('the budget is the pinned 45 seconds on both the read and the acknowledge', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const read = makeFetch(() => new Response(deskBody(1), { status: 200 }));
      await readDesk('acct-o', null, 0, read.fetchImpl);
      const write = makeFetch(() => new Response(JSON.stringify({ ok: true, moved: true, status: 'resolved' }), { status: 200 }));
      await acknowledgeReport('rep-9', 'acct-o', write.fetchImpl);
      expect(timeoutSpy).toHaveBeenCalledTimes(2);
      expect(timeoutSpy.mock.calls.map((c) => c[0])).toEqual([45_000, 45_000]);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('each read gets its own fresh signal — a deadline per call, never a shared one', async () => {
    const { fetchImpl, seen } = makeFetch(() => new Response(deskBody(1), { status: 200 }));

    await readDesk('acct-o', null, 0, fetchImpl);
    await readDesk('acct-o', null, 0, fetchImpl);

    expect(seen[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    expect(seen[0]?.init?.signal).not.toBe(seen[1]?.init?.signal);
  });

  it('the exported constant names the one number the whole lane rides', () => {
    expect(CALL_TIMEOUT_MS).toBe(45_000);
  });
});