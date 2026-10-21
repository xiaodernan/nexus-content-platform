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
/**
 * The comment to TAKE BACK, or null when the URL names none.
 *
 * v321 — the undoing of a comment, the same arrangement as the un-like: the artifact page's comments
 * section links here as `/?uncomment={id}`, and the Studio (where the account lives) does it.
 */
export function uncommentIdFromSearch(search: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const id = new URLSearchParams(query).get('uncomment');
  return id && id.trim() ? id : null;
}
