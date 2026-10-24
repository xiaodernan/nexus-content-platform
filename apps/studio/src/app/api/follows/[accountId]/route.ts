import { NextResponse } from 'next/server';
import { serviceFailureStatus } from '@/lib/serviceCall';
import { doorName } from '@/lib/doorName';

import { unfollowOnService } from '@/lib/followServer';

/**
 * v294 — the Studio's door onto the service's UN-FOLLOW.
 *
 * <p>This handler is a DYNAMIC SEGMENT because it reads the publication id out of the path: a route that
 * reads a path parameter has to BE a path parameter. (It was a flat route with a `params` argument
 * before — which the typed-routes check caught, and which no proof had exercised.)
 *
 * <p>The claimer is a query parameter, because a DELETE with no body is the conventional shape.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, { params }: { params: Promise<{ accountId: string }> }): Promise<NextResponse> {
  const { accountId } = await params;
  const url = new URL(request.url);
  // v508 — the claimer is read through the one rule (doorName): the service never trims, so a
  // padded claimer would be compared against an account that does not exist and refused as
  // “not yours” — the wrong sentence for a name that was never really named.
  const claimer = doorName(url.searchParams.get('claimer'));
  if (claimer === '') {
    return NextResponse.json(
      { ok: false, reason: 'a follow needs an account: a follow with no follower has no edge to draw' },
      { status: 400 },
    );
  }
  const answer = await unfollowOnService(doorName(decodeURIComponent(accountId)), claimer);
  return NextResponse.json(answer, { status: answer.ok ? 200 : serviceFailureStatus(answer.failure) });
}
