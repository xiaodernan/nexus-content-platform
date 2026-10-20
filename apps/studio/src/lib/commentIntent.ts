/**
 * M7 v286 — the COMMENT intent, read out of a URL.
 *
 * The artifact page links a reader here as `/?comment=<id>`, and the Studio opens a composer over it.
 *
 * PURE: the intent is a string, and reading it is a function of that string.
 */

/** The publication to comment on, or null when the URL names none. */
export function commentIdFromSearch(search: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const id = new URLSearchParams(query).get('comment');
  return id && id.trim() ? id : null;
}
