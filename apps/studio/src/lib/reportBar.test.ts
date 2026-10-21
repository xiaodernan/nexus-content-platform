import { describe, expect, it } from 'vitest';

import { reportIdFromSearch } from './reportIntent';
import { injectReportBar, renderReportBar, reportReasonText, reportStatusText, toReportRow, toReportRows } from './reportBar';

/**
 * M7 v296 — the REPORTS bar on the artifact page.
 *
 * Two rules the suite grades: a count that could not be READ is not a count of zero, and the bar does not
 * name the REPORTER — a page that named them would turn a report into a public accusation with no
 * moderation behind it.
 */
const entry = (over: Record<string, unknown> = {}) => ({
  id: 'r-1',
  reporterId: 'acct-ada',
  targetId: 'pub-1',
  reason: 'spam',
  detail: 'a detail',
  status: 'open',
  createdAt: 1_776_000_000_000,
  handle: 'ada',
  assurance: 'unsigned-local',
  ...over,
});

describe('reportIntent — the URL names the publication (M7 v296)', () => {
  it('reads the report id out of the query', () => {
    expect(reportIdFromSearch('?report=pub-1')).toBe('pub-1');
    expect(reportIdFromSearch('report=pub-1')).toBe('pub-1');
    expect(reportIdFromSearch('?a=1&report=pub-2')).toBe('pub-2');
  });

  it('answers null for ABSENCE', () => {
    expect(reportIdFromSearch('?report=')).toBeNull();
    expect(reportIdFromSearch('?report=%20')).toBeNull();
    expect(reportIdFromSearch('')).toBeNull();
    expect(reportIdFromSearch('?like=pub-1')).toBeNull();
  });
});

describe('reportBar — the reasons (M7 v296)', () => {
  it('names each of the four reasons', () => {
    expect(reportReasonText('spam')).toBe('spam');
    expect(reportReasonText('harassment')).toBe('harassment');
    expect(reportReasonText('illegal')).toBe('illegal');
    expect(reportReasonText('other')).toBe('something else');
  });

  it('PASSES AN UNKNOWN REASON THROUGH — the bar must not relabel a reason it does not know', () => {
    expect(reportReasonText('stake')).toBe('stake');
  });
});

describe('reportBar — one report becomes one row (M7 v296)', () => {
  it('carries the id, the reason and the withdrawn flag', () => {
    const row = toReportRow(entry())!;
    expect(row.id).toBe('r-1');
    expect(row.reason).toBe('spam');
    expect(row.reasonText).toBe('spam');
    expect(row.withdrawn).toBe(false);
  });

  it('v323 — it keeps the reporter’s OWN WORDS', () => {
    // The owner's desk has shown them since v304, and the wire has carried them all along: the reporter's
    // own view dropped them, so a reporter could not see what they had actually said.
    const row = toReportRow(entry({ detail: 'the harness says this is a problem' }))!;
    expect(row.detail).toBe('the harness says this is a problem');
  });

  it('v323 — and a report with no words has none, rather than a made-up one', () => {
    const row = toReportRow(entry({ detail: undefined }))!;
    expect(row.detail).toBe('');
  });

  it('a withdrawn report is marked as withdrawn, not hidden', () => {
    const row = toReportRow(entry({ status: 'rejected' }))!;
    expect(row.withdrawn).toBe(true);
  });

  it('a row it cannot display honestly is dropped', () => {
    expect(toReportRow(null)).toBeNull();
    expect(toReportRow(entry({ id: '' }))).toBeNull();
    expect(toReportRow(entry({ reason: undefined }))).toBeNull();
  });

  it('the list keeps the service’s order and drops what it cannot show', () => {
    const rows = toReportRows([entry({ id: 'r-1' }), entry({ id: '' }), entry({ id: 'r-2' })]);
    expect(rows.map((r) => r.id)).toEqual(['r-1', 'r-2']);
  });
});

describe('reportBar — the bar on the page (M7 v296)', () => {
  it('states the count and offers the report', () => {
    const html = renderReportBar({ projectId: 'pub-1', count: 2 });
    expect(html).toContain('data-reports="2"');
    expect(html).toContain('2 reports');
    expect(html).toContain('href="/?report=pub-1"');
  });

  it('says "1 report" for one', () => {
    expect(renderReportBar({ projectId: 'pub-1', count: 1 })).toContain('1 report');
    expect(renderReportBar({ projectId: 'pub-1', count: 1 })).not.toContain('1 reports');
  });

  it('ZERO reports is something to say — it is a fact, and it is different from a failed read', () => {
    const html = renderReportBar({ projectId: 'pub-1', count: 0 });
    expect(html).toContain('data-reports="0"');
    expect(html).toContain('0 reports');
  });

  it('a count that could NOT be read is NOT zero — the bar is left out entirely', () => {
    // A reader misled into thinking nobody complained is the one reader a report page must not mislead.
    expect(renderReportBar({ projectId: 'pub-1', count: null })).toBe('');
  });

  it('it does NOT name the REPORTER — the count is the fact, the identity is the moderator\u2019s business', () => {
    const rows = toReportRows([entry()]);
    const html = renderReportBar({ projectId: 'pub-1', count: 1, reports: rows });
    expect(html).not.toContain('acct-ada');
    expect(html).not.toContain('ada');
    expect(html).toContain('data-report-reason="spam"');
  });

  it('a withdrawn report is shown as withdrawn, not as its reason alone', () => {
    const rows = toReportRows([entry({ status: 'rejected' })]);
    const html = renderReportBar({ projectId: 'pub-1', count: 0, reports: rows });
    expect(html).toContain('spam (withdrawn)');
  });

  it('encodes the project id in the link', () => {
    expect(renderReportBar({ projectId: 'a/b c', count: 1 })).toContain('href="/?report=a%2Fb%20c"');
  });

  it('inserts the bar before the closing body tag, and an EMPTY bar inserts nothing', () => {
    const page = '<html><body><div>artifact</div></body></html>';
    const out = injectReportBar(page, '<div class="nexus-reports"></div>');
    expect(out).toContain('<div>artifact</div><div class="nexus-reports"></div></body>');
    expect(injectReportBar(page, '')).toBe(page);
    const noBody = '<html><div>artifact</div></html>';
    expect(injectReportBar(noBody, '<div></div>')).toBe(noBody);
  });

describe('reportBar — the report’s STATUS and its TARGET (M7 v305)', () => {
  it('the row carries the status the service gave and the work it is about', () => {
    const row = toReportRow(entry({ status: 'acknowledged', targetId: 'pub-9' }));
    expect(row?.status).toBe('acknowledged');
    expect(row?.statusText).toBe('acknowledged');
    expect(row?.targetId).toBe('pub-9');
    expect(row?.withdrawn).toBe(false);
  });

  it('a withdrawn report says so in the status too', () => {
    const row = toReportRow(entry({ status: 'rejected' }));
    expect(row?.withdrawn).toBe(true);
    expect(row?.statusText).toBe('withdrawn by the reporter');
  });

  it('an UNKNOWN status is passed through, not translated into a claim the service never made', () => {
    expect(reportStatusText('escalated')).toBe('escalated');
    const row = toReportRow(entry({ status: 'escalated' }));
    expect(row?.status).toBe('escalated');
    expect(row?.statusText).toBe('escalated');
  });

  it('a report with NO status is treated as open — the service’s own first state', () => {
    const row = toReportRow(entry({ status: '' }));
    expect(row?.status).toBe('open');
    expect(row?.statusText).toBe('not acknowledged yet');
  });
});
});
