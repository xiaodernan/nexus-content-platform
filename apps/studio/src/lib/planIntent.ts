/**
 * M7 v301 — the SUBSCRIBE intent, read out of a URL.
 *
 * The profile page's plans bar links here as `/?subscribe=<planId>`, and the Studio backs the plan on
 * mount — the same arrangement the like, the comment, the report, the follow and the tip use: the page is a
 * STATIC rendered page, and the part of the product that can act (and that knows who the device is) is the
 * Studio.
 *
 * PURE: the intent is a string, and reading it is a function of that string.
 */

/** The plan to back, or null when the URL names none. */
export function subscribeIdFromSearch(search: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const id = new URLSearchParams(query).get('subscribe');
  return id && id.trim() ? id : null;
}
