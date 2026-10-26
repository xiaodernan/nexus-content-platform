/**
 * M7 v284 — the LIKES bar on the artifact page.
 *
 * A publication's page is where a reader decides whether it is worth something, so the count belongs
 * THERE rather than only in the Studio. The page is SERVER-RENDERED, and the account lives in the
 * BROWSER's storage (ADR 0018 is why there is no session), so the page can report the count — a fact
 * that does not depend on who is asking — but it CANNOT say whether YOU liked it. The bar therefore
 * offers the LIKE and lets the Studio, where the account lives, do it.
 *
 * PURE and string-returning, like every other renderer here: the route asks the service, this module
 * decides what the page says about it.
 *
 * **What the bar refuses to say:**
 *
 * - **A failed read is NOT zero likes.** "0 likes" and "the likes could not be read" are different facts,
 *   and a page that showed the first when it knew the second would be lying in the way that matters
 *   most: a reader would conclude nobody cared.
 * - **The page does not claim YOU liked it.** It cannot know, and a button that says "Liked"
 *   when the liker is unknown would be a claim the page cannot support.
 *
 * - **v320 — the bar also offers the TAKING-BACK.** The chain was already whole — the intent, the lane,
 *   the Studio’s door, the service’s door — and NOTHING in the product pointed at it: a capability with
 *   no door is a capability nobody can reach, and a reader whose like cannot be taken back has a count
 *   they can only increase. The page still cannot say whether YOU liked it, so the link is an OFFER and
 *   not a claim: the service’s answer is what says whether there was a like to take back, and the Studio
 *   words it that way ("the like on X is gone — N like(s) now"), which is true whether there was one or
 *   not.
 */
import { escapeHtml } from './pageShell';
import { olderWindowWouldHoldSomething } from './pager';

/** What the bar needs to know. */
export interface LikeBarFacts {
  /** The publication the bar is for. */
  projectId: string;
  /** How many accounts liked it, or null when the count could not be read. */
  count: number | null;
  /** Why the count could not be read, when it could not. */
  reason?: string;
  /**
   * v336 — WHO liked it, in the order the service gave them.
   *
   * <p>The follow bar has named its followers since v288, and the like bar said only a count — so a reader
   * could see WHO follows a creator and not WHO liked their work, which is the smaller of the two facts
   * and the one a creator would want to see most. The wire has carried the likers' names all along.
   */
  likers?: { accountId: string; nameText: string; assurance?: string | null; likedText?: string | null }[];
  /**
   * v400 — WHICH window of the likers these rows are, in rows from the newest like, and how to build
   * the URL of another one. The list has been a WINDOW since v350 (the service caps it); a window with
   * no position cannot say which likers it is the window OF, and a page that cannot say that can only
   * offer the head of a long list forever.
   */
  window?: {
    offset?: number;
    /** How many accounts liked the publication — the whole number, and the one a pager pages by. */
    total?: number | null;
    /** How big a window is, as the service answered it. */
    limit?: number;
    pageHref?: (offset: number) => string;
  };
}

/**
 * The bar, as a section of HTML — or an empty string when there is nothing honest to say.
 *
 * A count of zero IS something to say (nobody has liked this yet), and it is different from a failed
 * read; the two are told apart here, and only the second one is silent about the number.
 */
