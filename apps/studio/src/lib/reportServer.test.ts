import { describe, expect, it, vi } from 'vitest';

import { readReports, readFiledReports, withdrawReport, reportOnService, type ReportEntry } from './reportServer';
import { nexusApiBase } from './publishServer';

/**
 * M7 v405 — the server-side half of the REPORTS reader, writer and withdrawer.
 *
 * Two rules this file exists for. **A refusal is NOT an empty list** — “nobody reported this” and “the
 * reports could not be read” are different facts, and an artifact page that showed the first when it
 * knew the second would tell a reader a publication was clean when it merely could not be checked. And
 * **the answer names the window it is FOR** — the filed list pages by rows (v382), so a read that came
 * back without its window would leave the panel describing one page’s rows with another page’s
 * numbers (v386’s correction).
 *
 * The WITHDRAW door has a rule of its own: the service answers 200 whether or not the report moved, so
 * “already withdrawn” is a fact the client must be able to read rather than an error to invent.
 */
function makeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init)) as unknown as typeof fetch;
}

const report = (i: number): ReportEntry => ({
  id: `rep-${i}`,
  targetId: 'pub-1',
  reason: 'spam',
  detail: `detail ${i}`,
  status: 'standing',
  createdAt: 1_776_000_000_000,
});

const reportsBody = (n: number, count?: number) =>
  JSON.stringify({
    reports: Array.from({ length: n }, (_unused, i) => report(i)),
    ...(count === undefined ? {} : { count }),
  });

describe('reportServer — readReports reads the reports ABOUT one publication (v405)', () => {
  it('the ask names the target and the cap', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(reportsBody(2, 2), { status: 200 });
    });
    const answer = await readReports('pub-1', 100, fetchImpl);
    expect(seen).toContain('target=pub-1');
    expect(seen).toContain('limit=100');
    expect(answer.ok).toBe(true);
    expect(answer.reports).toHaveLength(2);
    expect(answer.count).toBe(2);
  });

  it('the count falls back to the rows carried, not to zero', async () => {
    const fetchImpl = makeFetch(() => new Response(reportsBody(3), { status: 200 }));
    const answer = await readReports('pub-1', 100, fetchImpl);
    expect(answer.count).toBe(3);
  });

  it('an HTTP refusal names its status, and it is NOT a publication nobody reported', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ error: 'reports-unavailable' }), { status: 503 }));
    const answer = await readReports('pub-1', 100, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('503');
    expect(answer.reports).toEqual([]);
    expect(answer.count).toBe(0);
  });

  it('a body with no reports array is a refusal, not an empty list', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ count: 0 }), { status: 200 }));
    const answer = await readReports('pub-1', 100, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('no reports');
  });

  it('a body that is not JSON is a refusal with a reason, not a throw', async () => {
    const fetchImpl = makeFetch(() => new Response('not json', { status: 200 }));
    const answer = await readReports('pub-1', 100, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('not JSON');
  });

  it('a call that never answers is an unreachable reason, not a hang', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const answer = await readReports('pub-1', 100, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('unreachable');
  });
});

describe('reportServer — readFiledReports reads the reports ONE ACCOUNT filed (v405)', () => {
  it('the ask names the reporter with the window as rows, and the answer echoes it', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(reportsBody(2, 37), { status: 200 });
    });
    const answer = await readFiledReports('acct-r', 20, 20, fetchImpl);
    expect(seen).toContain('reporter=acct-r');
    expect(seen).toContain('offset=20');
    expect(seen).toContain('limit=20');
    expect(answer.ok).toBe(true);
    expect(answer.count).toBe(37);
    expect(answer.limit).toBe(20);
    expect(answer.offset).toBe(20);
  });

  it('the count is the WHOLE filed list and the rows are the window — both true at once (v380)', async () => {
    const fetchImpl = makeFetch(() => new Response(reportsBody(2, 37), { status: 200 }));
    const answer = await readFiledReports('acct-r', 20, 20, fetchImpl);
    expect(answer.count).toBe(37);
    expect(answer.reports).toHaveLength(2);
  });

  it('an answer with no reports array is a refusal, and a message is read when there is one', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ message: 'the reporter is unknown' }), { status: 200 }),
    );
    const answer = await readFiledReports('acct-r', 0, 20, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the reporter is unknown');
    expect(answer.limit).toBe(20);
    expect(answer.offset).toBe(0);
  });

  it('a refusal still names the window it was asked for', async () => {
    const fetchImpl = makeFetch(() => new Response('not json', { status: 200 }));
    const answer = await readFiledReports('acct-r', 40, 20, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('not JSON');
    expect(answer.offset).toBe(40);
    expect(answer.limit).toBe(20);
  });

  it('a call that never answers is an unreachable reason, not a hang', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const answer = await readFiledReports('acct-r', 0, 20, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('unreachable');
  });
});

