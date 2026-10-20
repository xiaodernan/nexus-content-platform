/**
 * M7 v286 — the server-side half of the COMMENTS reader and writer.
 *
 * The service's address is server-side, and both the artifact page (server-rendered) and the Studio's
 * own route (server-side) read and write through here.
 *
 * A failed call answers with a REASON rather than a thrown error: an artifact page that says "the
 * comments could not be read" is an honest page, and one that throws into a route handler is a 500 for a
 * page whose DOCUMENT is perfectly fine.
 */
import { nexusApiBase } from './publishServer';

/** One comment, in the service's own wire shape. */
export interface CommentEntry {
  id: string;
  accountId: string;
  projectId: string;
  body: string;
  createdAt: number;
  deleted: boolean;
  handle?: string | null;
  assurance?: string | null;
}

/** What one read of the comments answered. */
export interface CommentsAnswer {
  ok: boolean;
  comments: CommentEntry[];
  /** How many of the returned comments are NOT deleted. */
  visible: number;
  reason?: string;
}

/** What one write answered. */
export interface CommentWriteAnswer {
  ok: boolean;
  comment?: CommentEntry;
  reason?: string;
}

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<Response>;

/** Read the comments of one publication. */
export async function readComments(
  projectId: string,
  limit: number,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<CommentsAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/comments?projectId=${encodeURIComponent(projectId)}&limit=${encodeURIComponent(String(limit))}`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) {
      return { ok: false, comments: [], visible: 0, reason: `the service's comments door answered HTTP ${res.status}` };
    }
    const parsed: unknown = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, comments: [], visible: 0, reason: 'the service answered its comments door with something that is not JSON' };
    }
    const body = parsed as { comments?: unknown; visible?: unknown };
    if (!Array.isArray(body.comments)) {
      return { ok: false, comments: [], visible: 0, reason: 'the service answered its comments door with no comments' };
    }
    return {
      ok: true,
      comments: body.comments as CommentEntry[],
      visible: typeof body.visible === 'number' ? body.visible : body.comments.length,
    };
  } catch (error) {
    return {
      ok: false,
      comments: [],
      visible: 0,
      reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * WRITE a comment.
 *
 * The body is sent as it was typed: the ESCAPING is the caller's job (the service stores it verbatim),
 * and the page escapes it again on the way out.
 */
export async function writeComment(
  projectId: string,
  body: string,
  claim: { accountId: string; handle?: string | null; assurance?: string | null; claimedAt?: number | null },
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<CommentWriteAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(`${apiBase}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        projectId,
        body,
        claim: {
          accountId: claim.accountId,
          handle: claim.handle ?? null,
          assurance: claim.assurance ?? null,
          claimedAt: claim.claimedAt ?? null,
        },
      }),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, reason: `the comments answered HTTP ${res.status} with something that is not JSON` };
    }
    const answer = parsed as { ok?: unknown; comments?: unknown; reason?: unknown; message?: unknown };
    if (answer.ok === false || !res.ok) {
      const reason =
        typeof answer.reason === 'string'
          ? answer.reason
          : typeof answer.message === 'string'
            ? answer.message
            : `the comments answered HTTP ${res.status}`;
      return { ok: false, reason };
    }
    const comments = Array.isArray(answer.comments) ? (answer.comments as CommentEntry[]) : [];
    return { ok: true, comment: comments[0] };
  } catch (error) {
    return { ok: false, reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}` };
  }
}