export function renderLikeBar(facts: LikeBarFacts): string {
  if (facts.count === null) {
    return '';
  }
  const label = facts.count === 1 ? '1 like' : `${facts.count} likes`;
  const href = `/?like=${encodeURIComponent(facts.projectId)}`;
  // v320 — the taking-back, as a link to the Studio (the same arrangement as the like itself).
  const undoHref = `/?unlike=${encodeURIComponent(facts.projectId)}`;
  // v336 — the people, not only the number: the same shape the follow bar has used since v288.
  const likers = (facts.likers ?? [])
    .map((l) => {
      const text = l.assurance ? `${l.nameText} · ${l.assurance}` : l.nameText;
      // v348 — and WHEN they liked it: the instant, not "3 days ago" — a relative date goes stale the
      // moment it is written, and a like is a fact about the past that does not move.
      const when = l.likedText ? ` <span class="nexus-liker-when">· on ${escapeHtml(l.likedText)}</span>` : '';
      return `<li data-liker="${escapeHtml(l.accountId)}"><a href="/u/${encodeURIComponent(l.accountId)}">${escapeHtml(text)}</a>${when}</li>`;
    })
    .join('\n');
  const list = likers ? `<ul class="nexus-likes-list">\n${likers}\n</ul>` : '';
  // v350 — the count is the WHOLE number and the list is a WINDOW, so the bar says how many it is not
  // showing: a reader who sees "5 likes" and two names would otherwise read the two as all of them.
  const shown = (facts.likers ?? []).length;
// v400 window line prefix will be added below
  // v400 — the window's position and its end, in ROWS. A like is never soft-deleted (an un-like
  // DELETES its row), so the count IS the row count here — unlike the comment thread's answer (v399),
  // which had to carry a separate total because removed comments keep their rows. The count is the
  // fallback end for a caller that passed no window at all.
  const offset = typeof facts.window?.offset === 'number' && Number.isFinite(facts.window.offset) && facts.window.offset > 0
    ? Math.floor(facts.window.offset)
    : 0;
  const total = typeof facts.window?.total === 'number' && Number.isFinite(facts.window.total)
    ? facts.window.total
    : facts.count;
  const windowSize = typeof facts.window?.limit === 'number' && Number.isFinite(facts.window.limit) && facts.window.limit > 0
    ? Math.floor(facts.window.limit)
    : null;
  const hrefFor = typeof facts.window?.pageHref === 'function' ? facts.window.pageHref : null;
  // v400 — the PAGER, and it is made of LINKS: the artifact page is server-rendered and holds no
  // session (ADR 0018), so the route — the layer that knows the URL — builds the other windows' URLs
  // and this bar draws an <a>. At a boundary there is no page to offer and the control is a <span> with
  // no href: a link that went nowhere would be a lie with an href. "Older" is offered only when the
  // NEXT window would hold something (v398's one rule), so a page the service has already counted as
  // empty is a page this bar does not offer.
  const pageControl = (direction: 'newer' | 'older', target: number | null): string => {
    const text = direction === 'newer' ? '‹ Newer' : 'Older ›';
    const title = direction === 'newer' ? 'the newer likes' : 'the older likes';
    if (target === null || hrefFor === null) {
      return `<span class="nexus-likes-page" data-likes-page="${direction}" title="${title}">${text}</span>`;
    }
    return `<a class="nexus-likes-page" data-likes-page="${direction}" href="${escapeHtml(hrefFor(target))}" title="${title}">${text}</a>`;
  };
  const pager =
    windowSize !== null && hrefFor !== null && total !== null && (offset > 0 || total > shown)
      ? `<div class="nexus-likes-pager">
${pageControl('newer', offset > 0 ? Math.max(offset - windowSize, 0) : null)}
${pageControl('older', olderWindowWouldHoldSomething(offset, windowSize, total) ? offset + windowSize : null)}
</div>`
      : '';
  let more = '';
  if (offset > 0 && shown === 0 && total > 0) {
    // v400 — an empty window on a LATER page is not an empty publication: the service counted the
    // likers and this window holds none of them, which is a fact about the page and not about the work.
    more = ' · this page is past the end — the service answered an empty window';
  } else if (shown > 0 && total > shown) {
    // v400 — and WHICH likers: "the N newest of M" on the first window, the rows' own numbers past it
    // (v386's correction, the shared wording the tip and plan bars received in v395 and v396). The range
    // is in ROWS because the window is rows.
    more = offset <= 0
      ? ` · showing the ${shown} newest of ${total}`
      : ` · showing rows ${offset + 1}–${offset + shown} of ${total}`;
  }
  return `<div class="nexus-likes" data-likes="${facts.count}">
<span class="nexus-likes-count">\u2764 ${escapeHtml(label)}${more}</span>
<a class="nexus-likes-action" href="${escapeHtml(href)}" title="like this publication from the Studio">Like</a>
<a class="nexus-likes-undo" href="${escapeHtml(undoHref)}" title="take the like back from the Studio">Take it back</a>
${list}
${pager}
</div>`;
}

/**
 * Insert the bar into the artifact page, before `</body>`.
 *
 * PURE and testable, like `injectRemixBar`: it asserts nothing about the document, only that the
 * preview renderer's output ends the way it always does. A preview that does not contain `</body>` is
 * returned unchanged rather than corrupted.
 */
export function injectLikeBar(html: string, bar: string): string {
  if (!bar) return html;
  if (!html.includes('</body>')) return html;
  return html.replace('</body>', `${bar}</body>`);
}

/** The styles the bar carries with it — the artifact page's shell belongs to the PREVIEW renderer. */
export const LIKE_BAR_STYLES = `<style>
.nexus-likes{position:fixed;right:16px;bottom:16px;z-index:10;display:flex;gap:10px;align-items:center;background:#12151b;border:1px solid #262b34;border-radius:6px;padding:8px 12px;color:#9aa3b2;font:11px Inter,system-ui,sans-serif}
.nexus-likes-count{color:#e6e8ec;font-weight:600}
.nexus-likes-action{color:#3b82f6;font-weight:600;text-decoration:none}
.nexus-likes-action:hover{text-decoration:underline}
.nexus-likes-list{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:2px}
.nexus-likes-list a{color:#9aa3b2;text-decoration:none}
.nexus-likes-list a:hover{text-decoration:underline;color:#e6e8ec}
.nexus-likes-undo{color:#9aa3b2;font-weight:600;text-decoration:none;border-left:1px solid #262b34;padding-left:10px}
.nexus-likes-undo:hover{text-decoration:underline;color:#e6e8ec}
.nexus-likes-pager{display:flex;gap:10px;align-items:center}
.nexus-likes-page{color:#f59e0b;font-weight:600;text-decoration:none}
.nexus-likes-page:hover{text-decoration:underline}
.nexus-likes-pager span.nexus-likes-page{color:#5b6472;font-weight:400}
</style>`;
