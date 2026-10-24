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
import { serviceCallSignal, serviceUnreachableReason, type ServiceFailureKind } from './serviceCall';

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
  /** v507 — which kind of “no” this is, when `ok` is false. */
  failure?: ServiceFailureKind;
  comments: CommentEntry[];
  /**
   * v354 — how many comments are VISIBLE, over the WHOLE thread.
   *
   * <p>Before this it was the WINDOW's visible count — so a page said "3 comments" when the thread held
   * thirty-four, and quoted a window as if it were the thread.
   */
  visible: number;
  /**
   * v354 — the cap the service applied, so the page can say the rows it is showing are a WINDOW of the
   * thread and how big that window is.
   */
  limit?: number;
  /**
   * v399 — the ROW this window starts at, echoed from the ask — the same field every windowed
   * answer has carried since v382. The answer names the window it is FOR: two reads in flight cannot be
   * mistaken for each other's answers, and the page's pager can say WHICH comments it is showing.
   */
  offset?: number;
  /**
   * v399 — how many comments the thread holds, the REMOVED ones included.
   *
   * <p>The window pages by ROWS, so this is the number a pager pages by — not `visible`, which counts
   * only the comments still standing. A thread of fifty comments of which thirty were taken back has
   * thirty visible and fifty rows, and a pager that used the visible count as its end would stop a
   * reader twenty rows short of the end.
   */
  total?: number;
  reason?: string;
}

/** What one write answered. */
export interface CommentWriteAnswer {
  ok: boolean;
  /** v507 — which kind of “no” this is, when `ok` is false. */
  failure?: ServiceFailureKind;
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
  offset: number = 0,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<CommentsAnswer> {
  const apiBase = nexusApiBase();
  // v399 — the offset is ROWS, and a negative one is the first window rather than a refusal: the
  // newest comments are the honest answer to a question about a page before the first (the same rule
  // every other windowed read here has had since v382).
  const from = Math.max(offset, 0);
  try {
    const res = await fetchImpl(
      `${apiBase}/comments?projectId=${encodeURIComponent(projectId)}&limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(from))}`,
      { headers: { accept: 'application/json' }, signal: serviceCallSignal() },
    );
    if (!res.ok) {
      return { ok: false, comments: [], visible: 0, limit, offset: from, failure: 'invalid', reason: `the service's comments door answered HTTP ${res.status}` };
    }
    const parsed: unknown = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, comments: [], visible: 0, limit, offset: from, failure: 'invalid', reason: 'the service answered its comments door with something that is not JSON' };
    }
    const body = parsed as { comments?: unknown; visible?: unknown; limit?: unknown; total?: unknown };
    if (!Array.isArray(body.comments)) {
      return { ok: false, comments: [], visible: 0, limit, offset: from, failure: 'invalid', reason: 'the service answered its comments door with no comments' };
    }
    return {
      ok: true,
      comments: body.comments as CommentEntry[],
      visible: typeof body.visible === 'number' ? body.visible : body.comments.length,
      // v354 — and the cap the service applied, so the page can say the rows it shows are a WINDOW.
      limit: typeof body.limit === 'number' ? body.limit : undefined,
      // v399 — the window as the SERVICE answered it, and the row it starts at. A wire that echoes no
      // limit keeps the one that was asked for: the pager needs a window size, and guessing one would
      // offer a page of the wrong shape.
      offset: from,
      total: typeof body.total === 'number' && Number.isFinite(body.total) ? body.total : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      comments: [],
      visible: 0,
      limit,
      offset: from,
      failure: 'unreachable', reason: serviceUnreachableReason(apiBase, error),
    };
  }
}

/**
 * WRITE a comment.
 *
 * The body is sent as it was typed: the ESCAPING is the caller's job (the service stores it verbatim),
 * and the page escapes it again on the way out.
 */
/**
 * v335 — READ the comments one account WROTE.
 *
 * <p>The other side of the same relation, the same way the tips door answers both sides (v332): a reader
 * who wrote a comment could not see what they had written, and a comment is a thing a person might want to
 * find again, or take back.
 */
export async function readCommentsWritten(
  authorAccountId: string,
  limit: number,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<CommentsAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/comments?author=${encodeURIComponent(authorAccountId)}&limit=${encodeURIComponent(String(limit))}`,
      { headers: { accept: 'application/json' }, signal: serviceCallSignal() },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, comments: [], visible: 0, failure: 'invalid', reason: `the service's comments door answered HTTP ${res.status} with something that is not JSON` };
    }
    const body = parsed as { ok?: unknown; comments?: unknown; visible?: unknown; message?: unknown };
    if (body.ok === false || !res.ok) {
      const why = typeof body.message === 'string' ? body.message : `the service's comments door answered HTTP ${res.status}`;
      return { ok: false, comments: [], visible: 0, failure: 'invalid', reason: why };
    }
    return {
      ok: true,
      comments: Array.isArray(body.comments) ? (body.comments as CommentEntry[]) : [],
      visible: typeof body.visible === 'number' ? body.visible : 0,
    };
  } catch (error) {
    return { ok: false, comments: [], visible: 0, failure: 'unreachable', reason: serviceUnreachableReason(apiBase, error) };
  }
}

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
      signal: serviceCallSignal(),
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
      return { ok: false, failure: 'invalid', reason: `the comments answered HTTP ${res.status} with something that is not JSON` };
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
    return { ok: false, failure: 'unreachable', reason: serviceUnreachableReason(apiBase, error) };
  }
}
/** What one take-back answered. */
export interface CommentRemoveAnswer {
  ok: boolean;
  /** v507 — which kind of “no” this is, when `ok` is false. */
  failure?: ServiceFailureKind;
  /** True when a comment was ACTUALLY taken back; false when it was already gone. */
  removed?: boolean;
  reason?: string;
}

/**
 * TAKE a comment back — the author's own.
 *
 * <p>The service answers 200 either way ("a comment that is already gone is already gone"), and it says
 * which of the two happened: `removed` is true when a row was taken back and false when there was
 * nothing to take back. So the caller can say WHICH of the two things happened, and not one word for
 * both — the same rule the un-like keeps (v320).
 */
export async function removeCommentOnService(
  commentId: string,
  claimerAccountId: string,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<CommentRemoveAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/comments/${encodeURIComponent(commentId)}?claimer=${encodeURIComponent(claimerAccountId)}`,
      { method: 'DELETE', headers: { accept: 'application/json' }, signal: serviceCallSignal() },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, failure: 'invalid', reason: `the service's comments door answered HTTP ${res.status} with something that is not JSON` };
    }
    const body = parsed as { ok?: unknown; removed?: unknown; reason?: unknown; message?: unknown };
    if (body.ok === false || !res.ok) {
      const reason =
        typeof body.reason === 'string'
          ? body.reason
          : typeof body.message === 'string'
            ? body.message
            : `the service's comments door answered HTTP ${res.status}`;
      return { ok: false, reason };
    }
    return { ok: true, removed: body.removed === true };
  } catch (error) {
    return { ok: false, failure: 'unreachable', reason: serviceUnreachableReason(apiBase, error) };
  }
}
