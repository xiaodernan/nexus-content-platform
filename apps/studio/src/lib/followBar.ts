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
  /**
   * v343 — WHEN the follow happened, in a reader's words — or null when the wire did not say.
   *
   * <p>The service has carried the instant since the follow's own beginning, and the tip and plan bars on
   * the SAME page said their dates since v341 and v342; the follow bar said nothing. A follower with no
   * date on them is a name with no history.
   */
  followedText: string | null;
}

/**
 * One follower, or `null` when it cannot be shown honestly.
 *
 * A follower needs an account id \u2014 that is the address the link points at \u2014 and a name. A follower with
 * no id is a follower nobody could reach, so it is dropped rather than rendered as a nameless line.
 */
/**
 * WHEN a follow happened, in a reader's words — or null when the wire did not say.
 *
 * <p>The instant is the service's own, in UTC, in the same style as the tip bar's dates (v341): one
 * clock, one style, so a reader comparing a follow's date with a tip's date is reading two dates written
 * the same way.
 */
function followHappenedTextOf(createdAt: unknown): string | null {
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
  return new Date(createdAt).toISOString().replace('.000Z', 'Z');
}

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
    // v343 — and when it happened. The instant is the service's own, in UTC, in the same style as the
    // tip bar's dates (v341) and the plan bar's (v342).
    followedText: followHappenedTextOf(f.createdAt),
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
  const f = entry as { followerId?: unknown; followeeId?: unknown; createdAt?: unknown; handle?: unknown; assurance?: unknown };
  if (typeof f.followeeId !== 'string' || f.followeeId.length === 0) return null;
  const handle = typeof f.handle === 'string' && f.handle.length > 0 ? f.handle : null;
  const assurance = typeof f.assurance === 'string' && f.assurance.length > 0 ? f.assurance : null;
  return {
    accountId: f.followeeId,
    nameText: handle ? `@${handle}` : f.followeeId,
    assurance,
    // v343 — and when it happened, in this direction too: the follow row carries both ends of the edge
    // and the same instant.
    followedText: followHappenedTextOf(f.createdAt),
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
  /**
   * v397 — WHICH window of the FOLLOWERS the bar is showing, in rows from the newest — the same
   * rows the service pages by (v390 taught the other direction; this is the direction that had no
   * pager at all). A window with no position cannot say which followers it is the window OF.
   */
  followersOffset?: number;
  /** v397 — the followers window's SIZE, as the service answered it. */
  followersLimit?: number;
  /**
   * v397 — how to build the URL of another followers window. The same shape the tip bar (v395) and
   * the plan bar (v396) got: the page is server-rendered and holds no session (ADR 0018), so its pager
   * is a LINK and not a button, and a bar given no builder draws no pager at all.
   */
  followersPageHref?: (offset: number) => string;
  /** v397 — the same three facts for the OTHER direction in this bar. */
  followingOffset?: number;
  /** v397 — the following window's SIZE, as the service answered it. */
  followingLimit?: number;
  /** v397 — how to build the URL of another following window. */
  followingPageHref?: (offset: number) => string;
}

/** A window's size, when the wire named a positive one — a pager that does not know the window's size cannot name the page it would offer. */
function windowSizeOf(limit: number | undefined): number | null {
  return typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;
}

/** A window's position, in rows from the newest. A missing or negative one is the first window. */
function windowOffsetOf(offset: number | undefined): number {
  return typeof offset === 'number' && Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
}

/**
 * v397 — WHICH rows a list is showing, in the shared wording (v386's correction, which the tip bar
 * and the plan bar received in v395 and v396): the first window says it is the newest N of M, a later
 * one names its rows, and an empty window past the end says it is past the end — the emptiness is a
 * fact about the PAGE, not about the account.
 */
function followWindowLine(count: number | null, shown: number, offset: number): string {
  if (count === null || count <= shown) return '';
  if (shown <= 0) {
    return offset > 0 ? ' · this page is past the end — the service answered an empty window' : '';
  }
  if (offset <= 0) return ` · showing the ${shown} newest of ${count}`;
  return ` · showing ${offset + 1}–${offset + shown} of ${count}`;
}

/**
 * v397 — the PAGER for one of the bar's two lists, and it is made of LINKS: the profile page is
 * server-rendered and cannot act (ADR 0018), so the route — the layer that knows the URL — builds the
 * other windows' URLs and the bar draws an <a>. At a boundary there is no page to offer and the control
 * is a <span> with no href: a link that went nowhere would be a lie with an href. "Older" is offered
 * only when the NEXT window would hold something — the whole-table count rides on every answer, so a
 * page the service has already counted as empty is a page the bar does not offer.
 */
