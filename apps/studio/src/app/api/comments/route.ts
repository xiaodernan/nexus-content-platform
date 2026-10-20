import { NextResponse } from 'next/server';

import { writeComment } from '@/lib/commentServer';

/**
 * M7 v286 (ADR 0016 amendment 286): `/api/comments` — this Studio's door onto the service's comments.
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
  const { projectId, claim, body: text } = body as {
    projectId?: unknown;
    claim?: unknown;
    body?: unknown;
  };
  if (typeof projectId !== 'string' || projectId.length === 0) {
    return NextResponse.json({ ok: false, reason: 'the projectId is missing' }, { status: 400 });
  }
  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ ok: false, reason: 'a comment must say something: a blank body is not a comment' }, { status: 400 });
  }
  if (typeof claim !== 'object' || claim === null) {
    // The service refuses an authorless comment BY NAME, and this route does not invent an author: the
    // browser sends the claim it has, or the comment is refused.
    return NextResponse.json(
      { ok: false, reason: 'a comment needs an account: a comment with no author has nobody to take it back and nobody to answer to' },
      { status: 400 },
    );
  }
  const c = claim as { accountId?: unknown; handle?: unknown; assurance?: unknown; claimedAt?: unknown };
  if (typeof c.accountId !== 'string' || c.accountId.length === 0) {
    return NextResponse.json(
      { ok: false, reason: 'a comment needs an account: a comment with no author has nobody to take it back and nobody to answer to' },
      { status: 400 },
    );
  }
  const answer = await writeComment(projectId, text, {
    accountId: c.accountId,
    handle: typeof c.handle === 'string' ? c.handle : null,
    assurance: typeof c.assurance === 'string' ? c.assurance : null,
    claimedAt: typeof c.claimedAt === 'number' ? c.claimedAt : null,
  });
  return NextResponse.json(answer, { status: answer.ok ? 201 : 503 });
}
