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

/** One follower, in the service's own wire shape. */
export interface FollowerEntry {
  followerId?: unknown;
  followeeId?: unknown;
  createdAt?: unknown;
  handle?: unknown;
  assurance?: unknown;
}

/** A follower reduced to the facts a reader can act on. */
export interface FollowerRow {
  /** The account id — the ADDRESS of the follower, and the link's target. */
  accountId: string;
  /** The name: the handle when the claim carried one, else the account id. */
  nameText: string;
  /** What the follower's claim was worth, or null. */
  assurance: string | null;
}

/**
 * One follower, or `null` when it cannot be shown honestly.
 *
 * A follower needs an account id \u2014 that is the address the link points at \u2014 and a name. A follower with
 * no id is a follower nobody could reach, so it is dropped rather than rendered as a nameless line.
 */
export function toFollowerRow(entry: unknown): FollowerRow | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const f = entry as FollowerEntry;
  if (typeof f.followerId !== 'string' || f.followerId.length === 0) return null;
  const handle = typeof f.handle === 'string' && f.handle.length > 0 ? f.handle : null;
  const assurance = typeof f.assurance === 'string' && f.assurance.length > 0 ? f.assurance : null;
  return {
    accountId: f.followerId,
    nameText: handle ? `@${handle}` : f.followerId,
    assurance,
  };
}

/**
 * v303 — one account of the OTHER direction: the account this one FOLLOWS.
 *
 * <p>The mapping is the other way round from `toFollowerRow`, and that is not a detail: a follow row
 * carries BOTH ends of the edge, and the list of "who I follow" shows the FOLLOWEE while the list of
 * "who follows me" shows the FOLLOWER. Using one mapping for both would render a list of the accounts
 * somebody watches with the wrong names on them.
 */
export function toFollowingRow(entry: unknown): FollowerRow | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const f = entry as { followerId?: unknown; followeeId?: unknown; handle?: unknown; assurance?: unknown };
  if (typeof f.followeeId !== 'string' || f.followeeId.length === 0) return null;
  const handle = typeof f.handle === 'string' && f.handle.length > 0 ? f.handle : null;
  const assurance = typeof f.assurance === 'string' && f.assurance.length > 0 ? f.assurance : null;
  return {
    accountId: f.followeeId,
    nameText: handle ? `@${handle}` : f.followeeId,
    assurance,
  };
}

/** The followers, in the order the service gave them. */
export function toFollowerRows(entries: readonly unknown[]): FollowerRow[] {
  const rows: FollowerRow[] = [];
  for (const entry of entries) {
    const row = toFollowerRow(entry);
    if (row) rows.push(row);
  }
  return rows;
}

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
  /** The followers themselves \u2014 the list, not just the count (v292). */
  followers?: FollowerRow[];
  /**
   * v303 \u2014 the accounts THIS account follows, and how many in all. The other direction of the edge.
   *
   * <p>It lives in the SAME bar as the followers, because two floating panels saying \u201cfollowers\u201d and
   * \u201cfollowing\u201d side by side would be two panels a person has to read together to learn one thing: the
   * shape of this account\u2019s social life.
   */
  following?: FollowerRow[];
  followingCount?: number | null;
}

/**
 * The bar, as a section of HTML \u2014 or an empty string when there is nothing honest to say.
 *
 * The followers are LINKS to their own profiles: an account id is an address, and a follower list that
 * shows an address without a link would be a list nobody could act on.
 */
export function renderFollowBar(facts: FollowBarFacts): string {
  if (facts.followerCount === null) {
    return '';
  }
  const count = facts.followerCount;
  const label = count === 1 ? '1 follower' : `${count} followers`;
  const href = `/?follow=${encodeURIComponent(facts.accountId)}`;
  const who = facts.handle ? `@${facts.handle}` : facts.accountId;
  const followers = (facts.followers ?? [])
    .map((f) => {
      const text = f.assurance ? `${f.nameText} · ${f.assurance}` : f.nameText;
      return `<li data-follower="${escapeHtml(f.accountId)}"><a href="/u/${encodeURIComponent(f.accountId)}">${escapeHtml(text)}</a></li>`;
    })
    .join('\n');
  const list = followers
    ? `<ul class="nexus-followers-list">\n${followers}\n</ul>`
    : '';
  // v303 — the other direction, in the SAME bar: the two lists answer ONE question (the shape of this
  // account's social life) and two panels would make the reader assemble it themselves.
  const following = (facts.following ?? [])
    .map((f) => {
      const text = f.assurance ? `${f.nameText} · ${f.assurance}` : f.nameText;
      return `<li data-following="${escapeHtml(f.accountId)}"><a href="/u/${encodeURIComponent(f.accountId)}">${escapeHtml(text)}</a></li>`;
    })
    .join('\n');
  const followingCount = facts.followingCount ?? (facts.following ?? []).length;
  const followingLabel = followingCount === 1 ? '1 following' : `${followingCount} following`;
  const followingList = following
    ? `<div class="nexus-followers-sub">${escapeHtml(followingLabel)}</div><ul class="nexus-followers-list">\n${following}\n</ul>`
    : '';
  return `<div class="nexus-followers" data-followers="${count}" data-following="${followingCount}">
<span class="nexus-followers-count">${escapeHtml(label)}</span>
<a class="nexus-followers-action" href="${escapeHtml(href)}" title="follow this account from the Studio">Follow ${escapeHtml(who)}</a>
${list}
${followingList}
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
.nexus-followers{position:fixed;right:16px;top:16px;z-index:10;display:flex;flex-wrap:wrap;gap:10px;align-items:center;max-width:340px;background:#12151b;border:1px solid #262b34;border-radius:6px;padding:8px 12px;color:#9aa3b2;font:11px Inter,system-ui,sans-serif}
.nexus-followers-count{color:#e6e8ec;font-weight:600}
.nexus-followers-action{color:#3b82f6;font-weight:600;text-decoration:none}
.nexus-followers-action:hover{text-decoration:underline}
.nexus-followers-list{list-style:none;margin:0;padding:0;flex-basis:100%;display:flex;flex-direction:column;gap:2px;max-height:120px;overflow:auto}
.nexus-followers-sub{color:#9aa3b2;margin-top:4px}
.nexus-followers-sub{color:#9aa3b2;margin-top:4px}
.nexus-followers-list a{color:#cfd6e4;text-decoration:none}
.nexus-followers-list a:hover{text-decoration:underline;color:#3b82f6}
</style>`;
