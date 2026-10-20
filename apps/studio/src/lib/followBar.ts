/**
 * M7 v288 — the FOLLOWERS on the profile page.
 *
 * A profile is a public view of what an account made, and the followers are part of that view: a reader
 * who lands on a profile wants to know who else is watching. So the page states the count, and offers the
 * follow as a LINK to the Studio — the same arrangement the like and the comment use, for the same
 * reason: the page is SERVER-RENDERED and does not know who the device is (ADR 0018 is why there is no
 * session), while the Studio does.
 *
 * PURE and string-returning, like every other renderer here.
 *
 * **What the bar refuses to say:**
 *
 * - **A failed read is NOT zero followers.** "0 followers" and "the followers could not be read" are
 *   different facts, and a page that showed the first when it knew the second would make a reader
 *   conclude nobody is watching. A count of ZERO, on the other hand, IS a fact.
 * - **The page does not claim YOU follow them.** It cannot know \u2014 the account lives in the browser.
 */
import { escapeHtml } from './pageShell';

/** What the bar needs to know. */
export interface FollowBarFacts {
  /** The account the bar is for. */
  accountId: string;
  /** How many accounts follow it, or null when the count could not be read. */
  followerCount: number | null;
  /** Why the count could not be read, when it could not. */
  reason?: string;
  /** The handle of the account, when the page knows one. */
  handle?: string | null;
}

/**
 * The bar, as a section of HTML \u2014 or an empty string when there is nothing honest to say.
 */
export function renderFollowBar(facts: FollowBarFacts): string {
  if (facts.followerCount === null) {
    return '';
  }
  const count = facts.followerCount;
  const label = count === 1 ? '1 follower' : `${count} followers`;
  const href = `/?follow=${encodeURIComponent(facts.accountId)}`;
  const who = facts.handle ? `@${facts.handle}` : facts.accountId;
  return `<div class="nexus-followers" data-followers="${count}">
<span class="nexus-followers-count">${escapeHtml(label)}</span>
<a class="nexus-followers-action" href="${escapeHtml(href)}" title="follow this account from the Studio">Follow ${escapeHtml(who)}</a>
</div>`;
}

/**
 * Insert the bar into the page, before `</body>`.
 *
 * PURE and testable, like the other injections here: a page without a closing body tag is returned
 * unchanged rather than corrupted.
 */
export function injectFollowBar(html: string, bar: string): string {
  if (!bar) return html;
  if (!html.includes('</body>')) return html;
  return html.replace('</body>', `${bar}</body>`);
}

/** The styles the bar carries with it \u2014 the profile page's shell belongs to the gallery builder. */
export const FOLLOW_BAR_STYLES = `<style>
.nexus-followers{position:fixed;right:16px;top:16px;z-index:10;display:flex;gap:10px;align-items:center;background:#12151b;border:1px solid #262b34;border-radius:6px;padding:8px 12px;color:#9aa3b2;font:11px Inter,system-ui,sans-serif}
.nexus-followers-count{color:#e6e8ec;font-weight:600}
.nexus-followers-action{color:#3b82f6;font-weight:600;text-decoration:none}
.nexus-followers-action:hover{text-decoration:underline}
</style>`;