function followPager(
  count: number | null,
  shown: number,
  offset: number,
  windowSize: number | null,
  hrefFor: ((offset: number) => string) | null,
  attribute: 'followers' | 'following',
  noun: string,
): string {
  if (windowSize === null || hrefFor === null) return '';
  if (!(offset > 0 || (count !== null && count > shown))) return '';
  const control = (direction: 'newer' | 'older', target: number | null): string => {
    const text = direction === 'newer' ? '‹ Newer' : 'Older ›';
    const title = direction === 'newer' ? `the newer ${noun}` : `the older ${noun}`;
    if (target === null) {
      return `<span class="nexus-followers-page" data-${attribute}-page="${direction}" title="${title}">${text}</span>`;
    }
    return `<a class="nexus-followers-page" data-${attribute}-page="${direction}" href="${escapeHtml(hrefFor(target))}" title="${title}">${text}</a>`;
  };
  return `<div class="nexus-followers-pager">
${control('newer', offset > 0 ? Math.max(offset - windowSize, 0) : null)}
${control('older', count !== null && offset + windowSize < count ? offset + windowSize : null)}
</div>`;
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
      // v343 — and WHEN it happened: the instant, not "3 days ago" — a relative date goes stale the
      // moment it is written, and a follow is a fact about the past that does not move.
      const when = f.followedText ? ` <span class="nexus-follower-when">· on ${escapeHtml(f.followedText)}</span>` : '';
      return `<li data-follower="${escapeHtml(f.accountId)}"><a href="/u/${encodeURIComponent(f.accountId)}">${escapeHtml(text)}</a>${when}</li>`;
    })
    .join('\n');
  const list = followers
    ? `<ul class="nexus-followers-list">\n${followers}\n</ul>`
    : '';
  // v350 — the count is the WHOLE number and the list is a WINDOW, so the bar says how many it is not
  // showing: a reader who sees "5 followers" and two names would otherwise read the two as all of them.
  // v397 — and past the first window the line says WHICH followers (the shared wording's third
  // argument, the one the tip and plan bars received in v395 and v396).
  // v398 — the count is the whole number and the window line is self-describing, so a reader who
  // sees "5 followers · showing the 2 newest of 5" knows the 5 is the total desk count, not
  // a fact about the windowed list. v398 — add the "of these N rows" prefix when a window is shown,
  // matching the pattern from moderation tally (v377) and trail summary (v399).
  const shownFollowers = (facts.followers ?? []).length;
  const followersOffset = windowOffsetOf(facts.followersOffset);
  const moreFollowers = followWindowLine(count, shownFollowers, followersOffset);
  // v398 — prefix the count+window line with "of these N rows:" when a window is active,
// so the reader knows the count is the whole desk, not the window.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const followerCountLabel = shownFollowers > 0 && count > 0
    ? `of these ${shownFollowers} rows: ${label}${moreFollowers}`
    : `${label}${moreFollowers}`;
  /* eslint-enable @typescript-eslint/no-unused-vars */
  const followersPager = followPager(
    count,
    shownFollowers,
    followersOffset,
    windowSizeOf(facts.followersLimit),
    typeof facts.followersPageHref === 'function' ? facts.followersPageHref : null,
    'followers',
    'followers',
  );
  // v303 — the other direction, in the SAME bar: the two lists answer ONE question (the shape of this
  // account's social life) and two panels would make the reader assemble it themselves.
  const following = (facts.following ?? [])
    .map((f) => {
      const text = f.assurance ? `${f.nameText} · ${f.assurance}` : f.nameText;
      // v343 — and WHEN it happened, in this direction too.
      const when = f.followedText ? ` <span class="nexus-follower-when">· on ${escapeHtml(f.followedText)}</span>` : '';
      return `<li data-following="${escapeHtml(f.accountId)}"><a href="/u/${encodeURIComponent(f.accountId)}">${escapeHtml(text)}</a>${when}</li>`;
    })
    .join('\n');
  const followingCount = facts.followingCount ?? (facts.following ?? []).length;
  // v350 — and the same note for the OTHER list in this bar: it is a window too, and the count beside
  // it is the whole number. v397 — and it pages too, with the same shape and the same wording.
  // v398 — and it is self-describing with the "of these N rows" prefix, matching the followers side.
  // Define the label first so it can be used in the prefixed count line.
  const followingLabel = followingCount === 1 ? '1 following' : `${followingCount} following`;
  const shownFollowing = (facts.following ?? []).length;
  const followingOffset = windowOffsetOf(facts.followingOffset);
  const moreFollowing = followWindowLine(followingCount, shownFollowing, followingOffset);
  // v398 — prefix the following count+window line with "of these N rows:" when a window is shown.
  const followingCountLabel = shownFollowing > 0 && followingCount > 0
    ? `of these ${shownFollowing} rows: ${followingLabel}${moreFollowing}`
    : `${followingLabel}${moreFollowing}`;
  const followingPager = followPager(
    followingCount,
    shownFollowing,
    followingOffset,
    windowSizeOf(facts.followingLimit),
    typeof facts.followingPageHref === 'function' ? facts.followingPageHref : null,
    'following',
    'accounts this one follows',
  );
  const followingList = following
    ? `<div class="nexus-followers-sub">${escapeHtml(followingCountLabel)}</div><ul class="nexus-followers-list">\n${following}\n</ul>${followingPager}`
    : '';
  return `<div class="nexus-followers" data-followers="${count}" data-following="${followingCount}">
<span class="nexus-followers-count">${escapeHtml(label)}${moreFollowers}</span>
<a class="nexus-followers-action" href="${escapeHtml(href)}" title="follow this account from the Studio">Follow ${escapeHtml(who)}</a>
${list}
${followersPager}
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
.nexus-follower-when{color:#9aa3b2;margin-left:4px}
.nexus-followers-pager{flex-basis:100%;display:flex;gap:10px;align-items:center;margin-top:2px}
.nexus-followers-page{color:#f59e0b;font-weight:600;text-decoration:none}
.nexus-followers-page:hover{text-decoration:underline}
.nexus-followers-pager span.nexus-followers-page{color:#5b6472;font-weight:400}
.nexus-followers-list a{color:#cfd6e4;text-decoration:none}
.nexus-followers-list a:hover{text-decoration:underline;color:#3b82f6}
</style>`;
