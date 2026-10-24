import { NextResponse } from 'next/server';
import { serviceFailureStatus } from '@/lib/serviceCall';
import { doorName } from '@/lib/doorName';

import { readTips, readTipsGiven, tipOnService } from '@/lib/tipServer';

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

/**
 * READ the tips an account received — the creator's own view of what people gave them.
 *
 * <p>The same door serves both directions: the query names the RECIPIENT, and the answer carries the
 * count, the total the DATABASE summed, and the tips themselves.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  // v508 — both names are read through the one rule (doorName): the service never trims, so
  // forwarding “ acct-ada ” would ask about an account that does not exist and answer with an empty
  // list that reads as “nobody tipped this account”.
  const recipient = doorName(url.searchParams.get('recipient'));
  // v332 — the PAYER's side of the same door: a reader who gave money and could not see what they gave
  // had a receipt with no place to read it.
  const payer = doorName(url.searchParams.get('payer'));
  if (recipient === '' && payer === '') {
    return NextResponse.json(
      { ok: false, reason: 'the question names who received the tips or who gave them' },
      { status: 400 },
    );
  }
  const limit = Number.parseInt(url.searchParams.get('limit') ?? '20', 10);
  // v391 — and the PAGE the list is read at, in rows. A negative or unparseable one is the first
  // window: the newest rows are the honest answer to a question about a page before the first.
  const askedOffset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10);
  const offset = Number.isFinite(askedOffset) && askedOffset > 0 ? askedOffset : 0;
  const answer = recipient !== ''
    ? await readTips(recipient, Number.isFinite(limit) ? limit : 20, offset)
    : await readTipsGiven(payer, Number.isFinite(limit) ? limit : 20, offset);
  if (!answer.ok) {
    return NextResponse.json({ ok: false, reason: answer.reason, failure: answer.failure }, { status: serviceFailureStatus(answer.failure) });
  }
  return NextResponse.json({
    ok: true,
    tips: answer.tips,
    totalCents: answer.totalCents,
    count: answer.count,
    // v391 — and the cap that was applied: a panel that pages needs to know the window's size to
    // say which rows it is showing, the same field the filed read's answer carries (v382).
    limit: answer.limit,
  });
}

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
  if (typeof c.accountId !== 'string') {
    return NextResponse.json(
      { ok: false, reason: 'a tip needs an account to be from' },
      { status: 400 },
    );
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
  return NextResponse.json(answer, { status: answer.ok ? 201 : serviceFailureStatus(answer.failure) });
}
