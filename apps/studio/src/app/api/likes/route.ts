import { NextResponse } from 'next/server';
import { serviceFailureStatus } from '@/lib/serviceCall';
import { doorName } from '@/lib/doorName';

import { likeOnService, readLikesOnService } from '@/lib/likeServer';

/**
 * M7 v284 (ADR 0016 amendment 284): `/api/likes` — this Studio's door onto the service's likes.
 *
 * The service's address is server-side (the same hop `/api/publish` performs), so the browser never
 * learns where `services/nexus-api` lives. What crosses the door is the SERVICE'S OWN answer.
 *
 * Two verbs, two shapes:
 *   GET    — the likes of a publication, and whether the VIEWER is among them.
 *   POST   — like a publication. The body carries the project id and the CLAIM.
 *
 * The take-back is NOT here: an un-like names the publication it takes back, so it lives at
 * `/api/likes/[projectId]` (DELETE). A DELETE with no address would have to read its target from a
 * body, which is not what a DELETE is.
 *
 * The route is `force-dynamic`: the answer is a database read, and caching it would be storing a system
 * of record's contents in a place the next write cannot invalidate.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 20;

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  // v508 — the name the caller meant, trimmed. v521 corrected the claim written here, that the service
  // never trims: it trims every name it reads, isBlank() first and trim() after, so padding was never a
  // wrong lookup. The rule is the door’s own — a name blank after trimming names nothing — and the
  // padding is the URL’s, not the caller’s, so the door asks about pub-1.
  const projectId = doorName(url.searchParams.get('projectId'));
  if (projectId === '') {
    return NextResponse.json({ ok: false, reason: 'the projectId parameter is missing' }, { status: 400 });
  }
  const viewer = doorName(url.searchParams.get('viewer'));
  const limit = Number.parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10);
  const answer = await readLikesOnService(
    projectId,
    viewer || null,
    Number.isFinite(limit) ? limit : DEFAULT_LIMIT,
  );
  if (!answer.ok) {
    return NextResponse.json({ ok: false, reason: answer.reason, failure: answer.failure }, { status: serviceFailureStatus(answer.failure) });
  }
  return NextResponse.json({
    ok: true,
    count: answer.count,
    likes: answer.likes,
    liked: viewer
      ? answer.likes.some((like) => like.accountId === viewer)
      : false,
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
  const { projectId: projectIdRaw, claim } = body as { projectId?: unknown; claim?: unknown };
  // v521 — the name read from this BODY joins the rule the GET half of this door reads through doorName:
  // the bytes the caller meant, trimmed, and a name blank after trimming is not a name at all.
  const projectId = doorName(projectIdRaw);
  if (projectId === '') {
    return NextResponse.json({ ok: false, reason: 'the projectId is missing' }, { status: 400 });
  }
  if (typeof claim !== 'object' || claim === null) {
    // The service refuses an accountless like BY NAME, and this route does not invent one: the browser
    // sends the claim it has, or the like is refused.
    return NextResponse.json(
      { ok: false, reason: 'a like needs an account: the service cannot tell one anonymous like from the same one twice' },
      { status: 400 },
    );
  }
  const c = claim as { accountId?: unknown; handle?: unknown; assurance?: unknown; claimedAt?: unknown };
  // v521 — v511 read doorName’s rule as “a name only has to be a string”. The rule says the opposite: a name
  // blank after trimming is not a name. The service refused such a claim BY NAME, the refusal carried no
  // failure kind, and the door answered 502 for a liker whose device simply sent an empty account.
  const liker = doorName(c.accountId);
  if (liker === '') {
    return NextResponse.json(
      { ok: false, reason: 'a like needs an account: the service cannot tell one anonymous like from the same one twice' },
      { status: 400 },
    );
  }
  const answer = await likeOnService(projectId, {
    accountId: liker,
    handle: typeof c.handle === 'string' ? c.handle : null,
    assurance: typeof c.assurance === 'string' ? c.assurance : null,
    claimedAt: typeof c.claimedAt === 'number' ? c.claimedAt : null,
  });
  return NextResponse.json(answer, { status: answer.ok ? 200 : serviceFailureStatus(answer.failure) });
}

