import { describe, expect, it, vi } from 'vitest';

import { deskSummary, reportStatusText, tallyText, toDeskRow, toDeskRows } from './moderation';
import { acknowledgeReport, readDesk } from './moderationLane';

/**
 * M7 v304 — the OWNER'S DESK.
 *
 * The desk's rules: a row carries what an owner can act on; the reporter is never named; a failed read is
 * NOT an empty desk; and a disposition says whether the status MOVED.
 */
function makeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init)) as unknown as typeof fetch;
}

const A_REPORT = {
  reportId: 'rep-1',
  targetProjectId: 'pub-1',
  targetTitle: 'My First World',
  reason: 'harassment',
  detail: 'the words the reporter wrote',
  status: 'open',
  createdAt: 1_700_000_000_000,
};

describe('moderation — the desk rows', () => {
  it('a row carries the reason, the reporter\u2019s WORDS and the status', () => {
    const row = toDeskRow(A_REPORT);
    expect(row).not.toBeNull();
    expect(row?.reason).toBe('harassment');
    expect(row?.reasonText).toBe('harassment');
    expect(row?.detail).toBe('the words the reporter wrote');
    expect(row?.targetTitle).toBe('My First World');
    expect(row?.status).toBe('open');
    expect(row?.statusText).toBe('not acknowledged yet');
    expect(row?.open).toBe(true);
  });

  it('a report with NO words is still a report \u2014 the reason alone is one', () => {
    const row = toDeskRow({ ...A_REPORT, detail: '' });
    expect(row).not.toBeNull();
    expect(row?.detail).toBe('');
  });

  it('a row the owner cannot act on is DROPPED, not shown', () => {
    expect(toDeskRow({ ...A_REPORT, reportId: '' })).toBeNull();
    expect(toDeskRow({ ...A_REPORT, targetProjectId: '' })).toBeNull();
    expect(toDeskRow({ ...A_REPORT, reason: '' })).toBeNull();
    expect(toDeskRow(null)).toBeNull();
    expect(toDeskRow('nope')).toBeNull();
  });

  it('the reporter is NEVER named \u2014 the row has no field that could carry one', () => {
    const row = toDeskRow({ ...A_REPORT, reporterId: 'acct-reporter', handle: 'reporter' });
    expect(Object.keys(row ?? {}).join(' ')).not.toContain('reporter');
    expect(row?.detail).toBe('the words the reporter wrote');
  });

  it('the title falls back to the project id, so a row is never nameless', () => {
    const row = toDeskRow({ ...A_REPORT, targetTitle: '' });
    expect(row?.targetTitle).toBe('pub-1');
  });

  it('the status is spelled the way a person would say it', () => {
    expect(reportStatusText('open')).toBe('not acknowledged yet');
    expect(reportStatusText('acknowledged')).toBe('acknowledged');
    expect(reportStatusText('rejected')).toBe('withdrawn by the reporter');
  });

  it('an UNKNOWN status is passed through, not translated into a claim the service never made', () => {
    expect(reportStatusText('escalated')).toBe('escalated');
    const row = toDeskRow({ ...A_REPORT, status: 'escalated' });
    expect(row?.status).toBe('escalated');
    expect(row?.statusText).toBe('escalated');
    expect(row?.open).toBe(false);
  });

  it('the tally counts what is waiting, out of what the answer carried', () => {
    const rows = toDeskRows([
      A_REPORT,
      { ...A_REPORT, reportId: 'rep-2', status: 'acknowledged' },
      { ...A_REPORT, reportId: 'rep-3', status: 'rejected' },
    ]);
    expect(rows).toHaveLength(3);
    expect(deskSummary(rows)).toEqual({ total: 3, open: 1 });
  });
});

describe('moderationLane \u2014 the browser half', () => {
  it('asks the Studio\u2019s own door, naming the owner', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/moderation?owner=acct-ada');
      return new Response(JSON.stringify({ ok: true, reports: [A_REPORT], limit: 20 }), { status: 200 });
    });
    const answer = await readDesk('acct-ada', fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.reports).toHaveLength(1);
    expect(answer.reports[0]?.reportId).toBe('rep-1');
    expect(answer.open).toBe(1);
  });

  it('a REFUSED read is NOT an empty desk \u2014 it carries the reason', async () => {
    const answer = await readDesk(
      'acct-ada',
      makeFetch(() => new Response(JSON.stringify({ ok: false, reason: 'the desk could not be read' }), { status: 502 })),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the desk could not be read');
    expect(answer.reports).toEqual([]);
    expect(answer.open).toBe(0);
  });

  it('the acknowledgement names the report and the owner', async () => {
    const fetchImpl = makeFetch((url, init) => {
      expect(url).toBe('/api/moderation?owner=acct-ada');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body)) as { reportId: string };
      expect(body.reportId).toBe('rep-1');
      return new Response(JSON.stringify({ ok: true, reportId: 'rep-1', status: 'acknowledged', moved: true }), {
        status: 200,
      });
    });
    const answer = await acknowledgeReport('rep-1', 'acct-ada', fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.moved).toBe(true);
    expect(answer.status).toBe('acknowledged');
  });

  it('a refusal on the disposition carries the reason and does not claim a move', async () => {
    const answer = await acknowledgeReport(
      'rep-1',
      'acct-ada',
      makeFetch(() =>
        new Response(JSON.stringify({ ok: false, message: 'report rep-1 is about a publication this account does not own' }), {
          status: 502,
        }),
      ),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('does not own');
    expect(answer.moved).toBeUndefined();
  });

describe('moderation — the TALLY (M7 v312)', () => {
  it('the tally says the total and the reasons that OCCUR', () => {
    const text = tallyText({ total: 3, open: 1, byReason: { spam: 2, harassment: 1 }, byStatus: { open: 1 } });
    expect(text).toContain('3 report(s)');
    expect(text).toContain('1 still waiting');
    expect(text).toContain('2 spam');
    expect(text).toContain('1 harassment');
  });

  it('a reason with no reports is NOT said — a tally padded with zeroes is noise', () => {
    const text = tallyText({ total: 2, open: 0, byReason: { spam: 2 }, byStatus: { acknowledged: 2 } });
    expect(text).toContain('2 report(s)');
    expect(text).not.toContain('harassment');
    expect(text).not.toContain('still waiting');
  });

  it('the lane carries the tally, and a MISSING tally stays null', async () => {
    // A tally of zero would say "nobody complained" — and that is the one thing a creator must not be
    // misled about. A tally that could not be read stays null.
    const withTally = await readDesk(
      'acct-ada',
      makeFetch(() =>
        new Response(
          JSON.stringify({ ok: true, reports: [A_REPORT], tally: { total: 3, open: 1, byReason: { spam: 2 } } }),
          { status: 200 },
        ),
      ),
    );
    expect(withTally.tally?.total).toBe(3);
    expect(withTally.tally?.byReason?.spam).toBe(2);

    const withoutTally = await readDesk(
      'acct-ada',
      makeFetch(() => new Response(JSON.stringify({ ok: true, reports: [A_REPORT] }), { status: 200 })),
    );
    expect(withoutTally.tally).toBeNull();
  });
});
});
