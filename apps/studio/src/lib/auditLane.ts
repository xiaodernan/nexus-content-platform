/**
 * M9 v272 — the browser half of the AUDIT TRAIL's reading lane.
 *
 * The service's `GET /audit` is not reachable from the browser: the service's address is server-side, and
 * `/api/audit` is this Studio's own door onto it (the same hop `/api/publish` performs for publications).
 *
 * Answering with a REASON and not a thrown error is the rule every lane here keeps: a panel that says
 * "could not read: service unreachable" is an honest panel, and one that throws into React is not a panel
 * at all.
 */
import { toTrailRows, type TrailRow } from './trail';

/** What one read of the trail answered. */
export interface TrailAnswer {
  ok: boolean;
  /** The entries as displayable rows. Absent when `ok` is false. */
  rows?: TrailRow[];
  /** How many entries the service's answer CARRIED. Stated beside the rows so a drop is visible. */
  count: number;
  /** The cap the service applied. */
  limit: number;
  /** Why it could not be read, when it could not. */
  reason?: string;
}

/** A `fetch` this lane can be tested against. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Read the trail, newest first.
 *
 * `count` is the service's own number and `rows.length` is what could be rendered: the two are BOTH kept,
 * because a row the pure half could not display honestly is dropped — and a panel that only reported the
 * rendered count would be hiding the drop.
 */
export async function readTrail(limit: number, fetchImpl: FetchLike = fetch): Promise<TrailAnswer> {
  try {
    const res = await fetchImpl(`/api/audit?limit=${encodeURIComponent(String(limit))}`, {
      headers: { accept: 'application/json' },
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
      return { ok: false, count: 0, limit, reason: why };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, count: 0, limit, reason: 'the trail answered something that is not JSON' };
    }
    if (typeof body !== 'object' || body === null) {
      return { ok: false, count: 0, limit, reason: 'the trail answered with neither an object nor a reason' };
    }
    const { entries, count, limit: capped } = body as { entries?: unknown; count?: unknown; limit?: unknown };
    if (!Array.isArray(entries)) {
      return { ok: false, count: 0, limit, reason: 'the trail answered with no entries at all' };
    }
    return {
      ok: true,
      rows: toTrailRows(entries),
      count: typeof count === 'number' && Number.isFinite(count) ? count : entries.length,
      limit: typeof capped === 'number' && Number.isFinite(capped) ? capped : limit,
    };
  } catch (error) {
    return { ok: false, count: 0, limit, reason: error instanceof Error ? error.message : String(error) };
  }
}
