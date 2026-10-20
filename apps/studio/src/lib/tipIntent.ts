/**
 * M7 v298 — the TIP intent, read out of a URL.
 *
 * The profile page's tips bar links here as `/?tip=<accountId>`, and the Studio opens a composer over it
 * — the same arrangement the like, the comment, the report and the follow use: the page is a STATIC
 * rendered page, and the part of the product that can act (and that knows who the device is) is the Studio.
 *
 * PURE: the intent is a string, and reading it is a function of that string.
 */

/** The account to tip, or null when the URL names none. */
export function tipIdFromSearch(search: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const id = new URLSearchParams(query).get('tip');
  return id && id.trim() ? id : null;
}
