/**
 * M9 v272 — the browser half of the AUDIT TRAIL's reading lane.
 *
 * The service's `GET /audit` is not reachable from the browser: the service's address is server-side, and
 * `/api/audit` is this Studio's own door onto it (the same hop `/api/publish` performs for publications).
 *
 * Answering with a REASON and not a thrown error is the rule every lane here keeps: a panel that says
 * "could not read: service unreachable" is an honest panel, and one that throws into React is not a panel
 * at all.
 *
 * v385 — and the ACTION filter travels in the query (the service narrows, the browser does not): one
 * question asked in one place, so the answer can no longer disagree with itself between the panel's
 * filter and the service's window.
 */
import { toTrailRows, type TrailRow } from './trail';

/**
 * How long a call to the Studio's own door may take.
 *
 * A hung request is worse than a refused one: the panel would sit there saying nothing, and a person
 * would wait for an answer that is never coming. The timeout turns a hang into a reason, which is the
 * only shape this lane knows how to show.
 *
 * It is 45 seconds, not 10, for the reason every other lane records: the Studio's own door is a
 * `next dev` server, and the FIRST call to a route pays that route's compile (v294). Until v480 this
 * lane had no budget at all — the only lane that reads with no deadline, so a door that never answered
 * hung the trail forever with no reason to show.
 */
export const CALL_TIMEOUT_MS = 45_000;

/** A signal that aborts the request when it takes too long. */
function callSignal(): AbortSignal {
  return AbortSignal.timeout(CALL_TIMEOUT_MS);
}

/**
 * Why a call to this lane's door did not answer.
 *
 * <p>A TIMEOUT is not an unreachable door: the door may well be there, and slow. Saying "unreachable"
 * about a door that is merely late is the same kind of lie the house's rule about failed reads is about
 * — a reader who is told the thing is gone when it is only late stops looking for it. The publish lane
 * named this distinction in v294 and the service door in v337; v482 extends the sentence to every lane.
 */
function unreachableReason(error: unknown, door: string): string {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return `${door} did not answer within ${CALL_TIMEOUT_MS / 1000} seconds`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** What one read of the trail answered. */
export interface TrailAnswer {
  ok: boolean;
  /** The entries as displayable rows. Absent when `ok` is false. */
  rows?: TrailRow[];
  /** How many entries the service's answer CARRIED. Stated beside the rows so a drop is visible. */
  count: number;
  /** The cap the service applied. */
  limit: number;
  /**
   * v385 — how many entries the WHOLE trail holds, narrowed or not.
   *
   * The filter is the SERVICE's now, so the browser never sees the rows it excluded; this is the number
   * that still says what the filter is hiding. A panel that filtered in the browser could count the
   * whole answer itself (v281); one that asks the service to filter cannot, and says so with the
   * service's own count rather than guessing.
   */
  total: number;
  /**
   * v388 — the ROW this window starts at, echoed from the ask.
   *
   * The answer carries the window it is FOR rather than leaving the panel to remember which ask it
   * belongs to: two reads in flight (a filter change, then a page) answer in whatever order the network
   * chooses, and an answer that names its own window cannot be mistaken for the other one's.
   */
  offset: number;
  /** Why it could not be read, when it could not. */
  reason?: string;
}

/** A `fetch` this lane can be tested against. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Read the trail, newest first — narrowed to one action when one is named, from a row offset on.
 *
 * v385 — `action` is the SERVICE's own word for a verb (`publish`, `unpublish`, …), asked in the query
 * rather than filtered in the browser: the window that comes back is the newest N entries OF THAT
 * ACTION, which is a different set from "the newest N that happen to carry it" once the trail outgrows
 * the cap. `null` asks for the whole trail.
 *
 * v388 — and `offset` is ROWS (the same meaning the filed read's offset has, v387): the trail is the one
 * table that only grows, so the older entries are a question a reader is allowed to ask.
 *
 * `count` is the service's own number and `rows.length` is what could be rendered: the two are BOTH kept,
 * because a row the pure half could not display honestly is dropped — and a panel that only reported the
 * rendered count would be hiding the drop.
 */
export async function readTrail(
  limit: number,
  action: string | null,
  offset: number,
  fetchImpl: FetchLike = fetch,
): Promise<TrailAnswer> {
  const from = Math.max(offset, 0);
  const ask = action === null || action === '' ? '' : `&action=${encodeURIComponent(action)}`;
  try {
    const res = await fetchImpl(`/api/audit?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(from))}${ask}`, {
      headers: { accept: 'application/json' },
      signal: callSignal(),
    });
    if (!res.ok) {
      // The door answers a 503 with ITS OWN reason (the service was down, or it answered nonsense), and the
      // panel should say that rather than "HTTP 503" — a reason a person can act on, not a status code.
      let why = `the trail answered HTTP ${res.status}`;
      try {
        const failure = await res.json();
        if (typeof failure === 'object' && failure !== null && typeof (failure as { reason?: unknown }).reason === 'string') {
          why = (failure as { reason: string }).reason;
        }
      } catch {
        // no body — the status line stays as the reason
      }
      return { ok: false, count: 0, limit, total: 0, offset: from, reason: why };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, count: 0, limit, total: 0, offset: from, reason: 'the trail answered something that is not JSON' };
    }
    if (typeof body !== 'object' || body === null) {
      return { ok: false, count: 0, limit, total: 0, offset: from, reason: 'the trail answered with neither an object nor a reason' };
    }
    const { entries, count, limit: capped, total } = body as { entries?: unknown; count?: unknown; limit?: unknown; total?: unknown };
    // v388 — the window this answer is FOR is the one that was asked for. The service does not echo it
    // (the filed door does not either); the lane does, because the panel has to be able to say which
    // window it is looking at even when two reads are in flight at once.
    if (!Array.isArray(entries)) {
      return { ok: false, count: 0, limit, total: 0, offset: from, reason: 'the trail answered with no entries at all' };
    }
    return {
      ok: true,
      rows: toTrailRows(entries),
      count: typeof count === 'number' && Number.isFinite(count) ? count : entries.length,
      limit: typeof capped === 'number' && Number.isFinite(capped) ? capped : limit,
      total: typeof total === 'number' && Number.isFinite(total) ? total : typeof count === 'number' && Number.isFinite(count) ? count : entries.length,
      offset: from,
    };
  } catch (error) {
    return { ok: false, count: 0, limit, total: 0, offset: from, reason: unreachableReason(error, 'the trail') };
  }
}
