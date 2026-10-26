import { readPublication } from '@/lib/publishServer';
import { renderArtifactHtml, renderArtifactMissing, renderArtifactUnnamed, renderArtifactUnavailable } from '@/lib/artifact';
import { readRemixedFrom } from '@/lib/lineage';
import { readAuditTrail } from '@/lib/auditServer';
import { historyRowsOf, injectHistory, renderHistoryHtml } from '@/lib/history';
import { readReports } from '@/lib/reportServer';
import { injectReportBar, renderReportBar, toReportRows, REPORT_BAR_STYLES } from '@/lib/reportBar';
import { readLikes } from '@/lib/likeServer';
import { injectLikeBar, renderLikeBar, LIKE_BAR_STYLES } from '@/lib/likeBar';
import { readComments } from '@/lib/commentServer';
import { COMMENT_STYLES, renderCommentsHtml, toCommentRows } from '@/lib/commentBar';
import { doorName } from '@/lib/doorName';

/**
 * M7 v196 (ADR 0016 amendment 196): `/p/{projectId}` — a published project at a URL a PERSON can open.
 *
 * A route HANDLER rather than a page, because what it answers with is not a React tree: it is the artifact
 * itself, drawn by the Studio's own preview renderer. Serving that HTML directly is what makes "what you
 * published is what you get" literally true — the bytes here are the bytes the local Preview produces, not a
 * second rendering of the same document.
 *
 * Node runtime, because the hop to `services/nexus-api` is server-side (the browser never learns the
 * service's address).
 *
 * Four answers, and the status codes carry the difference:
 *   200 — the artifact
 *   400 — the segment NAMES no publication (v523: a blank after trimming is not an address, and asking
 *         about one is how a page ends up reading a LISTING as a publication)
 *   404 — nothing is published under this id (it may never have been, or it was taken down)
 *   503 — the SERVICE could not be reached or answered unusably. NOT a 404: "nothing is published here" and
 *         "the thing that knows what is published is not running" are different facts, and a reader given
 *         the wrong one looks for the problem in the wrong place.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * v280 — how many trail entries the artifact page reads. The service caps at 100; the page asks for the
 * cap, because a publication's own history can be anywhere in a trail that only ever grows.
 */
const HISTORY_LIMIT = 100;

/**
 * v296 — how many reports the artifact page reads. The service caps at 100; the page asks for the cap,
 * because a publication can be reported many times and the page states what it carried.
 */
const REPORT_LIMIT = 100;

/**
 * v286 — how many comments the artifact page reads. The service caps at 100; the page asks for the cap,
 * because a thread can be long and the page states what it carried.
 */
const COMMENT_LIMIT = 100;
// v400 — the likers window's own size: the service's DEFAULT, so the page shows the same twenty
// likers it has always shown and can now page past them.
const LIKE_LIMIT = 20;

/**
 * v286 — insert the comments section before the closing body tag. PURE and testable, like the other
 * injections here: a preview with no closing body tag is returned unchanged rather than corrupted.
 */
