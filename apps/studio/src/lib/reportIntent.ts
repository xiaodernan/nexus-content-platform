/**
 * M7 v296 — the REPORT intent, read out of a URL.
 *
 * The artifact page's report bar links here as `/?report=<id>`, and the Studio opens a composer over it —
 * the same arrangement the like, the comment and the follow use: the page is a STATIC rendered page, and
 * the part of the product that can act (and that knows who the device is) is the Studio.
 *
 * PURE: the intent is a string, and reading it is a function of that string.
 */

/** The publication to report, or null when the URL names none. */
export function reportIdFromSearch(search: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const id = new URLSearchParams(query).get('report');
  return id && id.trim() ? id : null;
}
