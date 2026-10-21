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
/**
 * READ the comments this account WROTE — the other side of the same relation (v335).
 *
 * <p>A failed read is NOT an empty list: "you have written no comments" and "the comments could not be
 * read" are different facts, and a panel that showed the first when it knew the second would tell a
 * reader their comments had vanished.
 */
export async function readMyComments(
  authorAccountId: string,
  fetchImpl: FetchLike = fetch,
): Promise<{
  ok: boolean;
  comments: { id: string; body: string; createdAt: number; deleted: boolean; projectId: string }[];
  reason?: string;
}> {
  try {
    const res = await fetchImpl(`/api/comments?author=${encodeURIComponent(authorAccountId)}`, {
      headers: { accept: 'application/json' },
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, comments: [], reason: `the comments answered HTTP ${res.status} with something that is not JSON` };
    }
    const body = parsed as { ok?: unknown; comments?: unknown; reason?: unknown; message?: unknown };
    if (body.ok === false || !res.ok) {
      const reason =
        typeof body.reason === 'string'
          ? body.reason
          : typeof body.message === 'string'
            ? body.message
            : `the comments answered HTTP ${res.status}`;
      return { ok: false, comments: [], reason };
    }
    return {
      ok: true,
      comments: Array.isArray(body.comments)
        ? (body.comments as { id: string; body: string; createdAt: number; deleted: boolean; projectId: string }[])
        : [],
    };
  } catch (error) {
    return { ok: false, comments: [], reason: error instanceof Error ? error.message : String(error) };
  }
}

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
/** What one take-back answered — the browser half. */
export interface CommentRemoveLaneAnswer {
  ok: boolean;
  /** True when a comment was ACTUALLY taken back; false when it was already gone. */
  removed?: boolean;
  reason?: string;
}

/**
 * TAKE a comment back — the author's own.
 *
 * <p>The claimer travels in the query, because a DELETE with no body is the conventional shape (the
 * un-like does the same). The answer says whether a comment was ACTUALLY taken back, so the caller can
 * tell "took it back" from "it was already gone".
 */
export async function removeComment(
  commentId: string,
  accountId: string,
  fetchImpl: FetchLike = fetch,
): Promise<CommentRemoveLaneAnswer> {
  try {
    const res = await fetchImpl(
      `/api/comments/${encodeURIComponent(commentId)}?claimer=${encodeURIComponent(accountId)}`,
      { method: 'DELETE', headers: { accept: 'application/json' }, signal: callSignal() },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, reason: `the comments answered HTTP ${res.status} with something that is not JSON` };
    }
    const answer = parsed as { ok?: unknown; removed?: unknown; reason?: unknown; message?: unknown };
    if (answer.ok === false || !res.ok) {
      const reason =
        typeof answer.reason === 'string'
          ? answer.reason
          : typeof answer.message === 'string'
            ? answer.message
            : `the comments answered HTTP ${res.status}`;
      return { ok: false, reason };
    }
    return { ok: true, removed: answer.removed === true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
