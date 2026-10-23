/**
 * M7 v286 — the COMMENTS on the artifact page.
 *
 * The artifact page is where a reader decides what a publication is worth, and the comments are part of
 * that answer. So the page LISTS them — server-rendered, read through the same server-side hop the
 * publication and the like count came through.
 *
 * PURE and string-returning, like every other renderer here.
 *
 * **Two rules this module keeps visible:**
 *
 * - **The body is escaped AGAIN on the way out.** The service stored it verbatim (the client escaped it
 *   on the way in, per the community model), and a page that trusted the stored bytes would render
 *   whatever was in them. Escaping twice is not a bug: the first escape is the caller's promise, and this
 *   one is the page's own.
 * - **A REMOVED comment is shown as removed, not hidden and not as its text.** "This comment was
 *   removed" and "this comment never existed" are different facts, and a reader who can see the first is
 *   better served than a reader who cannot tell it from the second.
 */
import { escapeHtml } from './pageShell';
import { olderWindowWouldHoldSomething } from './pager';

/** One comment, in the service's own wire shape. */
export interface CommentEntry {
  id?: unknown;
  accountId?: unknown;
  projectId?: unknown;
  body?: unknown;
  createdAt?: unknown;
  deleted?: unknown;
  handle?: unknown;
  assurance?: unknown;
}

/** A comment reduced to the facts a reader can act on. */
export interface CommentRow {
  id: string;
  /** Who wrote it: the handle beside the assurance, or the account id when there is no handle. */
  authorText: string;
  /** The body, ESCAPED. */
  bodyText: string;
  /** The instant, as UTC text to the second. */
  timeText: string;
  /** Whether the author has taken it back. */
  deleted: boolean;
}

/**
 * One comment, or `null` when it cannot be shown honestly.
 *
 * A row needs an id (so the page can key it), a body and a finite instant. A comment with no body is not
 * a comment, and one with no instant cannot be placed in time.
 */
export function toCommentRow(entry: unknown): CommentRow | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const c = entry as CommentEntry;
  if (typeof c.id !== 'string' || c.id.length === 0) return null;
  if (typeof c.body !== 'string') return null;
  if (typeof c.createdAt !== 'number' || !Number.isFinite(c.createdAt)) return null;

  const handle = typeof c.handle === 'string' && c.handle.length > 0 ? c.handle : null;
  const accountId = typeof c.accountId === 'string' && c.accountId.length > 0 ? c.accountId : null;
  const assurance = typeof c.assurance === 'string' && c.assurance.length > 0 ? c.assurance : null;
  const who = handle ? `@${handle}` : (accountId ?? 'nobody');
  const worth = assurance ? ` · ${assurance}` : '';

  return {
    id: c.id,
    authorText: `${who}${worth}`,
    bodyText: escapeHtml(c.body),
    timeText: new Date(c.createdAt).toISOString().replace('.000Z', 'Z'),
    deleted: c.deleted === true,
  };
}

