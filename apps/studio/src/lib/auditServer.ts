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
 *
 * v510 (ADR 0016 amendment 503): this module became the ONE reader of the service’s audit door. Until
 * now the Studio read that door twice — here for the artifact page, and again by hand inside
 * `app/api/audit/route.ts` — and the two readers disagreed about everything a reader decides: the
 * budget (5 seconds here, 15 there), the sentence for a service that never answered (the shared
 * `serviceUnreachableReason` here, the raw error message there), whether a refused filter is
 * answered with the SERVICE’S OWN NAME for the set it accepts (v385’s rule, only there), and which
 * of the question’s fields travel at all (the page and offset only here, the verb there). One door,
 * one reader: the question is now a parameter, the route keeps only what belongs to a door, and
 * every rule the hand-rolled reader had is a rule this lib has.
 */
import { nexusApiBase } from './publishServer';
import { serviceCallSignal, serviceUnreachableReason, type ServiceFailureKind } from './serviceCall';

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
  /** v507 — which kind of “no” this is, when `ok` is false. */
  failure?: ServiceFailureKind;
  entries?: AuditEntry[];
  /** How many entries the answer CARRIED in all — not just the ones for one target. */
  carried: number;
  /** The cap the service applied. */
  limit: number;
  /**
   * v385/v510 — how many entries the WHOLE trail holds, narrowed or not. Present when the service
   * says: the number a reader needs to see what a filter is hiding.
   */
  total?: number;
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
/**
 * The question a reader asks the trail: how many rows, from which window, narrowed to which verb.
 *
 * <p>The verb travels VERBATIM — the service owns the closed set and refuses an unknown one BY
 * NAME — so a reader that trimmed or validated it here would be answering a question the service
 * was never asked. An absent or empty verb asks for no narrowing at all.
 */
export interface AuditTrailQuestion {
  /** How many rows to ask for. The caller clamps a silly ask; the service caps at its own 100. */
  limit: number;
  /** Which row to start at; 0 (or less) is the newest window. */
  offset?: number;
  /** The verb to narrow to, or none. */
  action?: string | null;
}

export async function readAuditTrail(
  question: AuditTrailQuestion,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<AuditTrailAnswer> {
  const apiBase = nexusApiBase();
  const from = Math.max(question.offset ?? 0, 0);
  const ask =
    question.action === undefined || question.action === null || question.action === ''
      ? ''
      : `&action=${encodeURIComponent(question.action)}`;
  try {
    const res = await fetchImpl(
      `${apiBase}/audit?limit=${encodeURIComponent(String(question.limit))}&offset=${encodeURIComponent(String(from))}${ask}`,
      {
        headers: { accept: 'application/json' },
        signal: serviceCallSignal(),
      },
    );
    if (!res.ok) {
      // v385’s rule, now the lib’s: a refused filter is answered with the SERVICE’S OWN NAME for the
      // set it accepts. "HTTP 400" would throw away the one part a reader can act on.
      const refusal = await res.json().catch(() => null);
      const named =
        refusal && typeof refusal === 'object' && typeof (refusal as { message?: unknown }).message === 'string'
          ? (refusal as { message: string }).message
          : null;
      return {
        ok: false,
        carried: 0,
        limit: question.limit,
        failure: 'invalid',
        reason: named ?? `the service's audit door answered HTTP ${res.status}`,
      };
    }
    const parsed: unknown = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, carried: 0, limit: question.limit, failure: 'invalid', reason: 'the service answered its audit door with something that is not JSON' };
    }
    const body = parsed as { entries?: unknown; count?: unknown; limit?: unknown; total?: unknown };
    if (!Array.isArray(body.entries)) {
      return { ok: false, carried: 0, limit: question.limit, failure: 'invalid', reason: 'the service answered its audit door with no entries at all' };
    }
    return {
      ok: true,
      entries: body.entries as AuditEntry[],
      carried: typeof body.count === 'number' && Number.isFinite(body.count) ? body.count : body.entries.length,
      limit: typeof body.limit === 'number' && Number.isFinite(body.limit) ? body.limit : question.limit,
      ...(typeof body.total === 'number' && Number.isFinite(body.total) ? { total: body.total } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      carried: 0,
      limit: question.limit,
      failure: 'unreachable', reason: serviceUnreachableReason(apiBase, error),
    };
  }
}
