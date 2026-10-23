import { describe, expect, it, vi } from 'vitest';

import { fileReport, readMyReports, withdrawReport } from './reportLane';

/**
 * M7 v305 — the browser half of the REPORTER’s view.
 *
 * The lane’s rule is the one every lane here keeps: a FAILED read answers with a REASON and never a
 * thrown error, and it never answers with an EMPTY list — "you filed no report" and "the reports could not
 * be read" are different facts, and a reporter told the first when the truth was the second would think
 * their complaint had vanished.
 */
function makeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init)) as unknown as typeof fetch;
}

const A_REPORT = {
  id: 'rep-1',
  targetId: 'pub-1',
  reason: 'harassment',
  detail: 'the words the reporter wrote',
  status: 'acknowledged',
  createdAt: 1_776_000_000_000,
};

describe('reportLane — readMyReports (client half)', () => {
  it('asks the Studio’s own door, naming the reporter', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/reports?reporter=acct-bob&offset=0');
      return new Response(JSON.stringify({ ok: true, reports: [A_REPORT], count: 1, limit: 20 }), { status: 200 });
    });
    const answer = await readMyReports('acct-bob', fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.reports).toHaveLength(1);
    expect(answer.reports[0]?.id).toBe('rep-1');
    expect(answer.reports[0]?.status).toBe('acknowledged');
    expect(answer.reports[0]?.statusText).toBe('acknowledged');
    expect(answer.reports[0]?.targetId).toBe('pub-1');
  });

  it('a REFUSED read carries the reason and NO reports', async () => {
    const answer = await readMyReports(
      'acct-bob',
      makeFetch(() => new Response(JSON.stringify({ ok: false, reason: 'the reports could not be read' }), { status: 502 })),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the reports could not be read');
    expect(answer.reports).toEqual([]);
  });

  it('v382 — asks for the window it is told to page to, and says which window it asked for', async () => {
    // The service pages by offset: the window is "the newest N of THIS account's reports, starting at
    // offset". The lane asks for the offset it was given and echoes it, so a panel always knows which
    // slice of the reporter's history it is looking at — including after a failed read.
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/reports?reporter=acct-bob&offset=40');
      return new Response(JSON.stringify({ ok: true, reports: [A_REPORT], count: 57, limit: 20 }), { status: 200 });
    });
    const answer = await readMyReports('acct-bob', fetchImpl, 40);
    expect(answer.ok).toBe(true);
    expect(answer.offset).toBe(40);
    expect(answer.count).toBe(57);
  });

  it('v382 — a failed read still names the window it ASKED for', async () => {
    const answer = await readMyReports(
      'acct-bob',
      makeFetch(() => new Response(JSON.stringify({ ok: false, reason: 'the reports could not be read' }), { status: 502 })),
      40,
    );
    expect(answer.ok).toBe(false);
    expect(answer.offset).toBe(40);
    expect(answer.reason).toBe('the reports could not be read');
  });

  it('v380 — carries the service’s WHOLE-TABLE count, not the window’s length', async () => {
    // The service counts every report the account filed (v380); the rows are a WINDOW. A panel that said
    // "1 report" when the account filed 37 would be wrong in the direction that hides.
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: true, reports: [A_REPORT], count: 37, limit: 20 }), { status: 200 }),
    );
    const answer = await readMyReports('acct-bob', fetchImpl);
    expect(answer.count).toBe(37);
    expect(answer.limit).toBe(20);
    expect(answer.reports).toHaveLength(1);
  });

  it('v380 — a read that carries no count says ZERO, and does NOT invent the window as the total', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: true, reports: [A_REPORT] }), { status: 200 }),
    );
    const answer = await readMyReports('acct-bob', fetchImpl);
    expect(answer.count).toBe(1);
    expect(answer.limit).toBe(20);
  });

  it('v380 — and a REFUSED read carries NO count, because a refused read is not a count of zero', async () => {
    const answer = await readMyReports(
      'acct-bob',
      makeFetch(() => new Response(JSON.stringify({ ok: false, reason: 'the reports could not be read' }), { status: 502 })),
    );
    expect(answer.count).toBe(0);
    expect(answer.reason).toBe('the reports could not be read');
  });

  it('a THROWN read is answered with a reason, never an exception', async () => {
    const answer = await readMyReports(
      'acct-bob',
      makeFetch(() => {
        throw new Error('the server went away');
      }),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('the server went away');
  });

describe('reportLane — withdrawReport (client half)', () => {
  it('asks the Studio’s own door, naming the report and the claimer', async () => {
    const fetchImpl = makeFetch((url, init) => {
      expect(url).toBe('/api/reports?reportId=rep-1&claimer=acct-bob');
      expect(init?.method).toBe('DELETE');
      return new Response(JSON.stringify({ ok: true, reportId: 'rep-1', withdrawn: true }), { status: 200 });
    });
    const answer = await withdrawReport('rep-1', 'acct-bob', fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.withdrawn).toBe(true);
  });

  it('a REFUSAL carries the reason and does NOT claim the report moved', async () => {
    const answer = await withdrawReport(
      'rep-1',
      'acct-bob',
      makeFetch(() =>
        new Response(JSON.stringify({ ok: false, message: 'report rep-1 was filed by another account' }), { status: 502 }),
      ),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('another account');
    expect(answer.withdrawn).toBe(false);
  });

  it('an answer that says the report did not move is not a withdrawal', async () => {
    const answer = await withdrawReport(
      'rep-1',
      'acct-bob',
      makeFetch(() => new Response(JSON.stringify({ ok: true, reportId: 'rep-1', withdrawn: false }), { status: 200 })),
    );
    expect(answer.ok).toBe(true);
    expect(answer.withdrawn).toBe(false);
  });
});
});


