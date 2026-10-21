/**
 * M7 v284 — the server-side half of the LIKES reader.
 *
 * The artifact page is SERVER-RENDERED, so it reads the like count through a server-side hop: the
 * browser never learns the service's address. That is the same rule the publication itself and the
 * audit trail follow.
 *
 * A failed read answers with a REASON rather than a thrown error: an artifact page that says "the likes
 * could not be read" is an honest page, and one that throws into a route handler is a 500 for a page
 * whose DOCUMENT is perfectly fine.
 */
import { nexusApiBase } from './publishServer';

/** One like, in the service's own wire shape. */
export interface LikeEntry {
  accountId: string;
  projectId: string;
  createdAt: number;
  handle?: string | null;
  assurance?: string | null;
}

/** What one read of the likes answered. */
export interface LikeAnswer {
  ok: boolean;
  /** How many accounts liked the publication. */
  count: number;
  /** The likes themselves, newest first. */
  likes: LikeEntry[];
  reason?: string;
}

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<Response>;

/**
 * Read the likes of one publication.
 *
 * The VIEWER is not sent: the artifact page is server-rendered and the account lives in the browser's
 * own storage, so the page cannot know whether YOU liked it. It reports the count — a fact that does
 * not depend on who is asking — and the Studio, where the account lives, is where "you liked it" can be
 * answered. The bound is stated on the page rather than papered over.
 */
export async function readLikes(projectId: string, fetchImpl: FetchLike = fetch as FetchLike): Promise<LikeAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/likes?projectId=${encodeURIComponent(projectId)}`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) {
      return { ok: false, count: 0, likes: [], reason: `the service's likes door answered HTTP ${res.status}` };
    }
    const parsed: unknown = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, count: 0, likes: [], reason: 'the service answered its likes door with something that is not JSON' };
    }
    const body = parsed as { count?: unknown; likes?: unknown };
    if (typeof body.count !== 'number' || !Array.isArray(body.likes)) {
      return { ok: false, count: 0, likes: [], reason: 'the service answered its likes door with no count' };
    }
    return { ok: true, count: body.count, likes: body.likes as LikeEntry[] };
  } catch (error) {
    return {
      ok: false,
      count: 0,
      likes: [],
      reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Read the likes of one publication FROM THE SERVICE, with the viewer.
 *
 * The VIEWER is optional: the artifact page is server-rendered and the account lives in the browser's own
 * storage, so the page cannot know whether YOU liked it. It reports the count — a fact that does not
 * depend on who is asking — and the Studio, where the account lives, is where "you liked it" can be
 * answered.
 */
export async function readLikesOnService(
  projectId: string,
  viewerAccountId: string | null,
  limit: number,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<LikeAnswer> {
  const apiBase = nexusApiBase();
  try {
    const viewer = viewerAccountId ? `&viewer=${encodeURIComponent(viewerAccountId)}` : '';
    const res = await fetchImpl(
      `${apiBase}/likes?projectId=${encodeURIComponent(projectId)}${viewer}&limit=${encodeURIComponent(String(limit))}`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) {
      return { ok: false, count: 0, likes: [], reason: `the service's likes door answered HTTP ${res.status}` };
    }
    const parsed: unknown = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, count: 0, likes: [], reason: 'the service answered its likes door with something that is not JSON' };
    }
    const body = parsed as { count?: unknown; likes?: unknown };
    if (typeof body.count !== 'number' || !Array.isArray(body.likes)) {
      return { ok: false, count: 0, likes: [], reason: 'the service answered its likes door with no count' };
    }
    return { ok: true, count: body.count, likes: body.likes as LikeEntry[] };
  } catch (error) {
    return {
      ok: false,
      count: 0,
      likes: [],
      reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** What a like WRITE answered. */
export interface LikeWriteAnswer {
  ok: boolean;
  count?: number;
  liked?: boolean;
  reason?: string;
}

/**
 * LIKE a publication, on the service.
 *
 * The CLAIM travels exactly as the browser built it: the account id, the handle, the assurance, and the
 * instant in milliseconds. The service records the claim and verifies nothing (ADR 0018), and the
 * assurance travels with the like so a reader is told what it is worth.
 */
export async function likeOnService(
  projectId: string,
  claim: { accountId: string; handle?: string | null; assurance?: string | null; claimedAt?: number | null },
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<LikeWriteAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(`${apiBase}/likes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        projectId,
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

/** TAKE a like back, on the service. The claimer is the account id \u2014 and only that. */
export async function unlikeOnService(
  projectId: string,
  claimerAccountId: string,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<LikeWriteAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/likes/${encodeURIComponent(projectId)}?claimer=${encodeURIComponent(claimerAccountId)}`,
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
 * The count and the `liked` flag are read ONLY when the answer says `ok`: a refusal carries a reason and
 * no numbers, and a lane that filled in a count of zero on a refusal would make a refused like look like
 * a like that found nothing.
 */
function readWriteAnswer(res: Response, body: unknown): LikeWriteAnswer {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: `the likes answered HTTP ${res.status} with something that is not JSON` };
  }
  const answer = body as { ok?: unknown; count?: unknown; liked?: unknown; reason?: unknown; message?: unknown };
  // v313 — the reason is read whenever the answer is NOT ok, and not only when the body
  // says `ok: false`: the service’s error body carries no `ok` field at all (it is `{error, message}`),
  // so the old shape threw away every message the service ever wrote.
  if (answer.ok === false || !res.ok) {
    const reason =
      typeof answer.reason === 'string'
        ? answer.reason
        : typeof answer.message === 'string'
          ? answer.message
          : `the likes answered HTTP ${res.status}`;
    return { ok: false, reason };
  }
  return {
    ok: true,
    count: typeof answer.count === 'number' ? answer.count : undefined,
    liked: answer.liked === true,
  };
}
