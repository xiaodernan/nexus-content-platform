import { NextResponse } from 'next/server';
import { serviceFailureStatus } from '@/lib/serviceCall';
import { doorName } from '@/lib/doorName';

import { followOnService, readFollowing, unfollowOnService } from '@/lib/followServer';

/**
 * M7 v288 (ADR 0016 amendment 288): `/api/follows` — this Studio's door onto the service's follows.
 *
 * The service's address is server-side (the same hop `/api/publish` and `/api/likes` perform), so the
 * browser never learns where `services/nexus-api` lives.
 *
 * Two verbs, two shapes:
 *   POST   — follow an account. The body carries the account id and the CLAIM.
 *   DELETE — take the follow back. The claimer is a query parameter, because a DELETE with no body is
 *            the conventional shape (the publication's take-down does the same).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * READ the accounts THIS device follows — the follower's own side of the edge.
 *
 * <p>The follower is named in the query for the same reason the claimer is: this build has no session
 * (ADR 0018), so the account the device holds is the claim the service compares.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const follower = new URL(request.url).searchParams.get('follower');
  if (!follower || follower.trim() === '') {
    return NextResponse.json(
      { ok: false, reason: 'the follower must be named: a list of follows with no follower is nobody’s list' },
      { status: 400 },
    );
  }
  // v390 — and the PAGE the following list is read at, in rows. A negative or unparseable one is the
  // first window: the newest rows are the honest answer to a question about a page before the first.
  const askedOffset = Number(new URL(request.url).searchParams.get('offset') ?? '0');
  const offset = Number.isFinite(askedOffset) && askedOffset > 0 ? Math.trunc(askedOffset) : 0;
  const answer = await readFollowing(follower.trim(), offset);
  return NextResponse.json(answer, { status: answer.ok ? 200 : serviceFailureStatus(answer.failure) });
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
  const { accountId: accountIdRaw, claim } = body as { accountId?: unknown; claim?: unknown };
  // v521 — the account FOLLOWED is a name, and the GET half of this door already read its name through the
  // rule; the body checked only LENGTH, so three spaces was an account to ask about.
  const accountId = doorName(accountIdRaw);
  if (accountId === '') {
    return NextResponse.json({ ok: false, reason: 'the accountId is missing' }, { status: 400 });
  }
  if (typeof claim !== 'object' || claim === null) {
    // The service refuses an accountless follow BY NAME, and this route does not invent an account.
    return NextResponse.json(
      { ok: false, reason: 'a follow needs an account: a follow with no follower has no edge to draw' },
      { status: 400 },
    );
  }
  const c = claim as { accountId?: unknown; handle?: unknown; assurance?: unknown; claimedAt?: unknown };
  // v521 — v511 read doorName’s rule as “a name only has to be a string”. The rule says the opposite: a name
  // blank after trimming is not a name. The service refused such a claim BY NAME, the refusal carried no
  // failure kind, and the door answered 502 for a follower whose device sent an empty account.
  const follower = doorName(c.accountId);
  if (follower === '') {
    return NextResponse.json(
      { ok: false, reason: 'a follow needs an account: a follow with no follower has no edge to draw' },
      { status: 400 },
    );
  }
  const answer = await followOnService(accountId, {
    accountId: follower,
    handle: typeof c.handle === 'string' ? c.handle : null,
    assurance: typeof c.assurance === 'string' ? c.assurance : null,
    claimedAt: typeof c.claimedAt === 'number' ? c.claimedAt : null,
  });
  return NextResponse.json(answer, { status: answer.ok ? 200 : serviceFailureStatus(answer.failure) });
}

