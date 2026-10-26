import { NextResponse } from 'next/server';
import { serviceFailureStatus } from '@/lib/serviceCall';
import { doorName } from '@/lib/doorName';

import { removeCommentOnService } from '@/lib/commentServer';

/**
 * v321 — the Studio's door onto the service's TAKE-BACK of a comment.
 *
 * <p>This handler is a DYNAMIC SEGMENT because it reads the comment id out of the path: a route that
 * reads a path parameter has to BE a path parameter. (The un-like's door is the same shape — v294 —
 * and the typed-routes check is what taught us that.)
 *
 * <p>The claimer is a query parameter, because a DELETE with no body is the conventional shape, and
 * because the service is the one that compares the claimer with the comment's author: somebody else's
 * comment is REFUSED by name, not silently ignored.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, { params }: { params: Promise<{ commentId: string }> }): Promise<NextResponse> {
  // v523 — BOTH names on this door are read through the one rule now. The claimer had a hand-copied twin of
  // it (`!claimer || claimer.trim() === ''` forward of `claimer.trim()`); the comment id had no reading at
  // all beyond a SECOND decode — Next has already decoded the segment, so a comment id carrying a percent
  // threw `URIError` out of the handler (a 500 with no sentence and no ask), and a padded id was forwarded
  // with its padding while the claimer was not. A name blank after trimming is not a name: this door says
  // which one is missing, in its own sentence, before the service is asked.
  const commentId = doorName((await params).commentId);
  if (commentId === '') {
    return NextResponse.json(
      { ok: false, reason: 'a take-back needs the comment it points at: this URL names none' },
      { status: 400 },
    );
  }
  const claimer = doorName(new URL(request.url).searchParams.get('claimer'));
  if (claimer === '') {
    return NextResponse.json(
      {
        ok: false,
        reason:
          'a comment needs an account to take it back: a comment with no author has nobody to take it back and nobody to answer to',
      },
      { status: 400 },
    );
  }
  const answer = await removeCommentOnService(commentId, claimer);
  return NextResponse.json(answer, { status: answer.ok ? 200 : serviceFailureStatus(answer.failure) });
}
