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

/** READ the desk: the reports against the publications this account owns. */
export async function readDesk(
  ownerAccountId: string,
  reason: string | null = null,
  fetchImpl: FetchLike = fetch,
): Promise<DeskLaneAnswer> {
  try {
    // v326 — the narrowing is the service’s, so the reason travels with the question.
    const narrowed = reason && reason.trim() !== '' ? `&reason=${encodeURIComponent(reason.trim())}` : '';
    const res = await fetchImpl(`/api/moderation?owner=${encodeURIComponent(ownerAccountId)}${narrowed}`, {
      headers: { accept: 'application/json' },
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, reports: [], open: 0, reason: `the desk answered HTTP ${res.status} with something that is not JSON` };
    }
    const body = parsed as {
      ok?: unknown;
      reports?: unknown;
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
      return { ok: false, reports: [], open: 0, reason: why };
    }
    const rows = toDeskRows(Array.isArray(body.reports) ? body.reports : []);
    const tally = body.tally;
    return {
      ok: true,
      reports: rows,
      open: rows.filter((row) => row.open).length,
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
    return { ok: false, reports: [], open: 0, reason: error instanceof Error ? error.message : String(error) };
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
