/**
 * M7 v288 — the FOLLOW intent, read out of a URL.
 *
 * The profile page's bar links here as `/?follow=<accountId>`, and the Studio follows on mount — the same
 * arrangement the like and the comment use: the page is a STATIC rendered page, and the part of the
 * product that can act (and that knows who the device is) is the Studio.
 *
 * PURE: the intent is a string, and reading it is a function of that string.
 */

/** The account to follow, or null when the URL names none. */
export function followIdFromSearch(search: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const id = new URLSearchParams(query).get('follow');
  return id && id.trim() ? id : null;
}

/** The account to UNFOLLOW, or null when the URL names none. */
export function unfollowIdFromSearch(search: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const id = new URLSearchParams(query).get('unfollow');
  return id && id.trim() ? id : null;
}