describe('reportServer — withdrawReport moves a report, or says it already moved (v405)', () => {
  it('DELETEs with the claimer named, and reads whether the report actually moved', async () => {
    let seen = '';
    let init: RequestInit | undefined;
    const fetchImpl = makeFetch((url, i) => {
      seen = url;
      init = i;
      return new Response(JSON.stringify({ withdrawn: true }), { status: 200 });
    });
    const answer = await withdrawReport('rep-1', 'acct-r', fetchImpl);
    expect(seen).toContain('/reports/rep-1');
    expect(seen).toContain('claimer=acct-r');
    expect(init?.method).toBe('DELETE');
    expect(answer.ok).toBe(true);
    expect(answer.withdrawn).toBe(true);
  });

  it('an already-withdrawn report is a fact, not an error — ok:true, withdrawn:false', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ withdrawn: false }), { status: 200 }));
    const answer = await withdrawReport('rep-1', 'acct-r', fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.withdrawn).toBe(false);
    expect(answer.reason).toBeUndefined();
  });

  it('a withdrawal that is refused names the service’s own message', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ message: 'this report is not yours to withdraw' }), { status: 403 }),
    );
    const answer = await withdrawReport('rep-1', 'acct-other', fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.withdrawn).toBe(false);
    expect(answer.reason).toBe('this report is not yours to withdraw');
  });

  it('a refusal with no message names the HTTP status instead', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ error: 'boom' }), { status: 500 }));
    const answer = await withdrawReport('rep-1', 'acct-r', fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('500');
  });

  it('a body that is not JSON is a refusal naming the status, not a crash', async () => {
    const fetchImpl = makeFetch(() => new Response('<html>gateway</html>', { status: 502 }));
    const answer = await withdrawReport('rep-1', 'acct-r', fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('502');
    expect(answer.reason).toContain('not JSON');
  });
});

describe('reportServer — reportOnService FILES a report (v405)', () => {
  const claim = { accountId: 'acct-p', handle: 'payer', assurance: 'unsigned-local', claimedAt: 1_776_000_000_000 };

  it('POSTs the report with the claim exactly as the browser built it', async () => {
    let seen = '';
    let init: RequestInit | undefined;
    const fetchImpl = makeFetch((url, i) => {
      seen = url;
      init = i;
      return new Response(JSON.stringify({ ok: true, reports: [report(0)] }), { status: 200 });
    });
    const answer = await reportOnService('pub-1', 'spam', 'it is spam', claim, fetchImpl);
    expect(seen).toContain('/reports');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: 'pub-1',
      reason: 'spam',
      detail: 'it is spam',
      claim: { accountId: 'acct-p', handle: 'payer', assurance: 'unsigned-local', claimedAt: 1_776_000_000_000 },
    });
    expect(answer.ok).toBe(true);
    expect(answer.report?.id).toBe('rep-0');
  });

  it('an absent handle, assurance or instant travels as null — never as undefined', async () => {
    let init: RequestInit | undefined;
    const fetchImpl = makeFetch((_url, i) => {
      init = i;
      return new Response(JSON.stringify({ ok: true, reports: [report(0)] }), { status: 200 });
    });
    await reportOnService('pub-1', 'spam', '', { accountId: 'acct-p' }, fetchImpl);
    const body = JSON.parse(String(init?.body)) as { claim: Record<string, unknown> };
    expect(body.claim).toEqual({ accountId: 'acct-p', handle: null, assurance: null, claimedAt: null });
  });

  it('a refusal carries a reason and NO report — a refused report is not a report that found nothing', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ error: 'report-invalid', message: 'the reason is not one the door knows' }), { status: 400 }),
    );
    const answer = await reportOnService('pub-1', 'nonsense', 'x', claim, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.report).toBeUndefined();
    expect(answer.reason).toBe('the reason is not one the door knows');
  });

  it('a refusal with neither reason nor message still names the HTTP status', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ error: 'boom' }), { status: 502 }));
    const answer = await reportOnService('pub-1', 'spam', 'x', claim, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('502');
  });

  it('a call that never answers is an unreachable reason, not a hang', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const answer = await reportOnService('pub-1', 'spam', 'x', claim, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('unreachable');
  });
});


