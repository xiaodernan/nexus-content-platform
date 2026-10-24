/**
 * M7 v284 — the browser half of the LIKES lane.
 *
 * The service's address is server-side, so the browser talks to THIS Studio's own `/api/likes`, which
 * forwards to the service. The lane answers with a REASON and never a thrown error — the same rule every
 * lane here keeps.
 *
 * The CLAIM is built by the caller (the account session owns the identity), and it travels as the
 * service's own shape: the account id, the handle, the assurance, and the instant in MILLISECONDS.
 */
import type { OwnerClaim } from './accounts';

export interface LikeLaneAnswer {
  ok: boolean;
  /** How many accounts liked the publication, after the action. */
  count?: number;
  /** Whether THIS account's like is among them. */
  liked?: boolean;
  reason?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * How long a call to the Studio's own door may take — a READ, a write, or a take-back alike.
 *
 * A hung request is worse than a refused one: the panel would sit there saying nothing, and a person
 * would wait for an answer that is never coming. The timeout turns a hang into a reason, which is the
 * only shape this lane knows how to show.
 *
 * v294 — and it is 45 seconds, not 10. The Studio's own door is a `next dev` server in this
 * repository, and the FIRST call to a route pays that route's compile: a ten-second timeout was killing
 * requests that were about to be answered, and the lane reported a timeout where the truth was "the
 * server was still building it".
 *
 * v479 — every call rides it now. The LIKE rode it from the start, but the TAKE-BACK (a DELETE) and
 * the READ fetched with no signal at all: a door that never answered hung the unlike forever and the
 * likers list forever, with no reason to show. A budget that covers only some of a lane's calls is a
 * budget that believes only those calls can hang.
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


/** Like a publication. */
export async function likePublication(
  projectId: string,
  claim: OwnerClaim,
  fetchImpl: FetchLike = fetch,
): Promise<LikeLaneAnswer> {
  try {
    const res = await fetchImpl('/api/likes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ projectId, claim }),
      signal: callSignal(),
    });
    return readAnswer(res, await safeJson(res));
  } catch (error) {
    return { ok: false, reason: unreachableReason(error, 'the likes') };
  }
}

/** Take a like back. */
export async function unlikePublication(
  projectId: string,
  accountId: string,
  fetchImpl: FetchLike = fetch,
): Promise<LikeLaneAnswer> {
  try {
    const res = await fetchImpl(`/api/likes/${encodeURIComponent(projectId)}?claimer=${encodeURIComponent(accountId)}`, {
      method: 'DELETE',
      headers: { accept: 'application/json' },
      signal: callSignal(),
    });
    return readAnswer(res, await safeJson(res));
  } catch (error) {
    return { ok: false, reason: unreachableReason(error, 'the likes') };
  }
}

/** Read the likes of a publication, and whether this account is among them. */
export async function readLikes(
  projectId: string,
  viewerAccountId: string | null,
  fetchImpl: FetchLike = fetch,
): Promise<LikeLaneAnswer> {
  try {
    const viewer = viewerAccountId ? `&viewer=${encodeURIComponent(viewerAccountId)}` : '';
    const res = await fetchImpl(`/api/likes?projectId=${encodeURIComponent(projectId)}${viewer}`, {
      headers: { accept: 'application/json' },
      signal: callSignal(),
    });
    return readAnswer(res, await safeJson(res));
  } catch (error) {
    return { ok: false, reason: unreachableReason(error, 'the likes') };
  }
}

/** The body, or null when it is not JSON — a non-JSON body is a reason, not a crash. */
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
 * The count and the `liked` flag are read ONLY when the answer says `ok` — a refusal carries a reason
 * and no numbers, and a lane that filled in a count of zero on a refusal would make a failed like look
 * like a like that found nothing.
 */
function readAnswer(res: Response, body: unknown): LikeLaneAnswer {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: `the likes answered HTTP ${res.status} with something that is not JSON` };
  }
  const answer = body as { ok?: unknown; count?: unknown; liked?: unknown; reason?: unknown; message?: unknown };
  // v313 — the reason is read whenever the answer is NOT ok, and not only when the body
  // says `ok: false` — a door that answers without it must not swallow the reason either.
  if (answer.ok === false || !res.ok) {
    const reason = typeof answer.reason === 'string' ? answer.reason : typeof answer.message === 'string' ? answer.message : `the likes answered HTTP ${res.status}`;
    return { ok: false, reason };
  }
  return {
    ok: true,
    count: typeof answer.count === 'number' ? answer.count : undefined,
    liked: answer.liked === true,
  };
}
