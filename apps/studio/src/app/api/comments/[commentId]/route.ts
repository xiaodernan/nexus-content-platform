import { NextResponse } from 'next/server';
import { serviceFailureStatus } from '@/lib/serviceCall';

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
  const { commentId } = await params;
  const claimer = new URL(request.url).searchParams.get('claimer');
  if (!claimer || claimer.trim() === '') {
    return NextResponse.json(
      {
        ok: false,
        reason:
          'a comment needs an account to take it back: a comment with no author has nobody to take it back and nobody to answer to',
      },
      { status: 400 },
    );
  }
  const answer = await removeCommentOnService(decodeURIComponent(commentId), claimer.trim());
  return NextResponse.json(answer, { status: answer.ok ? 200 : serviceFailureStatus(answer.failure) });
}
