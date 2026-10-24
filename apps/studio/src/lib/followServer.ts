/**
 * M7 v288 — the server-side half of the FOLLOWS reader and writer.
 *
 * The service's address is server-side, and both the profile page (server-rendered) and the Studio's own
 * route (server-side) read and write through here.
 *
 * A failed call answers with a REASON rather than a thrown error: a profile page that says "the followers
 * could not be read" is an honest page, and one that throws into a route handler is a 500 for a page
 * whose PUBLICATIONS are perfectly fine.
 */
import { nexusApiBase } from './publishServer';
import { serviceCallSignal, serviceUnreachableReason } from './serviceCall';

/** One follower, in the service's own wire shape. */
export interface FollowerEntry {
  followerId: string;
  followeeId: string;
  createdAt: number;
  handle?: string | null;
  assurance?: string | null;
}

/**
 * What one read of the FOLLOWING list answered — the accounts an account follows, the other
 * direction of the edge.
 */
export interface FollowingAnswer {
  ok: boolean;
  /** The accounts the account follows, newest first. */
  following: FollowerEntry[];
  /** How many in all — the service's count, which can be larger than the window. */
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

/** What one read of the followers answered. */
export interface FollowersAnswer {
  ok: boolean;
  /** How many accounts follow the account. */
  followerCount: number;
  /** The followers themselves, newest first. */
  followers: FollowerEntry[];
  /** Whether the VIEWER follows it, when the service was asked. */
  following?: boolean;
  /**
   * v397 — the cap the service applied, and the ROW this window starts at, echoed from the ask —
   * the same two numbers the following direction's answer has carried since v390 and the plans answer
   * carries since v396. The answer names the window it is FOR: the follow bar says which followers it
   * is showing and offers the next page as a link, and it cannot say that from a URL it did not send.
   */
  limit?: number;
  offset?: number;
  reason?: string;
}

/** What one write answered. */
export interface FollowWriteAnswer {
  ok: boolean;
  followerCount?: number;
  following?: boolean;
  reason?: string;
}

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<Response>;

export async function readFollowers(
  accountId: string,
  viewerAccountId: string | null,
  limit: number,
  offset: number = 0,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<FollowersAnswer> {
  const apiBase = nexusApiBase();
  // v397 — the offset is ROWS, and a negative one is the first window rather than a refusal: the
  // newest followers are the honest answer to a question about a page before the first (the same rule
  // the following direction has had since v390).
  const from = Math.max(offset, 0);
  try {
    const viewer = viewerAccountId ? `&viewer=${encodeURIComponent(viewerAccountId)}` : '';
    const res = await fetchImpl(
      `${apiBase}/follows?accountId=${encodeURIComponent(accountId)}${viewer}&limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(from))}`,
      { headers: { accept: 'application/json' }, signal: serviceCallSignal() },
    );
    if (!res.ok) {
      return { ok: false, followerCount: 0, followers: [], limit, offset: from, reason: `the service's follows door answered HTTP ${res.status}` };
    }
    const parsed: unknown = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, followerCount: 0, followers: [], limit, offset: from, reason: 'the service answered its follows door with something that is not JSON' };
    }
    const body = parsed as { followerCount?: unknown; followers?: unknown; following?: unknown; limit?: unknown };
    if (typeof body.followerCount !== 'number' || !Array.isArray(body.followers)) {
      return { ok: false, followerCount: 0, followers: [], limit, offset: from, reason: 'the service answered its follows door with no count' };
    }
    return {
      ok: true,
      followerCount: body.followerCount,
      followers: body.followers as FollowerEntry[],
      following: body.following === true,
      // v397 — the window as the SERVICE applied it, and the row it starts at. A wire that echoes
      // no limit keeps the one that was asked for: the pager needs a window size, and guessing one
      // would offer a page of the wrong shape.
      limit: typeof body.limit === 'number' && Number.isFinite(body.limit) ? body.limit : limit,
      offset: from,
    };
  } catch (error) {
    return {
      ok: false,
      followerCount: 0,
      followers: [],
      limit,
      offset: from,
      reason: serviceUnreachableReason(apiBase, error),
    };
  }
}

