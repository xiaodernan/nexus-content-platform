/**
 * M7 v288 — the browser half of the FOLLOWS lane.
 *
 * The service's address is server-side, so the browser talks to THIS Studio's own `/api/follows`, which
 * forwards to the service. The lane answers with a REASON and never a thrown error — the same rule every
 * lane here keeps.
 */

/**
 * How long a call to the Studio's own door may take — a READ or a write alike. A hung request is
 * worse than a refused one: the panel would say nothing.
 *
 * v294 — and it is 45 seconds, not 10. The Studio's own door is a `next dev` server in this repository,
 * and the FIRST call to a route pays that route's compile: a ten-second timeout was killing requests
 * that were about to be answered, and the lane reported a timeout where the truth was "the server was
 * still building it".
 *
 * v477 — the READS ride it too. `readMyFollowing` fetched with no signal at all, so a door that never
 * answered hung the desk's YOU FOLLOW section forever with no reason to show; a budget that covers
 * only the writes is a budget that believes only the writes can hang.
 */
export const CALL_TIMEOUT_MS = 45_000;

/** A signal that aborts the request when it takes too long. */
function callSignal(): AbortSignal {
  return AbortSignal.timeout(CALL_TIMEOUT_MS);
}

/**
 * Why a call to this lane's door did not answer.
 *
 * <p>A TIMEOUT is not an unreachable door: the door may well be there, and slow. Saying "unreachable"
 * about a door that is merely late is the same kind of lie the house's rule about failed reads is about
 * — a reader who is told the thing is gone when it is only late stops looking for it. The publish lane
 * named this distinction in v294 and the service door in v337; v482 extends the sentence to every lane.
 */
function unreachableReason(error: unknown, door: string): string {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return `${door} did not answer within ${CALL_TIMEOUT_MS / 1000} seconds`;
  }
  return error instanceof Error ? error.message : String(error);
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
    return { ok: false, reason: unreachableReason(error, 'the follows') };
  }
}

/** Take a follow back. */
/** What one read of the accounts this device follows answered. */
export interface FollowingLaneAnswer {
  ok: boolean;
  /** The accounts the device follows, in the service's order. */
  following: { followerId: string; followeeId: string; handle: string | null; assurance: string | null }[];
  /** v380 — the service's count of EVERY account this device follows (the whole table, not the window). */
  count: number;
  /** The cap the service applied. */
  limit: number;
  /**
   * v390 — the ROW this window starts at, echoed from the ask.
   *
   * <p>The answer carries the window it is FOR rather than leaving the panel to remember which ask it
   * belongs to: two reads in flight (an un-follow, then a page) answer in whatever order the network
   * chooses, and an answer that names its own window cannot be mistaken for the other one's.
   */
  offset: number;
  reason?: string;
}

/**
 * READ the accounts this device follows.
 *
 * <p>The follower's own side of the edge — the one the desk's "YOU FOLLOW" section shows. A failed read is
 * NOT an empty list: "you follow nobody" and "the list could not be read" are different facts.
 */
export async function readMyFollowing(
  followerAccountId: string,
  offset: number = 0,
  fetchImpl: FetchLike = fetch,
): Promise<FollowingLaneAnswer> {
  const from = Math.max(offset, 0);
  try {
    const res = await fetchImpl(
      `/api/follows?follower=${encodeURIComponent(followerAccountId)}&offset=${encodeURIComponent(String(from))}`,
      { headers: { accept: 'application/json' }, signal: callSignal() },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, following: [], count: 0, limit: 20, offset: from, reason: `the follows answered HTTP ${res.status} with something that is not JSON` };
    }
    const body = parsed as {
      ok?: unknown;
      following?: unknown;
      followers?: unknown;
      count?: unknown;
      limit?: unknown;
      reason?: unknown;
      message?: unknown;
    };
    if (body.ok === false || !res.ok) {
      const reason =
        typeof body.reason === 'string'
          ? body.reason
          : typeof body.message === 'string'
            ? body.message
            : `the follows answered HTTP ${res.status}`;
      return { ok: false, following: [], count: 0, limit: 20, offset: from, reason };
    }
    const rows = Array.isArray(body.following)
      ? (body.following as { followerId: string; followeeId: string; handle: string | null; assurance: string | null }[])
      : [];
    return {
      ok: true,
      following: rows,
      // v380 — the service counts the WHOLE table now, so this number is every account the device
      // follows and not the window the rows happen to be.
      count: typeof body.count === 'number' ? body.count : rows.length,
      limit: typeof body.limit === 'number' && Number.isFinite(body.limit) ? body.limit : 20,
      offset: from,
    };
  } catch (error) {
    return { ok: false, following: [], count: 0, limit: 20, offset: from, reason: unreachableReason(error, 'the follows') };
  }
}

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
    return { ok: false, reason: unreachableReason(error, 'the follows') };
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
  // v313 — the reason is read whenever the answer is NOT ok, and not only when the body
  // says `ok: false` — a door that answers without it must not swallow the reason either.
  if (answer.ok === false || !res.ok) {
    const reason =
      typeof answer.reason === 'string'
        ? answer.reason
        : typeof answer.message === 'string'
          ? answer.message
          : `the follows answered HTTP ${res.status}`;
    return { ok: false, reason };
  }
  return {
    ok: true,
    followerCount: typeof answer.followerCount === 'number' ? answer.followerCount : undefined,
    following: answer.following === true,
  };
}
