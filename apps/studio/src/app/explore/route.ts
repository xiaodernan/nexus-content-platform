import { listPublications, readPublication } from '@/lib/publishServer';
import { docToSvg, svgToDataUri } from '@/lib/thumbnail';
import { renderExploreHtml, renderExploreUnavailable } from '@/lib/explore';
import { buildGalleryItems } from '@/lib/gallery';

/**
 * M7 v241 (ADR 0016 amendment 241): `/explore` — what is published, at a URL a person can browse.
 *
 * A route HANDLER, like `/p/{id}`: what it answers with is not a React tree but a gallery drawn from the
 * canonical model. The hop to `services/nexus-api` is server-side (the browser never learns the address).
 *
 * Two answers, and the status codes carry the difference:
 *   200 — the gallery (possibly empty)
 *   503 — the SERVICE could not be reached or answered unusably. NOT an empty gallery: "nothing is published"
 *         and "the thing that knows what is published is not running" are different facts.
 *
 * The listing carries NO documents (the service's own shape), so a thumbnail needs a second read per row. The
 * cap bounds that fan-out, and a row whose document cannot be read is shown with its reason rather than a
 * blank card.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The gallery's fan-out cap. Each row costs one extra read, so this is the price of the page. */
const EXPLORE_LIMIT = 24;

function html(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function GET(): Promise<Response> {
  const listing = await listPublications(EXPLORE_LIMIT);
  if (!listing.ok) return html(renderExploreUnavailable(listing.reason ?? 'no reason given'), 503);

  const rows = listing.publications ?? [];
  // v265 — the service-answer → card mapping is the PURE half's job (`toExploreItem`), not the route's. It
  // used to be written here, where nothing could assert it: the renderer had byline cases and no test could
  // say the page actually RECEIVES an owner to render.
  // v270 — and the per-row read-and-draw is the SHARED builder's, because the profile page needs the same
  // fan-out and two copies of it would drift.
  const items = await buildGalleryItems(
    rows,
    (projectId) => readPublication(projectId),
    (doc, pageId) => svgToDataUri(docToSvg(doc, pageId)),
  );

  return html(renderExploreHtml(items, { count: listing.count ?? rows.length, limit: listing.limit ?? EXPLORE_LIMIT }), 200);
}