/**
 * v441 — the WRITE half of the reporter's lane.
 *
 * `readMyReports` and `withdrawReport` are graded above. `fileReport` was reached only through the
 * report bar, so what a report carries on its way out and what the answer means were never asked:
 * the four fields of the ask, which report of the answer's list is reported, and whether the write
 * is bounded while its take-back is not.
 */
describe('reportLane — fileReport (v441)', () => {
  const CLAIM = { accountId: 'acct-bob', handle: 'bob', assurance: 'unsigned-local', claimedAt: 1_776_000_000_000 };

  it('files a report at the Studio’s own door with the project, the reason and the detail', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, reports: [A_REPORT] }), { status: 200 });
    });

    const answer = await fileReport('pub-1', 'harassment', 'the words the reporter wrote', CLAIM, fetchImpl);

    expect(seenUrl).toBe('/api/reports');
    expect(seenInit?.method).toBe('POST');
    expect(seenInit?.headers).toEqual({ 'content-type': 'application/json', accept: 'application/json' });
    expect(JSON.parse(String(seenInit?.body))).toEqual({
      projectId: 'pub-1',
      reason: 'harassment',
      detail: 'the words the reporter wrote',
      claim: CLAIM,
    });
    // The report the write answers with is the FIRST entry of the answer's list.
    expect(answer.ok).toBe(true);
    expect(answer.report).toEqual(A_REPORT);
  });

  it('the detail travels intact through JSON, quotes and newlines included', async () => {
    const detail = 'line one\nline two "quoted" <&> — end';
    let sent: unknown;
    const fetchImpl = makeFetch((_url, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, reports: [A_REPORT] }), { status: 200 });
    });

    await fileReport('pub-1', 'harassment', detail, CLAIM, fetchImpl);

    expect((sent as { detail: string }).detail).toBe(detail);
  });

  it('the answer reports the FIRST report the door lists', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(
        JSON.stringify({
          ok: true,
          reports: [A_REPORT, { ...A_REPORT, id: 'rep-2', reason: 'spam' }],
        }),
        { status: 200 },
      ),
    );
    const answer = await fileReport('pub-1', 'harassment', 'the words the reporter wrote', CLAIM, fetchImpl);
    expect(answer.report?.id).toBe('rep-1');
  });

  it('an ok answer carrying no report leaves the field absent rather than inventing one', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const answer = await fileReport('pub-1', 'harassment', 'x', CLAIM, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.report).toBeUndefined();
  });

  it('a refused report carries a reason and no report', async () => {
    const withReason = makeFetch(() =>
      new Response(JSON.stringify({ ok: false, reason: 'you already reported this' }), { status: 200 }),
    );
    const refused = await fileReport('pub-1', 'harassment', 'x', CLAIM, withReason);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe('you already reported this');
    expect(refused.report).toBeUndefined();

    // v313 — the door's error body carries no ok field, so the reason is read from message.
    const withMessage = makeFetch(() =>
      new Response(JSON.stringify({ error: 'reports-unavailable', message: 'the reports door is closed' }), { status: 503 }),
    );
    expect((await fileReport('pub-1', 'harassment', 'x', CLAIM, withMessage)).reason).toBe('the reports door is closed');

    const bare = makeFetch(() => new Response(JSON.stringify({ error: 'nope' }), { status: 500 }));
    expect((await fileReport('pub-1', 'harassment', 'x', CLAIM, bare)).reason).toBe('the reports answered HTTP 500');
  });

  it('an answer that is not JSON is a refusal, not a crash', async () => {
    const fetchImpl = makeFetch(() => new Response('<html>gateway', { status: 502 }));
    const answer = await fileReport('pub-1', 'harassment', 'x', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the reports answered HTTP 502 with something that is not JSON');
  });

  it('a report that never arrived answers with the raw error, not a remote address', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('network down');
    });
    const answer = await fileReport('pub-1', 'harassment', 'x', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('network down');
    expect(answer.reason).not.toContain('unreachable');
  });

  it('a write carries the 45-second budget (v294), pinned on AbortSignal.timeout', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true, reports: [A_REPORT] }), { status: 200 }));
      await fileReport('pub-1', 'harassment', 'x', CLAIM, fetchImpl);
      expect(timeoutSpy).toHaveBeenCalledWith(45_000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('the take-back carries NO budget of its own — pinned as measured, not as intended', async () => {
    // The filing above carries 45 seconds; the withdrawal beside it sends no signal at all, so a
    // door that never answers leaves the take-back hanging. Named here rather than left silent:
    // this is the failure mode v337 was written for, and the next cycle can close it or defend it.
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((_url, init) => {
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, withdrawn: true }), { status: 200 });
    });

    await withdrawReport('rep-1', 'acct-bob', fetchImpl);

    expect(seenInit?.signal).toBeUndefined();
  });
});
