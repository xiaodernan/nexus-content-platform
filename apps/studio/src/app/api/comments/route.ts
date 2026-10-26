import { NextResponse } from 'next/server';
import { serviceFailureStatus } from '@/lib/serviceCall';
import { doorName } from '@/lib/doorName';

import { readCommentsWritten, writeComment } from '@/lib/commentServer';

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

/**
 * READ the comments of a publication — or, with `author`, the comments one account WROTE.
 *
 * <p>v335 — the same door, the other direction, the way the tips door answers both sides of a relation
 * (v332). A reader who wrote a comment could not see what they had written, and a comment is a thing a
 * person might want to find again, or take back.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const author = url.searchParams.get('author');
  if (!author || author.trim() === '') {
    return NextResponse.json(
      { ok: false, reason: 'the question names whose comments they are' },
      { status: 400 },
    );
  }
  const limit = Number.parseInt(url.searchParams.get('limit') ?? '20', 10);
  const answer = await readCommentsWritten(author.trim(), Number.isFinite(limit) ? limit : 20);
  if (!answer.ok) {
    return NextResponse.json({ ok: false, reason: answer.reason, failure: answer.failure }, { status: serviceFailureStatus(answer.failure) });
  }
  return NextResponse.json(
    { ok: true, comments: answer.comments, visible: answer.visible },
    { status: 200 },
  );
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
  const { projectId: projectIdRaw, claim, body: text } = body as {
    projectId?: unknown;
    claim?: unknown;
    body?: unknown;
  };
  // v521 — a name read from a BODY goes through the rule a name read from a QUERY already kept: the bytes
  // the caller meant, trimmed. Checking only LENGTH let three spaces be a publication.
  const projectId = doorName(projectIdRaw);
  if (projectId === '') {
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
  // v521 — v511 cited doorName’s rule for dropping the blank check here; the rule says the opposite: a name
  // blank after trimming is not a name. The service refuses such a claim BY NAME, its refusal carries no
  // failure kind, and the door answered 502 for a writer who simply forgot to sign.
  const accountId = doorName(c.accountId);
  if (accountId === '') {
    return NextResponse.json(
      { ok: false, reason: 'a comment needs an account: a comment with no author has nobody to take it back and nobody to answer to' },
      { status: 400 },
    );
  }
  const answer = await writeComment(projectId, text, {
    accountId,
    handle: typeof c.handle === 'string' ? c.handle : null,
    assurance: typeof c.assurance === 'string' ? c.assurance : null,
    claimedAt: typeof c.claimedAt === 'number' ? c.claimedAt : null,
  });
  return NextResponse.json(answer, { status: answer.ok ? 201 : serviceFailureStatus(answer.failure) });
}
