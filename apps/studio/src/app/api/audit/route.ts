import { NextResponse } from 'next/server';
import { serviceFailureStatus } from '@/lib/serviceCall';

import { readAuditTrail } from '@/lib/auditServer';

/**
 * M9 v272 (ADR 0016 amendment 272): `/api/audit` — this Studio's door onto the service's audit trail.
 *
 * The service's address is server-side (the same hop `/api/publish` performs), so the browser never learns
 * where `services/nexus-api` lives. What crosses the door is the SERVICE'S OWN answer — `{ ok, entries,
 * count, limit }` — not a re-shaping of it: the trail's order, its count and its cap are all the service's
 * facts, and a route that re-sorted or re-counted them would be reporting something the service never said.
 *
 * The route is `force-dynamic` because the answer is a database read; caching it would be storing a
 * system of record's contents in a place that cannot be invalidated by the next write.
 *
 * v385 (ADR 0016 amendment 385): an `action` the caller names travels to the service, which narrows the
 * window itself — the same hop, the same answer shape, plus the service's `total` (how many the whole
 * trail holds) so a reader can still see what the filter is hiding.
 *
 * v510 (ADR 0016 amendment 503): the route stopped reading the service BY HAND. It used to build the
 * URL, pick its own 5-second budget and answer its own sentences — a SECOND reader of the same service
 * door beside `auditServer.ts`, disagreeing with it about the budget, the unreachable sentence and
 * the named refusal. The read is the lib’s now; what is left here is what belongs to a door and to
 * nothing else: which window is asked for, which fields travel verbatim, and which status each kind
 * of answer earns (v507’s rule, read off the answer rather than picked per branch).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The default number of entries the panel asks for. */
const DEFAULT_LIMIT = 20;

/** The most the panel asks for. The service clamps to its own 100; the route refuses a silly ask up front. */
const MAX_LIMIT = 100;

export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const raw = params.get('limit');
  const parsed = raw === null ? DEFAULT_LIMIT : Number.parseInt(raw, 10);
  const asked = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), MAX_LIMIT) : DEFAULT_LIMIT;
  // v385 — the filter travels verbatim: the service owns the closed set of verbs and refuses an unknown
  // one BY NAME, so the route's job is to forward the question, not to answer a different one.
  const action = params.get('action');
  // v388 — and so does the page, in ROWS (the filed read's meaning, v387). A negative or unparseable
  // offset is the first window rather than a refusal: a page before the first does not exist, and the
  // newest rows are the honest answer to a question about it.
  const rawOffset = params.get('offset');
  const parsedOffset = rawOffset === null ? 0 : Number.parseInt(rawOffset, 10);
  const from = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

  const answer = await readAuditTrail({ limit: asked, offset: from, action });
  if (!answer.ok) {
    // v507’s rule, read off the answer: the service answered unusably is a 502, it did not answer
    // at all is a 503, and the reason is the lib’s own — the service’s named refusal when it named one.
    return NextResponse.json({ ok: false, reason: answer.reason }, { status: serviceFailureStatus(answer.failure) });
  }
  return NextResponse.json({
    ok: true,
    entries: answer.entries,
    count: answer.carried,
    limit: answer.limit,
    total: answer.total,
  });
}
