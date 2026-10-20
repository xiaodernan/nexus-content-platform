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

/** One report, in the service's own wire shape. */
export interface ReportEntry {
  id: string;
  reporterId: string;
  targetId: string;
  reason: string;
  detail: string;
  status: string;
  createdAt: number;
  handle?: string | null;
  assurance?: string | null;
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
  /** How many the answer carried. */
  count: number;
  /** The cap the service applied. */
  limit: number;
  reason?: string;
}

/**
 * READ the reports one account filed — the reporter's own view of their complaints.
 *
 * <p>A reporter is owed an answer, and the only way they can learn where their complaint stands is to ask
 * for it. The rows are the reporter's OWN reports, so the identity in them is theirs.
 */
export async function readFiledReports(
  reporterAccountId: string,
  limit: number,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<FiledReportsAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/reports?reporter=${encodeURIComponent(reporterAccountId)}&limit=${encodeURIComponent(String(limit))}`,
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
    };
  } catch (error) {
    return {
      ok: false,
      reports: [],
      count: 0,
      limit,
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
  if (answer.ok === false) {
    const reason =
      typeof answer.reason === 'string'
        ? answer.reason
        : typeof answer.message === 'string'
          ? answer.message
          : `the reports answered HTTP ${res.status}`;
    return { ok: false, reason };
  }
  if (!res.ok) {
    return { ok: false, reason: `the reports answered HTTP ${res.status}` };
  }
  const reports = Array.isArray(answer.reports) ? (answer.reports as ReportEntry[]) : [];
  return { ok: true, report: reports[0] };
}
