import { listPublications, readPublication } from '@/lib/publishServer';
import { docToSvg, svgToDataUri } from '@/lib/thumbnail';
import { renderExploreUnavailable } from '@/lib/explore';
import { buildGalleryItems } from '@/lib/gallery';
import { profileFactsOf, renderProfileHtml } from '@/lib/profile';

/**
 * M7 v270 (ADR 0016 amendment 270): `/u/{accountId}` — the PROFILE page, what ONE account has published.
 *
 * A route HANDLER, like `/explore` and `/p/{id}`: what it answers with is not a React tree but a page drawn
 * from the service's own answer. The hop to `services/nexus-api` is server-side — the browser never learns
 * the address — and the cards are built by the SHARED gallery builder, so a profile and the gallery draw the
 * same card with the same code.
 *
 * The service's own rule (v270's service half) is what makes the page honest: a BLANK owner is the ABSENCE
 * of one and answers an EMPTY list, so "nobody" is never the whole table. And because the service holds no
 * account table — an account exists in it only as far as publications NAME it — the page can show the handle
 * and the assurance the claims carry and nothing else. It cannot show a display name, a bio, a follower count
 * or a joined date, and it cannot tell an account that has published nothing from one that does not exist.
 * Both of those are said on the page rather than left to be discovered.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The profile's fan-out cap. Each row costs one extra read, so this is the price of the page. */
const PROFILE_LIMIT = 24;

function html(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function GET(request: Request, { params }: { params: Promise<{ accountId: string }> }): Promise<Response> {
  const accountId = decodeURIComponent((await params).accountId);
  const url = new URL(request.url);
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') ?? '0', 10));
  
  if (!accountId.trim()) {
    return html(renderProfileHtml(profileFactsOf('', [], 0, PROFILE_LIMIT, offset), []), 200);
  }

  const listing = await listPublications(PROFILE_LIMIT, undefined, accountId, offset);
  if (!listing.ok) return html(renderExploreUnavailable(listing.reason ?? 'no reason given'), 503);

  const rows = listing.publications ?? [];
  const items = await buildGalleryItems(
    rows,
    (projectId) => readPublication(projectId),
    (doc, pageId) => svgToDataUri(docToSvg(doc, pageId)),
  );
  const facts = profileFactsOf(accountId, rows, listing.count ?? rows.length, listing.limit ?? PROFILE_LIMIT, offset);
  return html(renderProfileHtml(facts, items, offset), 200);
}
