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
  const url = new URL(request.url);
  // v523 — the segment is read the same way as the claimer: ONE decode (Next has already decoded it; a
  // second decode threw `URIError` out of the handler on an account id that carries a percent, which is a
  // 500 with no sentence and no ask) and the one rule — a name blank after trimming names no account, and
  // this door says so in its own sentence instead of asking the service to delete an edge it never named.
  const accountId = doorName((await params).accountId);
  if (accountId === '') {
    return NextResponse.json(
      { ok: false, reason: 'a follow needs the account it points at: this URL names none' },
      { status: 400 },
    );
  }
  // v508 — the claimer is read through the one rule (doorName). v521 corrected the claim made here, that
  // the service never trims: it trims every name it reads. The rule is the door’s own — a name blank
  // after trimming names nobody — so this door says that in its own sentence instead of forwarding an
  // empty claimer for the service to refuse.
  const claimer = doorName(url.searchParams.get('claimer'));
  if (claimer === '') {
    return NextResponse.json(
      { ok: false, reason: 'a follow needs an account: a follow with no follower has no edge to draw' },
      { status: 400 },
    );
  }
  const answer = await unfollowOnService(accountId, claimer);
  return NextResponse.json(answer, { status: answer.ok ? 200 : serviceFailureStatus(answer.failure) });
}