/** The comments, in the order the service gave them. */
export function toCommentRows(entries: readonly unknown[]): CommentRow[] {
  const rows: CommentRow[] = [];
  for (const entry of entries) {
    const row = toCommentRow(entry);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * The comments section, as a section of HTML — or an empty string when there is nothing to say.
 *
 * `visible` is the service's count of the comments that are NOT deleted, and it is stated beside the
 * rows: a list of three of which one was removed must not read as "there are three comments".
 */
export function renderCommentsHtml(
  rows: CommentRow[],
  visible: number,
  projectId: string,
  limit?: number,
  /**
   * v399 — WHICH window of the thread these rows are, in rows from the newest, and how to build the
   * URL of another one. The thread has been a WINDOW since v286 (the service caps at a hundred); a
   * window with no position cannot say which comments it is the window OF, and a page that cannot say
   * that can only offer the head of a long thread forever.
   */
  window?: {
    offset?: number;
    /** How many comments the thread holds, the removed ones included — the number a pager pages by. */
    total?: number | null;
    pageHref?: (offset: number) => string;
  },
): string {
  const href = `/?comment=${encodeURIComponent(projectId)}`;
  const action = `<a class="nexus-comments-action" href="${escapeHtml(href)}" title="write a comment from the Studio">Add a comment</a>`;
  // v399 — the window's position and its end, in ROWS. A thread pages by rows because the window is
  // rows: `visible` counts only the comments still standing, and a thread of fifty comments of which
  // thirty were taken back has thirty visible and fifty rows.
  const offset = typeof window?.offset === 'number' && Number.isFinite(window.offset) && window.offset > 0
    ? Math.floor(window.offset)
    : 0;
  const total = typeof window?.total === 'number' && Number.isFinite(window.total) ? window.total : null;
  const windowSize = typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;
  const hrefFor = typeof window?.pageHref === 'function' ? window.pageHref : null;
  // v399 — the PAGER, and it is made of LINKS: the artifact page is server-rendered and holds no
  // session (ADR 0018), so the route — the layer that knows the URL — builds the other windows' URLs
  // and this section draws an <a>. At a boundary there is no page to offer and the control is a <span>
  // with no href: a link that went nowhere would be a lie with an href. "Older" is offered only when the
  // NEXT window would hold something (v398's one rule), so a page the service has already counted as
  // empty is a page this section does not offer.
  const pageControl = (direction: 'newer' | 'older', target: number | null): string => {
    const text = direction === 'newer' ? '‹ Newer' : 'Older ›';
    const title = direction === 'newer' ? 'the newer comments' : 'the older comments';
    if (target === null || hrefFor === null) {
      return `<span class="nexus-comments-page" data-comments-page="${direction}" title="${title}">${text}</span>`;
    }
    return `<a class="nexus-comments-page" data-comments-page="${direction}" href="${escapeHtml(hrefFor(target))}" title="${title}">${text}</a>`;
  };
  const pager =
    windowSize !== null && hrefFor !== null && total !== null && (offset > 0 || total > rows.length)
      ? `<div class="nexus-comments-pager">
${pageControl('newer', offset > 0 ? Math.max(offset - windowSize, 0) : null)}
${pageControl('older', olderWindowWouldHoldSomething(offset, windowSize, total) ? offset + windowSize : null)}
</div>`
      : '';
  if (rows.length === 0) {
    // v399 — an empty window on a LATER page is not an empty thread: the service counted the thread
    // and this window holds none of it, which is a fact about the page and not about the publication.
    // The empty state below is the honest answer to a question about the FIRST window, and only that.
    if (offset > 0 && total !== null && total > 0) {
      return `<section class="nexus-comments" data-comments="${visible}">
<h2>COMMENTS</h2>
<p class="nexus-comments-note">this page is past the end — the service answered an empty window</p>
<p class="nexus-comments-note">${visible} comment(s) visible in the whole thread</p>
${action}
${pager}
</section>`;
    }
    // The EMPTY state still offers the composer: a thread with no comments is exactly the thread a
    // reader would want to start, and a section that said "no comments" and offered nothing would be a
    // dead end.
    return `<section class="nexus-comments" data-comments="0">
<h2>COMMENTS</h2>
<p class="nexus-comments-note">No comments yet. A comment needs an account, and it is written from the Studio — the page cannot know who is reading it.</p>
${action}
</section>`;
  }
  const items = rows
    .map((row) => {
      const body = row.deleted
        ? '<em class="nexus-comment-removed">this comment was removed by its author</em>'
        : row.bodyText;
      // v321 — the taking-back, as a link to the Studio (the same arrangement as the like bar's).
      // It is an OFFER and not a claim: the page cannot know who is reading, so every comment carries the
      // link and the SERVICE is the one that refuses somebody else's comment by name.
      const undo = row.deleted
        ? ''
        : `<a class="nexus-comment-undo" href="/?uncomment=${encodeURIComponent(row.id)}" title="take this comment back from the Studio">Take it back</a>`;
      return `<li class="nexus-comment" data-comment="${escapeHtml(row.id)}" data-comment-deleted="${row.deleted}">
<span class="nexus-comment-author">${escapeHtml(row.authorText)}</span>
<span class="nexus-comment-time">${escapeHtml(row.timeText)}</span>
<div class="nexus-comment-body">${body}</div>
${undo}
</li>`;
    })
    .join('\n');
  // v354 — three numbers, told apart: how many comments are visible in the WHOLE thread, how
  // many of them are actually shown here, and how many of the shown ones were taken back. A page that
  // said "3 comments" when the thread holds thirty-four would be quoting a window as if it were the
  // thread.
  const removed = rows.filter((row) => row.deleted).length;
  const shownVisible = rows.length - removed;
  // v354/v399 — the window is the whole thread when the thread has no more rows than this window
  // holds. The ROW count says that when the wire carried one (v399); the visible count was the only
  // witness before it, and it stays the fallback for a service that does not answer with one.
  const windowed = total !== null ? total > rows.length : visible > shownVisible;
  const parts = [`${visible} comment(s) visible`];
  if (windowed) {
    // v399 — and WHICH rows: "the N newest" on the first window, the rows' own numbers past it
    // (v386's correction, the shared wording the tip and plan bars received in v395 and v396). The
    // range is in ROWS because the window is rows, and the removed ones among them are counted here.
    parts.push(
      offset <= 0 || total === null
        ? `showing the ${rows.length} newest`
        : `showing rows ${offset + 1}–${offset + rows.length} of ${total}`,
    );
  }
  if (removed > 0) {
    parts.push(`— ${removed} of them were taken back by their authors`);
  }
  const more = `<p class="nexus-comments-note">${parts.join(' · ')}</p>`;
  return `<section class="nexus-comments" data-comments="${visible}">
<h2>COMMENTS</h2>
<ul class="nexus-comment-list">
${items}
</ul>
${more}
${action}
${pager}
</section>`;
}

/**
 * The styles the comments section carries with it — the artifact page's shell belongs to the PREVIEW
 * renderer, and a guest that assumed it could restyle the host would be a guest that could break the
 * drawing.
 */
export const COMMENT_STYLES = `<style>
.nexus-comments{position:fixed;left:16px;top:16px;z-index:10;max-width:340px;max-height:44vh;overflow:auto;background:#12151b;border:1px solid #262b34;border-radius:6px;padding:10px 12px;color:#9aa3b2;font:11px Inter,system-ui,sans-serif}
.nexus-comments h2{margin:0 0 6px;font-size:11px;letter-spacing:.4px;color:#e6e8ec}
.nexus-comment-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.nexus-comment{display:flex;flex-direction:column;gap:2px;border-left:2px solid #262b34;padding-left:8px}
.nexus-comment-author{color:#cfd6e4;font-weight:600}
.nexus-comment-time{color:#6b7280;font-size:10px}
.nexus-comment-body{color:#e6e8ec;line-height:1.4;white-space:pre-wrap;word-break:break-word}
.nexus-comment-removed{color:#6b7280;font-style:italic}
.nexus-comment-undo{color:#6b7280;font-size:10px;text-decoration:none;align-self:flex-start}
.nexus-comment-undo:hover{color:#3b82f6;text-decoration:underline}
.nexus-comments-note{margin:6px 0 0;font-size:10px;line-height:1.4}
.nexus-comments-action{display:inline-block;margin-top:6px;color:#3b82f6;font-weight:600;text-decoration:none}
.nexus-comments-action:hover{text-decoration:underline}
.nexus-comments-pager{display:flex;gap:10px;align-items:center;margin-top:4px}
.nexus-comments-page{color:#f59e0b;font-weight:600;text-decoration:none}
.nexus-comments-page:hover{text-decoration:underline}
.nexus-comments-pager span.nexus-comments-page{color:#5b6472;font-weight:400}
</style>`;
