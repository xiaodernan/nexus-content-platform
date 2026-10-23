/**
 * M7 v304 — the browser half of the DESK lane.
 *
 * The service's address is server-side, so the browser talks to THIS Studio's own `/api/moderation`,
 * which forwards to the service. The lane answers with a REASON and never a thrown error.
 */
import { toDeskRows, type DeskRow, type TallyFacts } from './moderation';

/**
 * How long a write may take. A hung request is worse than a refused one: the panel would sit there
 * saying nothing.
 *
 * It is 45 seconds, not 10, for the reason the tips lane records: the Studio's own door is a `next dev`
 * server, and the FIRST call to a route pays that route's compile.
 */
const WRITE_TIMEOUT_MS = 45_000;

/** A signal that aborts the request when it takes too long. */
function callSignal(): AbortSignal {
  return AbortSignal.timeout(WRITE_TIMEOUT_MS);
}

export interface DeskLaneAnswer {
  ok: boolean;
  /** The desk's rows, mapped. Empty when the read failed — and the reason says so. */
  reports: DeskRow[];
  /** How many are still waiting to be acknowledged. */
  open: number;
  /** The cap the service applied. */
  limit: number;
  /**
   * v389 — the ROW this window starts at, echoed from the ask.
   *
   * <p>The answer carries the window it is FOR rather than leaving the panel to remember which ask it
   * belongs to: two reads in flight (a filter change, then a page) answer in whatever order the network
   * chooses, and an answer that names its own window cannot be mistaken for the other one's. The same
   * rule the trail's answer keeps (v388).
   */
  offset: number;
  /**
   * v312 — the TALLY: how many reports there are against the work in all, and how many by reason.
   *
   * <p>It is null when the tally could not be read: a tally of zero would say "nobody complained", and that
   * is the one thing a creator must not be misled about.
   */
  tally?: TallyFacts | null;
  reason?: string;
}

export interface DispositionLaneAnswer {
  ok: boolean;
  moved?: boolean;
  status?: string;
  reason?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * READ the desk: the reports against the publications this account owns.
 *
 * v389 — and the window can be PAGED: `offset` is ROWS past the newest ones, the same meaning the
 * trail's and the filed read's offsets have, so an owner with more complaints than the cap can reach
 * the older ones. A negative offset is the first window, not a refusal.
 */
export async function readDesk(
  ownerAccountId: string,
  reason: string | null = null,
  offset: number = 0,
  fetchImpl: FetchLike = fetch,
): Promise<DeskLaneAnswer> {
  const from = Math.max(offset, 0);
  try {
    // v326 — the narrowing is the service’s, so the reason travels with the question. v389 — and so
    // does the page: the window the panel is showing is part of the ask, not a fact the service keeps.
    const narrowed = reason && reason.trim() !== '' ? `&reason=${encodeURIComponent(reason.trim())}` : '';
    const res = await fetchImpl(
      `/api/moderation?owner=${encodeURIComponent(ownerAccountId)}${narrowed}&offset=${encodeURIComponent(String(from))}`,
      { headers: { accept: 'application/json' } },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, reports: [], open: 0, limit: 20, offset: from, reason: `the desk answered HTTP ${res.status} with something that is not JSON` };
    }
    const body = parsed as {
      ok?: unknown;
      reports?: unknown;
      limit?: unknown;
      tally?: unknown;
      reason?: unknown;
      message?: unknown;
    };
    if (body.ok === false || !res.ok) {
      const why =
        typeof body.reason === 'string'
          ? body.reason
          : typeof body.message === 'string'
            ? body.message
            : `the desk answered HTTP ${res.status}`;
      return { ok: false, reports: [], open: 0, limit: 20, offset: from, reason: why };
    }
    const rows = toDeskRows(Array.isArray(body.reports) ? body.reports : []);
    const tally = body.tally;
    return {
      ok: true,
      reports: rows,
      open: rows.filter((row) => row.open).length,
      limit: typeof body.limit === 'number' && Number.isFinite(body.limit) ? body.limit : 20,
      offset: from,
      // v312 — the tally, when the service gave one. A tally that could not be read stays null: zero would
      // say "nobody complained".
      tally:
        typeof tally === 'object' && tally !== null && typeof (tally as { total?: unknown }).total === 'number'
          ? {
              total: (tally as { total: number }).total,
              open: typeof (tally as { open?: unknown }).open === 'number' ? (tally as { open: number }).open : 0,
              byReason: ((tally as { byReason?: unknown }).byReason ?? {}) as Record<string, number>,
              byStatus: ((tally as { byStatus?: unknown }).byStatus ?? {}) as Record<string, number>,
            }
          : null,
    };
  } catch (error) {
    return { ok: false, reports: [], open: 0, limit: 20, offset: from, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** ACKNOWLEDGE a report: the owner of the publication says they have seen it. */
export async function acknowledgeReport(
  reportId: string,
  ownerAccountId: string,
  fetchImpl: FetchLike = fetch,
): Promise<DispositionLaneAnswer> {
  try {
    const res = await fetchImpl(`/api/moderation?owner=${encodeURIComponent(ownerAccountId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ reportId }),
      signal: callSignal(),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, reason: `the desk answered HTTP ${res.status} with something that is not JSON` };
    }
    const body = parsed as { ok?: unknown; moved?: unknown; status?: unknown; reason?: unknown; message?: unknown };
    if (body.ok === false || !res.ok) {
      const why =
        typeof body.reason === 'string'
          ? body.reason
          : typeof body.message === 'string'
            ? body.message
            : `the desk answered HTTP ${res.status}`;
      return { ok: false, reason: why };
    }
    return { ok: true, moved: body.moved === true, status: typeof body.status === 'string' ? body.status : undefined };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
