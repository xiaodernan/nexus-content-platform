import { NextResponse } from 'next/server';

import { followOnService, unfollowOnService } from '@/lib/followServer';

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
  const { accountId, claim } = body as { accountId?: unknown; claim?: unknown };
  if (typeof accountId !== 'string' || accountId.length === 0) {
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
  if (typeof c.accountId !== 'string' || c.accountId.length === 0) {
    return NextResponse.json(
      { ok: false, reason: 'a follow needs an account: a follow with no follower has no edge to draw' },
      { status: 400 },
    );
  }
  const answer = await followOnService(accountId, {
    accountId: c.accountId,
    handle: typeof c.handle === 'string' ? c.handle : null,
    assurance: typeof c.assurance === 'string' ? c.assurance : null,
    claimedAt: typeof c.claimedAt === 'number' ? c.claimedAt : null,
  });
  return NextResponse.json(answer, { status: answer.ok ? 200 : 503 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ accountId: string }> }): Promise<NextResponse> {
  const { accountId } = await params;
  const url = new URL(request.url);
  const claimer = url.searchParams.get('claimer');
  if (!claimer) {
    return NextResponse.json(
      { ok: false, reason: 'a follow needs an account: a follow with no follower has no edge to draw' },
      { status: 400 },
    );
  }
  const answer = await unfollowOnService(decodeURIComponent(accountId), claimer);
  return NextResponse.json(answer, { status: answer.ok ? 200 : 503 });
}
