import { listPublications, readPublication } from '@/lib/publishServer';
import { docToSvg, svgToDataUri } from '@/lib/thumbnail';
import { renderExploreUnavailable } from '@/lib/explore';
import { buildGalleryItems } from '@/lib/gallery';
import { profileFactsOf, renderProfileHtml } from '@/lib/profile';
import { readFollowers } from '@/lib/followServer';
import { FOLLOW_BAR_STYLES, injectFollowBar, renderFollowBar, toFollowerRows } from '@/lib/followBar';
import { readTips } from '@/lib/tipServer';
import { readPlans } from '@/lib/planServer';
import { injectPlanBar, renderPlanBar, toPlanRows, PLAN_BAR_STYLES } from '@/lib/planBar';
import { injectTipBar, renderTipBar, toTipRows, TIP_BAR_STYLES } from '@/lib/tipBar';

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

/**
 * v298 — how many tips the profile page reads. The service caps at 100; the page asks for the cap,
 * because an account can be given many tips and the page states what it carried.
 */
const TIP_LIMIT = 100;

function html(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function GET(request: Request, { params }: { params: Promise<{ accountId: string }> }): Promise<Response> {
  const accountId = decodeURIComponent((await params).accountId);
  const url = new URL(request.url);
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') ?? '0', 10));
  const query = url.searchParams.get('q') ?? '';
  
  if (!accountId.trim()) {
    return html(renderProfileHtml(profileFactsOf('', [], 0, PROFILE_LIMIT, offset, query), []), 200);
  }

  const listing = await listPublications(PROFILE_LIMIT, undefined, accountId, offset, query);
  if (!listing.ok) return html(renderExploreUnavailable(listing.reason ?? 'no reason given'), 503);

  const rows = listing.publications ?? [];
  const items = await buildGalleryItems(
    rows,
    (projectId) => readPublication(projectId),
    (doc, pageId) => svgToDataUri(docToSvg(doc, pageId)),
  );
  const facts = profileFactsOf(accountId, rows, listing.count ?? rows.length, listing.limit ?? PROFILE_LIMIT, offset, query);
  // v288 — the FOLLOWERS. Read independently of the publications: a followers door that could not be read
  // leaves the bar out ENTIRELY, because "0 followers" and "the followers could not be read" are different
  // facts and a page that showed the first when it knew the second would make a reader conclude nobody is
  // watching.
  // v298 — the TIPS. A tip is for an ACCOUNT, so the bar belongs on the profile — the page a reader
  // lands on when they want to know about a person. Read independently: a tips door that could not be read
  // leaves the bar out entirely, because "no tips" and "the tips could not be read" are different facts
  // and a creator's page must not say the first when it knows the second.
  // v301 — the PLANS this creator offers. Read independently: a plans door that could not be read
  // leaves the bar out ENTIRELY, because "this creator offers nothing" and "the plans could not be read"
  // are different facts — and a page that showed the first when it knew the second would say that a
  // creator whose plans are one read away has nothing to offer.
  const offered = await readPlans(accountId);
  const planBar = offered.ok ? renderPlanBar({ accountId, plans: toPlanRows(offered.plans) }) + PLAN_BAR_STYLES : '';
  const tips = await readTips(accountId, TIP_LIMIT);
  const tipBar = tips.ok
    ? renderTipBar({
        accountId,
        count: tips.count,
        totalCents: tips.totalCents,
        // The amounts and the messages, WITHOUT the payers: a page that listed who gave what would turn
        // a small gesture into a public list of who supports whom.
        tips: toTipRows(tips.tips),
      }) + TIP_BAR_STYLES
    : '';
  const followers = await readFollowers(accountId, null);
  const bar = followers.ok
    ? renderFollowBar({
        accountId,
        followerCount: followers.followerCount,
        handle: facts.handle,
        // v292 — the LIST, not just the count: a follower is a LINK to their own profile, because an
        // account id is an address and a list of addresses with no links is a list nobody can act on.
        followers: toFollowerRows(followers.followers),
      }) + FOLLOW_BAR_STYLES
    : '';
  return html(
    injectPlanBar(
      injectTipBar(injectFollowBar(renderProfileHtml(facts, items, offset, query), bar), tipBar),
      planBar,
    ),
    200,
  );
}
