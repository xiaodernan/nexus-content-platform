import { NextResponse } from 'next/server';

import { tipOnService } from '@/lib/tipServer';

/**
 * M7 v298 (ADR 0016 amendment 298): `/api/tips` — this Studio's door onto the service's tips.
 *
 * The service's address is server-side (the same hop `/api/publish` and `/api/likes` perform), so the
 * browser never learns where `services/nexus-api` lives.
 *
 * The route is `force-dynamic`: the answer is a database read, and caching it would be storing a system
 * of record's contents in a place the next write cannot invalidate.
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
  const { recipientAccountId, amountCents, message, anonymous, claim } = body as {
    recipientAccountId?: unknown;
    amountCents?: unknown;
    message?: unknown;
    anonymous?: unknown;
    claim?: unknown;
  };
  if (typeof recipientAccountId !== 'string' || recipientAccountId.length === 0) {
    return NextResponse.json({ ok: false, reason: 'the recipientAccountId is missing' }, { status: 400 });
  }
  if (typeof amountCents !== 'number' || !Number.isFinite(amountCents)) {
    return NextResponse.json({ ok: false, reason: 'the amountCents is missing' }, { status: 400 });
  }
  if (typeof claim !== 'object' || claim === null) {
    // The service refuses a tip with no payer BY NAME, and this route does not invent one.
    return NextResponse.json(
      { ok: false, reason: 'a tip needs an account to be from' },
      { status: 400 },
    );
  }
  const c = claim as { accountId?: unknown; handle?: unknown; assurance?: unknown; claimedAt?: unknown };
  if (typeof c.accountId !== 'string' || c.accountId.length === 0) {
    return NextResponse.json({ ok: false, reason: 'a tip needs an account to be from' }, { status: 400 });
  }
  const answer = await tipOnService(
    recipientAccountId,
    Math.floor(amountCents),
    typeof message === 'string' ? message : '',
    anonymous === true,
    {
      accountId: c.accountId,
      handle: typeof c.handle === 'string' ? c.handle : null,
      assurance: typeof c.assurance === 'string' ? c.assurance : null,
      claimedAt: typeof c.claimedAt === 'number' ? c.claimedAt : null,
    },
  );
  return NextResponse.json(answer, { status: answer.ok ? 201 : 503 });
}
