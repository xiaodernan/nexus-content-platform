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

/** Read the followers of one account. */
export async function readFollowers(
  accountId: string,
  viewerAccountId: string | null,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<FollowersAnswer> {
  const apiBase = nexusApiBase();
  try {
    const viewer = viewerAccountId ? `&viewer=${encodeURIComponent(viewerAccountId)}` : '';
    const res = await fetchImpl(
      `${apiBase}/follows?accountId=${encodeURIComponent(accountId)}${viewer}`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) {
      return { ok: false, followerCount: 0, followers: [], reason: `the service's follows door answered HTTP ${res.status}` };
    }
    const parsed: unknown = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, followerCount: 0, followers: [], reason: 'the service answered its follows door with something that is not JSON' };
    }
    const body = parsed as { followerCount?: unknown; followers?: unknown; following?: unknown };
    if (typeof body.followerCount !== 'number' || !Array.isArray(body.followers)) {
      return { ok: false, followerCount: 0, followers: [], reason: 'the service answered its follows door with no count' };
    }
    return {
      ok: true,
      followerCount: body.followerCount,
      followers: body.followers as FollowerEntry[],
      following: body.following === true,
    };
  } catch (error) {
    return {
      ok: false,
      followerCount: 0,
      followers: [],
      reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}`,
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
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<FollowingAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(`${apiBase}/follows?follower=${encodeURIComponent(accountId)}`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      return { ok: false, following: [], count: 0, reason: `the service's follows door answered HTTP ${res.status}` };
    }
    const parsed: unknown = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, following: [], count: 0, reason: 'the service answered its follows door with something that is not JSON' };
    }
    const body = parsed as { following?: unknown; followingCount?: unknown };
    if (!Array.isArray(body.following)) {
      return { ok: false, following: [], count: 0, reason: 'the service answered its follows door with no list' };
    }
    return {
      ok: true,
      following: body.following as FollowerEntry[],
      count: typeof body.followingCount === 'number' ? body.followingCount : body.following.length,
    };
  } catch (error) {
    return {
      ok: false,
      following: [],
      count: 0,
      reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}`,
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
    return { ok: false, reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}` };
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
      { method: 'DELETE', headers: { accept: 'application/json' } },
    );
    return readWriteAnswer(res, await safeJson(res));
  } catch (error) {
    return { ok: false, reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}` };
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
