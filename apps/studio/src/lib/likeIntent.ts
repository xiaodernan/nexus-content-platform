import { claimOf } from './socialClaim';

/**
 * M7 v284 — the LIKE intent, read out of a URL.
 *
 * The artifact page's like bar links here as `/?like=<id>`, the same way the remix bar links as
 * `/?remix=<id>`: the artifact page is a STATIC rendered page, and the part of the product that can
 * act (and that knows who the device is) is the Studio.
 *
 * PURE: the intent is a string, and reading it is a function of that string.
 */

/** The publication to like, or null when the URL names none. */
export function likeIdFromSearch(search: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const id = new URLSearchParams(query).get('like');
  return id && id.trim() ? id : null;
}

/** The publication to UNLIKE, or null when the URL names none. */
export function unlikeIdFromSearch(search: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const id = new URLSearchParams(query).get('unlike');
  return id && id.trim() ? id : null;
}

/**
 * The CLAIM the like travels with, read from the device's own account.
 *
 * A device with no account has NO claim, and the like is then refused by the service — which is the
 * right answer (an anonymous like cannot be counted honestly), and NOT a reason for the client to
 * invent an actor.
 *
 * v288 — the builder itself moved to `socialClaim.ts`, because all three social verbs (like, comment,
 * follow) must build the SAME claim shape: a claim that three modules each build slightly differently is
 * a claim whose three shapes disagree about the same account.
 */
export const likeClaimOf = claimOf;
