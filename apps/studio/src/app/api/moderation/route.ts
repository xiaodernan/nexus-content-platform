import { NextResponse } from 'next/server';

import { acknowledgeOnService, readDesk } from '@/lib/moderationServer';

/**
 * M7 v304 (ADR 0016 amendment 304): `/api/moderation` — this Studio's door onto the service's OWNER'S
 * DESK.
 *
 * The service's address is server-side (the same hop `/api/publish` and `/api/tips` perform), so the
 * browser never learns where `services/nexus-api` lives.
 *
 * The route is `force-dynamic`: the answer is a database read, and caching it would be storing a system
 * of record's contents in a place the next write cannot invalidate.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * READ the desk: the reports against the publications this account owns.
 *
 * <p>The owner is named in the query. This build has no session (ADR 0018), so the account the device
 * holds is the claim the service compares — the same claim the take-down and the withdrawal name. The
 * route does not pretend to know more than that, and it says so when there is no owner to ask about.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const owner = new URL(request.url).searchParams.get('owner');
  if (!owner || owner.trim() === '') {
    return NextResponse.json(
      { ok: false, reports: [], reason: 'the desk belongs to an account, and this request names none' },
      { status: 400 },
    );
  }
  const asked = Number(new URL(request.url).searchParams.get('limit') ?? '20');
  const limit = Number.isFinite(asked) && asked > 0 ? Math.trunc(asked) : 20;
  const answer = await readDesk(owner.trim(), limit);
  return NextResponse.json(answer, { status: answer.ok ? 200 : 502 });
}

/**
 * ACKNOWLEDGE a report: the owner of the publication says they have seen it.
 *
 * <p>The body carries the report's id, and the owner travels in the query for the same reason it does on
 * the read. The route answers with what the service answered, including the refusal's own words: a
 * panel that turned a refusal into a generic error would be hiding the rule that was broken.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const owner = new URL(request.url).searchParams.get('owner');
  if (!owner || owner.trim() === '') {
    return NextResponse.json(
      { ok: false, reason: 'the desk belongs to an account, and this request names none' },
      { status: 400 },
    );
  }
  let reportId = '';
  try {
    const body: unknown = await request.json();
    if (typeof body === 'object' && body !== null) {
      const id = (body as { reportId?: unknown }).reportId;
      if (typeof id === 'string') reportId = id;
    }
  } catch {
    // an unparseable body is answered below, by name
  }
  if (reportId.trim() === '') {
    return NextResponse.json({ ok: false, reason: 'the desk needs a reportId to acknowledge' }, { status: 400 });
  }
  const answer = await acknowledgeOnService(reportId.trim(), owner.trim());
  return NextResponse.json(answer, { status: answer.ok ? 200 : 502 });
}
