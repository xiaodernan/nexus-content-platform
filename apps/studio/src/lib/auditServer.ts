/**
 * M9 v280 — the server-side half of the AUDIT TRAIL's reader.
 *
 * The service's address is server-side (the browser never learns it), and the artifact page is SERVER-
 * RENDERED, so it reads the trail the same way it reads the publication: a server-side hop, never a
 * client-side one.
 *
 * A failed read answers with a REASON rather than a thrown error — the same rule every lane in this repo
 * keeps — because an artifact page that says "the history could not be read: the service is unreachable"
 * is an honest page and one that throws into a route handler is a 500.
 */
import { nexusApiBase } from './publishServer';
import { serviceCallSignal } from './serviceCall';

/** One audit entry, in the service's own wire shape. */
export interface AuditEntry {
  id: string;
  action: string;
  actorId: string | null;
  targetId: string;
  /**
   * v384 — what KIND of thing the entry happened to: account, plan or publication. Never null on this
   * wire: the service refuses an entry that does not name a kind, so the lane types it as it arrives.
   */
  targetType: string;
  createdAt: number;
  assurance: string | null;
}

/** What one read of the trail answered. */
export interface AuditTrailAnswer {
  ok: boolean;
  entries?: AuditEntry[];
  /** How many entries the answer CARRIED in all — not just the ones for one target. */
  carried: number;
  /** The cap the service applied. */
  limit: number;
  reason?: string;
}

export type FetchLike = (input: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;

/**
 * Read the trail, newest first.
 *
 * `carried` is the service's own count of what it returned, and it is kept BESIDE the entries: a reader
 * that filtered the trail down to one publication's rows must still be able to say how big the answer was,
 * because "this publication has one entry" and "the answer was cut short before this publication's
 * entries appeared" are different facts.
 */
export async function readAuditTrail(limit: number, fetchImpl: FetchLike = fetch as FetchLike): Promise<AuditTrailAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(`${apiBase}/audit?limit=${encodeURIComponent(String(limit))}`, {
      headers: { accept: 'application/json' },
      signal: serviceCallSignal(),
    });
    if (!res.ok) {
      return { ok: false, carried: 0, limit, reason: `the service's audit door answered HTTP ${res.status}` };
    }
    const parsed: unknown = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, carried: 0, limit, reason: 'the service answered its audit door with something that is not JSON' };
    }
    const body = parsed as { entries?: unknown; count?: unknown; limit?: unknown };
    if (!Array.isArray(body.entries)) {
      return { ok: false, carried: 0, limit, reason: 'the service answered its audit door with no entries at all' };
    }
    return {
      ok: true,
      entries: body.entries as AuditEntry[],
      carried: typeof body.count === 'number' && Number.isFinite(body.count) ? body.count : body.entries.length,
      limit: typeof body.limit === 'number' && Number.isFinite(body.limit) ? body.limit : limit,
    };
  } catch (error) {
    return {
      ok: false,
      carried: 0,
      limit,
      reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
