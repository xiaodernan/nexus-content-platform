import { describe, expect, it, vi } from 'vitest';

import { readMyReports, withdrawReport } from './reportLane';

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
  reporterId: 'acct-bob',
  targetId: 'pub-1',
  reason: 'harassment',
  detail: 'the words the reporter wrote',
  status: 'acknowledged',
  createdAt: 1_776_000_000_000,
  handle: 'bob',
  assurance: 'unsigned-local',
};

describe('reportLane — readMyReports (client half)', () => {
  it('asks the Studio’s own door, naming the reporter', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/reports?reporter=acct-bob');
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
