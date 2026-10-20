import { NextResponse } from 'next/server';

import { reportOnService } from '@/lib/reportServer';

/**
 * M7 v296 (ADR 0016 amendment 296): `/api/reports` — this Studio's door onto the service's reports.
 *
 * The service's address is server-side (the same hop `/api/publish` and `/api/likes` perform), so the
 * browser never learns where `services/nexus-api` lives.
 *
 * The route is `force-dynamic`: the answer is a database read, and caching it would be storing a system of
 * record's contents in a place the next write cannot invalidate.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'the body is not JSON' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ ok: false, reason: 'the body is not an object' }, { status: 400 });
  }
  const { projectId, reason, detail, claim } = body as {
    projectId?: unknown;
    reason?: unknown;
    detail?: unknown;
    claim?: unknown;
  };
  if (typeof projectId !== 'string' || projectId.length === 0) {
    return NextResponse.json({ ok: false, reason: 'the projectId is missing' }, { status: 400 });
  }
  if (typeof reason !== 'string' || reason.length === 0) {
    return NextResponse.json(
      { ok: false, reason: 'a report needs a reason: one of spam, harassment, illegal, other' },
      { status: 400 },
    );
  }
  if (typeof claim !== 'object' || claim === null) {
    // The service refuses an authorless report BY NAME, and this route does not invent an author.
    return NextResponse.json(
      { ok: false, reason: 'a report needs an account: a report with no reporter cannot be followed up' },
      { status: 400 },
    );
  }
  const c = claim as { accountId?: unknown; handle?: unknown; assurance?: unknown; claimedAt?: unknown };
  if (typeof c.accountId !== 'string' || c.accountId.length === 0) {
    return NextResponse.json(
      { ok: false, reason: 'a report needs an account: a report with no reporter cannot be followed up' },
      { status: 400 },
    );
  }
  const answer = await reportOnService(
    projectId,
    reason,
    typeof detail === 'string' ? detail : '',
    {
      accountId: c.accountId,
      handle: typeof c.handle === 'string' ? c.handle : null,
      assurance: typeof c.assurance === 'string' ? c.assurance : null,
      claimedAt: typeof c.claimedAt === 'number' ? c.claimedAt : null,
    },
  );
  return NextResponse.json(answer, { status: answer.ok ? 201 : 503 });
}
