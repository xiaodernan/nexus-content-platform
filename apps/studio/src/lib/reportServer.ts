/**
 * M7 v296 — the server-side half of the REPORTS reader and writer.
 *
 * The service's address is server-side, and both the artifact page (server-rendered) and the Studio's own
 * route (server-side) read and write through here.
 *
 * A failed call answers with a REASON rather than a thrown error: an artifact page that says "the reports
 * could not be read" is an honest page, and one that throws into a route handler is a 500 for a page whose
 * DOCUMENT is perfectly fine.
 */
import { nexusApiBase } from './publishServer';

/**
 * One report, in the service's own wire shape.
 *
 * <p>v307 — and it carries NO identity. The service stores the reporter's account id (the withdrawal
 * compares it with the row), but the wire does not carry it: a report is a complaint, not an accusation
 * with the complainant's name on it, and the page that reads these has never shown a name. A client that
 * expected one would find it undefined — which is the honest answer.
 */
export interface ReportEntry {
  id: string;
  targetId: string;
  reason: string;
  detail: string;
  status: string;
  createdAt: number;
}

/** What one read of the reports answered. */
export interface ReportsAnswer {
  ok: boolean;
  reports: ReportEntry[];
  /** How many reports the answer carried. */
  count: number;
  reason?: string;
}

/** What one write answered. */
export interface ReportWriteAnswer {
  ok: boolean;
  report?: ReportEntry;
  reason?: string;
}

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<Response>;

/** Read the reports about one publication. */
export async function readReports(
  projectId: string,
  limit: number,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<ReportsAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/reports?target=${encodeURIComponent(projectId)}&limit=${encodeURIComponent(String(limit))}`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) {
      return { ok: false, reports: [], count: 0, reason: `the service's reports door answered HTTP ${res.status}` };
    }
    const parsed: unknown = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, reports: [], count: 0, reason: 'the service answered its reports door with something that is not JSON' };
    }
    const body = parsed as { reports?: unknown; count?: unknown };
    if (!Array.isArray(body.reports)) {
      return { ok: false, reports: [], count: 0, reason: 'the service answered its reports door with no reports' };
    }
    return {
      ok: true,
      reports: body.reports as ReportEntry[],
      count: typeof body.count === 'number' ? body.count : body.reports.length,
    };
  } catch (error) {
    return {
      ok: false,
      reports: [],
      count: 0,
      reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * What one read of the FILED reports answered — the reports ONE ACCOUNT filed.
 */
export interface FiledReportsAnswer {
  ok: boolean;
  reports: ReportEntry[];
  /**
   * v380 — how many reports this account filed IN ALL.
   *
   * <p>The service counts the WHOLE table for this direction (it did not before v380 — it answered with the
   * window’s own length, which read as a total and was not one), so this number and the rows beside it can
   * be different sizes and both are true.
   */
  count: number;
  /** The cap the service applied to the window. */
  limit: number;
  /** v382 — the zero-based index of the first row in the window. */
  offset: number;
  reason?: string;
}

/**
 * READ the reports one account filed — the reporter's own view of their complaints.
 *
 * <p>A reporter is owed an answer, and the only way they can learn where their complaint stands is to ask
 * for it. The rows are the reporter's OWN reports, so the identity in them is theirs.
 *
 * <p>v382 — offset enables paging through older reports beyond the window.
 */
export async function readFiledReports(
  reporterAccountId: string,
  offset: number,
  limit: number,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<FiledReportsAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/reports?reporter=${encodeURIComponent(reporterAccountId)}&offset=${encodeURIComponent(String(offset))}&limit=${encodeURIComponent(String(limit))}`,
      { headers: { accept: 'application/json' } },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return {
        ok: false,
        reports: [],
        count: 0,
        limit,
        reason: `the service's reports door answered HTTP ${res.status} with something that is not JSON`,
      };
    }
    const body = parsed as { reports?: unknown; count?: unknown; message?: unknown };
    if (!Array.isArray(body.reports)) {
      const why = typeof body.message === 'string' ? body.message : `the service's reports door answered HTTP ${res.status}`;
      return { ok: false, reports: [], count: 0, limit, reason: why };
    }
    return {
      ok: true,
      reports: body.reports as ReportEntry[],
      count: typeof body.count === 'number' ? body.count : body.reports.length,
      limit,
      offset,
    };
  } catch (error) {
    return {
      ok: false,
      reports: [],
      count: 0,
      limit,
      offset,
      reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** What one withdrawal answered. */
export interface WithdrawAnswer {
  ok: boolean;
  /** Whether the report actually moved. A report that was already withdrawn is "already withdrawn", not an error. */
  withdrawn: boolean;
  reason?: string;
}

/**
 * WITHDRAW a report on the service — and only the reporter's own.
 *
 * <p>The service answers 200 either way and says whether the report MOVED, so a client is never told a
 * report was withdrawn when it was not.
 */
export async function withdrawReport(
  reportId: string,
  claimerAccountId: string,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<WithdrawAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/reports/${encodeURIComponent(reportId)}?claimer=${encodeURIComponent(claimerAccountId)}`,
      { method: 'DELETE', headers: { accept: 'application/json' } },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, withdrawn: false, reason: `the service's reports door answered HTTP ${res.status} with something that is not JSON` };
    }
    const body = parsed as { withdrawn?: unknown; message?: unknown };
    if (!res.ok) {
      const why = typeof body.message === 'string' ? body.message : `the service's reports door answered HTTP ${res.status}`;
      return { ok: false, withdrawn: false, reason: why };
    }
    return { ok: true, withdrawn: body.withdrawn === true };
  } catch (error) {
    return {
      ok: false,
      withdrawn: false,
      reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** FILE a report, on the service. The claim travels exactly as the browser built it. */
export async function reportOnService(
  projectId: string,
  reason: string,
  detail: string,
  claim: { accountId: string; handle?: string | null; assurance?: string | null; claimedAt?: number | null },
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<ReportWriteAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(`${apiBase}/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        projectId,
        reason,
        detail,
        claim: {
          accountId: claim.accountId,
          handle: claim.handle ?? null,
          assurance: claim.assurance ?? null,
          claimedAt: claim.claimedAt ?? null,
        },
      }),
    });
    return readWriteAnswer(res, await safeJson(res));
  } catch (error) {
    return { ok: false, reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * A write's answer.
 *
 * The count and the report are read ONLY when the answer says `ok`: a refusal carries a reason and no
 * numbers, and a lane that filled in a count of zero on a refusal would make a refused report look like a
 * report that found nothing.
 */
function readWriteAnswer(res: Response, body: unknown): ReportWriteAnswer {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: `the reports answered HTTP ${res.status} with something that is not JSON` };
  }
  const answer = body as { ok?: unknown; reports?: unknown; reason?: unknown; message?: unknown };
  // v313 — the reason is read whenever the answer is NOT ok, and not only when the body
  // says `ok: false`: the service’s error body carries no `ok` field at all (it is `{error, message}`),
  // so the old shape threw away every message the service ever wrote.
  if (answer.ok === false || !res.ok) {
    const reason =
      typeof answer.reason === 'string'
        ? answer.reason
        : typeof answer.message === 'string'
          ? answer.message
          : `the reports answered HTTP ${res.status}`;
    return { ok: false, reason };
  }
  const reports = Array.isArray(answer.reports) ? (answer.reports as ReportEntry[]) : [];
  return { ok: true, report: reports[0] };
}
