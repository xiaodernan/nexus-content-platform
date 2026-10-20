/**
 * M7 v288 — the browser half of the FOLLOWS lane.
 *
 * The service's address is server-side, so the browser talks to THIS Studio's own `/api/follows`, which
 * forwards to the service. The lane answers with a REASON and never a thrown error — the same rule every
 * lane here keeps.
 */

/** How long a write may take. A hung request is worse than a refused one: the panel would say nothing. */
const WRITE_TIMEOUT_MS = 10_000;

/** A signal that aborts the request when it takes too long. */
function callSignal(): AbortSignal {
  return AbortSignal.timeout(WRITE_TIMEOUT_MS);
}

export interface FollowLaneAnswer {
  ok: boolean;
  followerCount?: number;
  following?: boolean;
  reason?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Follow an account. */
export async function followAccount(
  accountId: string,
  claim: { accountId: string; handle?: string | null; assurance?: string | null; claimedAt?: number | null },
  fetchImpl: FetchLike = fetch,
): Promise<FollowLaneAnswer> {
  try {
    const res = await fetchImpl('/api/follows', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ accountId, claim }),
      signal: callSignal(),
    });
    return readAnswer(res, await safeJson(res));
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Take a follow back. */
export async function unfollowAccount(
  accountId: string,
  claimerAccountId: string,
  fetchImpl: FetchLike = fetch,
): Promise<FollowLaneAnswer> {
  try {
    const res = await fetchImpl(`/api/follows/${encodeURIComponent(accountId)}?claimer=${encodeURIComponent(claimerAccountId)}`, {
      method: 'DELETE',
      headers: { accept: 'application/json' },
      signal: callSignal(),
    });
    return readAnswer(res, await safeJson(res));
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * One answer, from the response and its body.
 *
 * The count is read ONLY when the answer says `ok` — a refusal carries a reason and no numbers, and a
 * lane that filled in a count of zero on a refusal would make a refused follow look like a follow that
 * found nobody.
 */
function readAnswer(res: Response, body: unknown): FollowLaneAnswer {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: `the follows answered HTTP ${res.status} with something that is not JSON` };
  }
  const answer = body as { ok?: unknown; followerCount?: unknown; following?: unknown; reason?: unknown; message?: unknown };
  if (answer.ok === false) {
    const reason =
      typeof answer.reason === 'string'
        ? answer.reason
        : typeof answer.message === 'string'
          ? answer.message
          : `the follows answered HTTP ${res.status}`;
    return { ok: false, reason };
  }
  if (!res.ok) {
    return { ok: false, reason: `the follows answered HTTP ${res.status}` };
  }
  return {
    ok: true,
    followerCount: typeof answer.followerCount === 'number' ? answer.followerCount : undefined,
    following: answer.following === true,
  };
}
