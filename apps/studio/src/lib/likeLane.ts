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
    });
    return readAnswer(res, await safeJson(res));
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
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
    });
    return readAnswer(res, await safeJson(res));
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
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
    });
    return readAnswer(res, await safeJson(res));
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
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
  if (answer.ok === false) {
    const reason = typeof answer.reason === 'string' ? answer.reason : typeof answer.message === 'string' ? answer.message : `the likes answered HTTP ${res.status}`;
    return { ok: false, reason };
  }
  if (!res.ok) {
    return { ok: false, reason: `the likes answered HTTP ${res.status}` };
  }
  return {
    ok: true,
    count: typeof answer.count === 'number' ? answer.count : undefined,
    liked: answer.liked === true,
  };
}
