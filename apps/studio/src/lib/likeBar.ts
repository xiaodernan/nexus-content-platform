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
 * - **The page does not claim YOU liked it.** It cannot know, and a button that says "Liked" when the
 *   liker is unknown would be a claim the page cannot support.
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
  return `<div class="nexus-likes" data-likes="${facts.count}">
<span class="nexus-likes-count">\u2764 ${escapeHtml(label)}</span>
<a class="nexus-likes-action" href="${escapeHtml(href)}" title="like this publication from the Studio">Like</a>
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
</style>`;
