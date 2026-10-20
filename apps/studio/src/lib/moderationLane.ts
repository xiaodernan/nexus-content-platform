/**
 * M7 v304 — the browser half of the DESK lane.
 *
 * The service's address is server-side, so the browser talks to THIS Studio's own `/api/moderation`,
 * which forwards to the service. The lane answers with a REASON and never a thrown error.
 */
import { toDeskRows, type DeskRow } from './moderation';

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
  fetchImpl: FetchLike = fetch,
): Promise<DeskLaneAnswer> {
  try {
    const res = await fetchImpl(`/api/moderation?owner=${encodeURIComponent(ownerAccountId)}`, {
      headers: { accept: 'application/json' },
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, reports: [], open: 0, reason: `the desk answered HTTP ${res.status} with something that is not JSON` };
    }
    const body = parsed as { ok?: unknown; reports?: unknown; reason?: unknown; message?: unknown };
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
    return { ok: true, reports: rows, open: rows.filter((row) => row.open).length };
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
