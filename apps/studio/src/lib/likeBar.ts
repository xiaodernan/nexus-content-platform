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
  likers?: { accountId: string; nameText: string; assurance?: string | null }[];
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
      return `<li data-liker="${escapeHtml(l.accountId)}"><a href="/u/${encodeURIComponent(l.accountId)}">${escapeHtml(text)}</a></li>`;
    })
    .join('\n');
  const list = likers ? `<ul class="nexus-likes-list">\n${likers}\n</ul>` : '';
  return `<div class="nexus-likes" data-likes="${facts.count}">
<span class="nexus-likes-count">\u2764 ${escapeHtml(label)}</span>
<a class="nexus-likes-action" href="${escapeHtml(href)}" title="like this publication from the Studio">Like</a>
<a class="nexus-likes-undo" href="${escapeHtml(undoHref)}" title="take the like back from the Studio">Take it back</a>
${list}
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
</style>`;