/**
 * READ the accounts an account follows — the other direction of the edge.
 *
 * <p>The two directions are different questions ("who watches me" and "who do I watch"), and the service
 * answers them with different finders — one query cannot answer both.
 */
export async function readFollowing(
  accountId: string,
  offset: number = 0,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<FollowingAnswer> {
  const apiBase = nexusApiBase();
  const from = Math.max(offset, 0);
  try {
    const res = await fetchImpl(`${apiBase}/follows?follower=${encodeURIComponent(accountId)}&offset=${encodeURIComponent(String(from))}`, {
      headers: { accept: 'application/json' },
      signal: serviceCallSignal(),
    });
    if (!res.ok) {
      return { ok: false, following: [], count: 0, limit: 20, offset: from, reason: `the service's follows door answered HTTP ${res.status}` };
    }
    const parsed: unknown = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, following: [], count: 0, limit: 20, offset: from, reason: 'the service answered its follows door with something that is not JSON' };
    }
    const body = parsed as { following?: unknown; followingCount?: unknown; limit?: unknown };
    if (!Array.isArray(body.following)) {
      return { ok: false, following: [], count: 0, limit: 20, offset: from, reason: 'the service answered its follows door with no list' };
    }
    return {
      ok: true,
      following: body.following as FollowerEntry[],
      count: typeof body.followingCount === 'number' ? body.followingCount : body.following.length,
      limit: typeof body.limit === 'number' && Number.isFinite(body.limit) ? body.limit : 20,
      offset: from,
    };
  } catch (error) {
    return {
      ok: false,
      following: [],
      count: 0,
      limit: 20,
      offset: from,
      reason: serviceUnreachableReason(apiBase, error),
    };
  }
}

/** FOLLOW an account, on the service. The claim travels exactly as the browser built it. */
export async function followOnService(
  accountId: string,
  claim: { accountId: string; handle?: string | null; assurance?: string | null; claimedAt?: number | null },
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<FollowWriteAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(`${apiBase}/follows`, {
      method: 'POST',
      signal: serviceCallSignal(),
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        accountId,
        claim: {
          accountId: claim.accountId,
          handle: claim.handle ?? null,
          assurance: claim.assurance ?? null,
          claimedAt: claim.claimedAt ?? null,
        },
      }),
    });
    return readWriteAnswer(res, await safeJson(res));
  } catch (error) {
    return { ok: false, reason: serviceUnreachableReason(apiBase, error) };
  }
}

/** TAKE a follow back, on the service. The claimer is the account id \u2014 and only that. */
export async function unfollowOnService(
  accountId: string,
  claimerAccountId: string,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<FollowWriteAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/follows/${encodeURIComponent(accountId)}?claimer=${encodeURIComponent(claimerAccountId)}`,
      { method: 'DELETE', headers: { accept: 'application/json' }, signal: serviceCallSignal() },
    );
    return readWriteAnswer(res, await safeJson(res));
  } catch (error) {
    return { ok: false, reason: serviceUnreachableReason(apiBase, error) };
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
 * A write's answer.
 *
 * The count and the `following` flag are read ONLY when the answer says `ok`: a refusal carries a reason
 * and no numbers, and a lane that filled in a count of zero on a refusal would make a refused follow
 * look like a follow that found nobody.
 */
function readWriteAnswer(res: Response, body: unknown): FollowWriteAnswer {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: `the follows answered HTTP ${res.status} with something that is not JSON` };
  }
  const answer = body as { ok?: unknown; followerCount?: unknown; following?: unknown; reason?: unknown; message?: unknown };
  // v313 — the reason is read whenever the answer is NOT ok, and not only when the body
  // says `ok: false`: the service’s error body carries no `ok` field at all (it is `{error, message}`),
  // so the old shape threw away every message the service ever wrote.
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
