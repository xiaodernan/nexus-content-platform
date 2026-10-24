import { NextResponse } from 'next/server';
import type { OwnerClaim } from '@/lib/accounts';

import { DEFAULT_LIST_LIMIT as LIST_DEFAULT, listPublications, publishDocument, publishState, readPublication, unpublishProject } from '@/lib/publishServer';

/**
 * M7 v194 (ADR 0016 amendment 194): the route where a Studio document crosses into `services/nexus-api`.
 *
 * Node runtime, because this is the hop that holds the service's address (`NEXUS_API_URL`) and does the
 * fetching — the browser never learns either. The POST body names an ACTION and the project:
 *
 *   { action: "publish",   projectId, title, document } → the service's receipt, passed through
 *   { action: "read",      projectId }                  → the publication, document included
 *   { action: "unpublish", projectId, claimer }         → whether anything actually moved
 *   { action: "list",      limit, owner }               → what is published; names NO project
 *
 * The refusal sentences below quote this vocabulary, so a caller that sends a name from it never has to guess
 * whether the route knows the action.
 *
 * A service that is NOT RUNNING is the ordinary state of a frontend-first repository, so it arrives as
 * `ok: false` with a reason rather than as a 500 — the panel needs to say "the service is not up", not
 * "something went wrong". The status codes follow the same rule: 200 when the Studio got an answer it can
 * show, 400 when the CALLER asked something malformed.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await publishState());
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'the body is not JSON; this route answers { action: "publish" | "read" | "unpublish" | "list", projectId, … }' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ ok: false, reason: 'the body is not an object; this route answers { action: "publish" | "read" | "unpublish" | "list", projectId, … }' }, { status: 400 });
  }

  const { action, projectId, title, document, limit, owner, claimer } = body as {
    action?: unknown;
    projectId?: unknown;
    title?: unknown;
    document?: unknown;
    limit?: unknown;
    /** The Studio's claim of who published this (attach-only; the service decides what it is worth). */
    owner?: unknown;
    /** The account id asking to take the publication down. */
    claimer?: unknown;
  };

  // `list` is the one action that names no project — it asks what is published, so it is answered before the
  // projectId guard rather than being given a sentinel id to satisfy it.
  if (action === 'list') {
    const asked = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : LIST_DEFAULT;
    // v270 — an OWNER narrows the listing to one account's publications (a profile). A blank or non-string
    // owner is the ABSENCE of one, and it is not forwarded: the service answers "everybody" for it.
    const narrowed = typeof owner === 'string' && owner.trim() ? owner.trim() : undefined;
    return NextResponse.json(await listPublications(asked, undefined, narrowed));
  }

  if (typeof projectId !== 'string' || !projectId.trim()) {
    return NextResponse.json({ ok: false, reason: 'projectId is required and must be a non-empty string' }, { status: 400 });
  }

  if (action === 'publish') {
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ ok: false, reason: 'title is required and must be a non-empty string' }, { status: 400 });
    }
    return NextResponse.json(await publishDocument(projectId, title, document, undefined, owner as OwnerClaim | undefined));
  }
  if (action === 'read') {
    return NextResponse.json(await readPublication(projectId));
  }
  if (action === 'unpublish') {
    return NextResponse.json(await unpublishProject(projectId, undefined, claimer as string | undefined));
  }
  return NextResponse.json(
    { ok: false, reason: `action is ${typeof action === 'string' ? `"${action}"` : String(action)}; this route speaks "publish", "read", "unpublish" and "list" only` },
    { status: 400 },
  );
}
