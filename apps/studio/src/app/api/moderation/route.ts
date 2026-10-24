import { NextResponse } from 'next/server';
import { serviceFailureStatus } from '@/lib/serviceCall';

import { acknowledgeOnService, readDesk, readTally } from '@/lib/moderationServer';

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
  // v326 — the REASON the desk is narrowed to, if any. It travels to the service, which does the
  // narrowing in its query — the browser never receives the rows it did not ask for.
  const reason = new URL(request.url).searchParams.get('reason');
  // v389 — and the PAGE the desk is read at, in rows. A negative or unparseable one is the first
  // window: the newest rows are the honest answer to a question about a page before the first.
  const askedOffset = Number(new URL(request.url).searchParams.get('offset') ?? '0');
  const offset = Number.isFinite(askedOffset) && askedOffset > 0 ? Math.trunc(askedOffset) : 0;
  const [answer, tally] = await Promise.all([
    readDesk(owner.trim(), limit, reason, offset),
    readTally(owner.trim()),
  ]);
  // The TALLY is part of the desk’s answer (v312): it counts every report against the work, where the rows
  // are a window, and a panel that showed the rows without the count would let a reader mistake the window
  // for the whole.
  return NextResponse.json(
    { ...answer, tally: tally.ok ? { total: tally.total, open: tally.open, byReason: tally.byReason, byStatus: tally.byStatus } : null },
    { status: answer.ok ? 200 : serviceFailureStatus(answer.failure) },
  );
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
  return NextResponse.json(answer, { status: answer.ok ? 200 : serviceFailureStatus(answer.failure) });
}
