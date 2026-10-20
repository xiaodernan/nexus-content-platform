/**
 * M7 v286 — the browser half of the COMMENTS lane.
 *
 * The service's address is server-side, so the browser talks to THIS Studio's own `/api/comments`,
 * which forwards to the service. The lane answers with a REASON and never a thrown error — the same rule
 * every lane here keeps.
 */
export interface CommentLaneAnswer {
  ok: boolean;
  comment?: { id: string; body: string; accountId: string; createdAt: number };
  reason?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * How long a write to the Studio's own door may take.
 *
 * A hung request is worse than a refused one: the panel would sit there saying nothing, and a person
 * would wait for an answer that is never coming. The timeout turns a hang into a reason, which is the
 * only shape this lane knows how to show.
 *
 * v294 — and it is 45 seconds, not 10. The Studio's own door is a `next dev` server in this
 * repository, and the FIRST call to a route pays that route's compile: a ten-second timeout was killing
 * requests that were about to be answered, and the lane reported a timeout where the truth was "the
 * server was still building it".
 */
const WRITE_TIMEOUT_MS = 45_000;

/** A signal that aborts the request when it takes too long. */
function callSignal(): AbortSignal {
  return AbortSignal.timeout(WRITE_TIMEOUT_MS);
}

/**
 * Write a comment.
 *
 * The CLAIM travels with it: the account id, the handle, the assurance, and the instant in milliseconds.
 * A device with no account has no claim, and the service refuses an authorless comment BY NAME — the
 * client does not invent an actor to make the request succeed.
 */
export async function postComment(
  projectId: string,
  body: string,
  claim: { accountId: string; handle?: string | null; assurance?: string | null; claimedAt?: number | null },
  fetchImpl: FetchLike = fetch,
): Promise<CommentLaneAnswer> {
  try {
    const res = await fetchImpl('/api/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ projectId, body, claim }),
      signal: callSignal(),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, reason: `the comments answered HTTP ${res.status} with something that is not JSON` };
    }
    const answer = parsed as { ok?: unknown; comment?: unknown; reason?: unknown; message?: unknown };
    if (answer.ok === false || !res.ok) {
      const reason =
        typeof answer.reason === 'string'
          ? answer.reason
          : typeof answer.message === 'string'
            ? answer.message
            : `the comments answered HTTP ${res.status}`;
      return { ok: false, reason };
    }
    const comment = answer.comment as CommentLaneAnswer['comment'];
    return { ok: true, comment };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