describe('reportServer — every door carries the budget (v481)', () => {
  // v337 gave the writes the service's 15-second budget, and v480 gave the withdraw its own. The two
  // READS — readReports (v405) and readFiledReports (v382) — still fetched with no signal at all, so a
  // service that never answered left the artifact page's reports panel and the filed-reports panel
  // waiting forever, with no sentence and no reason. v481 closes it: all four doors ride the same
  // budget, and each asks for its own.

  const claim = { accountId: 'acct-p', handle: 'payer', assurance: 'unsigned-local', claimedAt: 1_776_000_000_000 };

  it('both reads, the withdraw and the filing all carry an active signal', async () => {
    const seen: (AbortSignal | undefined)[] = [];
    const fetchImpl = makeFetch((_url, init) => {
      seen.push(init?.signal ?? undefined);
      return new Response(reportsBody(0, 0), { status: 200 });
    });
    await readReports('pub-1', 100, fetchImpl);
    await readFiledReports('acct-r', 0, 20, fetchImpl);
    await withdrawReport('rep-1', 'acct-r', fetchImpl);
    await reportOnService('pub-1', 'spam', 'x', claim, fetchImpl);
    expect(seen).toHaveLength(4);
    for (const signal of seen) {
      expect(signal).toBeInstanceOf(AbortSignal);
      expect((signal as AbortSignal).aborted).toBe(false);
    }
  });

  it('the budget is the service call budget — 15 seconds, asked of AbortSignal.timeout', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const fetchImpl = makeFetch(() => new Response(reportsBody(0, 0), { status: 200 }));
      await readReports('pub-1', 100, fetchImpl);
      await readFiledReports('acct-r', 0, 20, fetchImpl);
      await withdrawReport('rep-1', 'acct-r', fetchImpl);
      await reportOnService('pub-1', 'spam', 'x', claim, fetchImpl);
      expect(timeoutSpy).toHaveBeenCalledWith(15_000);
      expect(timeoutSpy).toHaveBeenCalledTimes(4);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('each door gets a FRESH signal — four calls cannot share one budget', async () => {
    const seen: (AbortSignal | undefined)[] = [];
    const fetchImpl = makeFetch((_url, init) => {
      seen.push(init?.signal ?? undefined);
      return new Response(reportsBody(0, 0), { status: 200 });
    });
    await readReports('pub-1', 100, fetchImpl);
    await readFiledReports('acct-r', 0, 20, fetchImpl);
    await withdrawReport('rep-1', 'acct-r', fetchImpl);
    await reportOnService('pub-1', 'spam', 'x', claim, fetchImpl);
    expect(seen[0]).not.toBe(seen[1]);
    expect(seen[1]).not.toBe(seen[2]);
    expect(seen[2]).not.toBe(seen[3]);
  });
});


describe('reportServer — when the budget FIRES the door says the service was LATE (v483)', () => {
  // v481 gave these four doors the 15-second budget; what nobody pinned is what the reader sees when
  // it FIRES. The catches hand-rolled "nexus-api unreachable at …: <message>" — so a fired budget was
  // answered as a service that was GONE, the exact lie the v337 helper was written to end. v483 routes
  // all four doors through serviceUnreachableReason.

  const late = () => {
    const error = new Error('The operation was aborted due to timeout');
    error.name = 'TimeoutError';
    return error;
  };

  const claim = { accountId: 'acct-p', handle: 'payer', assurance: 'unsigned-local', claimedAt: 1_776_000_000_000 };

  it('a fired budget says the service was LATE — not "unreachable", and not the platform’s string', async () => {
    const fetchImpl = makeFetch(() => {
      throw late();
    });
    const answer = await readReports('pub-1', 100, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe(`the service at ${nexusApiBase()} did not answer within 15 seconds`);
    expect(answer.reason).not.toContain('unreachable');
    expect(answer.reason).not.toContain('aborted');
  });

  it('a service that is GONE keeps the unreachable sentence with its own message', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const answer = await readReports('pub-1', 100, fetchImpl);
    expect(answer.reason).toBe(`nexus-api unreachable at ${nexusApiBase()}: connect ECONNREFUSED`);
    expect(answer.reason).not.toContain('15 seconds');
  });

  it('every door of the file rides the same distinction — both reads, the take-back and the filing', async () => {
    const fetchImpl = makeFetch(() => {
      throw late();
    });
    const reports = await readReports('pub-1', 100, fetchImpl);
    const filed = await readFiledReports('acct-r', 0, 20, fetchImpl);
    const withdrawn = await withdrawReport('rep-1', 'acct-r', fetchImpl);
    const reported = await reportOnService('pub-1', 'spam', 'x', claim, fetchImpl);
    for (const answer of [reports, filed, withdrawn, reported]) {
      expect(answer.reason).toBe(`the service at ${nexusApiBase()} did not answer within 15 seconds`);
    }
  });
});
