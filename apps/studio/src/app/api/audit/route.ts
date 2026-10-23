import { NextResponse } from 'next/server';

import { nexusApiBase } from '@/lib/publishServer';

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
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The default number of entries the panel asks for. */
const DEFAULT_LIMIT = 20;

/** The most the panel asks for. The service clamps to its own 100; the route refuses a silly ask up front. */
const MAX_LIMIT = 100;

/** How long the service may take. The trail is a small read; a hung one should not hang the panel. */
const CALL_TIMEOUT_MS = 5000;

function html(reason: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, reason }, { status });
}

export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const raw = params.get('limit');
  const parsed = raw === null ? DEFAULT_LIMIT : Number.parseInt(raw, 10);
  const asked = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), MAX_LIMIT) : DEFAULT_LIMIT;
  // v385 — the filter travels verbatim: the service owns the closed set of verbs and refuses an unknown
  // one BY NAME, so the route's job is to forward the question, not to answer a different one.
  const action = params.get('action');

  try {
    const ask = action === null || action === '' ? '' : `&action=${encodeURIComponent(action)}`;
    const res = await fetch(`${nexusApiBase()}/audit?limit=${encodeURIComponent(String(asked))}${ask}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (!res.ok) {
      // v385 — a refused filter is a 400 that NAMES the set, and that name is the part a reader can act
      // on; answering "HTTP 400" would throw the reason away.
      const refusal = await res.json().catch(() => null);
      const named =
        refusal && typeof refusal === 'object' && typeof (refusal as { message?: unknown }).message === 'string'
          ? (refusal as { message: string }).message
          : null;
      return html(named ?? `the service's audit door answered HTTP ${res.status}`, 503);
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return html('the service answered its audit door with something that is not JSON', 503);
    }
    if (typeof body !== 'object' || body === null || !Array.isArray((body as { entries?: unknown }).entries)) {
      return html('the service answered its audit door with no entries at all', 503);
    }
    const { entries, count, limit, total } = body as { entries: unknown; count?: unknown; limit?: unknown; total?: unknown };
    return NextResponse.json({ ok: true, entries, count, limit, total });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return html(reason, 503);
  }
}