function injectComments(html: string, section: string): string {
  if (!section) return html;
  if (!html.includes('</body>')) return html;
  return html.replace('</body>', `${section}</body>`);
}

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }): Promise<Response> {
  // v523 — the segment is a NAME, and this page decodes it ONCE. Next has already decoded a dynamic
  // segment before handing it over (`base-server.js`'s `prepareDestination`, the file dev and prod share),
  // so a route that decodes again runs a SECOND decode over bytes that already mean what they say: a
  // publication id carrying a percent threw `URIError` out of the handler — a 500 with no sentence and no
  // ask — and a double-encoded id asked about a third value nobody typed. Then the one rule the doors have
  // kept since amendment 501: decide on the trimmed bytes and FORWARD them, so the page the reader lands
  // on and the key the service looks up name the same publication.
  const projectId = doorName((await params).projectId);
  if (projectId === '') {
    return new Response(renderArtifactUnnamed(), {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  // v399 — the comments window's own page, in rows from the newest comment. The gallery on the
  // profile page (v270) and the profile page's four lists (v395/v396/v397) page the same way, each on
  // its own parameter, so a reader on comment page 3 keeps their place in everything else on the page.
  const url = new URL(request.url);
  const commentOffset = Math.max(0, Number.parseInt(url.searchParams.get('commentOffset') ?? '0', 10));
  // v400 — the likers window's own page, in rows from the newest like. The comments window pages on its
  // own parameter (v399), so a reader on liker page 3 keeps their place in the thread and vice versa.
  const likeOffset = Math.max(0, Number.parseInt(url.searchParams.get('likeOffset') ?? '0', 10));
  const answer = await readPublication(projectId);

  if (answer.ok) {
    const doc = answer.document as Record<string, unknown> | null | undefined;
    const remixedFrom = readRemixedFrom(doc);
    const page = renderArtifactHtml(
      { projectId, title: answer.title, version: answer.version, publishedAt: answer.publishedAt, document: answer.document },
      answer.owner ?? null,
      remixedFrom,
    );
    // v280 — the publication's OWN history. The trail is read server-side (the same hop the publication
    // itself was read through), and a FAILED read does NOT take the page down: an artifact that cannot show
    // its history is still an artifact, and a page that 500s because the trail was unreachable would make
    // the publication unreachable for a reason that has nothing to do with it.
    // v296 — the REPORTS. Read independently again: a reports door that could not be read leaves the bar
    // out ENTIRELY, because "0 reports" and "the reports could not be read" are different facts — and a
    // reader misled into thinking nobody complained is the one reader a report page must not mislead.
    // v339 — the four side sources are read TOGETHER. They are four independent facts about the
    // same publication, and reading them one after another made the page wait for their SUM: a service
    // that was slow by a second made the reader wait four seconds. Now the page waits for the SLOWEST
    // of the four, and nothing else about the page changes — the same reads, the same bars, the same
    // "a failed read leaves its section out" rule.
    const [reports, trail, likes, comments] = await Promise.all([
      readReports(projectId, REPORT_LIMIT),
      readAuditTrail({ limit: HISTORY_LIMIT }),
      // v400 — the likers list pages too, the same way the comments thread does (v399): the window's
      // own page, in rows, so a reader on a publication liked by more accounts than the cap can reach
      // the older likers instead of being shown the head forever.
      readLikes(projectId, LIKE_LIMIT, likeOffset),
      // v399 — the comments thread pages too, the same way the profile page's four lists do: the
      // window's own page, in rows, so a reader on a thread longer than the cap can reach the older
      // comments instead of being shown the head forever.
      readComments(projectId, COMMENT_LIMIT, commentOffset),
    ]);
    const reportBar = reports.ok
      ? renderReportBar({
          projectId,
          count: reports.count,
          // The reasons, WITHOUT the reporters: a page that named the reporter would turn a report into
          // a public accusation with no moderation behind it.
          reports: toReportRows(reports.reports),
        }) + REPORT_BAR_STYLES
      : '';
    const history = trail.ok
      ? renderHistoryHtml(historyRowsOf(trail.entries ?? [], projectId), trail.carried)
      : '';
    // v400 — the likers pager is a LINK for the same reason every other pager on a server-rendered
    // page is: the route is the layer that knows the URL. It moves ONE window and keeps the reader's
    // place in the page's other windows (there is one query parameter per window, and the builder only
    // touches its own).
    const likePageHref = (nextOffset: number): string => {
      const params = new URLSearchParams(url.search);
      if (nextOffset > 0) params.set('likeOffset', String(nextOffset));
      else params.delete('likeOffset');
      const search = params.toString();
      return search ? `${url.pathname}?${search}` : url.pathname;
    };
    // v284 — the LIKES bar. Read independently of the history and of the document: a count that could
    // not be read leaves the bar out ENTIRELY, because "0 likes" and "the likes could not be read" are
    // different facts and a page that showed the first when it knew the second would be lying in the way
    // that matters most — a reader would conclude nobody cared.
    // v336 — and WHO liked it, not only how many: the wire has carried the likers' names all along,
    // and the follow bar has named its followers since v288.
    const bar = likes.ok
      ? renderLikeBar({
          projectId,
          count: likes.count,
          likers: (likes.likes ?? []).map((l) => ({
            accountId: l.accountId,
            nameText: l.handle ? `@${l.handle}` : l.accountId,
            assurance: l.assurance ?? null,
            // v348 — and when they liked it: the service's own instant, in UTC, in the same style as
            // the profile bar's dates (v341-v343) and the tip receipt's (v333).
            likedText:
              typeof l.createdAt === 'number' && Number.isFinite(l.createdAt)
                ? new Date(l.createdAt).toISOString().replace('.000Z', 'Z')
                : null,
          })),
          // v400 — which window this is, how big it is, where the likers end, and where the next
          // window lives. The service pages by rows and echoes the window it answered, so the bar can
          // say WHICH likers it is showing and offer the next page as a link.
          window: {
            offset: likes.offset ?? likeOffset,
            total: likes.count,
            limit: likes.limit ?? LIKE_LIMIT,
            pageHref: likePageHref,
          },
        })
      : '';
    // v399 — the comments pager is a LINK for the same reason every other pager on a server-rendered
    // page is: the route is the layer that knows the URL. It moves ONE window and keeps the reader's
    // place in the page's other windows (there is one query parameter per window, and the builder only
    // touches its own).
    const commentPageHref = (nextOffset: number): string => {
      const params = new URLSearchParams(url.search);
      if (nextOffset > 0) params.set('commentOffset', String(nextOffset));
      else params.delete('commentOffset');
      const search = params.toString();
      return search ? `${url.pathname}?${search}` : url.pathname;
    };
    // v286 — the COMMENTS. Read independently again: a comments door that could not be read leaves the
    // section out rather than claiming the publication has no comments.
    const commentSection = comments.ok
      ? renderCommentsHtml(toCommentRows(comments.comments), comments.visible, projectId, comments.limit, {
          // v399 — which window this is, how big it is, where the thread ends, and where the next
          // window lives. The service pages by rows and echoes the window it answered, so the section
          // can say WHICH comments it is showing and offer the next page as a link.
          offset: comments.offset ?? commentOffset,
          total: comments.total,
          pageHref: commentPageHref,
        }) +
        COMMENT_STYLES
      : '';
    return new Response(
      injectComments(
        injectReportBar(
          injectLikeBar(injectHistory(page, history), bar ? bar + LIKE_BAR_STYLES : ''),
          reportBar,
        ),
        commentSection,
      ),
      {
      status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      },
    );
  }

  // The lane reports a 404 STRUCTURALLY (`notFound`), rather than this route pattern-matching its sentence:
  // a route that read the wording would start answering 503 the day someone reworded it, and the difference
  // between "nothing is published here" and "the service is down" is the whole reason there are two pages.
  if (answer.notFound) {
    return new Response(renderArtifactMissing(projectId), {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return new Response(renderArtifactUnavailable(answer.reason ?? 'no reason given'), {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
