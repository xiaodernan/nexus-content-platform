/**
 * M7 v304 — the server-side half of the OWNER'S DESK.
 *
 * The service's address is server-side, so the Studio's own route (server-side) reads and writes through
 * here. A failed call answers with a REASON rather than a thrown error: a panel that says "the desk could
 * not be read" is an honest panel, and one that throws into a route handler is a 500 for a panel whose
 * DOCUMENT is perfectly fine.
 */
import { nexusApiBase } from './publishServer';

/** One report, in the service's desk shape. */
export interface DeskEntry {
  reportId: string;
  targetProjectId: string;
  targetTitle: string;
  reason: string;
  detail: string;
  status: string;
  createdAt: number;
}

/** What one read of the desk answered. */
export interface DeskAnswer {
  ok: boolean;
  /** The desk's rows. Empty when the read failed — and the reason says so. */
  reports: DeskEntry[];
  /** The cap the service applied. */
  limit: number;
  reason?: string;
}

/** What one disposition answered. */
export interface DispositionAnswer {
  ok: boolean;
  /** The report the disposition was about. */
  reportId?: string;
  /** Where the report stands now. */
  status?: string;
  /** Whether the status actually MOVED. */
  moved?: boolean;
  reason?: string;
}

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<Response>;

/**
 * READ the desk: the reports against the publications this account owns.
 *
 * <p>The owner is named in the query, because this build has no session to hold it (ADR 0018) — the same
 * claim the take-down and the withdrawal name.
 */
export async function readDesk(
  ownerAccountId: string,
  limit: number,
  reason: string | null = null,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<DeskAnswer> {
  const apiBase = nexusApiBase();
  try {
    // v326 — the narrowing is the SERVICE’s: the reason travels with the question, so a desk with a
    // thousand reports does not have to be read whole to show the spam ones.
    const narrowed = reason && reason.trim() !== '' ? `&reason=${encodeURIComponent(reason.trim())}` : '';
    const res = await fetchImpl(
      `${apiBase}/moderation/reports?owner=${encodeURIComponent(ownerAccountId)}&limit=${encodeURIComponent(String(limit))}${narrowed}`,
      { headers: { accept: 'application/json' } },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, reports: [], limit, reason: `the service's desk answered HTTP ${res.status} with something that is not JSON` };
    }
    const body = parsed as { reports?: unknown; limit?: unknown; message?: unknown };
    if (!Array.isArray(body.reports)) {
      const why = typeof body.message === 'string' ? body.message : `the service's desk answered HTTP ${res.status}`;
      return { ok: false, reports: [], limit, reason: why };
    }
    return {
      ok: true,
      reports: body.reports as DeskEntry[],
      limit: typeof body.limit === 'number' ? body.limit : limit,
    };
  } catch (error) {
    return {
      ok: false,
      reports: [],
      limit,
      reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * What one read of the TALLY answered — the counts of every report against the account's work.
 */
export interface TallyAnswer {
  ok: boolean;
  total: number;
  open: number;
  byReason: Record<string, number>;
  byStatus: Record<string, number>;
  reason?: string;
}

/**
 * READ the tally of the reports against an account's work.
 *
 * <p>It counts EVERY report, and not the desk's window — the desk shows the most recent hundred and the
 * tally says how many there are.
 */
export async function readTally(
  ownerAccountId: string,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<TallyAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/moderation/tally?owner=${encodeURIComponent(ownerAccountId)}`,
      { headers: { accept: 'application/json' } },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return {
        ok: false,
        total: 0,
        open: 0,
        byReason: {},
        byStatus: {},
        reason: `the service's tally door answered HTTP ${res.status} with something that is not JSON`,
      };
    }
    const body = parsed as {
      total?: unknown;
      open?: unknown;
      byReason?: unknown;
      byStatus?: unknown;
      message?: unknown;
    };
    if (typeof body.total !== 'number' || typeof body.open !== 'number') {
      const why = typeof body.message === 'string' ? body.message : `the service's tally door answered HTTP ${res.status}`;
      return { ok: false, total: 0, open: 0, byReason: {}, byStatus: {}, reason: why };
    }
    return {
      ok: true,
      total: body.total,
      open: body.open,
      byReason: (body.byReason ?? {}) as Record<string, number>,
      byStatus: (body.byStatus ?? {}) as Record<string, number>,
    };
  } catch (error) {
    return {
      ok: false,
      total: 0,
      open: 0,
      byReason: {},
      byStatus: {},
      reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * ACKNOWLEDGE a report on the desk: the owner of the publication says they have seen it.
 *
 * <p>The answer says whether the status MOVED, so a panel is never told a report moved when it did not.
 */
export async function acknowledgeOnService(
  reportId: string,
  ownerAccountId: string,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<DispositionAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/moderation/reports/${encodeURIComponent(reportId)}/acknowledge?owner=${encodeURIComponent(ownerAccountId)}`,
      { method: 'POST', headers: { accept: 'application/json' } },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, reason: `the service's desk answered HTTP ${res.status} with something that is not JSON` };
    }
    const body = parsed as { reportId?: unknown; status?: unknown; moved?: unknown; message?: unknown };
    if (!res.ok) {
      const why = typeof body.message === 'string' ? body.message : `the service's desk answered HTTP ${res.status}`;
      return { ok: false, reason: why };
    }
    return {
      ok: true,
      reportId: typeof body.reportId === 'string' ? body.reportId : reportId,
      status: typeof body.status === 'string' ? body.status : undefined,
      moved: body.moved === true,
    };
  } catch (error) {
    return {
      ok: false,
      reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
