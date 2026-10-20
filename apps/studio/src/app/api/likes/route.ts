import { NextResponse } from 'next/server';

import { likeOnService, readLikesOnService, unlikeOnService } from '@/lib/likeServer';

/**
 * M7 v284 (ADR 0016 amendment 284): `/api/likes` — this Studio's door onto the service's likes.
 *
 * The service's address is server-side (the same hop `/api/publish` performs), so the browser never
 * learns where `services/nexus-api` lives. What crosses the door is the SERVICE'S OWN answer.
 *
 * Three verbs, three shapes:
 *   GET    — the likes of a publication, and whether the VIEWER is among them.
 *   POST   — like a publication. The body carries the project id and the CLAIM.
 *   DELETE — take a like back. The claimer is a query parameter, because a DELETE with no body is the
 *            conventional shape (the publication's take-down does the same).
 *
 * The route is `force-dynamic`: the answer is a database read, and caching it would be storing a system
 * of record's contents in a place the next write cannot invalidate.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 20;

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ ok: false, reason: 'the projectId parameter is missing' }, { status: 400 });
  }
  const viewer = url.searchParams.get('viewer') ?? '';
  const limit = Number.parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10);
  const answer = await readLikesOnService(
    projectId,
    viewer || null,
    Number.isFinite(limit) ? limit : DEFAULT_LIMIT,
  );
  if (!answer.ok) {
    return NextResponse.json({ ok: false, reason: answer.reason }, { status: 503 });
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
  const { projectId, claim } = body as { projectId?: unknown; claim?: unknown };
  if (typeof projectId !== 'string' || projectId.length === 0) {
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
  if (typeof c.accountId !== 'string' || c.accountId.length === 0) {
    return NextResponse.json(
      { ok: false, reason: 'a like needs an account: the service cannot tell one anonymous like from the same one twice' },
      { status: 400 },
    );
  }
  const answer = await likeOnService(projectId, {
    accountId: c.accountId,
    handle: typeof c.handle === 'string' ? c.handle : null,
    assurance: typeof c.assurance === 'string' ? c.assurance : null,
    claimedAt: typeof c.claimedAt === 'number' ? c.claimedAt : null,
  });
  return NextResponse.json(answer, { status: answer.ok ? 200 : 503 });
}

