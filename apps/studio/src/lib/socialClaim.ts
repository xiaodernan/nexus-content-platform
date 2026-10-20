/**
 * M7 v288 — the CLAIM a social verb travels with.
 *
 * The account lives in the BROWSER's storage, and the service is one hop behind the Studio's own route,
 * so the claim has to be attached on THIS side of the wire: the server cannot read a browser's
 * localStorage, and the browser must not hold the service's address.
 *
 * ONE builder for all three social verbs (like, comment, follow), because a claim that three modules
 * each build slightly differently is a claim whose three shapes disagree about the same account.
 *
 * A device with NO account has NO claim \u2014 and the client does not invent one. The service refuses an
 * accountless social act BY NAME (v283, v285, v287), and an invented account id would be an action
 * nobody took.
 */
export interface SocialClaim {
  accountId: string;
  handle: string | null;
  assurance: string | null;
  claimedAt: number | null;
}

/** The claim for a device's account, or null when the device has none. */
export function claimOf(
  accountId: string | null,
  handle: string | null,
  assurance: string | null,
): SocialClaim | null {
  if (!accountId || !accountId.trim()) return null;
  return {
    accountId: accountId.trim(),
    handle: handle && handle.trim() ? handle.trim() : null,
    assurance: assurance && assurance.trim() ? assurance.trim() : null,
    claimedAt: null,
  };
}
